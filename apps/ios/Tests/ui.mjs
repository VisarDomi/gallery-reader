import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('apps/ios');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#567"/></svg>';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
try {
 for(const provider of ['hitomi','imhentai']) {
  assert.equal(await readFile(resolve(root,'build',provider,'Web/style.css'),'utf8'),await readFile('src/css/style.css','utf8'),'Native styles are exactly shared styles');
  const errors=[], network=[], cancelled=[];
  let releaseFetch;
  let readerOpened=false, metadataGate, routingGate, releaseRouting;
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
  let ggBase='123';
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let restoring=false;
  await context.exposeBinding('bridge',async(_,{command,args={}})=> {
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
   if(command==='init') return JSON.stringify({restoring});
   assert.fail('Unexpected native command: '+command);
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
  assert.equal(await page.locator('.hs-page-bar').first().evaluate(el=>!!(el.compareDocumentPosition(document.getElementById('hs-grid')) & Node.DOCUMENT_POSITION_FOLLOWING)),true,'Count belongs above grid, like the userscript');
  readerOpened=true;
  failReaderImages=provider==='imhentai';
  if(provider==='hitomi') {const gate=deferred();routingGate=gate.promise;releaseRouting=gate.resolve;}
  await page.locator('.hs-thumb').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.hs-reader-img').length===40);
  if(provider==='hitomi') {
   assert.equal(await page.locator('.hs-reader-img').first().evaluate(i=>i.naturalWidth),0,'Slots and dimensions render before blocked image URL resolution');
   releaseRouting();routingGate=undefined;
  }
  await page.waitForFunction(()=>[...document.querySelectorAll('.hs-reader-img')].some(i=>i.getAttribute('src')&&i.complete&&!i.naturalWidth));
  assert.equal(await page.locator('.hs-reader-body').innerText(),'','Failed images must not add text that the userscript does not render');
  assert.equal(await page.locator('.hs-reader-img').evaluateAll(images=>images.some(i=>i.alt)),false,'Image failures must not inject exception text as alt labels');
  failReaderImages=false;
  await page.waitForFunction(()=>document.querySelector('.hs-reader-img')?.naturalWidth>0);
  if(provider==='hitomi')assert.equal(retryAttempts,5,'Shared image retry must recover beyond the old three-retry cap');
  assert.equal(await page.locator('#hs-wrap').count(),0);
  await page.waitForTimeout(200);
  const bookmark=await page.evaluate(()=>{
   addEventListener('scrollend',event=>{if(event.isTrusted)event.stopImmediatePropagation();},true);
   scrollTo(0,1300);
   const historyBefore=history.length;
   dispatchEvent(new Event('scrollend'));
   return {url:location.href,historyBefore,historyAfter:history.length};
  });
  assert.equal(bookmark.historyBefore,bookmark.historyAfter,'Source bookmarks replace the current history entry');
  assert.match(bookmark.url,/page=2/);
  await page.goBack();await page.locator('#query-input').waitFor();
  assert.equal(await page.locator('#query-input').inputValue(),'language:japanese');
  await page.locator('.hs-page-favs').click();await page.getByText('~1 Favorites',{exact:true}).waitFor();
  await page.locator('.hs-row').waitFor();
  restoring=true;
  ggBase='456';imageRequests.length=0;
  await page.goto(bookmark.url);await page.waitForURL(/read=/);await page.locator('.hs-reader-img').first().waitFor();
  assert.equal(await page.evaluate(()=>scrollY),0,'Native code leaves restored-history positioning to WebKit');
  await page.waitForFunction(()=>[...document.querySelectorAll('.hs-reader-img')].some(i=>i.naturalWidth>0));
  if(provider==='hitomi')assert.ok(imageRequests.filter(u=>new URL(u).host.startsWith('w')).every(u=>new URL(u).pathname.startsWith('/456/')),'Cold reader must resolve current provider routing, not reuse saved image URLs');
  assert.equal(await page.locator('.hs-reader-img').count(),40);
  assert.equal(await page.locator('.hs-reader-body > img[loading=lazy]').count(),40,'Source reader renders lazy image elements directly');
  assert.equal(await page.locator('.page,.thumb-link,#reader-message,#status').count(),0,'No copied offline slots or extra status UI');
  assert.deepEqual(errors,[]);
  restoring=false;
  // WebKit retains the page and worker; no native position bookkeeping runs.
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  assert.deepEqual(errors,[]);
  await page.goto('https://app.test/');
  await page.getByRole('button',{name:'Import / Merge',exact:true}).click();
  await page.getByPlaceholder('Paste gallery IDs (space, newline, comma separated)').fill(Array.from({length:30},(_,i)=>i+1).join(' '));
  await page.getByRole('button',{name:'Merge',exact:true}).click();
  await page.getByText('~30 Favorites',{exact:true}).waitFor();
  await page.locator('.hs-page-link').filter({hasText:/^2$/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.hs-row-wrap').length===5);
  assert.equal(await page.locator('.hs-row-wrap').count(),5);
  await page.locator('#query-input').fill('language:japanese');await page.locator('#query-input').press('Enter');
  await page.locator('.hs-page-favs').click();
  await page.waitForFunction(()=>document.querySelectorAll('.hs-row-wrap').length===5);
  assert.equal(await page.locator('.hs-page-active').textContent(),'2','Favs restores the source saved Home page');
  assert.deepEqual(errors,[]);

  // Cold launch reconstructs Home before opening the saved reader. WebKit can
  // preserve that Home while its thumbnail requests are still in flight.
  const homeGate=deferred();metadataGate=homeGate.promise;
  await page.goto('https://app.test/');
  await page.waitForFunction(()=>document.querySelectorAll('.hs-row-wrap').length===5);
  assert.equal(await page.locator('.hs-row').count(),0);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  homeGate.resolve();metadataGate=undefined;
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForFunction(()=>document.querySelectorAll('.hs-row').length===5);
  assert.deepEqual(errors,[],'A retained Home must finish its pending thumbnails after Back');

  console.log(provider+': shared provider search, favorites, current image routing, decoded reader images, retries and WebKit-owned restoration passed ('+network.length+' requests)');
  await context.close();
 }
} finally {await browser.close();}
