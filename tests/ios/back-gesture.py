"""Watch a real thumbnail tap + Safari swipe Back for 55 seconds. No navigation.

Only attaches transient home lifecycle listeners. No storage writes/clears.
Console must remain enabled on the original target to observe bfcache restoration.
"""
import asyncio
import json
import logging
from urllib.parse import urlparse
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService

ARM = r"""JSON.stringify((()=>{
  if (!document.querySelector('#hs-grid')) throw Error('Open home before arming');
  window.__grBackWatch?.stop();
  const node=document.querySelector('#hs-grid'), boot=window.__galleryExtensionBoot;
  const p=window.__grBackWatch={events:[],id:Math.random().toString(36)};
  const emit=(type,extra={})=>{const e={type,epoch:Date.now(),at:performance.now(),historyLength:history.length,...extra};p.events.push(e);console.log('GR_BACK '+JSON.stringify(e));};
  const click=e=>{if(e.target.matches?.('.hs-thumb'))emit('thumbnail-click');};
  const hide=e=>emit('pagehide',{persisted:e.persisted});
  const show=e=>{emit('pageshow',{persisted:e.persisted,sameNode:node===document.querySelector('#hs-grid'),sameBoot:boot===window.__galleryExtensionBoot});requestAnimationFrame(()=>requestAnimationFrame(()=>emit('restored-frame')));};
  document.addEventListener('click',click,true);addEventListener('pagehide',hide);addEventListener('pageshow',show);
  p.stop=()=>{document.removeEventListener('click',click,true);removeEventListener('pagehide',hide);removeEventListener('pageshow',show);};
  return {armed:true,href:location.href,historyLength:history.length,ready:document.readyState};
})())"""

async def main():
    logging.disable(logging.CRITICAL)
    lock=await create_using_usbmux(serial='00008101-000639912881401E')
    inspector=WebinspectorService(lockdown=lock)
    session=None
    try:
        await asyncio.wait_for(inspector.connect(),15)
        pages=await inspector.get_open_application_pages(timeout=5)
        matches=[p for p in pages if p.application.bundle=='com.apple.mobilesafari' and urlparse(p.page.web_url).hostname in ('hitomi.la','imhentai.xxx')]
        if len(matches)!=1: raise RuntimeError('Need exactly one provider tab')
        p=matches[0]
        session=await asyncio.wait_for(inspector.inspector_session(p.application,p.page),15)
        def message(event):
            text=event['params'].get('message',{}).get('text','')
            if text.startswith('GR_BACK '): print(text,flush=True)
        session.response_methods['Console.messageAdded']=message
        await session.console_enable()
        await session.runtime_enable()
        print('ARMED',await session.runtime_evaluate(ARM),flush=True)
        await asyncio.sleep(55)
        print('FINAL',await asyncio.wait_for(session.runtime_evaluate("JSON.stringify({href:location.href,boot:window.__galleryExtensionBoot,events:window.__grBackWatch?.events,historyLength:history.length})"),10),flush=True)
    finally:
        if session:
            try: await asyncio.wait_for(session.runtime_evaluate('window.__grBackWatch?.stop()'),5)
            except Exception: pass
        await inspector.close()
        await lock.close()

asyncio.run(main())
