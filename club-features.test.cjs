const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('http://127.0.0.1:8123/**', async route => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      const body = file === 'auth.bundle.js'
        ? (await fs.readFile('tests/fixture.js','utf8'))+`window.BookratsAuth={async startAuth(c,cb){if(!localStorage.getItem('bookrats.account.v1:you'))localStorage.setItem('bookrats.account.v1:you',JSON.stringify(seed()));cb({uid:'you',email:'test@example.com'});}};`+(await fs.readFile('tests/cloud-mock.js','utf8'))
        : await fs.readFile(path.join(__dirname,file));
      await route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html'});
    });
    await page.goto('http://127.0.0.1:8123/');
    await page.waitForFunction(()=>cloudReady);
    await page.evaluate(()=>{
      const c=club();
      c.proposals=['b1','b2'];c.votes={you:'b1',ana:'b2'};
      c.meetings=[{id:'m1',userId:'ana',title:'Encontro de outubro',date:today(),time:'19:30',place:'Biblioteca central',going:['ana']}];
      const reading=state.readings.find(r=>r.userId==='you');reading.logs=[{id:'week-log',date:today(),from:100,to:110,delta:10}];
      render();
    });

    assert.equal(await page.locator('.sync-bar').count(),0,'sync controls removed');
    assert.match(await page.locator('[data-action=log-picker] svg path').first().getAttribute('d'),/^M7 4\.5/,'bookmark icon');
    await page.getByRole('button',{name:'Abrir menu'}).click();
    await page.locator('.menu-profile').click();
    await page.getByRole('heading',{name:'Seu espaço'}).waitFor();
    assert.equal(await page.locator('dialog').evaluate(el=>el.open),false,'profile menu closes');

    await page.evaluate(()=>navigate('clube'));
    await page.getByRole('tab',{name:'Clube'}).click();
    assert.equal(await page.locator('.calendar .day.done').count(),1,'one reading day highlighted');
    const opacity=await page.evaluate(()=>({done:getComputedStyle(document.querySelector('.day.done')).opacity,empty:getComputedStyle(document.querySelector('.day:not(.done)')).opacity}));
    assert.ok(Number(opacity.done)>Number(opacity.empty),'days without reading have lower opacity');
    assert.equal(await page.locator('.vote.voted').count(),1,'own vote highlighted');
    assert.equal(await page.locator('.vote').last().evaluate(el=>getComputedStyle(el).borderBottomWidth),'0px','last vote has no duplicate separator');
    assert.equal(await page.locator('.meeting-row').last().evaluate(el=>getComputedStyle(el).borderBottomWidth),'0px','last meeting has no duplicate separator');
    assert.equal(await page.locator('.meeting-attendees .avatar').count(),1,'dashboard shows attendees');

    await page.locator('[data-action=meeting-details]').click();
    await page.locator('.meeting-detail').getByText('Biblioteca central',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Eu vou',exact:true}).click();
    await page.waitForFunction(()=>club().meetings[0].going.includes('you')&&document.querySelectorAll('.meeting-confirmed .avatar').length===2);
    assert.equal(await page.locator('.meeting-confirmed .avatar').count(),2,'RSVP modal shows attendees');
    await page.getByRole('button',{name:'Não vou',exact:true}).click();
    await page.waitForFunction(()=>!club().meetings[0].going.includes('you')&&document.querySelectorAll('.meeting-confirmed .avatar').length===1);
    assert.deepEqual(errors,[]);
    console.log('PASS: profile menu, bookmark icon, reading week, vote highlight, separators and meeting RSVP.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
