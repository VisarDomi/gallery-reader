"""Compare native KM location/link navigation on the attached Safari tab.

No favorites edits or restore. Home visits run the normal backup. Videos are
paused after each measurement. The final Back uses WebKit history, not a router.
"""
import asyncio
import argparse
import json
import logging
from urllib.parse import urlparse
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService

SNAP = """JSON.stringify({path:location.pathname,history:history.length,ready:document.readyState,boot:window.__kmExtensionBoot,cards:document.querySelectorAll('.ke-card').length,active:navigator.userActivation?.isActive})"""

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--app-flow',action='store_true',help='Exercise actual thumbnail and related-card handlers instead of navigation probes')
    args=parser.parse_args()
    logging.disable(logging.CRITICAL)
    lock = await create_using_usbmux(serial='00008101-000639912881401E')
    inspector = WebinspectorService(lockdown=lock)
    try:
        await asyncio.wait_for(inspector.connect(),15)
        pages = await inspector.get_open_application_pages(timeout=5)
        pages = [p for p in pages if p.application.bundle=='com.apple.mobilesafari' and urlparse(p.page.web_url).hostname=='ytboob.com']
        if len(pages)!=1: raise RuntimeError('Need one KM Safari tab')
        p=pages[0]
        s=await asyncio.wait_for(inspector.inspector_session(p.application,p.page),15)
        def console(event):
            msg=event['params'].get('message',{}).get('text','')
            if msg.startswith('KM_HISTORY '): print(msg,flush=True)
        s.response_methods['Console.messageAdded']=console
        await s.console_enable()
        await s.runtime_enable()
        async def run(js): return await asyncio.wait_for(s.runtime_evaluate(js),10)
        async def snapshot(label):
            print(label,await run(SNAP),flush=True)
            await run("document.querySelectorAll('video').forEach(v=>v.pause())")
        await snapshot('INITIAL')
        if p.page.web_url!='https://ytboob.com/':
            await run("location.href='https://ytboob.com/'")
            await asyncio.sleep(4)
        video=await run("document.querySelector('.ke-card:not([aria-disabled=\"true\"])')?.dataset.videoPageUrl")
        if not isinstance(video,str) or not video.startswith('https://ytboob.com/'): raise RuntimeError('No ready video')
        await snapshot('HOME')
        if args.app_flow:
            await run("(()=>{const node=document.querySelector('#ke-grid'),boot=window.__kmExtensionBoot;addEventListener('pageshow',e=>console.log('KM_HISTORY '+JSON.stringify({persisted:e.persisted,sameNode:node===document.querySelector('#ke-grid'),sameBoot:boot===window.__kmExtensionBoot})));})()")
            await run("document.querySelector('.ke-card:not([aria-disabled=\"true\"])').click()")
            await asyncio.sleep(4)
            await snapshot('CARD_VIDEO')
            clicked=await run("(()=>{const c=document.querySelector('.ke-card:not([aria-disabled=\"true\"])');if(!c)return false;c.click();return true})()")
            if clicked:
                await asyncio.sleep(4)
                await snapshot('RELATED_REPLACEMENT')
            await run('history.back()')
            await asyncio.sleep(4)
            await snapshot('APP_BACK')
            return
        await run('location.href='+json.dumps(video))
        await asyncio.sleep(4)
        await snapshot('LOCATION_VIDEO')
        await run("(()=>{const a=document.createElement('a');a.href='/';document.body.append(a);a.click();a.remove();})()")
        await asyncio.sleep(4)
        await snapshot('ANCHOR_HOME')
        await run("(()=>{const node=document.querySelector('#ke-grid'),boot=window.__kmExtensionBoot;window.__kmHistoryProbe={node,boot};addEventListener('pageshow',e=>console.log('KM_HISTORY '+JSON.stringify({persisted:e.persisted,sameNode:node===document.querySelector('#ke-grid'),sameBoot:boot===window.__kmExtensionBoot})));})()")
        await run("(()=>{const a=document.createElement('a');a.href="+json.dumps(video)+";document.body.append(a);a.click();a.remove();})()")
        await asyncio.sleep(4)
        await snapshot('ANCHOR_VIDEO')
        await run('history.back()')
        await asyncio.sleep(4)
        await snapshot('BACK')
    finally:
        await inspector.close()
        await lock.close()

asyncio.run(main())
