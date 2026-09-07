// Explicitly opt-in migration/backup operation. Never clears storage or restores over phone data.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createController, createSession, sleep } from 'userscript-ios-test/controller';
import { BackupStore } from '../../../gallery-downloader/gallery-server/downloader/dist/reader-backups.js';

process.umask(0o077);
if (!process.argv.includes('--backup')) throw new Error('Explicit --backup required; this migrates gallery data and creates PC snapshots');
const siteArg = process.argv.indexOf('--site');
const requested = siteArg < 0 ? null : process.argv[siteArg + 1];
const root = path.resolve(import.meta.dirname, '../..');
const manga = path.resolve(root, '../manga-reader');
const registry = JSON.parse(fs.readFileSync(path.join(manga, 'src/core/sites.json'), 'utf8'));
const cases = [
    { app: 'gallery-reader', provider: 'hitomi', host: 'hitomi.la', root },
    { app: 'gallery-reader', provider: 'imhentai', host: 'imhentai.xxx', root },
    ...Object.entries(registry).map(([provider, site]) => ({ app: 'manga-reader', provider, host: site.domain, root: manga })),
].filter(item => !requested || item.provider === requested);
if (!cases.length) throw new Error('Unknown --site');
const controller = createController({ root, name: 'reader-migration-backup', connectionTimeoutMs: 60000, commandTimeoutMs: 30000, clientTimeoutMs: 40000 });
const session = createSession({ controller });
const store = new BackupStore(path.resolve(root, '../gallery-downloader/backups/readers'));
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function content(data, app) {
    if (app === 'gallery-reader') return { favorites: data.indexedDB.favorites, searches: data.indexedDB.searches };
    return data.indexedDB.progress;
}

// Verification reads also stay in a worker. Only counts and hashes cross back to the UI.
function auditWorker() {
    const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
        : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
    const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    async function read(name, stores) {
        if (!(await indexedDB.databases()).some(db => db.name === name)) return null;
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await Promise.all(stores.map(([store, key]) => new Promise((resolve, reject) => {
                const tx = db.transaction(store, 'readonly');
                const request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
                request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
            })));
        } finally { db.close(); }
    }
    self.onmessage = async ({ data: config }) => {
        try {
            let data;
            if (config.app === 'gallery-reader') {
                const stored = await read('gallery-reader-data', [['state', 'reader']]);
                const raw = config.legacy;
                const state = stored?.[0] ?? { favorites: JSON.parse(raw['gallery-reader-favorites-v1'] || '[]'), searches: JSON.parse(raw.saved_searches || '[]'), page: Number(raw.favorites || 1), scroll: Object.fromEntries(Object.entries(raw).filter(([key]) => key.startsWith('scroll-pos-')).map(([key, value]) => [key.slice(11), Number(value)])) };
                data = { version: 1, indexedDB: state };
            } else {
                const records = await read('manga-reader-compute', [['progress'], ['tokens'], ['metadata']]);
                data = { version: 1, indexedDB: { progress: records?.[0] ?? [], tokens: records?.[1] ?? [], metadata: records?.[2] ?? [] } };
            }
            const current = await read('reader-pc-backup-state-v1', [['identities', config.app + ':' + config.provider]]);
            const critical = config.app === 'gallery-reader' ? { favorites: data.indexedDB.favorites, searches: data.indexedDB.searches } : data.indexedDB.progress;
            const counts = config.app === 'gallery-reader' ? { favorites: data.indexedDB.favorites.length, searches: data.indexedDB.searches.length, scroll: Object.keys(data.indexedDB.scroll).length }
                : { progress: data.indexedDB.progress.length, tokens: data.indexedDB.tokens.length, metadata: data.indexedDB.metadata.length };
            self.postMessage({ ok: true, counts, criticalHash: await hash(critical), fullHash: await hash(data), identity: current?.[0] ?? null });
        } catch (error) { self.postMessage({ ok: false, error: String(error) }); }
    };
}
const command = async code => {
    const fg = await controller.foregroundClient();
    return controller.command(fg.client, code);
};
async function audit(item) {
    return command(`
        const config = ${JSON.stringify({ app: item.app, provider: item.provider })};
        config.legacy = {};
        if (config.app === 'gallery-reader') for (const key of Object.keys(localStorage)) {
            if (['gallery-reader-favorites-v1','saved_searches','favorites'].includes(key) || key.startsWith('scroll-pos-')) config.legacy[key] = localStorage.getItem(key);
        }
        const source = ${JSON.stringify('(' + auditWorker.toString() + ')();')};
        const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
        const worker = new Worker(url);
        try {
            return await new Promise((resolve,reject) => {
                const timer = setTimeout(() => reject(new Error('Audit timed out')), 15000);
                worker.onmessage = ({data}) => { clearTimeout(timer); data.ok ? resolve(data) : reject(new Error(data.error)); };
                worker.onerror = error => { clearTimeout(timer); reject(new Error(error.message)); };
                worker.postMessage(config);
            });
        } finally { worker.terminate(); URL.revokeObjectURL(url); }
    `);
}
const results = [];
try {
    await session.connect({ allowedHosts: cases.map(item => item.host), controlledCode: `return Boolean(document.querySelector('#hs-wrap,.hs-home,.hs-home-loading'));` });
    console.log('Same-session preflight:', await command('return {href:location.href,visible:document.visibilityState};'));
    for (const item of cases) {
        console.log('Opening', item.app, item.provider);
        try {
            await session.navigate('https://' + item.host + '/');
            const before = await audit(item);
            console.log('Before:', item.provider, before.counts);
            const bundle = fs.readFileSync(path.join(item.root, 'dist/' + item.app + '.user.js'), 'utf8');
            const fg = await controller.foregroundClient();
            // Use the shared session injector on the freshly claimed page.
            await session.waitForNavigation(client => client.client === fg.client, 'foreground before takeover');
            try { await session.inject(bundle); }
            catch (error) {
                if (!await command(`return Boolean(document.querySelector('#hs-wrap,.hs-home,.hs-home-loading'));`)) throw error;
            }
            const choice = before.identity ? {chosen:'already configured'} : await command(`
                for (let i=0;i<80;i++) {
                    const host=document.querySelector('#reader-backup-setup');
                    if (host) {
                        const root=host.shadowRoot;
                        const name=root.querySelector('input');
                        name.value='iPhone before iOS downgrade';
                        const stats=root.querySelector('p')?.textContent;
                        [...root.querySelectorAll('button')].find(button=>button.textContent==='Back up this phone').click();
                        return {chosen:'backup',stats};
                    }
                    const text=document.querySelector('#reader-backup-status')?.textContent||'';
                    if(text.includes('NOT completed'))throw new Error(text);
                    await new Promise(resolve=>setTimeout(resolve,200));
                }
                throw new Error('Backup setup did not become ready');
            `);
            console.log('Choice:', item.provider, choice);
            // Routine backups are silent. Verify committed identity + actual PC contents,
            // including an already-identical snapshot (idempotent saves do not rotate it).
            let after, saved, ui;
            const deadline = Date.now() + 30000;
            while (Date.now() < deadline) {
                ui = await command(`
                    const text=document.querySelector('#reader-backup-status')?.textContent||'';
                    if(text.includes('NOT completed'))throw new Error(text);
                    return {rows:document.querySelectorAll('.hs-row').length,loadedImages:[...document.images].filter(image=>image.naturalWidth>0).length};
                `);
                after = await audit(item);
                saved = after.identity?.revision ? store.read(item.app, item.provider, after.identity.id) : null;
                if (saved?.current.revision === after.identity?.revision && hash(saved.current.data) === after.fullHash) break;
                await sleep(1000);
            }
            assert.ok(after, 'Phone audit missing');
            assert.equal(after.criticalHash, before.criticalHash, 'Migration/backup changed favorites, searches or reading progress');
            assert.ok(after.identity?.revision, 'Missing committed backup identity');
            assert.ok(saved, 'PC file missing');
            assert.equal(saved.current.revision, after.identity.revision, 'PC revision differs from phone acknowledgement');
            assert.equal(hash(saved.current.data), after.fullHash, 'PC snapshot differs from phone');
            assert.equal(hash(content(saved.current.data, item.app)), after.criticalHash, 'PC content differs from phone');
            const result = { provider: item.provider, counts: after.counts, id: saved.id, exactSnapshotMatch: hash(saved.current.data) === after.fullHash, ui };
            results.push(result);
            console.log('VERIFIED', JSON.stringify(result));
            await sleep(1000);
        } catch (error) {
            console.error('FAILED', item.provider, error.message);
            results.push({ provider: item.provider, error: error.message });
        }
    }
    console.log('PHONE BACKUP SUMMARY', JSON.stringify(results));
    if (results.some(result => result.error)) process.exitCode = 1;
} finally {
    try { await session.cleanup(); } finally { session.close(); }
}
