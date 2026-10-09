const {chromium}=require('@playwright/test');
const {buildSync}=require('esbuild');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 const cache=buildSync({entryPoints:['view-cache.js'],bundle:true,format:'iife',globalName:'Cache',write:false}).outputFiles[0].text;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:8123/**',async route=>{
  const file=new URL(route.request().url()).pathname.slice(1)||'index.html';
  let body;
  if(file==='auth.bundle.js')body=cache+`let listener;window.BookratsAuth={...Cache,async startAuth(c,cb){listener=cb;cb({uid:localStorage.getItem('test.user')||'alice'});},async logout(){listener(null);},accountStore(uid){return {async load(){await new Promise(r=>window.releaseCloud=r);if(window.failCloud)throw Error('offline');return {version:1,currentUser:uid,users:[{id:uid,name:uid,goal:4,color:'#ddef83',photo:''}],books:[],readings:[],clubs:[],activities:[],activeClub:''};},watch(){},stop(){}};}};`;
  else body=await fs.readFile(file);
  await route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('http://localhost:8123/');
 await page.waitForFunction(()=>window.releaseCloud);
 await page.evaluate(()=>window.releaseCloud());
 await page.waitForFunction(()=>cloudReady);
 await page.evaluate(async()=>{const cached=structuredClone(state);cached.users[0].name='Cached Alice';await BookratsAuth.saveCachedState('alice',cached);});
 await page.reload();
 await page.waitForFunction(()=>state?.users[0].name==='Cached Alice'&&!cloudReady);
 await page.evaluate(()=>navigate('estante'));
 await page.locator('[data-action=add-book]').first().click();
 assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
 await page.evaluate(()=>{window.failCloud=true;window.releaseCloud();});
 await page.waitForFunction(()=>!dataLoading);
 assert.equal(await page.evaluate(()=>state.users[0].name),'Cached Alice');
 await page.evaluate(()=>googleLogout());
 await page.waitForFunction(()=>!sessionUser);
 assert.equal(await page.evaluate(()=>BookratsAuth.loadCachedState('alice')),null);
 await page.evaluate(()=>localStorage.setItem('test.user','bob'));
 await page.reload();
 await page.waitForFunction(()=>window.releaseCloud);
 assert.equal(await page.evaluate(()=>state),null);
 await page.evaluate(()=>window.releaseCloud());
 await page.waitForFunction(()=>cloudReady);
 assert.equal(await page.evaluate(()=>state.currentUser),'bob');
 assert.deepEqual(errors,[]);
 console.log('PASS: IndexedDB warm cache, blocked writes, offline view, logout cleanup and account isolation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
