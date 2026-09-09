"""Read the real iPhone Web Inspector over the Mac's trusted USB connection.

Run with the Mac's inspector-venv. No userscript/debugger injection or storage
mutation. --reload is an explicit diagnostic navigation; normal app home sync
can occur on reload. Output omits request bodies and authentication headers.
"""
import argparse
import asyncio
import base64
import json
import logging
from pathlib import Path
from urllib.parse import urlparse

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService

SNAPSHOT = """JSON.stringify({
    href: location.href, ready: document.readyState, visible: document.visibilityState, historyLength:history.length, activation:{active:navigator.userActivation?.isActive,ever:navigator.userActivation?.hasBeenActive},
    boot: window.__galleryExtensionBoot,
    manga: {boot:window.__mangaExtensionBoot,cards:document.querySelectorAll('.hs-home-card').length,chapters:document.querySelectorAll('.hs-chapter').length,status:document.querySelector('.hs-home-catalog-status')?.textContent,errors:[...document.querySelectorAll('.hs-error')].map(e=>e.textContent),backupPrompt:!!document.querySelector('#reader-backup-setup')},
    streamViewer: {boot:window.__streamViewerExtensionBoot,rows:document.querySelectorAll('.stream-row').length,followed:document.querySelectorAll('.stream-row.following').length,stage:!!document.querySelector('.stream-stage'),loading:!!document.querySelector('.viewer-loading'),error:document.querySelector('.status-error')?.textContent,download:[...document.querySelectorAll('button.download')].map(b=>({text:b.textContent,disabled:b.disabled,error:b.classList.contains('error')})),slots:[...document.querySelectorAll('.stream-slot')].map(s=>{const v=s.querySelector('video');return {role:s.className,ready:v?.readyState,width:v?.videoWidth,height:v?.videoHeight,muted:v?.muted,paused:v?.paused,error:v?.error?.code}})},
    km: {boot:window.__kmExtensionBoot,grid:!!document.querySelector('#ke-grid'),cards:document.querySelectorAll('.ke-card').length,favorites:document.querySelectorAll('.ke-fav-toggle.active').length,loading:document.querySelector('.ke-loading')?.textContent,copy:[...document.querySelectorAll('.ke-video-copy')].map(b=>({text:b.textContent,visible:!b.hidden})),backupPrompt:!!document.querySelector('#reader-backup-setup'),video:[...document.querySelectorAll('video')].map(v=>({ready:v.readyState,width:v.videoWidth,height:v.videoHeight,paused:v.paused,error:v.error?.code}))},
    viewport: {innerWidth,innerHeight,screenWidth:screen.width,dpr:devicePixelRatio,visualWidth:visualViewport?.width,scale:visualViewport?.scale,meta:[...document.querySelectorAll('meta[name="viewport"]')].map(m=>m.content)},
    layout: {mode:document.compatMode,bodyWidth:document.body?.getBoundingClientRect().width,bodyFont:document.body&&getComputedStyle(document.body).fontSize,scrollY,elements:[...document.querySelectorAll('#query-input,.hs-thumb,.hs-reader-body img')].slice(0,3).map(e=>({tag:e.tagName,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top,font:getComputedStyle(e).fontSize}))},
    navigation: performance.getEntriesByType('navigation').map(n=>({start:n.startTime,request:n.requestStart,responseStart:n.responseStart,responseEnd:n.responseEnd,domInteractive:n.domInteractive,domComplete:n.domComplete,type:n.type})),
    userAgent: navigator.userAgent,
    shell: !!document.querySelector('#hs-wrap'), reader: !!document.querySelector('.hs-reader-body'),
    rows: document.querySelectorAll('.hs-row-wrap').length,
    images: [...document.images].slice(0,6).map(i=>({src:i.currentSrc||i.src,width:i.naturalWidth,complete:i.complete})),
    scriptCount: document.scripts.length,
    scripts: [...document.scripts].slice(0,12).map(s=>({src:s.src,nonce:!!s.nonce})),
    jq: typeof window.jQuery, suggestions: typeof window.get_suggestions_for_query,
    errors: [...document.querySelectorAll('#hs-grid,#reader-backup-status')].filter(e=>!e.children.length).map(e=>e.textContent.slice(0,250)),
    resources: performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').map(r=>({name:r.name.split('?')[0],start:r.startTime,duration:r.duration}))
})"""


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--native', action='store_true', help='Use the paired Mac network tunnel without USB')
    parser.add_argument('--evaluate-file', help='Evaluate a local diagnostic JavaScript file in the selected tab')
    parser.add_argument('--observe-seconds', type=float, default=2, help='Bounded observation after the diagnostic')
    parser.add_argument('--reload', action='store_true')
    parser.add_argument('--reader', action='store_true')
    parser.add_argument('--stream', action='store_true', help='Open the first Stream Viewer native Home link')
    parser.add_argument('--site', choices=['gallery', 'km', 'stream', 'manga'])
    parser.add_argument('--video', action='store_true', help='Click a visible ready KM card, then pause its video')
    parser.add_argument('--navigate', choices=['https://hitomi.la/', 'https://ytboob.com/', 'https://ytboob.com/great-try-on-haul/', 'https://ytboob.com/purple-see-through-try-on-haul-4k-017/', 'https://ezmanga.org/', 'https://qimanga.com/', 'https://yakshacomics.com/', 'https://asurascans.com/', 'https://scythescans.com/', 'https://luacomic.org/'])
    parser.add_argument('--watch-copy', action='store_true', help='Observe a real Copy tap for 45 seconds; never read the clipboard')
    parser.add_argument('--policy', action='store_true')
    parser.add_argument('--screenshot', help='Save a native Web Inspector viewport PNG to this path')
    parser.add_argument('--home', action='store_true')
    parser.add_argument('--page-id', type=int)
    parser.add_argument('--km-stats', action='store_true', help='Read only KM store counts in a disposable worker')
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)  # never dump raw protocol request headers
    if args.native:
        from pymobiledevice3.remote.native_tunnel import establish_native_rsd
        lockdown = await establish_native_rsd(serial='00008101-000639912881401E')
    else:
        lockdown = await create_using_usbmux(serial='00008101-000639912881401E')
    inspector = WebinspectorService(lockdown=lockdown)
    try:
        await asyncio.wait_for(inspector.connect(), 15)
        pages = await inspector.get_open_application_pages(timeout=3)
        if not pages:
            await inspector.get_open_pages()
            pages = await inspector.get_open_application_pages(timeout=5)
        candidates = []
        for pair in pages:
            if pair.application.bundle != 'com.apple.mobilesafari':
                continue
            hosts={'gallery':('hitomi.la','imhentai.xxx'),'km':('ytboob.com',),'stream':('tango.me','www.tango.me'),'manga':('ezmanga.org','qimanga.com','yakshacomics.com','asurascans.com','scythescans.com','luacomic.org')}
            allowed=hosts[args.site] if args.site else sum(hosts.values(),())
            if urlparse(pair.page.web_url).hostname not in allowed:
                continue
            print('PAGE', json.dumps({'app': pair.application.bundle, 'id': pair.page.id_, 'url': pair.page.web_url}), flush=True)
            if args.page_id is None or pair.page.id_ == args.page_id:
                candidates.append(pair)
        if len(candidates) != 1:
            raise RuntimeError('Select exactly one provider tab with --page-id; candidates=' + str(len(candidates)))
        pair = candidates[0]
        session = await asyncio.wait_for(inspector.inspector_session(pair.application, pair.page), 15)
        scripts = {}
        def script(event):
            params = event['params']
            key = params.get('url') or params.get('sourceURL') or '(anonymous)'
            scripts[key] = scripts.get(key, 0) + 1
            if scripts[key] == 1:
                print('SCRIPT', json.dumps({k: params.get(k) for k in ('url', 'sourceURL', 'startLine', 'isContentScript')}), flush=True)

        def console(event):
            msg = event['params'].get('message', {})
            stack = msg.get('stackTrace', {})
            frames = stack.get('callFrames', []) if isinstance(stack, dict) else stack
            print('CONSOLE', json.dumps({'level': msg.get('level'), 'text': msg.get('text', '')[:700], 'stackDepth': len(frames), 'frames': frames[:8]}), flush=True)

        session.response_methods['Console.messageAdded'] = console
        session.response_methods['Debugger.scriptParsed'] = script

        def response(event):
            params = event['params']
            info = params.get('response', {})
            if params.get('type') == 'Image' and info.get('status', 200) < 400:
                return
            headers = {k: v for k, v in info.get('headers', {}).items() if k.lower() in ('content-security-policy', 'cache-control', 'content-type')}
            print('RESPONSE', json.dumps({'time': params.get('timestamp'), 'type': params.get('type'), 'url': info.get('url', '').split('?')[0], 'status': info.get('status'), 'headers': headers}), flush=True)

        session.response_methods['Network.responseReceived'] = response
        session.response_methods['Network.loadingFailed'] = lambda event: print('FAILED', json.dumps(event['params']), flush=True)
        await asyncio.wait_for(session.console_enable(), 10)
        await asyncio.wait_for(session.runtime_enable(), 10)
        await asyncio.wait_for(session.send_command('Network.enable'), 10)
        await asyncio.wait_for(session.send_command('Debugger.enable'), 10)
        print('SNAPSHOT', await asyncio.wait_for(session.runtime_evaluate(SNAPSHOT), 10), flush=True)
        if args.evaluate_file:
            print('DIAGNOSTIC', await asyncio.wait_for(session.runtime_evaluate(Path(args.evaluate_file).read_text()), 10), flush=True)
        if args.km_stats:
            if urlparse(pair.page.web_url).hostname != 'ytboob.com':
                raise RuntimeError('KM stats require the KM origin')
            # No getAll of media catalogs, no main-thread IDB and no migrations.
            worker_source = """const r=indexedDB.open('km-explorer',5);r.onupgradeneeded=()=>r.transaction.abort();r.onerror=()=>postMessage({error:String(r.error)});r.onsuccess=()=>{const db=r.result;const names=['videos','details','channels','preferences'];const tx=db.transaction(names,'readonly');const stats={version:db.version};for(const name of names){const q=tx.objectStore(name).count();q.onsuccess=()=>stats[name]=q.result;}const p=tx.objectStore('preferences').get('state');p.onsuccess=()=>{const v=p.result;stats.favorites=v?.favorites?.length;stats.scrollPositions=Object.keys(v?.scroll||{}).length;stats.selectedCard=!!v?.highlight;};tx.oncomplete=()=>{db.close();postMessage(stats);};tx.onabort=()=>{db.close();postMessage({error:String(tx.error)});};};"""
            expression = """(()=>{const u=URL.createObjectURL(new Blob([%s],{type:'text/javascript'}));const w=new Worker(u);const stop=()=>{w.terminate();URL.revokeObjectURL(u);};const timer=setTimeout(stop,10000);w.onmessage=e=>{console.log('KM_STATS '+JSON.stringify(e.data));clearTimeout(timer);stop();};w.onerror=()=>{clearTimeout(timer);stop();};return 'Reading KM counts in worker';})()""" % json.dumps(worker_source)
            print('STATS_REQUEST', await session.runtime_evaluate(expression), flush=True)
        if args.policy:
            expression = """(()=>{const s=document.createElement('script');s.textContent='window.__readerPolicyProbe = true';document.head.appendChild(s);s.remove();const executed=window.__readerPolicyProbe===true;delete window.__readerPolicyProbe;return JSON.stringify({unnoncedScriptExecuted:executed})})()"""
            print('POLICY_PROBE', await asyncio.wait_for(session.runtime_evaluate(expression), 10), flush=True)
        if args.reload or args.reader or args.home or args.video or args.navigate or args.stream:
            scripts.clear()
            if args.navigate:
                await asyncio.wait_for(session.runtime_evaluate('location.href = ' + json.dumps(args.navigate)), 10)
            elif args.stream:
                await asyncio.wait_for(session.runtime_evaluate("document.querySelector('a.stream-row')?.click()"), 10)
            elif args.video:
                print('CLICK', await asyncio.wait_for(session.runtime_evaluate("""(()=>{const card=[...document.querySelectorAll('.ke-card:not([aria-disabled="true"])')].find(c=>c.getBoundingClientRect().top<innerHeight&&c.getBoundingClientRect().bottom>0);if(!card)throw Error('No visible KM card');card.click();return 'KM card clicked'})()"""), 10), flush=True)
            elif args.home:
                await asyncio.wait_for(session.runtime_evaluate("location.href = location.origin + '/'"), 10)
            elif args.reload:
                await asyncio.wait_for(session.send_command('Page.reload'), 10)
            elif args.reader and args.site == 'manga':
                print('CLICK', await asyncio.wait_for(session.runtime_evaluate("""(()=>{const link=document.querySelector('.hs-home-chapter:not(.hs-home-chapter-locked)');if(!link)throw Error('No chapter link');link.click();return 'Manga chapter clicked'})()"""), 10), flush=True)
            else:
                print('CLICK', await asyncio.wait_for(session.runtime_evaluate("""(()=>{const img=[...document.querySelectorAll('.hs-thumb')].find(i=>i.naturalWidth>0 && i.getBoundingClientRect().top<innerHeight && i.getBoundingClientRect().bottom>0);if(!img)throw Error('No visible decoded thumbnail');const info={src:img.src,time:Date.now()};img.click();return JSON.stringify(info)})()"""), 10), flush=True)
            await asyncio.sleep(8)
            print('SCRIPT_COUNTS', json.dumps(scripts), flush=True)
            print('AFTER_NAVIGATION', await asyncio.wait_for(session.runtime_evaluate(SNAPSHOT), 10), flush=True)
            if args.video:
                await session.runtime_evaluate("document.querySelectorAll('video').forEach(v=>v.pause())")
        if args.screenshot:
            dimensions = json.loads(await session.runtime_evaluate('JSON.stringify({width:innerWidth,height:innerHeight})'))
            result = await asyncio.wait_for(session.send_command('Page.snapshotRect', x=0, y=0, coordinateSystem='Viewport', **dimensions), 15)
            if result.get('method') == 'Target.dispatchMessageFromTarget':
                result = json.loads(result['params']['message'])
            payload = result.get('result', result)
            if 'dataURL' in payload:
                Path(args.screenshot).write_bytes(base64.b64decode(payload['dataURL'].split(',', 1)[1]))
                print('SCREENSHOT', args.screenshot, flush=True)
            else:
                print('SCREENSHOT_UNAVAILABLE', json.dumps(result.get('error', {'keys': list(result)})), flush=True)
        if args.watch_copy:
            print('COPY_ARMED', await session.runtime_evaluate("""(()=>{const b=document.querySelector('.ke-video-copy');if(!b||b.hidden)throw Error('No visible Copy button');const log=e=>console.log('KM_COPY '+JSON.stringify({trusted:e.isTrusted,text:b.textContent}));b.addEventListener('click',log);const o=new MutationObserver(()=>console.log('KM_COPY_RESULT '+JSON.stringify({text:b.textContent})));o.observe(b,{childList:true,subtree:true});window.__kmStopCopyWatch=()=>{b.removeEventListener('click',log);o.disconnect();delete window.__kmStopCopyWatch;};return 'Tap Copy now';})()"""), flush=True)
            try:
                await asyncio.sleep(45)
            finally:
                await session.runtime_evaluate('window.__kmStopCopyWatch?.()')
        await asyncio.sleep(min(45, max(0, args.observe_seconds)))
    finally:
        await inspector.close()
        await lockdown.close()


asyncio.run(main())
