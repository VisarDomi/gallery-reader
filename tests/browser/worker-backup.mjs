// Entire real worker: migration, favorite edits, both backup generations, restore and reload.
// Uses a disposable Chromium profile and synthetic IDs. Never touches the phone or real backups.
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from '../../../gallery-downloader/node_modules/playwright-core/index.mjs';

const bundle = await build({ entryPoints: ['src/core/compute/worker-entry.ts'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env.VITE_GALLERY_SERVER_URL': 'undefined' } });
const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Worker backup fixture</title><h1>UI ready</h1>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const initialize = () => page.evaluate(source => {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const worker = new Worker(url);
        const pending = new Map(); let id = 0;
        worker.onmessage = ({ data }) => {
            const task = pending.get(data.id); pending.delete(data.id);
            if (data.ok) task.resolve(data.value); else task.reject(new Error(data.error));
        };
        window.rpc = (op, payload) => new Promise((resolve, reject) => {
            const number = ++id; pending.set(number, { resolve, reject }); worker.postMessage({ id: number, op, payload });
        });
        window.testWorker = worker;
        // UI-side IndexedDB and localStorage are forbidden for this fixture.
        Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Main-thread IndexedDB access'); } });
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('Unexpected localStorage access'); } });
    }, bundle.outputFiles[0].text);
    await initialize();
    const result = await page.evaluate(async () => {
        const scope = 'gallery-reader:hitomi';
        const backup = (action, fields = {}) => rpc('backup-control', { action, scope, ...fields });
        const raw = { 'gallery-reader-favorites-v1': JSON.stringify(Array.from({ length: 560 }, (_, i) => i + 1)), saved_searches: '[{"query":"test","page":2}]', favorites: '2', 'scroll-pos-/': '345' };
        const initiallyReady = await rpc('state-ready');
        await rpc('state-migrate', raw);
        await rpc('state-migrate', {}); // another tab must not overwrite a committed migration
        const initial = await rpc('home-page');
        const beforeChoice = await backup('state');
        await backup('choose', { label: 'Fixture iPhone' });
        const upload = await backup('upload');
        const first = { id: upload.id, label: upload.label, current: { revision: 'revision-1', savedAt: new Date().toISOString(), data: JSON.parse(upload.text).data }, previous: null };
        await backup('ack', { text: JSON.stringify(first) });
        const enrolled = await backup('enrolled');
        await rpc('favorite-toggle', 999);
        await rpc('search-save', { query: 'new search', page: 3 });
        const afterEdits = await backup('upload');
        const second = { ...first, current: { revision: 'revision-2', savedAt: new Date().toISOString(), data: JSON.parse(afterEdits.text).data }, previous: first.current };
        await backup('ack', { text: JSON.stringify(second) });
        // Simulates a new installation identity without deleting its actual data.
        await backup('reset');
        const choices = await backup('list', { text: JSON.stringify([second]) });
        await backup('choose', { label: 'Restored copy', selection: first.id + ':previous' });
        const restored = await backup('upload');
        const position = await rpc('scroll', '/');
        testWorker.terminate();
        return { initiallyReady, initial, beforeChoice, first, enrolled, choices, restored, position };
    });
    assert.equal(result.initiallyReady, false);
    assert.equal(result.initial.total, 560);
    assert.equal(result.initial.page, 2);
    assert.equal(result.initial.ids.length, 25);
    assert.equal(result.beforeChoice.identity, null);
    assert.equal(result.enrolled, true);
    assert.equal(result.choices.length, 2);
    assert.deepEqual(JSON.parse(result.restored.text).data, result.first.current.data);
    assert.notEqual(result.restored.id, result.first.id);
    assert.equal(result.position, 345);
    await page.reload(); await initialize();
    assert.equal(await page.evaluate(() => rpc('state-ready')), true);
    assert.equal((await page.evaluate(() => rpc('home-page'))).total, 560);
    assert.equal((await page.evaluate(() => rpc('backup-control', { action: 'state', scope: 'gallery-reader:hitomi' }))).identity.id, result.restored.id);
    console.log('PASS: real worker-only IndexedDB, 560-favorite migration, repeated migration safety, edits, current/previous restore, independent IDs and reload persistence');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
