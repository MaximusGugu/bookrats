const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('http://127.0.0.1:8123/**', async route => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if(file==='auth.bundle.js')return route.fulfill({contentType:'text/javascript',body:(await fs.readFile('tests/fixture.js','utf8'))+`
window.BookratsAuth={async startAuth(c,cb){if(!localStorage.getItem('bookrats.account.v1:you'))localStorage.setItem('bookrats.account.v1:you',JSON.stringify(seed()));cb({uid:'you',email:'test@example.com'});}};`+(await fs.readFile('tests/cloud-mock.js','utf8'))});
      await route.fulfill({ body: await fs.readFile(path.join(__dirname, file)), contentType: file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    });
    await page.goto('http://127.0.0.1:8123/');

 await page.waitForFunction(()=>cloudReady);page.on('dialog',d=>d.accept());
 await page.evaluate(()=>addBook());
 await page.getByLabel('Digital',{exact:true}).check();
 assert.equal(await page.locator('[name=pages]').isVisible(),false);
 await page.locator('[name=title]').fill('Livro digital');await page.locator('[name=author]').fill('Autor');
 await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
 const rid=await page.evaluate(()=>state.readings.find(r=>book(r.bookId).title==='Livro digital').id);
 for(const value of [25,60]){
 await page.evaluate(id=>logReading(id),rid);await page.getByLabel('Parei na porcentagem (%)',{exact:true}).fill(String(value));
 await page.getByRole('button',{name:'Registrar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
 }
 assert.equal(await page.evaluate(()=>clubRanking(club(),'all').rows.find(r=>r.id==='you').count),1);
 await page.evaluate(()=>navigate('atividade'));
 await page.locator('[data-action=delete-activity]').first().click();await page.waitForFunction(()=>!dataSaving);
 assert.equal(await page.evaluate(id=>state.readings.find(r=>r.id===id).page,rid),25);
 assert.equal(await page.evaluate(()=>clubRanking(club(),'all').rows.find(r=>r.id==='you').count),1);
 await page.locator('[data-action=delete-activity]').first().click();await page.waitForFunction(()=>!dataSaving);
 assert.equal(await page.evaluate(id=>state.readings.find(r=>r.id===id).page,rid),0);
 assert.equal(await page.evaluate(()=>clubRanking(club(),'all').rows.find(r=>r.id==='you').count),0);
 await page.reload();await page.waitForFunction(()=>cloudReady);
 assert.equal(await page.evaluate(id=>state.readings.find(r=>r.id===id).logs.length,rid),0);
 await page.evaluate(id=>details(state.readings.find(r=>r.id===id).bookId),rid);
 const cover=await page.locator('.book-detail .cover').boundingBox(),log=await page.locator('.book-detail [data-action=log]').boundingBox();assert.ok(log.y>cover.y+cover.height);
 assert.equal(await page.locator('.book-detail-footer [data-action=edit-book] svg').count(),1);
 await page.screenshot({path:'.test-tools/digital-modal.png'});
 assert.deepEqual(errors,[]);console.log('PASS: digital form, percentage logs, deletion/history/progress/ranking, persistence and modal layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
