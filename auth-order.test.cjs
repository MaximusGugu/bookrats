const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.failStart=true;});
  await page.route('http://localhost:8123/**',async route=>{
   const file=new URL(route.request().url()).pathname.slice(1)||'index.html';
   let body;
   if(file==='auth.bundle.js')body=`let listener;window.BookratsAuth={async startAuth(c,cb){if(window.failStart)throw Error('Falha temporária');listener=cb;cb(JSON.parse(sessionStorage.getItem('mockUser')||'null'));},async login(){if(window.failLogin)throw Error('Login cancelado');const u={uid:window.nextUser||'alice',displayName:'Leitor Google',email:'reader@example.com'};sessionStorage.setItem('mockUser',JSON.stringify(u));listener(u);},async logout(){sessionStorage.removeItem('mockUser');listener(null);},authError(e){return e.message;}};`;
   else body=await fs.readFile(path.join(__dirname,file));
   await route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'text/html'});
  });
  await page.goto('http://localhost:8123/');
  await page.getByText('Falha temporária',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Entrar com Google'}).isEnabled(),true,'Retry available after initialization failure');
  assert.equal(await page.locator('[data-action=demo]').count(),0);
  await page.evaluate(()=>{window.failStart=false;});
  await page.getByRole('button',{name:'Entrar com Google'}).click();
  await page.waitForFunction(()=>authReady);
  await page.evaluate(()=>window.failLogin=true);
  await page.getByRole('button',{name:'Entrar com Google'}).click();
  await page.getByText('Login cancelado',{exact:true}).waitFor();
  await page.evaluate(()=>window.failLogin=false);
  await page.getByRole('button',{name:'Entrar com Google'}).click();
  await page.waitForFunction(()=>sessionUser?.uid==='alice');
  assert.equal(await page.evaluate(()=>state.books.length),0);
  await page.evaluate(()=>navigate('estante'));
  // Use actual forms to create and update readings.
  for(const title of ['Primeiro','Segundo']){
   await page.getByRole('button',{name:'Adicionar livro',exact:true}).click();
   await page.locator('[name=title]').fill(title);
   await page.locator('[name=author]').fill('Autora');
   await page.locator('[name=pages]').fill('200');
   await page.getByRole('button',{name:'Salvar',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('dialog').open);
  }
  assert.equal(await page.locator('.book-title').first().textContent(),'Segundo');
  await page.getByRole('button',{name:'Abrir Primeiro',exact:true}).click();
  await page.getByRole('button',{name:'Registrar leitura',exact:true}).click();
  await page.locator('[name=page]').fill('20');
  await page.locator('[name=date]').fill('2020-01-01');
  await page.getByRole('button',{name:'Registrar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.book-title')?.textContent==='Primeiro');
  await page.evaluate(()=>{user().goal=6;save();navigate('perfil');});
  assert.equal(await page.locator('#profileSwitch').count(),0);
  await page.reload();
  await page.evaluate(()=>window.failStart=false);
  await page.getByRole('button',{name:'Entrar com Google'}).click();
  await page.waitForFunction(()=>sessionUser?.uid==='alice');
  assert.equal(await page.evaluate(()=>user().goal),6);
  await page.evaluate(()=>navigate('estante'));
  assert.equal(await page.locator('.book-title').first().textContent(),'Primeiro');
  await page.evaluate(()=>navigate('perfil'));
  await page.getByRole('button',{name:'Sair da conta'}).click();
  await page.waitForFunction(()=>!sessionUser&&!authBusy);
  assert.equal(await page.getByRole('button',{name:'Entrar com Google'}).isEnabled(),true);
  await page.evaluate(()=>{location.hash='estante';});
  assert.equal(await page.locator('.shelf').count(),0,'Protected view after logout');
  await page.evaluate(()=>window.nextUser='bob');
  await page.getByRole('button',{name:'Entrar com Google'}).click();
  await page.waitForFunction(()=>sessionUser?.uid==='bob');
  assert.equal(await page.evaluate(()=>user().goal),4);
  assert.equal(await page.evaluate(()=>state.books.length),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: init failure/retry, no anonymous access, cancellation, ordering, reload, logout, protected routes, account isolation (mock Auth).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
