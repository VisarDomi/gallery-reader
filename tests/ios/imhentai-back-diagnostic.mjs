// Read-only comparison: native page vs document takeover, without the reader worker.
import { createController, createSession, sleep } from 'userscript-ios-test/controller';
const controller = createController({root: process.cwd(), name:'imhentai-back-diagnostic', connectionTimeoutMs:60000});
const session = createSession({controller});
const command = async (code, options) => controller.command((await controller.foregroundClient()).client, code, options);
try {
    await session.connect({allowedHosts:['imhentai.xxx']});
    console.log('Preflight',await command('return {href:location.href,visible:document.visibilityState};'));
    for (const takeover of [false, true]) {
        await session.navigate('https://imhentai.xxx/');
        console.log('Probe', takeover ? 'minimal takeover' : 'native', await command(`
            const response=await fetch(location.href);
            const headers={status:response.status,cache:response.headers.get('cache-control'),pragma:response.headers.get('pragma')};
            await response.body?.cancel();
            ${takeover ? "window.stop();document.open();document.close();document.body.innerHTML='<p>Read-only Back diagnostic</p>';" : ''}
            globalThis.__nativeBackProbe={body:document.body,persisted:false};
            addEventListener('pageshow',e=>{globalThis.__nativeBackProbe.persisted=e.persisted;});
            return headers;
        `));
        await session.navigate('https://imhentai.xxx/view/988447/1/');
        await command('history.back();',{expectResult:false});
        await session.waitForNavigation(client=>client.href==='https://imhentai.xxx/','Back');
        await sleep(1500);
        console.log('Result',takeover ? 'minimal takeover' : 'native',JSON.stringify(await command(`return {persisted:globalThis.__nativeBackProbe?.persisted===true,sameBody:globalThis.__nativeBackProbe?.body===document.body,navigation:performance.getEntriesByType('navigation').map(e=>({type:e.type,reasons:e.notRestoredReasons}))};`)));
    }
} finally {try{await session.cleanup();}finally{session.close();}}
