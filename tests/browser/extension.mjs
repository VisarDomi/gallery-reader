// Exercise the REAL installed extension, not addInitScript/addScriptTag.
// A local TLS fixture serves both sites; no favorites or live site data is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { chromium } from '../../../gallery-downloader/node_modules/playwright-core/index.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-extension-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${temporary}/key.pem`, '-out', `${temporary}/cert.pem`, '-days', '1', '-subj', '/CN=gallery-extension-fixture'], { stdio: 'ignore' });
const requests = [];
const server = https.createServer({ key: fs.readFileSync(`${temporary}/key.pem`), cert: fs.readFileSync(`${temporary}/cert.pem`) }, (req, res) => {
    const url = new URL(req.url, `https://${req.headers.host}`);
    requests.push({ host: url.hostname, path: url.pathname });
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname.startsWith('/api/')) { res.writeHead(503); res.end(); return; }
    if (url.hostname === 'tagindex.hitomi.la') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify([['test tag', 12, 'female']])); return;
    }
    if (url.hostname === 'ltn.gold-usergeneratedcontent.net') {
        res.setHeader('Content-Type', 'application/javascript');
        if (url.pathname.startsWith('/galleries/')) { res.end('var galleryinfo = ' + JSON.stringify({ title: 'Fixture', files: Array.from({length:3}, (_, i) => ({ hash: String(i + 1).padStart(64, '0'), width: 100, height: 300 })) }) + ';'); return; }
        if (url.pathname === '/gg.js') { res.end("var o = 0; var gg = {b:'fixture/'};"); return; }
    }
    if (url.pathname.endsWith('.webp') || url.pathname.endsWith('.jpg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#456"/></svg>'); return;
    }
    if (url.hostname === 'imhentai.xxx' && url.pathname.startsWith('/gallery/')) {
        res.end(`<h1>Fixture</h1><img data-src="https://imhentai.xxx/fixture/1t.jpg"><script>var files=$.parseJSON('{"1":"j,100,300","2":"j,100,300","3":"j,100,300"}');</script>`); return;
    }
    if (url.pathname === '/original.js') { res.setHeader('Content-Type', 'application/javascript'); res.end('window.originalExternal=true; fetch("/external-ran");'); return; }
    res.setHeader('Content-Type', 'text/html');
    // The very first parser token is executable. No site libraries are needed.
    res.end(`<script>window.originalInline=true;fetch('/inline-ran')</script><script src="/original.js"></script><script src="https://ltn.gold-usergeneratedcontent.net/jquery.min.js"></script><title>Original</title><h1 id="original">Original site</h1>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let context;
try {
    const extension = path.resolve('dist/extension');
    context = await chromium.launchPersistentContext(`${temporary}/profile`, {
        executablePath: '/usr/bin/chromium', headless: !process.env.DISPLAY, ignoreHTTPSErrors: true,
        viewport: { width: 428, height: 800 },
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, `--host-resolver-rules=MAP * 127.0.0.1:${port}, EXCLUDE localhost`, '--no-proxy-server', '--ignore-certificate-errors'],
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => console.error('Page error:', error.message));
    page.on('console', message => { if (message.type() === 'error') console.error('Console:', message.text()); });
    for (const host of ['hitomi.la', 'imhentai.xxx']) {
        const start = requests.length;
        await page.goto(`https://${host}/`, { waitUntil: 'commit' });
        await page.locator('#query-input').waitFor();
        await page.locator('.hs-page-bar').first().waitFor(); // real worker + IDB ready
        assert.equal(await page.evaluate(() => !!window.originalInline || !!window.originalExternal), false);
        assert.equal(requests.slice(start).some(r => ['/original.js', '/inline-ran', '/external-ran'].includes(r.path)), false);
        await page.locator('#query-input').fill('UI responsive');
        if (host === 'hitomi.la') {
            await page.locator('.search-suggestion_string').waitFor({ state: 'visible' });
            const suggestion = await page.locator('.search-suggestion_string').boundingBox();
            await page.mouse.click(suggestion.x + 15, suggestion.y + 10);
            assert.equal(await page.locator('#query-input').inputValue(), 'UI female:test_tag ');
            assert.equal(await page.locator('#search-suggestions').textContent(), '');
            assert.equal(requests.slice(start).filter(r => ['/jquery.min.js', '/common.js', '/searchlib.js', '/search.js'].includes(r.path)).length, 0, 'Suggestions require no site JavaScript');
        }
        await page.evaluate(() => {
            const spacer = document.createElement('div');
            spacer.style.height = '4000px';
            document.body.append(spacer);
            addEventListener('scrollend', event => { if (event.isTrusted) event.stopImmediatePropagation(); }, true);
            scrollTo(0, 320);
            dispatchEvent(new Event('scrollend'));
            scrollTo(0, 640);
        });
        await page.waitForFunction(async () => {
            const db = await new Promise((resolve, reject) => {
                const r = indexedDB.open('gallery-reader-data');
                r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
            });
            try {
                return await new Promise(resolve => {
                    const r = db.transaction('state').objectStore('state').get('reader');
                    r.onsuccess = () => resolve(r.result?.scroll['/'] === 320);
                });
            } finally { db.close(); }
        });
        const reader = host === 'hitomi.la' ? '/reader/1.html' : '/view/1/1/';
        await page.goto(`https://${host}${reader}`, { waitUntil: 'commit' });
        await page.waitForFunction(() => [...document.images].some(image => image.naturalWidth === 100), null, { polling: 100 }).catch(async error => {
            console.error('Reader state:', await page.locator('body').innerHTML(), requests.slice(start));
            console.error(JSON.stringify(await page.evaluate(() => ({ ready: document.readyState, visibility: document.visibilityState, images: [...document.images].map(i => ({ rect: i.getBoundingClientRect().toJSON(), complete: i.complete, loading: i.loading })), viewport: [innerWidth, innerHeight, scrollY] }))));
            throw error;
        });
        assert.equal(await page.evaluate(() => !!window.originalInline || !!window.originalExternal), false);
        const bookmark = await page.evaluate(() => {
            addEventListener('scrollend', event => { if (event.isTrusted) event.stopImmediatePropagation(); }, true);
            const image = document.querySelectorAll('.hs-reader-img')[1];
            const rect = image.getBoundingClientRect();
            const historyBefore = history.length;
            scrollTo(0, scrollY + rect.top + rect.height / 2 - innerHeight / 2);
            dispatchEvent(new Event('scrollend'));
            return { url: location.href, historyBefore, historyAfter: history.length };
        });
        assert.equal(bookmark.url, host === 'hitomi.la' ? 'https://hitomi.la/reader/1.html#1' : 'https://imhentai.xxx/view/1/2/', 'Reader URL updates in the scrollend event, with no timer');
        assert.equal(bookmark.historyAfter, bookmark.historyBefore);
        await page.goto(`https://${host}/not-owned`, { waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('#original').count(), 1);
        assert.equal(await page.evaluate(() => window.originalInline && window.originalExternal), true, 'Unowned routes still run normally');
        console.log(`${host}: takeover, worker scroll snapshot, immediate reader bookmark, unchanged history, reader images, and unowned route passed`);
    }
    await context.close();
    context = undefined;
    // Independently verify the preinstalled policy, with NO takeover script.
    // Otherwise document.open alone could mask a broken header rule.
    const policyOnly = `${temporary}/policy-extension`;
    fs.mkdirSync(policyOnly);
    const manifest = JSON.parse(fs.readFileSync(`${extension}/manifest.json`, 'utf8'));
    delete manifest.content_scripts;
    fs.writeFileSync(`${policyOnly}/manifest.json`, JSON.stringify(manifest));
    fs.copyFileSync(`${extension}/rules.json`, `${policyOnly}/rules.json`);
    context = await chromium.launchPersistentContext(`${temporary}/policy-profile`, {
        executablePath: '/usr/bin/chromium', headless: !process.env.DISPLAY, ignoreHTTPSErrors: true,
        viewport: { width: 428, height: 800 },
        args: [`--disable-extensions-except=${policyOnly}`, `--load-extension=${policyOnly}`, `--host-resolver-rules=MAP * 127.0.0.1:${port}, EXCLUDE localhost`, '--no-proxy-server', '--ignore-certificate-errors'],
    });
    const policyPage = await context.newPage();
    for (const host of ['hitomi.la', 'imhentai.xxx']) {
        const start = requests.length;
        await policyPage.goto(`https://${host}/`, { waitUntil: 'load' });
        assert.equal(await policyPage.locator('#original').count(), 1);
        assert.equal(await policyPage.evaluate(() => !!window.originalInline || !!window.originalExternal || !!window.intentionalScripts), false);
        assert.equal(requests.slice(start).some(r => ['/original.js', '/jquery.min.js', '/inline-ran', '/external-ran'].includes(r.path)), false);
    }
    console.log('Rules alone block initial inline/external scripts before download, without document takeover');
} finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
}
