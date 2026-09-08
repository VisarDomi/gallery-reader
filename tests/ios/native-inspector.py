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
    href: location.href, ready: document.readyState, visible: document.visibilityState,
    boot: window.__galleryExtensionBoot,
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
    parser.add_argument('--reload', action='store_true')
    parser.add_argument('--reader', action='store_true')
    parser.add_argument('--policy', action='store_true')
    parser.add_argument('--screenshot', help='Save a native Web Inspector viewport PNG to this path')
    parser.add_argument('--home', action='store_true')
    parser.add_argument('--page-id', type=int)
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)  # never dump raw protocol request headers
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
            if urlparse(pair.page.web_url).hostname not in ('hitomi.la', 'imhentai.xxx'):
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
        if args.policy:
            expression = """(()=>{const s=document.createElement('script');s.textContent='window.__readerPolicyProbe = true';document.head.appendChild(s);s.remove();const executed=window.__readerPolicyProbe===true;delete window.__readerPolicyProbe;return JSON.stringify({unnoncedScriptExecuted:executed})})()"""
            print('POLICY_PROBE', await asyncio.wait_for(session.runtime_evaluate(expression), 10), flush=True)
        if args.reload or args.reader or args.home:
            scripts.clear()
            if args.home:
                await asyncio.wait_for(session.runtime_evaluate("location.href = location.origin + '/'"), 10)
            elif args.reload:
                await asyncio.wait_for(session.send_command('Page.reload'), 10)
            else:
                print('CLICK', await asyncio.wait_for(session.runtime_evaluate("""(()=>{const img=[...document.querySelectorAll('.hs-thumb')].find(i=>i.naturalWidth>0 && i.getBoundingClientRect().top<innerHeight && i.getBoundingClientRect().bottom>0);if(!img)throw Error('No visible decoded thumbnail');const info={src:img.src,time:Date.now()};img.click();return JSON.stringify(info)})()"""), 10), flush=True)
            await asyncio.sleep(8)
            print('SCRIPT_COUNTS', json.dumps(scripts), flush=True)
            print('AFTER_NAVIGATION', await asyncio.wait_for(session.runtime_evaluate(SNAPSHOT), 10), flush=True)
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
        await asyncio.sleep(2)
    finally:
        await inspector.close()
        await lockdown.close()


asyncio.run(main())
