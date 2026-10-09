const {chromium}=require('@playwright/test');const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:8123/**',async route=>{
  const file=new URL(route.request().url()).pathname.slice(1)||'index.html';let body=await fs.readFile(path.join(__dirname,file));
  if(file==='auth.bundle.js')body=`window.BookratsAuth={async startAuth(c,cb){this.cb=cb;cb(null);},async login(){this.cb({uid:'bob',displayName:'Bob',email:'bob@example.com'});},async logout(){this.cb(null);},authError(e){return e.message;}};`+'\n'+await fs.readFile('tests/cloud-mock.js','utf8')+`
  const baseStore=window.BookratsAuth.accountStore;window.BookratsAuth.accountStore=uid=>{const store=baseStore(uid);return {...store,
   async previewInvite(token){if(token==='0'.repeat(64))throw Error('Convite revogado');return {name:'Leitores convidados',clubId:'club-shared',expiresAt:Date.now()+86400000};},
   async acceptInvite(token){const s=await store.read();s.clubs=[{id:'club-shared',name:'Leitores convidados',description:'',owner:'alice',members:['alice','bob'],target:40,proposals:[],votes:{},comments:[],meetings:[],shared:true}];s.users.push({id:'alice',name:'Alice',goal:4,color:'#c8dfe8',photo:''});await store.save(s);return 'club-shared';},
   async createInvite(cid,renew){return {name:'Meu clube',clubId:cid,token:(renew?'b':'a').repeat(64),expiresAt:Date.now()+86400000};},
   async revokeInvite(){window.revoked=true;}
  };};`;
  await route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('http://localhost:8123/?invite='+'a'.repeat(64));
 await page.getByText('Entre com Google para ver e aceitar o convite do clube.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Entrar com Google'}).click();
 await page.getByRole('heading',{name:'Convite para o clube'}).waitFor();
 assert.equal(await page.evaluate(()=>state.clubs.length),0,'Not joined until confirmation');
 await page.getByRole('button',{name:'Entrar no clube',exact:true}).click();
 await page.getByRole('heading',{name:'Leitores convidados',exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.has('invite'),false);
 await page.evaluate(()=>{state.clubs[0].owner='bob';});
 await page.getByRole('button',{name:'Abrir menu'}).click();
 await page.getByRole('button',{name:'Convidar por link',exact:true}).click();
 const first=await page.locator('#inviteLink').inputValue();assert(first.startsWith('https://maximusgugu.github.io/bookrats/?invite='),'Shareable URL from localhost');
 await page.getByRole('button',{name:'Gerar novo link'}).click();
 await page.waitForFunction(()=>document.querySelector('#inviteLink')?.value.endsWith('b'.repeat(64)));
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Revogar link',exact:true}).click();await page.waitForFunction(()=>window.revoked);
 await page.goto('http://localhost:8123/?invite='+'0'.repeat(64));
 await page.getByRole('button',{name:'Entrar com Google'}).click();await page.getByRole('heading',{name:'Convite indisponível'}).waitFor();
 await page.getByRole('button',{name:'Fechar',exact:true}).last().click();
 assert.deepEqual(errors,[]);console.log('PASS: invite preserved through login, explicit acceptance, navigation, public URL, renewal, revocation and invalid invitation.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
