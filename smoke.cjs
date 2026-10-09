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
window.BookratsAuth={async startAuth(c,cb){if(!localStorage.getItem('bookrats.account.v1:you'))localStorage.setItem('bookrats.account.v1:you',JSON.stringify(seed()));cb({uid:'you',email:'test@example.com'});}};`});
      await route.fulfill({ body: await fs.readFile(path.join(__dirname, file)), contentType: file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    });
    await page.goto('http://127.0.0.1:8123/');
    await page.getByRole('heading', { name: 'Só mais um capítulo' }).waitFor();
    await page.getByRole('button', { name: 'Modo escuro', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.getByRole('button', { name: 'Modo escuro', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark', 'Theme survives reload');
    for (const width of [320,390,768]) {
      await page.setViewportSize({width,height:844});
      const members=await page.locator('.club-members').boundingBox();
      const register=await page.getByRole('button',{name:'Registrar leitura',exact:true}).boundingBox();
      const add=await page.getByRole('button',{name:'Adicionar livro',exact:true}).boundingBox();
      assert(register.y>=members.y && register.y+register.height<=members.y+members.height+1, 'Actions stay in member bar');
      assert(add.x>=register.x+register.width, 'Add stays right of register');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    }
    await page.setViewportSize({width:390,height:844});
    await fs.mkdir(path.join(__dirname, 'test-results'), { recursive: true });
    await page.locator('.cover').first().evaluate(img=>img.decode());
    await page.screenshot({path:path.join(__dirname,'test-results/bookrats-dark-mobile.png')});
    await page.getByRole('button',{name:'Adicionar livro',exact:true}).click();
    await page.screenshot({path:path.join(__dirname,'test-results/bookrats-dark-modal.png')});
    await page.getByRole('button',{name:'Fechar',exact:true}).click();
    await page.getByRole('button', { name: 'Modo escuro', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    const rankingResults = await page.evaluate(() => {
      const original = state.readings;
      const reading = (userId, dates, clubs = ['c1']) => ({ userId, clubs, logs: dates.map(date => ({ date, delta: 10 })) });
      try {
        state.readings = [
          reading('you', ['2026-10-05','2026-10-05','2026-10-06','2026-10-04','2026-09-30','2026-10-09']),
          reading('you', ['2026-10-06']),
          reading('you', ['2026-10-07'], []),
          reading('ana', ['2026-10-05','2026-10-06']),
          reading('leo', ['2026-10-04']),
          { userId:'bia', clubs:['c1'], logs:[{date:'2026-10-07',delta:0},{date:'2026-10-08',delta:-10}] }
        ];
        return Object.fromEntries(['week','month','all'].map(period=>[period,clubRanking(club(),period,new Date(2026,9,8)).rows]));
      } finally { state.readings = original; }
    });
    const score = (period,id) => rankingResults[period].find(row=>row.id===id);
    assert.equal(score('week','you').count, 2, 'Distinct days only, across books; private and future logs excluded');
    assert.equal(score('week','ana').position, score('week','you').position, 'Shared positions for ties');
    assert.equal(score('week','leo').count, 0, 'Week starts Monday');
    assert.equal(score('week','bia').position, null, 'Non-positive progress does not score');
    assert.equal(score('month','you').count, 3);
    assert.equal(score('all','you').count, 4);
    assert.equal(await page.getByRole('button', { name: 'Convidar amigos' }).count(), 0);
    assert((await page.locator('.cover-button').first().boundingBox()).y < 240, 'Books should be visible near the top');
    await page.getByRole('tab', { name: 'Conversa', exact: true }).click();
    await page.getByRole('button', { name: 'Comentar', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Conversa', exact: true }).press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Clube', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('heading', { name: 'Próxima leitura coletiva' }).waitFor();
    await page.getByRole('tab', { name: 'Clube', exact: true }).press('Home');
    await page.getByRole('button', { name: 'Adicionar livro', exact: true }).click();
    await page.locator('[name=title]').fill('Livro de teste');
    await page.locator('[name=author]').fill('Autora Teste');
    await page.locator('[name=pages]').fill('200');
    await page.locator('[name=status]').selectOption('reading');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(()=>!document.querySelector("dialog").open);
    assert.equal(await page.locator('dialog').evaluate(el=>el.open), false, await page.locator('#toast').textContent());
    await page.getByRole('button', { name: 'Abrir Livro de teste', exact: true }).click();
    await page.locator('dialog').getByRole('button', { name: 'Registrar leitura', exact: true }).click();
    await page.locator('[name=page]').fill('40');
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bookrats.account.v1:you')).readings.at(-1).page), 40);
    await page.getByRole('tab', { name: 'Ranking', exact: true }).click();
    assert.equal(await page.locator('.ranking-row.is-you .ranking-score strong').textContent(), '1');
    for (const name of ['Mensal','Geral','Semanal']) {
      await page.getByRole('button', { name, exact: true }).click();
      assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.ranking-row.is-you .ranking-score strong').textContent(), '1');
    }
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('link', { name: 'Meus clubes', exact: true }).click();
    await page.getByRole('button', { name: 'Criar clube', exact: true }).click();
    await page.locator('[name=name]').fill('Clube de teste');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.getByRole('heading', { name: 'Clube de teste' }).waitFor();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('button', { name: 'Só mais um capítulo', exact: true }).click();
    await page.locator('.cover').first().evaluate(img => img.decode());
    await fs.mkdir(path.join(__dirname, 'test-results'), { recursive: true });
    await page.getByRole('tab', { name: 'Ranking', exact: true }).click();
    await page.locator('.ranking').screenshot({path:path.join(__dirname, 'test-results/bookrats-ranking.png')});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({ path: path.join(__dirname, 'test-results/bookrats-mobile.png'), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(__dirname, 'test-results/bookrats-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: book registration, reading progress, club creation, authenticated session, reload, mobile width, no runtime errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
