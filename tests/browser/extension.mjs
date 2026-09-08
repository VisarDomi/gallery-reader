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
const scripts = {
    'jquery.min.js': `window.intentionalScripts=['jquery.min.js']; window.jQuery={fn:{on:function(){}}};`,
    'common.js': `intentionalScripts.push('common.js'); window.clear_page=()=>{window.suggestionsCleared=true};`,
    'searchlib.js': `intentionalScripts.push('searchlib.js');`,
    'search.js': `intentionalScripts.push('search.js'); document.querySelector('.hs-search-input').classList.add('active'); document.querySelector('#search-suggestions').innerHTML='<li><a class="search-suggestion_string"><span class="search-result">test tag</span><span class="search-ns">(female)</span></a></li>';`,
};
const server = https.createServer({ key: fs.readFileSync(`${temporary}/key.pem`), cert: fs.readFileSync(`${temporary}/cert.pem`) }, (req, res) => {
    const url = new URL(req.url, `https://${req.headers.host}`);
    requests.push({ host: url.hostname, path: url.pathname });
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname.startsWith('/api/')) { res.writeHead(503); res.end(); return; }
    if (url.hostname === 'ltn.gold-usergeneratedcontent.net') {
        res.setHeader('Content-Type', 'application/javascript');
        if (scripts[url.pathname.slice(1)]) { res.end(scripts[url.pathname.slice(1)]); return; }
        if (url.pathname.startsWith('/galleries/')) { res.end('var galleryinfo = ' + JSON.stringify({ title: 'Fixture', files: [{ hash: 'a'.repeat(64), width: 100, height: 300 }] }) + ';'); return; }
        if (url.pathname === '/gg.js') { res.end("var o = 0; var gg = {b:'fixture/'};"); return; }
    }
    if (url.pathname.endsWith('.webp') || url.pathname.endsWith('.jpg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#456"/></svg>'); return;
    }
    if (url.hostname === 'imhentai.xxx' && url.pathname.startsWith('/gallery/')) {
        res.end(`<h1>Fixture</h1><img data-src="https://imhentai.xxx/fixture/1t.jpg"><script>var files=$.parseJSON('{"1":"j,100,300"}');</script>`); return;
    }
    if (url.pathname === '/original.js') { res.setHeader('Content-Type', 'application/javascript'); res.end('window.originalExternal=true; fetch("/external-ran");'); return; }
    res.setHeader('Content-Type', 'text/html');
    // The very first parser token is executable. Include the same Hitomi library
    // that the reader later explicitly authorizes, to test both phases.
    res.end(`<script>window.originalInline=true;fetch('/inline-ran')</script><script src="/original.js"></script><script src="https://ltn.gold-usergeneratedcontent.net/jquery.min.js"></script><title>Original</title><h1 id="original">Original site</h1>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let context;
try {
    const extension = path.resolve('dist/extension');
    context = await chromium.launchPersistentContext(`${temporary}/profile`, {
        executablePath: '/usr/bin/chromium', headless: !process.env.DISPLAY, ignoreHTTPSErrors: true,
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
            assert.equal(await page.evaluate(() => window.suggestionsCleared), true);
            assert.deepEqual(await page.evaluate(() => window.intentionalScripts), Object.keys(scripts));
            assert.equal(requests.slice(start).filter(r => r.path === '/jquery.min.js').length, 1, 'Only the intentional post-takeover library request');
        }
        const reader = host === 'hitomi.la' ? '/reader/1.html' : '/view/1/1/';
        await page.goto(`https://${host}${reader}`, { waitUntil: 'commit' });
        await page.waitForFunction(() => [...document.images].some(image => image.naturalWidth === 100), null, { polling: 100 }).catch(async error => {
            console.error('Reader state:', await page.locator('body').innerHTML(), requests.slice(start));
            console.error(await page.evaluate(() => ({ ready: document.readyState, visibility: document.visibilityState, images: [...document.images].map(i => ({ rect: i.getBoundingClientRect().toJSON(), complete: i.complete, loading: i.loading })), viewport: [innerWidth, innerHeight, scrollY] })));
            throw error;
        });
        assert.equal(await page.evaluate(() => !!window.originalInline || !!window.originalExternal), false);
        await page.goto(`https://${host}/not-owned`, { waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('#original').count(), 1);
        assert.equal(await page.evaluate(() => window.originalInline && window.originalExternal), true, 'Unowned routes still run normally');
        console.log(`${host}: takeover, blocked initial scripts, worker/IDB, reader images, and unowned route passed`);
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
