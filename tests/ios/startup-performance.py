"""Native iPhone Safari timing probe. No storage clearing or reader injection.

Runs home navigation -> visible thumbnail -> reader -> history.back(). Build the
extension with READER_PERFORMANCE_PROBE=1; the temporary probe only observes
scheduling/lifecycle. Reinstall a normal build afterwards to remove it.
Keep Safari foregrounded. Inspector/USB overhead makes this diagnostic, not a
lab benchmark. history.back tests bfcache, not the physical swipe animation.
"""
import asyncio
import argparse
from collections import Counter
import json
import logging
from urllib.parse import urlparse

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService

REPORT = r"""JSON.stringify((() => {
  const p=window.__grPerf;
  const stats=a=>{a=[...a].sort((x,y)=>x-y);return {n:a.length,max:a.at(-1),p95:a[Math.floor(a.length*.95)],over50:a.filter(n=>n>50).length,over100:a.filter(n=>n>100).length};};
  return {href:location.href,ready:document.readyState,visible:document.visibilityState,historyLength:history.length,boot:window.__galleryExtensionBoot,
    probe:p&&{id:p.id,born:p.born,firstFrame:p.firstFrame,frames:stats(p.frames),timerIntervals:stats(p.ticks),shows:p.shows,hides:p.hides,restoredFrameEpoch:p.restoredFrameEpoch},
    sameHomeNode:p?.homeNode===document.querySelector('#hs-grid'),scrollY,
    viewport:{width:innerWidth,scale:visualViewport?.scale},
    navigation:performance.getEntriesByType('navigation').map(n=>({type:n.type,responseStart:n.responseStart,responseEnd:n.responseEnd,domComplete:n.domComplete})),
    rows:document.querySelectorAll('.hs-row-wrap').length,
    images:[...document.images].slice(0,3).map(i=>({decoded:i.naturalWidth>0,top:i.getBoundingClientRect().top,width:i.getBoundingClientRect().width})),
    scripts:[...document.scripts].map(s=>s.src),
    originalScriptResources:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').map(r=>({url:r.name.split('?')[0],start:r.startTime,duration:r.duration}))};
})())"""

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--profile-home', action='store_true')
    args=parser.parse_args()
    logging.disable(logging.CRITICAL)
    lockdown = await create_using_usbmux(serial='00008101-000639912881401E')
    inspector = WebinspectorService(lockdown=lockdown)
    session = None
    try:
        await asyncio.wait_for(inspector.connect(), 15)
        pages = await inspector.get_open_application_pages(timeout=5)
        matches = [p for p in pages if p.application.bundle == 'com.apple.mobilesafari' and urlparse(p.page.web_url).hostname in ('hitomi.la', 'imhentai.xxx')]
        if len(matches) != 1:
            raise RuntimeError('Need exactly one provider tab: ' + str(len(matches)))
        p=matches[0]
        session=await asyncio.wait_for(inspector.inspector_session(p.application,p.page),15)
        await session.runtime_enable()
        async def evaluate(source):
            return await asyncio.wait_for(session.runtime_evaluate(source),10)
        await evaluate("location.href=location.origin+'/'")
        if args.profile_home:
            await asyncio.sleep(.3)
            samples=[]
            events=[]
            session.response_methods['ScriptProfiler.trackingComplete']=lambda e:samples.extend(e['params'].get('samples',{}).get('stackTraces',[]))
            session.response_methods['ScriptProfiler.trackingUpdate']=lambda e:events.append(e['params']['event'])
            await session.send_command('ScriptProfiler.startTracking',includeSamples=True)
            await asyncio.sleep(8)
            await session.send_command('ScriptProfiler.stopTracking')
            await asyncio.sleep(1)
            counts=Counter()
            for sample in samples:
                for frame in sample.get('stackFrames',[]):
                    counts[(frame['name'],frame['url'],frame['line'])]+=1
            durations=[(e['endTime']-e['startTime'])*1000 for e in events]
            print('PROFILE',json.dumps({'samples':len(samples),'events':len(events),'maxTaskMs':max(durations,default=0),'over50':sum(d>50 for d in durations),'topFrames':[{'frame':k,'samples':v} for k,v in counts.most_common(18)]}),flush=True)
            print('HOME',await evaluate(REPORT),flush=True)
            return
        await asyncio.sleep(10)
        print('HOME',await evaluate(REPORT),flush=True)
        print('CLICK',await evaluate(r"""JSON.stringify((()=>{
          const p=window.__grPerf; if(!p)throw Error('Build with READER_PERFORMANCE_PROBE=1 first');
          p.homeNode=document.querySelector('#hs-grid');
          const i=[...document.querySelectorAll('.hs-thumb')].find(i=>i.naturalWidth>0&&i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0);
          if(!i)throw Error('No visible decoded thumbnail');
          const result={epoch:Date.now(),at:performance.now(),homeId:p.id};i.click();return result;
        })())"""),flush=True)
        await asyncio.sleep(6)
        print('READER',await evaluate(REPORT),flush=True)
        await evaluate('window.__grPerf?.stop()')
        print('BACK_REQUEST',await evaluate("JSON.stringify((()=>{const epoch=Date.now();history.back();return {epoch};})())"),flush=True)
        await asyncio.sleep(2)
        print('BACK',await evaluate(REPORT),flush=True)
    finally:
        if session:
            try:
                await asyncio.wait_for(session.runtime_evaluate('window.__grPerf?.stop()'),5)
            except Exception:
                pass
        await inspector.close()
        await lockdown.close()

asyncio.run(main())
