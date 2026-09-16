import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('apps/ios');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#567"/></svg>';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
try {
 for(const provider of ['hitomi','imhentai']) {
  const errors=[], network=[], manifests=new Map(), cancelled=[];
  let releaseFetch;
  let readerOpened=false, metadataGate, releaseMetadata, routingGate, releaseRouting;
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
  let ggBase='123';
  const state={lastPath:'/',libraryPath:'/',positions:{}};
  const route=path=> {const q=new URL(path,'https://app.test').searchParams;return q.has('read')?'reader:'+q.get('read'):'library:'+(q.get('q')??'favorites')+':'+(q.get('p')||1);};
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let cold=true,documentID,viewWrites=0;
  await context.exposeBinding('bridge',async({frame},{command,args={}})=> {
   if(command==='manifest-read') return JSON.stringify({manifest:manifests.get(args.key)});
   if(command==='manifest-write') {manifests.set(args.key,args.manifest);return '{}';}
   if(command==='fetch-cancel') {cancelled.push(args.requestID);return '{}';}
   if(command==='fetch') {
    const u=new URL(args.url); network.push(u.href);
    if ((u.pathname.startsWith('/galleries/') || u.pathname.startsWith('/gallery/')) && metadataGate) await metadataGate;
    if(u.hostname==='cancel.test') await new Promise(resolve=>{releaseFetch=resolve;});
    let body='',type='text/plain',status=200;
    if(u.hostname==='192.168.1.197') throw new Error('PC offline fixture');
    if(u.pathname.endsWith('.nozomi')) {const buffer=Buffer.alloc(30*4);for(let i=0;i<30;i++)buffer.writeUInt32BE(i+1,i*4);body=buffer;}
    else if(u.pathname.endsWith('gg.js')) { assert.equal(readerOpened,true,'Home thumbnails must not depend on full-size image routing'); if(routingGate) await routingGate; body=`var o = 0; var gg = {b:'${ggBase}/'}`; }
    else if(u.pathname.startsWith('/galleries/')) body='var galleryinfo = '+JSON.stringify({title:'Fixture gallery',language:'japanese',tags:[{tag:'sample',female:true}],files:Array.from({length:40},(_,i)=>({hash:String(i+1).padStart(64,'0'),width:100,height:300}))})+';';
    else if(u.pathname.startsWith('/gallery/')) body=`<h1>Fixture gallery</h1><img data-src="https://i.imhentai.xxx/001/222/1t.jpg"><script>$.parseJSON('${JSON.stringify(Object.fromEntries(Array.from({length:40},(_,i)=>[String(i+1),'j,100,300'])))}')</script>`;
    else body=Array.from({length:20},(_,i)=>`<a href="/gallery/${i+1}/">Gallery</a>`).join('')+"<a class='page-link' href='/search/?page=2'>2</a>";
    return JSON.stringify({status,headers:{'Content-Type':type},body:Buffer.from(body).toString('base64')});
   }
   if(command==='init') {
    documentID=args.document;const path=new URL(frame.url()).pathname+new URL(frame.url()).search;
    const result={position:state.positions[route(path)]};
    if(cold) {cold=false;if(route(state.lastPath).startsWith('reader:'))result.resumeReader=state.lastPath;else if(path!==state.lastPath)result.redirect=state.lastPath;}
    return JSON.stringify(result);
   }
   if(command==='view-save'&&args.document===documentID) {viewWrites++;const p=args.position;state.positions[route(p.path)]=p;state.lastPath=p.path;if(!route(p.path).startsWith('reader:'))state.libraryPath=p.path;}
   return '{}';
  });
  await context.addInitScript(()=> {
   window.webkit={messageHandlers:{gallery:{postMessage:request=>window.bridge(request)}}};
   // Chromium has no WKURLSchemeHandler. Route native image resources through
   // an intercepted HTTPS origin so real image decoding is exercised.
   const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
   Object.defineProperty(HTMLImageElement.prototype,'src',{...src,set(value){src.set.call(this,String(value).replace('gallery://app/image?','https://images.test/image?'));}});
  });
  const imageRequests=[];
  let retryAttempts=0, failReaderImages=false;
  await context.route('https://images.test/**',route=>{
   const source=new URL(new URL(route.request().url()).searchParams.get('url'));
   imageRequests.push(source.href);
   if(failReaderImages)return route.fulfill({status:429,body:'Image temporarily unavailable'});
   if(source.host.startsWith('w')&&!source.pathname.startsWith('/'+ggBase+'/'))return route.fulfill({status:404,body:'Expired image routing'});
   if(source.host.startsWith('w')&&ggBase==='123'&&source.pathname.endsWith('/'+String(1).padStart(64,'0')+'.webp')) {
    if(++retryAttempts<=4)return route.fulfill({status:429,body:'Transient image failure'});
   }
   return route.fulfill({contentType:'image/svg+xml',body:svg});
  });
  await context.route('https://app.test/**',async route=> {
   const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
   await route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:await readFile(resolve(root,'build',provider,'Web',name))});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://app.test/');
  await page.getByText('~0 Favorites',{exact:true}).waitFor();
  const abortResult=await page.evaluate(async()=>{
   const controller=new AbortController();
   const task=fetch('https://cancel.test/delayed',{signal:controller.signal}).then(()=> 'resolved',error=>error.name);
   setTimeout(()=>controller.abort(),20);
   return Promise.race([task,new Promise(resolve=>setTimeout(()=>resolve('still waiting'),250))]);
  });
  assert.equal(abortResult,'AbortError','Native Fetch must reject promptly without waiting for network completion');
  assert.equal(cancelled.length,1,'Abort reaches native cancellation');
  releaseFetch();

  await page.locator('#query-input').fill('language:japanese');await page.locator('#query-input').press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.hs-row').length>=20);
  await page.locator('.row-actions button').nth(1).click();
  await page.waitForFunction(()=>document.querySelectorAll('.row-actions button')[1]?.textContent==='❤️');
  assert.equal(await page.locator('.row-actions button').nth(1).textContent(),'❤️');
  await page.locator('.info-btn').first().click();await page.locator('.hs-modal-header').waitFor();
  assert.match(await page.locator('.hs-modal-header').textContent(),/Fixture gallery/);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  assert.deepEqual(await page.locator('.hs-page-active').evaluate(el=>({tag:el.tagName,padding:getComputedStyle(el).padding})),{tag:'SPAN',padding:'2px 6px'},'Source pagination appearance and inactive current-page control');
  assert.equal(await page.locator('#count').evaluate(el=>!!(el.compareDocumentPosition(document.getElementById('hs-grid')) & Node.DOCUMENT_POSITION_FOLLOWING)),true,'Count belongs above grid, like the userscript');
  readerOpened=true;
  failReaderImages=provider==='imhentai';
  if(provider==='hitomi') {const gate=deferred();routingGate=gate.promise;releaseRouting=gate.resolve;}
  await page.locator('.thumb-link').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.page').length===40);
  if(provider==='hitomi') {
   assert.equal(await page.locator('.page img').first().evaluate(i=>i.naturalWidth),0,'Slots and dimensions render before blocked image URL resolution');
   releaseRouting();routingGate=undefined;
  }
  await page.waitForFunction(()=>[...document.querySelectorAll('.page img')].some(i=>i.getAttribute('src')&&i.complete&&!i.naturalWidth));
  assert.equal(await page.locator('#reader-pages').innerText(),'','Failed images must not add text that the userscript does not render');
  assert.equal(await page.locator('.page img').evaluateAll(images=>images.some(i=>i.alt)),false,'Image failures must not inject exception text as alt labels');
  failReaderImages=false;
  await page.waitForFunction(()=>document.querySelector('.page img')?.naturalWidth>0);
  if(provider==='hitomi')assert.equal(retryAttempts,5,'Shared image retry must recover beyond the old three-retry cap');
  assert.equal(await page.locator('#hs-wrap').count(),0);
  await page.waitForTimeout(200);
  const beforeScroll=viewWrites;
  await page.evaluate(()=>dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(220);
  assert.equal(viewWrites,beforeScroll,'Ongoing scroll must not trigger the old 150ms checkpoint timer');
  await page.evaluate(()=>dispatchEvent(new Event('scrollend')));
  await page.waitForTimeout(50);
  assert.ok(viewWrites>beforeScroll,'scrollend checkpoints immediately');
  await page.evaluate(async()=>{dispatchEvent(new Event('pointerdown'));scrollTo(0,1300);await window.galleryViewState.save();});
  const saved=structuredClone(state);
  await page.goBack();await page.locator('#query-input').waitFor();
  assert.equal(await page.locator('#query-input').inputValue(),'language:japanese');
  await page.locator('.hs-page-favs').click();await page.getByText('~1 Favorites',{exact:true}).waitFor();
  await page.locator('.hs-row').waitFor();
  state.lastPath=saved.lastPath;state.libraryPath=saved.libraryPath;state.positions=saved.positions;cold=true;
  ggBase='456';imageRequests.length=0;
  await page.goto('https://app.test/');await page.waitForURL(/read=/);await page.locator('#page-1').waitFor();
  await page.waitForFunction(()=>scrollY>1000);
  await page.waitForFunction(()=>[...document.querySelectorAll('.page img')].some(i=>i.naturalWidth>0));
  if(provider==='hitomi')assert.ok(imageRequests.filter(u=>new URL(u).host.startsWith('w')).every(u=>new URL(u).pathname.startsWith('/456/')),'Cold reader must resolve current provider routing, not reuse saved image URLs');
  assert.equal(await page.locator('.page').count(),40);
  assert.deepEqual(errors,[]);
  assert.equal(manifests.size,0,'Resolved provider URLs must not be written to persistent manifests');
  // Delayed reader metadata must not override input that arrived during loading.
  const gate=deferred();metadataGate=gate.promise;releaseMetadata=gate.resolve;
  await page.goto(`https://app.test/?read=${provider}-999&page=20`);
  await page.waitForFunction(()=>!!window.galleryViewState);
  await page.evaluate(()=>dispatchEvent(new Event('pointerdown')));
  releaseMetadata();metadataGate=undefined;
  await page.waitForFunction(()=>document.querySelectorAll('.page').length===40);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>scrollY),0,'Early user input cancels delayed initial reader positioning');
  // Run the actual suspension handlers explicitly: browser navigation can hide
  // pagehide exceptions and does not deterministically exercise bfcache.
  const beforeSuspend=viewWrites;
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await page.waitForTimeout(50);
  assert.deepEqual(errors,[],'pagehide cleanup must complete without a removed-timer ReferenceError');
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForTimeout(200);
  await page.evaluate(()=>dispatchEvent(new Event('scrollend')));
  await page.waitForTimeout(50);
  assert.ok(viewWrites>beforeSuspend,'Restored document recreates its worker and accepts checkpoints');
  await page.goto('https://app.test/');
  await page.getByRole('button',{name:'Import / Merge',exact:true}).click();
  await page.getByPlaceholder('Paste gallery IDs (space, newline, comma separated)').fill(Array.from({length:30},(_,i)=>i+1).join(' '));
  await page.getByRole('button',{name:'Merge',exact:true}).click();
  await page.getByText('~30 Favorites',{exact:true}).waitFor();
  await page.locator('.hs-page-link').filter({hasText:/^2$/}).click();
  await page.waitForURL(/p=2/);
  assert.equal(await page.locator('.hs-row-wrap').count(),5);
  await page.locator('#query-input').fill('language:japanese');await page.locator('#query-input').press('Enter');
  await page.locator('.hs-page-favs').click();
  await page.waitForURL(/p=2/);
  await page.waitForFunction(()=>document.querySelectorAll('.hs-row-wrap').length===5);
  assert.equal(await page.locator('.hs-page-active').textContent(),'2','Favs restores the source saved Home page');
  assert.deepEqual(errors,[]);

  console.log(provider+': shared provider search, favorites, current image routing, decoded reader images, retries, back and cold restore passed ('+network.length+' requests)');
  await context.close();
 }
} finally {await browser.close();}
