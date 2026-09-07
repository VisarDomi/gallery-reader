import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createController, createSession } from 'userscript-ios-test/controller';

const root = resolve(import.meta.dirname, '../..');
const controller = createController({ root, name: 'gallery-reader', connectionTimeoutMs: 60_000, commandTimeoutMs: 40_000 });
const session = createSession({ controller });
const bundle = await readFile(resolve(root, 'dist/gallery-reader.user.js'), 'utf8');
let snapshot;
const command = async code => {
    const foreground = await controller.foregroundClient();
    return controller.command(foreground.client, code);
};
try {
    await session.connect({ allowedHosts: ['imhentai.xxx'] });
    console.log('Preflight:', await command('return { href: location.href, visible: document.visibilityState };'));
    await session.navigate('https://imhentai.xxx/gallery/1362775/');
    snapshot = await command(`return Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]));`);
    // Bound this test to two galleries, without changing the user's favorites.
    // Gallery HTML, CDN images, and all application code remain real.
    const before = `
        history.replaceState(null, '', '/search/?key=thumbnailregression');
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, options) => {
            const url = new URL(typeof input === 'string' ? input : input.url, location.href);
            if (url.pathname === '/search/' && url.searchParams.get('key') === 'thumbnailregression')
                return Promise.resolve(new Response('<a href="/gallery/1362775/">one</a><a href="/gallery/988447/">two</a>', { headers: { 'Content-Type': 'text/html' } }));
            return nativeFetch(input, options);
        };
        performance.clearResourceTimings();
    `;
    try { await session.inject(bundle, { before }); }
    catch (error) {
        if (!await command(`return Boolean(document.querySelector('.hs-thumb'));`)) throw error;
    }
    const listing = await command(`
        for (let i = 0; i < 100 && document.querySelectorAll('.hs-thumb').length !== 361; i++) await new Promise(r => setTimeout(r, 200));
        const thumbs = [...document.querySelectorAll('.hs-thumb')];
        for (let i = 0; i < 60 && !thumbs.some(img => img.complete && img.naturalWidth > 0); i++) await new Promise(r => setTimeout(r, 200));
        return {
            rows: document.querySelectorAll('.hs-row').length, count: thumbs.length,
            wrong: thumbs.filter(img => !/\\/\\d+t\\.jpg(?:\\?|$)/.test(img.src)).map(img => img.src).slice(0, 4),
            loaded: thumbs.filter(img => img.complete && img.naturalWidth > 0).length,
            fifth: thumbs[4]?.src, last: thumbs.at(-1)?.src,
            fullImageRequests: performance.getEntriesByType('resource').filter(entry => /m\\d+\\.imhentai\\.xxx\\/.*\\/\\d+\\.(?:png|webp|jpg)(?:\\?|$)/.test(entry.name)).map(entry => entry.name),
        };
    `);
    console.log('Thumbnail strips:', listing);
    assert.equal(listing.rows, 2); assert.equal(listing.count, 361);
    assert.deepEqual(listing.wrong, []); assert.ok(listing.loaded > 0);
    assert.deepEqual(listing.fullImageRequests, []);
    const client = await controller.foregroundClient();
    await controller.command(client.client, `document.querySelectorAll('.hs-thumb')[4].click();`, { expectResult: false });
    await session.waitForNavigation(client => new URL(client.href).pathname === '/view/1362775/5/', 'selected reader page');
    try { await session.inject(bundle); }
    catch (error) { if (!await command(`return Boolean(document.querySelector('.hs-reader-img'));`)) throw error; }
    const reader = await command(`
        for (let i = 0; i < 100; i++) {
            const image = document.getElementById('#4');
            if (image?.naturalWidth > 0) return { src: image.src, width: image.naturalWidth, count: document.querySelectorAll('.hs-reader-img').length };
            await new Promise(r => setTimeout(r, 200));
        }
        throw new Error('Reader original did not load');
    `);
    console.log('Reader original:', reader);
    assert.match(reader.src, /\/5\.webp$/); assert.equal(reader.width, 1254); assert.equal(reader.count, 144);
    console.log('PASS: iPhone strips load source thumbnails; selected reader page loads its original.');
} finally {
    try {
        if (snapshot) await command(`
            if (location.hostname !== 'imhentai.xxx') throw new Error('Cannot restore state outside IMHentai');
            const snapshot = ${JSON.stringify(snapshot)};
            for (const key of Object.keys(localStorage)) if (!(key in snapshot)) localStorage.removeItem(key);
            for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
            return true;
        `);
    } finally {
        try { await session.cleanup(); }
        finally { session.close(); }
    }
}
