// Real Safari navigation, no favorite/progress edits and no reinjection after Back.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createController, createSession, sleep } from 'userscript-ios-test/controller';
process.umask(0o077);
const root = path.resolve(import.meta.dirname, '../..');
const controller = createController({ root, name: 'gallery-worker-ui', connectionTimeoutMs: 60000, commandTimeoutMs: 30000 });
const session = createSession({ controller });
const bundle = fs.readFileSync(path.join(root, 'dist/gallery-reader.user.js'), 'utf8');
const requestedSite = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : undefined;
const hosts = ['hitomi.la', 'imhentai.xxx'].filter(host => !requestedSite || host === requestedSite);
if (!hosts.length) throw new Error('Use --site hitomi.la or --site imhentai.xxx');
const command = async (code, options) => {
    const fg = await controller.foregroundClient();
    return controller.command(fg.client, code, options);
};
async function inject() {
    const fg = await controller.foregroundClient();
    await session.waitForNavigation(client => client.client === fg.client, 'foreground before injection');
    try { await session.inject(bundle, { after: `
        globalThis.__readerErrors=[];
        addEventListener('unhandledrejection',event=>globalThis.__readerErrors.push(String(event.reason)));
        addEventListener('error',event=>globalThis.__readerErrors.push(event.message||'resource failed'));
    ` }); }
    catch (error) { if (!await command(`return Boolean(document.querySelector('#hs-wrap,.hs-reader-body'));`)) throw error; }
}
try {
    await session.connect({ allowedHosts: ['hitomi.la', 'imhentai.xxx'] });
    console.log('Preflight', await command('return {href:location.href,visible:document.visibilityState};'));
    for (const host of hosts) {
        await session.navigate('https://' + host + '/');
        await inject();
        const listing = await command(`
            for(let i=0;i<100;i++){
                const images=[...document.querySelectorAll('.hs-thumb')];
                if(images.some(img=>img.naturalWidth>0))break;
                await new Promise(resolve=>setTimeout(resolve,200));
            }
            const images=[...document.querySelectorAll('.hs-thumb')];
            const selected=images.find(img=>{const rect=img.getBoundingClientRect();return img.naturalWidth>0&&rect.bottom>0&&rect.top<innerHeight;})||images.find(img=>img.naturalWidth>0);
            if(!selected)throw new Error('No source thumbnail decoded');
            const strip=selected.closest('.hs-row');
            globalThis.__readerUIProbe={row:document.querySelector('.hs-row-wrap'),strip,selected,y:scrollY,x:strip.scrollLeft,persisted:false};
            addEventListener('pageshow',event=>{globalThis.__readerUIProbe.persisted=event.persisted;},{once:true});
            return {rows:document.querySelectorAll('.hs-row-wrap').length,loaded:images.filter(img=>img.naturalWidth>0).length,y:scrollY};
        `);
        console.log('Listing', host, listing);
        await command(`
            const probe=globalThis.__readerUIProbe;
            probe.y=scrollY;probe.x=probe.strip.scrollLeft;
            addEventListener('pagehide',()=>{probe.y=scrollY;probe.x=probe.strip.scrollLeft;},{once:true});
            probe.selected.click();
        `, { expectResult: false });
        await session.waitForNavigation(client => new URL(client.href).hostname === host && /^\/(reader|view)\//.test(new URL(client.href).pathname), 'reader navigation');
        await inject();
        const reader = await command(`
            for(let i=0;i<120;i++){
                const images=[...document.querySelectorAll('.hs-reader-img')];
                if(images.some(img=>img.naturalWidth>0))return {count:images.length,loaded:images.filter(img=>img.naturalWidth>0).length,buttons:document.querySelectorAll('.hs-reader-body button').length};
                await new Promise(resolve=>setTimeout(resolve,200));
            }
            throw new Error('Reader original did not decode: '+JSON.stringify({errors:globalThis.__readerErrors,images:[...document.querySelectorAll('.hs-reader-img')].slice(0,2).map(img=>({src:img.src,complete:img.complete,width:img.naturalWidth})),href:location.href}));
        `);
        assert.equal(reader.buttons, 0);
        await command('history.back();', { expectResult: false });
        await session.waitForNavigation(client => new URL(client.href).hostname === host && new URL(client.href).pathname === '/', 'native Back to home');
        await sleep(1500);
        const back = await command(`
            const probe=globalThis.__readerUIProbe;
            return {persisted:probe?.persisted===true,sameRow:probe?.row===document.querySelector('.hs-row-wrap'),sameStrip:probe?.strip?.isConnected===true,y:scrollY,expectedY:probe?.y,x:probe?.strip?.scrollLeft,expectedX:probe?.x, navigation:performance.getEntriesByType('navigation').map(entry=>({type:entry.type,notRestoredReasons:entry.notRestoredReasons})), readerHome:!!document.querySelector('#hs-wrap')};
        `);
        console.log('Reader/Back', host, JSON.stringify({ reader, back }, null, 2));
        if (host === 'imhentai.xxx' && !back.persisted) {
            console.log('PASS source thumbnails and original reader: imhentai.xxx');
            console.log('SKIP bfcache assertion: known IMHentai HTTPS no-store limitation; no reinjection or false bfcache pass');
            continue;
        }
        assert.equal(back.persisted, true); assert.equal(back.sameRow, true); assert.equal(back.sameStrip, true);
        assert.ok(Math.abs(back.y - back.expectedY) <= 1); assert.equal(back.x, back.expectedX);
        console.log('PASS native Safari reader and bfcache:', host);
    }
} finally {
    try { await session.cleanup(); } finally { session.close(); }
}
