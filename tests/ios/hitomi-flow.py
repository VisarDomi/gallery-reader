"""Test the installed extension in Safari, using existing searches and history.
No favorites edits, storage clearing, restore or userscript injection.
Home visits perform normal backups. By default this is only a navigation smoke
test. Use --manual-navigation for a real tap/swipe bfcache check: after READY,
open a saved search, tap a thumbnail, then swipe Back twice when each view loads.
"""
import argparse
import asyncio
import json
import logging
from urllib.parse import urlparse
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService

REPORT = r"""JSON.stringify({
 path:location.pathname,queryTerms:decodeURIComponent(location.search.slice(1)).split(/\s+/).filter(Boolean).length,
 boot:window.__galleryExtensionBoot,rows:document.querySelectorAll('.hs-row-wrap').length,
 reader:document.querySelectorAll('.hs-reader-img').length,scripts:document.scripts.length,
 warning:document.querySelector('#reader-backup-status')?.textContent,
 count:document.querySelector('.hs-page-bar')?.textContent,
 checkpoint:window.__hitomiFlow,db:window.__hitomiReadProbe
})"""
MARK = """(()=>{const node=document.querySelector('#hs-grid');
 window.__hitomiFlow={label:%s,shows:[],sameGrid:true};
 addEventListener('pageshow',e=>{window.__hitomiFlow.shows.push(e.persisted);window.__hitomiFlow.sameGrid=node===document.querySelector('#hs-grid');});
 return true;})()"""
DB_PROBE = """(()=>{
 window.__hitomiReadProbe=null;
 const source=`const r=indexedDB.open('gallery-reader-data',1);
 r.onupgradeneeded=()=>r.transaction.abort();
 r.onerror=()=>postMessage({error:String(r.error)});
 r.onsuccess=()=>{const db=r.result;const tx=db.transaction('state','readonly');
 const q=tx.objectStore('state').get('reader');let stats;
 q.onsuccess=()=>{stats={favorites:q.result?.favorites.length,searches:q.result?.searches.length};};
 tx.oncomplete=()=>{db.close();postMessage(stats);};
 tx.onabort=()=>{db.close();postMessage({error:String(tx.error)});};tx.commit();};`;
 const u=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 const w=new Worker(u);
 const stop=()=>{clearTimeout(timer);w.terminate();URL.revokeObjectURL(u);};
 const timer=setTimeout(()=>{window.__hitomiReadProbe={error:'timeout'};stop();},5000);
 w.onmessage=e=>{window.__hitomiReadProbe=e.data;stop();};
 return true;
})()"""

async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manual-navigation', action='store_true')
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    lockdown = await create_using_usbmux(serial='00008101-000639912881401E')
    inspector = WebinspectorService(lockdown=lockdown)
    try:
        await asyncio.wait_for(inspector.connect(), 15)
        pages = await inspector.get_open_application_pages(timeout=5)
        matches = [p for p in pages if p.application.bundle == 'com.apple.mobilesafari' and urlparse(p.page.web_url).hostname == 'hitomi.la']
        if len(matches) != 1:
            raise RuntimeError('Need exactly one Hitomi Safari tab')
        p = matches[0]
        session = await asyncio.wait_for(inspector.inspector_session(p.application, p.page), 15)
        await session.runtime_enable()
        async def evaluate(source):
            return await asyncio.wait_for(session.runtime_evaluate(source), 10)
        async def wait(condition, timeout=30):
            deadline = asyncio.get_running_loop().time() + timeout
            while asyncio.get_running_loop().time() < deadline:
                if await evaluate('Boolean(' + condition + ')'):
                    return
                await asyncio.sleep(.3)
            raise RuntimeError('Condition timed out: ' + condition + ' ' + str(await evaluate(REPORT)))
        async def snapshot(label):
            print(label, await evaluate(REPORT), flush=True)
        await evaluate("window.__hitomiBeforeNavigation=true;location.href='https://hitomi.la/'")
        await wait("!window.__hitomiBeforeNavigation && location.pathname==='/' && window.__galleryExtensionBoot?.readyAt && document.querySelectorAll('.hs-row-wrap').length")
        await evaluate(DB_PROBE)
        await wait("window.__hitomiReadProbe")
        await snapshot('HOME_BEFORE')
        if json.loads(await evaluate(REPORT)).get('db', {}).get('error'):
            raise RuntimeError('Local database is stalled')
        await evaluate("""(()=>{const input=document.querySelector('#query-input');
 window.__hitomiOriginalInput=input.value;scrollTo(0,0);input.focus();
 input.value='language:japa';input.setSelectionRange(input.value.length,input.value.length);
 input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()""")
        await wait("document.querySelector('#search-suggestions a')")
        print('AUTOCOMPLETE', await evaluate("""JSON.stringify((()=>{
 const count=document.querySelectorAll('#search-suggestions a').length;
 const a=[...document.querySelectorAll('#search-suggestions a')].find(a=>a.textContent.includes('japanese'));
 if(!a)throw Error('Japanese source suggestion missing');
 a.click();const input=document.querySelector('#query-input');const accepted=input.value;
 input.value=window.__hitomiOriginalInput;input.blur();delete window.__hitomiOriginalInput;
 return {count,accepted,remaining:document.querySelector('#search-suggestions').children.length,scripts:document.scripts.length};
})())"""), flush=True)
        for cycle in range(1):
            await evaluate(MARK % json.dumps('home-' + str(cycle)))
            if args.manual_navigation:
                print('READY: open a saved search, tap a thumbnail, then swipe Back twice.', flush=True)
            else:
                await evaluate("document.querySelector('.hs-saved-show-more')?.click()")
                await wait("!document.querySelector('.hs-saved-show-more')")
                await evaluate("""(()=>{
 const chips=[...document.querySelectorAll('.hs-saved-chip')];
 const biggest=chips.sort((a,b)=>b.firstElementChild.textContent.length-a.firstElementChild.textContent.length)[0];
 if(!biggest)throw Error('No existing saved query');biggest.click();return true;})()""")
            await wait("location.pathname==='/search.html' && window.__galleryExtensionBoot?.readyAt && document.querySelectorAll('.hs-thumb').length")
            await snapshot('SEARCH_' + str(cycle))
            await evaluate(MARK % json.dumps('search-' + str(cycle)))
            if not args.manual_navigation:
                await evaluate("(()=>{const img=document.querySelector('.hs-thumb');img.scrollIntoView({block:'center'});img.click();return true;})()")
            await wait("location.pathname.startsWith('/reader/') && window.__galleryExtensionBoot?.readyAt && [...document.images].some(i=>i.naturalWidth>0)")
            await snapshot('READER_' + str(cycle))
            if args.manual_navigation:
                await wait("location.pathname==='/search.html' && document.querySelectorAll('.hs-row-wrap').length")
                await snapshot('BACK_SEARCH_' + str(cycle))
            else:
                # Safari may skip entries created without real user activation.
                # Do not mislabel a scripted history.back() as a swipe test.
                await evaluate("location.href='https://hitomi.la/'")
            await wait("location.pathname==='/' && document.querySelectorAll('.hs-row-wrap').length")
            await evaluate(DB_PROBE)
            await wait("window.__hitomiReadProbe")
            await asyncio.sleep(1)
            await snapshot('RETURN_HOME_' + str(cycle))
            report = json.loads(await evaluate(REPORT))
            if report.get('warning') or report.get('db', {}).get('error'):
                raise RuntimeError('Home backup/database warning: ' + str(report))
        await asyncio.sleep(10)
        await snapshot('FINAL_HOME')
        if json.loads(await evaluate(REPORT)).get('warning'):
            raise RuntimeError('Delayed backup warning after returning home')
    finally:
        await inspector.close()
        await lockdown.close()

asyncio.run(main())
