// User-visible behavior through the complete built userscript and real backup store.
// All provider traffic is intercepted with synthetic fixtures; profiles/backups are disposable.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../../../gallery-downloader/node_modules/playwright-core/index.mjs';
import { BackupStore } from '../../../gallery-downloader/gallery-server/downloader/dist/reader-backups.js';

const bundle = fs.readFileSync('dist/gallery-reader.user.js', 'utf8');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-ui-backup-'));
const store = new BackupStore(temporary);
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#567"/></svg>';
async function until(page, predicate) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try { if (await page.evaluate(predicate)) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('User-visible condition did not become true: ' + predicate);
}
let browser;
try {
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    for (const provider of ['hitomi', 'imhentai']) {
        const domain = provider === 'hitomi' ? 'hitomi.la' : 'imhentai.xxx';
        let release;
        const pcGate = new Promise(resolve => { release = resolve; });
        let holdPC = true;
        let pcOffline = false;
        let offlineAttempts = 0;
        async function phone(seed) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Reader-Backup-Key', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS' };
                if (url.port === '7777') {
                    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
                    if (pcOffline) {
                        if (url.pathname.startsWith('/api/reader-backups/')) offlineAttempts++;
                        return route.abort('connectionrefused');
                    }
                    if (url.pathname.startsWith('/api/favorites/')) return route.fulfill({ headers, json: {} });
                    if (holdPC) await pcGate;
                    const value = route.request().method() === 'GET' ? store.list('gallery-reader', provider)
                        : store.put('gallery-reader', provider, url.pathname.split('/').at(-1), JSON.parse(route.request().postData()));
                    return route.fulfill({ headers, json: value });
                }
                if (url.pathname.match(/\.(?:webp|jpg)$/)) return route.fulfill({ contentType: 'image/svg+xml', body: image, headers });
                if (url.hostname.startsWith('ltn.')) {
                    if (url.pathname.startsWith('/galleries/')) return route.fulfill({ contentType: 'text/javascript', headers, body: 'var galleryinfo = ' + JSON.stringify({ title: 'Fixture gallery', files: Array.from({ length: 20 }, (_, i) => ({ hash: String(i + 1).padStart(64, '0'), width: 100, height: 300 })) }) + ';' });
                    if (url.pathname === '/gg.js') return route.fulfill({ contentType: 'text/javascript', headers, body: "var o = 0; var gg = {b:'fixture/'};" });
                    if (url.pathname.endsWith('.js')) return route.fulfill({ contentType: 'text/javascript', headers, body: ';' });
                }
                if (url.hostname === 'imhentai.xxx' && url.pathname.startsWith('/gallery/')) {
                    const files = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), 'j,100,300']));
                    return route.fulfill({ contentType: 'text/html', headers, body: `<h1>Fixture gallery</h1><img data-src="https://imhentai.xxx/fixture/1t.jpg"><script>var files=$.parseJSON('${JSON.stringify(files)}');</script>` });
                }
                if (url.hostname === domain) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture provider</title><h1>Original page</h1>' + (provider === 'hitomi' && url.pathname.startsWith('/reader/') ? `<script>history.replaceState(null,'',location.pathname+'#1-')</script>` : '') });
                return route.abort();
            });
            await context.addInitScript({ content: `
                if (${seed} && !localStorage.getItem('fixture-seeded')) {
                    localStorage.setItem('gallery-reader-favorites-v1', JSON.stringify(Array.from({length:560}, (_,i)=>i+1)));
                    localStorage.setItem('saved_searches', '[{"query":"language:japanese","page":2}]');
                    localStorage.setItem('favorites', '2');
                    localStorage.setItem('fixture-seeded', 'yes');
                }
            ` });
            const page = await context.newPage();
            page.on('pageerror', error => console.error('Fixture page error:', error.message));
            page.setDefaultTimeout(15000);
            await page.goto('https://' + domain + '/', { waitUntil: 'domcontentloaded' });
            await page.addScriptTag({ content: bundle });
            return { page, context };
        }
        const original = await phone(true);
        const { page } = original;
        await until(page, () => document.querySelectorAll('.hs-row-wrap').length === 25).catch(async error => {
            console.error('Fixture home:', await page.locator('body').innerText());
            throw error;
        });
        await page.locator('#query-input').fill('UI remains usable while backup PC is waiting');
        assert.equal(await page.locator('#query-input').inputValue(), 'UI remains usable while backup PC is waiting');
        assert.equal(await page.locator('#reader-backup-setup').count(), 0);
        await until(page, () => [...document.images].some(image => image.naturalWidth > 0));
        holdPC = false; release();
        const dialog = page.getByRole('dialog', { name: 'Reader backup setup' });
        await dialog.getByRole('button', { name: 'Back up this phone', exact: true }).click();
        await until(page, () => document.querySelector('#reader-backup-status')?.textContent.includes('Backed up to PC'));
        assert.equal(store.list('gallery-reader', provider)[0].current.data.indexedDB.favorites.length, 560);
        await page.locator('.hs-row-wrap').first().locator('.row-action-btn').last().click();
        await until(page, () => document.querySelector('.hs-row-wrap .row-action-btn:last-child')?.textContent === '🤍');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ content: bundle });
        // Observe the persisted backup, not a notification that routine saves must not show.
        const deadline = Date.now() + 15000;
        while (store.list('gallery-reader', provider)[0].current.data.indexedDB.favorites.length !== 559 && Date.now() < deadline) {
            assert.equal(await page.locator('#reader-backup-status').count(), 0);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.equal(await page.locator('#reader-backup-status').count(), 0);
        assert.match(await page.locator('.hs-page-bar').first().textContent(), /559/);
        assert.match(await page.locator('.hs-saved-searches').textContent(), /language:japanese/);
        const before = store.list('gallery-reader', provider)[0];
        assert.equal(before.current.data.indexedDB.favorites.length, 559);
        assert.equal(before.previous.data.indexedDB.favorites.length, 560);
        pcOffline = true;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ content: bundle });
        const copy = await phone(false);
        const offlineDeadline = Date.now() + 15000;
        while (offlineAttempts < 2 && Date.now() < offlineDeadline) await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(offlineAttempts, 2, 'Both the enrolled and fresh phone must attempt the PC');
        await new Promise(resolve => setTimeout(resolve, 1000));
        for (const offlinePage of [page, copy.page]) {
            assert.equal(await offlinePage.locator('#reader-backup-status, #reader-backup-setup').count(), 0);
            await offlinePage.locator('#query-input').fill('Offline PC does not interfere');
            assert.equal(await offlinePage.locator('#query-input').inputValue(), 'Offline PC does not interfere');
        }
        assert.deepEqual(store.read('gallery-reader', provider, before.id), before);
        pcOffline = false;
        await copy.page.reload({ waitUntil: 'domcontentloaded' });
        await copy.page.addScriptTag({ content: bundle });
        const restoreDialog = copy.page.getByRole('dialog', { name: 'Reader backup setup' });
        await restoreDialog.getByRole('button', { name: 'Restore from PC', exact: true }).waitFor();
        assert.match(await restoreDialog.textContent(), /On this phone: 0 favorites/);
        await restoreDialog.getByRole('textbox', { name: 'New backup name' }).fill('Formatted phone');
        await restoreDialog.getByRole('button', { name: 'Restore from PC', exact: true }).click();
        await until(copy.page, () => document.querySelector('#reader-backup-status')?.textContent.includes('Backed up to PC'));
        assert.match(await copy.page.locator('.hs-page-bar').first().textContent(), /559/);
        assert.deepEqual(store.read('gallery-reader', provider, before.id), before);
        assert.equal(store.list('gallery-reader', provider).length, 2);
        // A thumbnail opens the actual reader route; source originals render there.
        await copy.page.locator('.hs-thumb').first().click();
        await copy.page.waitForURL(url => url.pathname.startsWith(provider === 'hitomi' ? '/reader/' : '/view/'));
        await copy.page.addScriptTag({ content: bundle });
        await until(copy.page, () => document.querySelectorAll('.hs-reader-img').length === 20);
        await until(copy.page, () => [...document.images].some(image => image.naturalWidth > 0));
        assert.equal(await copy.page.locator('.hs-reader-body button').count(), 0);
        await copy.page.goBack({ waitUntil: 'domcontentloaded' });
        if (!await copy.page.locator('#hs-wrap').count()) await copy.page.addScriptTag({ content: bundle });
        await until(copy.page, () => document.querySelectorAll('.hs-row-wrap').length === 25);
        assert.match(await copy.page.locator('.hs-page-bar').first().textContent(), /559/);
        await original.context.close(); await copy.context.close();
        console.log(`PASS ${provider}: responsive home while PC waits, source previews/reader, migration, edit+reload, previous backup, independent formatted-phone restore and Back`);
    }
} finally {
    await browser?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
}
