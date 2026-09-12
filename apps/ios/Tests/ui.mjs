import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('apps/ios');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#567"/></svg>';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
try {
 for(const provider of ['hitomi','imhentai']) {
  const errors=[], network=[], manifests=new Map();
  let offline=false;
  const state={lastPath:'/',libraryPath:'/',positions:{}};
  const route=path=> {const q=new URL(path,'https://app.test').searchParams;return q.has('read')?'reader:'+q.get('read'):'library:'+(q.get('q')??'favorites')+':'+(q.get('p')||1);};
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let cold=true,documentID;
  await context.exposeBinding('bridge',async({frame},{command,args={}})=> {
   if(command==='manifest-read') return JSON.stringify({manifest:manifests.get(args.key)});
   if(command==='manifest-write') {manifests.set(args.key,args.manifest);return '{}';}
   if(command==='fetch') {
    if(offline) throw new Error('Offline');
    const u=new URL(args.url); network.push(u.href);
    let body='',type='text/plain',status=200;
    if(u.hostname==='192.168.1.197') throw new Error('PC offline fixture');
    if(u.pathname.endsWith('.nozomi')) {const buffer=Buffer.alloc(30*4);for(let i=0;i<30;i++)buffer.writeUInt32BE(i+1,i*4);body=buffer;}
    else if(u.pathname.endsWith('gg.js')) body="var o = 0; var gg = {b:'123/'}";
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
   if(command==='view-save'&&args.document===documentID) {const p=args.position;state.positions[route(p.path)]=p;state.lastPath=p.path;if(!route(p.path).startsWith('reader:'))state.libraryPath=p.path;}
   return '{}';
  });
  await context.addInitScript(()=> {window.webkit={messageHandlers:{gallery:{postMessage:request=>window.bridge(request)}}};});
  await context.route('gallery://app/image?**',route=>route.fulfill({contentType:'image/svg+xml',body:svg}));
  await context.route('https://app.test/**',async route=> {
   const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
   await route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:await readFile(resolve(root,'build',provider,'Web',name))});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://app.test/');
  await page.getByText('0 Favorites',{exact:true}).waitFor();
  await page.locator('#query-input').fill('language:japanese');await page.locator('#query-input').press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.hs-row').length>=20);
  await page.locator('.row-actions button').nth(1).click();
  assert.equal(await page.locator('.row-actions button').nth(1).textContent(),'❤️');
  await page.locator('.info-btn').first().click();await page.locator('.hs-modal-header').waitFor();
  assert.match(await page.locator('.hs-modal-header').textContent(),/Fixture gallery/);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('.thumb-link').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.page').length===40);
  assert.equal(await page.locator('#hs-wrap').count(),0);
  await page.evaluate(async()=>{dispatchEvent(new Event('pointerdown'));scrollTo(0,1300);await window.galleryViewState.save();});
  const saved=structuredClone(state);
  await page.goBack();await page.locator('#query-input').waitFor();
  assert.equal(await page.locator('#query-input').inputValue(),'language:japanese');
  await page.locator('.hs-page-favs').click();await page.getByText('1 Favorites',{exact:true}).waitFor();
  await page.locator('.hs-row').waitFor();
  state.lastPath=saved.lastPath;state.libraryPath=saved.libraryPath;state.positions=saved.positions;cold=true;
  offline=true;
  await page.goto('https://app.test/');await page.waitForURL(/read=/);await page.locator('#page-1').waitFor();
  await page.waitForFunction(()=>scrollY>1000);
  assert.equal(await page.locator('.page').count(),40);
  assert.deepEqual(errors,[]);
  console.log(provider+': shared provider search, favorites, metadata, reader, back and cold restore passed ('+network.length+' requests)');
  await context.close();
 }
} finally {await browser.close();}
