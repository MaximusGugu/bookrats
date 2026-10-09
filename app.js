'use strict';
let KEY = '';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)), n=>n.toString(16).padStart(8,'0')).join('');
const today = () => new Date().toLocaleDateString('sv-SE');
const date = v => new Date(v + 'T12:00:00').toLocaleDateString('pt-BR');
const safeUrl = value => { if(/^assets\/\d{13}\.jpg$/.test(value||'') || /^data:image\/(png|jpeg|webp);base64,/.test(value||''))return value; try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const cover = isbn => `assets/${isbn}.jpg`;
const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#315542"/><path d="M55 70h90v150H55zM65 80v130" fill="none" stroke="#c8df9d" stroke-width="3"/><text x="100" y="260" text-anchor="middle" fill="#c8df9d" font-family="Arial" font-size="16">BOOKRATS</text></svg>');
let sessionUser = null, authReady = false, authBusy = false, authModule;
let authMessage = 'Verificando sessão…';
let state = null;
let pendingInvite=new URL(location.href).searchParams.get('invite')||'', inviteOpening=false;
let cloudStore=null, cloudReady=false, dataSaving=false, dataLoading=false, remotePending=false;
let dataMessage='Carregando seus dados…', syncMessage='Conectando ao Firestore…';
let view = location.hash.slice(1) || 'clube', filter = 'all', query = '';
const user = () => state.users.find(u=>u.id===state.currentUser);
const club = () => state.clubs.find(c=>c.id===state.activeClub && c.members.includes(user().id));
const book = id => state.books.find(b=>b.id===id);
const person = id => state.users.find(u=>u.id===id);
const memberships = () => state.clubs.filter(c=>c.members.includes(user().id));
const pct = r => Math.min(100,Math.round(r.page / book(r.bookId).pages * 100));
const statusNames = {wanted:'Quero ler',reading:'Lendo',paused:'Pausado',done:'Concluído'};
function toast(text) { $('#toast').textContent=text; $('#toast').style.display='block'; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').style.display='none',3500); }
async function save() {
  if(!sessionUser||!cloudReady||!cloudStore)throw Error('Aguarde seus dados carregarem.');
  const store=cloudStore, snapshot=JSON.parse(JSON.stringify(state));
  dataSaving=true;setSyncStatus('Salvando no Firestore…');
  try {
    await store.save(snapshot);
    if(store!==cloudStore)return false;
    authModule.saveCachedState?.(sessionUser.uid,snapshot);
    setSyncStatus('Salvo no Firestore');
    return true;
  } catch(error) {
    if(store===cloudStore){
      setSyncStatus('Alteração não salva');
      if(error.code==='bookrats/conflict')remotePending=true;
    }
    throw error;
  } finally {if(store===cloudStore)dataSaving=false;}
}
function setSyncStatus(message){syncMessage=message;const el=$('#syncStatus');if(el)el.textContent=message;}
function cloudMessage(error){return authModule?.cloudError?.(error)||error.message;}
function emptyAccount(account){return {version:1,currentUser:account.uid,users:[{id:account.uid,name:account.displayName||'Leitor',photo:account.photoURL||'',goal:4,color:'#ddef83'}],books:[],readings:[],clubs:[],activities:[],activeClub:''};}
async function loadCloud(account) {
  cloudStore?.stop();
  let store;
  try{store=authModule.accountStore(account.uid);}catch(error){cloudReady=false;dataLoading=false;dataMessage=cloudMessage(error);render();return;}
  cloudStore=store;
  cloudReady=false;dataLoading=true;dataMessage='Carregando seus livros e clubes…';render();
  const cachedView=authModule.loadCachedState?.(account.uid).then(cached=>{
    if(store!==cloudStore||cloudReady||!dataLoading||state||!cached)return;
    try{validateBackup(cached);if(cached.currentUser!==account.uid)return;state=cached;setSyncStatus('Dados salvos neste navegador � Atualizando�');render();}catch{}
  });
  await Promise.race([cachedView,new Promise(resolve=>setTimeout(resolve,500))]);
  if(store!==cloudStore)return;
  try {
    const loaded=await store.load(()=>{
      // Only inspect legacy storage when no cloud account exists. Never replace cloud data.
      let saved=null;
      try{saved=localStorage.getItem('bookrats.account.v1:'+account.uid);}catch{};
      const initial=saved?JSON.parse(saved):emptyAccount(account);
      validateBackup(initial);
      if(initial.currentUser!==account.uid)throw Error('O backup local não pertence à conta conectada.');
      return {state:initial,migrated:!!saved};
    });
    if(store!==cloudStore)return;
    validateBackup(loaded);state=loaded;authModule.saveCachedState?.(account.uid,loaded);cloudReady=true;remotePending=false;
    setSyncStatus('Sincronizado com o Firestore');
    store.watch(()=>{remotePending=true;refreshCloud();},error=>{if(store===cloudStore){setSyncStatus(cloudMessage(error));}});
  } catch(error){if(store===cloudStore){cloudReady=false;dataMessage=cloudMessage(error);setSyncStatus('Consulta do cache � '+dataMessage);if(['permission-denied','unauthenticated'].includes(error.code)){state=null;authModule.removeCachedState?.(account.uid);}}}
  finally{if(store===cloudStore){dataLoading=false;render();if(cloudReady&&pendingInvite)openPendingInvite();}}
}
async function refreshCloud(force=false) {
  if(!cloudStore||!cloudReady||dataSaving||dataLoading)return;
  if($('#modal').open&&!force){setSyncStatus('Há alterações em outro dispositivo. Feche o formulário para atualizar.');return;}
  if(!remotePending&&!force)return;
  const store=cloudStore;dataLoading=true;
  try{
    const loaded=await store.read();
    if(store!==cloudStore)return;
    if(!loaded)throw Error('Os dados desta conta não estão disponíveis no Firestore.');
    validateBackup(loaded);state=loaded;authModule.saveCachedState?.(sessionUser.uid,loaded);remotePending=false;setSyncStatus('Sincronizado com o Firestore');render();
  }catch(error){if(store===cloudStore){setSyncStatus(cloudMessage(error));toast(cloudMessage(error));}}
  finally{if(store===cloudStore)dataLoading=false;}
}

function avatar(id) { const u=person(id); if(!u)return ''; return `<span class="avatar" style="background:${/^#[a-f0-9]{6}$/i.test(u.color)?u.color:'#eedbb7'}" title="${esc(u.name)}">${safeUrl(u.photo)?`<img src="${esc(safeUrl(u.photo))}" alt="${esc(u.name)}">`:esc(u.name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</span>`; }
function image(b,cls='cover') { return `<img class="${cls}" src="${esc(safeUrl(b.cover)||fallback)}" alt="Capa de ${esc(b.title)}" loading="lazy">`; }
function daysFor(id,month=false) { const now=new Date(); const start=new Date(now); if(month)start.setDate(1);else start.setDate(now.getDate()-((now.getDay()+6)%7)); start.setHours(0,0,0,0); return new Set(state.readings.filter(r=>r.userId===id).flatMap(r=>r.logs).filter(l=>l.delta>0 && new Date(l.date+'T12:00:00')>=start).map(l=>l.date)); }
function clubDays(c) { return new Set(state.readings.filter(r=>r.clubs.includes(c.id)&&c.members.includes(r.userId)).flatMap(r=>r.logs.map(l=>({...l,userId:r.userId}))).filter(l=>l.delta>0 && l.date.slice(0,7)===today().slice(0,7)).map(l=>l.userId+l.date)).size; }
function navigate(v){view=v;filter='all';query='';location.hash=v;render();}
const iconNodes = {"Menu":[["path",{"d":"M4 5h16"}],["path",{"d":"M4 12h16"}],["path",{"d":"M4 19h16"}]],"Plus":[["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],"ChevronRight":[["path",{"d":"m9 18 6-6-6-6"}]],"Search":[["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],"BookOpen":[["path",{"d":"M12 5v16"}],["path",{"d":"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"}]],"Sun":[["circle",{"cx":"12","cy":"12","r":"4"}],["path",{"d":"M12 2v2"}],["path",{"d":"M12 20v2"}],["path",{"d":"m4.93 4.93 1.41 1.41"}],["path",{"d":"m17.66 17.66 1.41 1.41"}],["path",{"d":"M2 12h2"}],["path",{"d":"M20 12h2"}],["path",{"d":"m6.34 17.66-1.41 1.41"}],["path",{"d":"m19.07 4.93-1.41 1.41"}]],"Moon":[["path",{"d":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]]};
function icon(name) {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + iconNodes[name].map(([tag,attrs])=>'<'+tag+' '+Object.entries(attrs).map(([key,value])=>key+'="'+esc(value)+'"').join(' ')+'/>').join('')+'</svg>';
}
let clubTab = 'activity';
let rankingPeriod = 'week';
function themeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return `<button class="icon-button" data-action="theme" aria-label="Modo escuro" aria-pressed="${dark}" title="${dark?'Ativar modo claro':'Ativar modo escuro'}">${icon(dark?'Sun':'Moon')}</button>`;
}
function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme==='dark'?'#171d1a':'#fafbf9';
  try { localStorage.setItem('bookrats.theme',theme); } catch { toast('Tema alterado, mas não foi possível salvar a preferência.'); }
  $('[data-action="theme"]').outerHTML = themeButton();
  $('[data-action="theme"]').focus({preventScroll:true});
}
function clubRanking(c, period, now = new Date()) {
  const end = now.toLocaleDateString('sv-SE');
  const startDate = new Date(now);
  if (period === 'week') startDate.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (period === 'month') startDate.setDate(1);
  const start = period === 'all' ? '' : startDate.toLocaleDateString('sv-SE');
  const days = new Map(c.members.map(id => [id, new Set()]));
  for (const reading of state.readings) {
    if (!reading.clubs.includes(c.id) || !days.has(reading.userId)) continue;
    for (const log of reading.logs) {
      if (log.delta > 0 && /^\d{4}-\d{2}-\d{2}$/.test(log.date) && log.date >= start && log.date <= end) {
        days.get(reading.userId).add(log.date);
      }
    }
  }
  const rows = [...days].map(([id, dates]) => ({ id, count: dates.size }));
  rows.sort((a, b) => b.count - a.count || person(a.id).name.localeCompare(person(b.id).name, 'pt-BR'));
  let position = 0;
  rows.forEach((row, index) => {
    if (!index || row.count !== rows[index - 1].count) position = index + 1;
    row.position = row.count ? position : null;
  });
  return { rows, start, end };
}
function rankingPanel(c) {
  const ranking = clubRanking(c, rankingPeriod);
  return `<section class="ranking" aria-label="Ranking de dias de leitura">
    <div class="section-head"><h2>Dias de leitura</h2><div class="ranking-periods" role="group" aria-label="Período do ranking">${[['week','Semanal'],['month','Mensal'],['all','Geral']].map(([id,label])=>`<button type="button" data-action="ranking-period" data-id="${esc(id)}" aria-pressed="${rankingPeriod===id}">${label}</button>`).join('')}</div></div>
    <p class="ranking-range">${ranking.start ? `${date(ranking.start)} a ${date(ranking.end)}` : `Até ${date(ranking.end)}`}</p>
    <ol class="ranking-list">${ranking.rows.map(row=>`<li class="ranking-row ${row.id===user().id?'is-you':''}" data-user-id="${row.id}"><span class="ranking-position" aria-label="${row.position?'Posição '+row.position:'Sem registros'}">${row.position ? row.position+'º' : '—'}</span>${avatar(row.id)}<span class="ranking-name">${esc(person(row.id).name)}${row.id===user().id?'<small>Você</small>':''}</span><span class="ranking-score"><strong>${row.count}</strong><small>${row.count===1?'dia':'dias'}</small></span></li>`).join('')}</ol>
    ${ranking.rows.every(row=>row.count===0)?'<p class="ranking-empty">Ainda sem dias de leitura neste período.</p>':''}
  </section>`;
}
function clubPanel(c) {
  if (clubTab === 'ranking') return rankingPanel(c);
  if (clubTab === 'conversation') return conversationPanel(c);
  return clubTab === 'club' ? clubInfo(c) : feed(c.id,8);
}
function render(){
  if (!sessionUser) return renderLogin();
  if(!state)return renderCloudLoading();
  const filtersOpen = $('.shelf-filters')?.open;
  if(!club())state.activeClub=memberships()[0]?.id||'';
  const c=club();
  const title=view==='clube'&&c?c.name:'bookrats';
  $('#app').innerHTML=`<div class="shell"><main class="main"><header class="topbar"><${view==='clube'&&c?'h1':'a href="#clube"'} class="topbar-title">${esc(title)}</${view==='clube'&&c?'h1':'a'}><div class="topbar-actions">${themeButton()}<button class="icon-button" data-action="app-menu" aria-label="Abrir menu" aria-haspopup="dialog" title="Menu">${icon('Menu')}</button></div></header><div class="content">${view==='estante'?library():view==='clubes'?clubsPage():view==='perfil'?profilePage():view==='atividade'?`<div class="heading"><h1>Entre uma página e outra</h1></div><div class="feed">${feed()}</div>`:c?clubPage(c):clubsPage()}<div class="sync-bar"><span id="syncStatus" role="status">${esc(syncMessage)}</span><button class="small" data-action="refresh-cloud">Atualizar</button></div></div></main></div>`;
  document.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src=fallback;},{once:true}));
  if(filtersOpen && $('.shelf-filters')) $('.shelf-filters').open = true;
}
function appMenu(){
  const c=club();
  modal('Menu',`<div class="menu-profile">${avatar(user().id)}<div><strong>${esc(user().name)}</strong><small>bookrats</small></div></div><nav class="menu-links" aria-label="Navegação">${[['clube','Meu clube'],['estante','Minha estante'],['clubes','Meus clubes'],['atividade','Atividade'],['perfil','Perfil e dados']].map(([id,label])=>`<a href="#${id}" data-action="menu-route" data-id="${esc(id)}" ${view===id?'aria-current="page"':''}>${label}${icon('ChevronRight')}</a>`).join('')}</nav>${c?`<div class="menu-section"><p class="menu-label">${esc(c.name)}</p><div class="menu-links">${c.owner===user().id?`<button type="button" data-action="invite" data-id="${esc(c.id)}">Convidar por link${icon('ChevronRight')}</button>`:''}<button type="button" data-action="members">Ver membros${icon('ChevronRight')}</button>${c.owner===user().id?`<button type="button" data-action="edit-club">Configurar clube${icon('ChevronRight')}</button>`:''}</div></div>`:''}<div class="menu-section"><p class="menu-label">Trocar de clube</p><div class="menu-links">${memberships().map(c=>`<button type="button" data-action="switch-club" data-id="${esc(c.id)}">${esc(c.name)}${icon('ChevronRight')}</button>`).join('')}</div></div>`,null);
}
function heading(title,subtitle,actions=''){return `<div class="heading"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="actions">${actions}</div></div>`;}
function clubPage(c){
  const rs=state.readings.filter(r=>r.clubs.includes(c.id)&&c.members.includes(r.userId));
  return `<div class="club-members"><div class="member-overview"><div class="avatars">${c.members.slice(0,8).map((id,index)=>`<button class="member-button ${index>=3?'extra-member':''}" data-action="person" data-id="${esc(id)}" aria-label="Perfil de ${esc(person(id)?.name)}">${avatar(id)}</button>`).join('')}${c.members.length>3?`<button class="member-overflow" data-action="members" aria-label="Ver todos os ${c.members.length} membros">+${c.members.length-3}</button>`:''}</div><small>${c.members.length} leitores</small></div><div class="reading-actions"><button class="primary" data-action="log-picker" aria-label="Registrar leitura" title="Registrar leitura">${icon('BookOpen')}<span>Registrar leitura</span></button><button class="icon-button" data-action="add-book" aria-label="Adicionar livro" title="Adicionar livro">${icon('Plus')}</button></div></div>
    <section aria-label="Prateleira do clube" class="club-shelf">
      <div class="shelf-tools"><span class="shelf-caption">Na nossa prateleira</span><details class="shelf-filters"><summary aria-label="Buscar e filtrar livros" title="Buscar e filtrar">${icon('Search')}</summary><div class="shelf-filter-content">${filters()}</div></details></div>
      <div class="shelf">${shelf(rs)}</div>
    </section>
    <section class="club-details"><div class="club-tabs" role="tablist" aria-label="Mais do clube">${[['activity','Atividade'],['ranking','Ranking'],['conversation','Conversa'],['club','Clube']].map(([id,label])=>`<button role="tab" id="tab-${id}" aria-controls="club-panel" aria-selected="${clubTab===id}" tabindex="${clubTab===id?'0':'-1'}" data-action="club-tab" data-id="${esc(id)}">${label}</button>`).join('')}</div><div id="club-panel" class="club-panel" role="tabpanel" aria-labelledby="tab-${clubTab}" tabindex="0">${clubPanel(c)}</div></section>`;
}
function conversationPanel(c){return `<section class="subsection"><div class="section-head"><h2>Conversa do clube</h2><button class="small" data-action="comment">Comentar</button></div>${c.comments.map(m=>`<div class="activity">${avatar(m.userId)}<div><strong>${esc(person(m.userId)?.name)}</strong>${m.spoiler?`<details><summary>Mostrar comentário com spoiler</summary><p>${esc(m.text)}</p></details>`:`<p>${esc(m.text)}</p>`}</div></div>`).join('')||'<p class="muted">Compartilhe uma impressão da leitura.</p>'}</section>`;}
function clubInfo(c){return `<p class="club-description">${esc(c.description)}</p>
  <section class="subsection"><h2>Nosso ritmo</h2><div class="club-goal"><strong>${clubDays(c)}</strong><span> / ${c.target} dias de leitura neste mês</span></div><div class="progress"><i style="width:${Math.min(100,clubDays(c)/c.target*100)}%"></i></div><h3 style="margin-top:24px">Sua semana</h3>${week()}<small>${daysFor(user().id).size} de ${user().goal} dias da sua meta</small></section>
  <section class="subsection"><div class="section-head"><h2>Próxima leitura coletiva</h2><button class="small" data-action="propose">Sugerir livro</button></div>${c.proposals.map(id=>`<div class="vote"><p><strong>${esc(book(id)?.title)}</strong><br><small>${Object.values(c.votes).filter(v=>v===id).length} votos</small></p><button class="small ${c.votes[user().id]===id?'active':''}" data-action="vote" data-id="${esc(id)}">${c.votes[user().id]===id?'Retirar voto':'Votar'}</button></div>`).join('')||'<p class="muted">Qual será a próxima história?</p>'}</section><section class="subsection"><div class="section-head"><h2>Encontros</h2><button class="small" data-action="meeting">Agendar</button></div>${c.meetings.map(m=>`<div class="person-row"><div><strong>${esc(m.title)}</strong><p class="muted">${date(m.date)} · ${esc(m.time)} · ${esc(m.place)}</p></div>${m.userId===user().id||c.owner===user().id?`<button class="small" data-action="delete-meeting" data-id="${esc(m.id)}">Excluir</button>`:''}</div>`).join('')||'<p class="muted">Nenhum encontro agendado.</p>'}</section>
  <div class="club-footer">${c.owner===user().id?`<button data-action="invite" data-id="${esc(c.id)}">Convidar por link</button>`:''}<button data-action="members">Membros</button>${c.owner===user().id?'<button data-action="edit-club">Configurar clube</button>':''}</div>`;}
function filters(){return `<div class="filterbar"><div class="tabs">${[['all','Todos'],['reading','Lendo agora'],['done','Concluídos']].map(([id,t])=>`<button data-action="filter" data-id="${esc(id)}" class="${filter===id?'active':''}">${t}</button>`).join('')}</div><input class="search" id="search" type="search" placeholder="Buscar livro ou autor" aria-label="Buscar livro ou autor" value="${esc(query)}"></div>`;}
function modifiedAt(b, readings) {
  const time = v => Date.parse(v) || 0;
  return Math.max(time(b.updatedAt), ...readings.filter(r=>r.bookId===b.id).map(r=>time(r.updatedAt) || Math.max(time(r.started),time(r.finished),...r.logs.map(l=>time(l.date)))));
}
function stampChanges(before) {
  const now = new Date().toISOString();
  for (const key of ['books','readings']) {
    const previous = new Map(before[key].map(item=>[item.id, item]));
    for (const item of state[key]) {
      if (JSON.stringify(previous.get(item.id)) !== JSON.stringify(item)) item.updatedAt = now;
    }
  }
}
function shelf(rs){const ids=[...new Set(rs.filter(r=>filter==='all'||r.status===filter).map(r=>r.bookId))];const books=ids.map(book).filter(b=>b&&`${b.title} ${b.author} ${b.genre}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>modifiedAt(b,rs)-modifiedAt(a,rs));return books.map(b=>{const readers=rs.filter(r=>r.bookId===b.id);const own=readers.find(r=>r.userId===user().id);return `<article class="book"><button class="cover-button" data-action="book" data-id="${esc(b.id)}" aria-label="Abrir ${esc(b.title)}">${image(b)}</button><span class="book-title" title="${esc(b.title)}">${esc(b.title)}</span><p class="book-author">${esc(b.author)}</p><div class="book-bottom"><div class="avatars">${[...new Set(readers.map(r=>r.userId))].slice(0,4).map(id=>`<a href="#" data-action="person" data-id="${esc(id)}" aria-label="Perfil de ${esc(person(id)?.name)}">${avatar(id)}</a>`).join('')}</div><small>${own?pct(own)+'%':readers.length+' leitores'}</small></div>${own?`<div class="progress"><i style="width:${pct(own)}%"></i></div>`:''}</article>`;}).join('')||'<div class="empty">Nenhum livro por aqui ainda.</div>';}
function library(){return `${heading('Minha estante','Cada livro, no seu tempo.','<button class="primary" data-action="add-book">Adicionar livro</button>')}${filters()}<div class="shelf">${shelf(state.readings.filter(r=>r.userId===user().id))}</div>`;}
function clubsPage(){return `${heading('Seus clubes','Encontre sua próxima leitura em boa companhia.','<button class="primary" data-action="new-club">Criar clube</button>')}<div class="collection">${memberships().map(c=>`<article class="club-card"><span class="club-emblem">${esc(c.name[0])}</span><h2>${esc(c.name)}</h2><p class="muted">${esc(c.description)}</p><div class="section-head"><div class="avatars">${c.members.slice(0,5).map(avatar).join('')}</div><button data-action="switch-club" data-id="${esc(c.id)}">Abrir clube</button></div></article>`).join('')||'<div class="empty">Crie um clube para começar.</div>'}</div>`;}
function week(){const days=daysFor(user().id);const start=new Date();start.setDate(start.getDate()-((start.getDay()+6)%7));return `<div class="calendar">${['S','T','Q','Q','S','S','D'].map((n,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return `<span class="day ${days.has(d.toLocaleDateString('sv-SE'))?'done':''}">${n}<br>${d.getDate()}</span>`;}).join('')}</div>`;}
function feed(clubId,limit=40){const activities=state.activities.filter(a=>clubId?a.clubs.includes(clubId):a.userId===user().id||a.clubs.some(id=>memberships().some(c=>c.id===id))).slice().reverse().slice(0,limit);return activities.map(a=>`<div class="activity">${avatar(a.userId)}<div><p><strong>${esc(person(a.userId)?.name)}</strong> ${esc(a.text)}</p><small>${date(a.date)}</small><br><button class="reaction ${a.likes.includes(user().id)?'active':''}" data-action="react" data-id="${esc(a.id)}">Gostei · ${a.likes.length}</button></div></div>`).join('')||'<p class="muted">As próximas leituras registradas aparecem aqui.</p>';}
function profilePage(){const rs=state.readings.filter(r=>r.userId===user().id);return `${heading('Seu espaço','Leituras, metas e seus dados.')}<div class="settings"><section><div class="person-row">${avatar(user().id)}<div><h2>${esc(user().name)}</h2><small>Conta Google</small></div><button data-action="edit-profile">Editar perfil</button></div>${week()}<p>${daysFor(user().id).size} de ${user().goal} dias nesta semana</p><div class="actions" style="margin-top:15px">${[rs.some(r=>r.logs.length)&&'Primeiro registro',rs.some(r=>r.status==='done')&&'Primeiro livro concluído',daysFor(user().id).size>=user().goal&&'Meta da semana'].filter(Boolean).map(s=>`<span class="badge">${s}</span>`).join('')}</div></section><section><h2>Conta Google</h2><p>${esc(sessionUser.email)}</p><p class="muted">Livros, leituras e clubes são salvos no Firestore e acompanham sua conta.</p><button data-action="sign-out">Sair da conta</button></section><section><h2>Backup dos dados</h2><p class="muted">Exporte uma cópia dos dados da sua conta.</p><div class="actions" style="margin-top:12px"><button data-action="export">Exportar dados</button><button data-action="import">Importar backup</button></div></section></div>`;}
let submit = null;
function modal(title,body,onSubmit,button='Salvar'){submit=onSubmit;$('#modalBody').innerHTML=`<div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="close" data-action="close" aria-label="Fechar">×</button></div>${body}${onSubmit?`<div class="form-actions"><button type="button" data-action="close">Cancelar</button><button class="primary" type="submit">${button}</button></div>`:''}`;if(!$('#modal').open)$('#modal').showModal();$('#modalBody input:not([type=checkbox]),#modalBody textarea,#modalBody select')?.focus();}
const field=(label,name,value='',type='text',extra='')=>`<label>${label}<input type="${type}" name="${name}" value="${esc(type==='url'&&/^assets\//.test(value)?new URL(value,location.href).href:value)}" ${extra}></label>`;
const select=(label,name,items,value)=>`<label>${label}<select name="${name}">${items.map(([id,t])=>`<option value="${id}" ${value===id?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
function shares(r){return `<div class="span2"><label>Compartilhar nos clubes</label><div class="check-group">${memberships().map(c=>`<label class="check"><input type="checkbox" name="clubs" value="${c.id}" ${(r?.clubs||[]).includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')||'<small>Você ainda não participa de clubes.</small>'}</div></div>`;}
function addBook(existing){const b=existing||{};modal(existing?'Adicionar à minha estante':'Novo livro',`<div class="form-grid">${field('Título','title',b.title,'text','required maxlength="160"')}${field('Autor','author',b.author,'text','required maxlength="120"')}${field('Gênero','genre',b.genre,'text','maxlength="60"')}${field('Total de páginas desta edição','pages',b.pages||'','number','required min="1" max="100000"')}${field('URL da capa','cover',b.cover,'url')}${field('Ou enviar capa','upload','','file','accept="image/png,image/jpeg,image/webp"')}${field('Página atual','page',0,'number','min="0" required')}${select('Status','status',Object.entries(statusNames),'wanted')}${shares({clubs:club()?[club().id]:[]})}</div>`,async fd=>{const pages=Number(fd.get('pages')),page=Number(fd.get('page'));if(page>pages)throw Error('A página atual não pode superar o total.');let coverUrl=fd.get('cover');const file=fd.get('upload');if(file?.size){if(file.size>600000)throw Error('Use uma imagem de até 600 KB.');coverUrl=await readImage(file);}let b=existing;if(!b||b.pages!==pages||b.title!==fd.get('title')||b.author!==fd.get('author')){b={id:uid(),title:fd.get('title').trim(),author:fd.get('author').trim(),genre:fd.get('genre').trim(),pages,cover:coverUrl};state.books.push(b);}if(state.readings.some(r=>r.userId===user().id&&r.bookId===b.id))throw Error('Este livro já está na sua estante.');const status=fd.get('status');state.readings.push({id:uid(),userId:user().id,bookId:b.id,page:status==='done'?pages:page,status:page===pages?'done':status,clubs:fd.getAll('clubs'),started:today(),finished:status==='done'||page===pages?today():'',logs:[]});});}
function readImage(file){return new Promise((resolve,reject)=>{if(!['image/png','image/jpeg','image/webp'].includes(file.type))return reject(Error('Formato de imagem inválido.'));const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});}
function canEditBook(id) {
  if(state.clubs.some(c=>c.shared)&&!state.readings.some(r=>r.bookId===id&&r.userId===user().id))return false;
  return Boolean(book(id)) && state.readings.some(r => r.bookId === id && (
    r.userId === user().id || r.clubs.some(cid => state.clubs.some(c => c.id === cid && c.members.includes(user().id) && c.members.includes(r.userId)))
  ));
}
function minimumBookPages(id) {
  return Math.max(1, ...state.readings.filter(r=>r.bookId===id).flatMap(r=>[r.page,...r.logs.flatMap(l=>[Number(l.from)||0,Number(l.to)||0])]));
}
function editBook(id) {
  if (!canEditBook(id)) return toast('Este livro não está na sua estante ou nos seus clubes.');
  const b = book(id);
  const uploadedCover = b.cover?.startsWith('data:');
  modal('Editar livro', `<p class="muted" style="margin-bottom:18px">Edite as informações da sua edição. Seu progresso permanece individual.</p><div class="form-grid">
    ${field('Título','title',b.title,'text','required maxlength="160"')}
    ${field('Autor','author',b.author,'text','required maxlength="120"')}
    ${field('Gênero','genre',b.genre,'text','maxlength="60"')}
    ${field('Total de páginas desta edição','pages',b.pages,'number',`required min="${minimumBookPages(id)}" max="100000"`)}
    <small class="span2">Mínimo de ${minimumBookPages(id)} páginas para preservar as páginas já registradas.</small>
    ${field('URL da capa','cover',uploadedCover?'':b.cover,'url')}
    ${field('Ou enviar nova capa','upload','','file','accept="image/png,image/jpeg,image/webp"')}
    <label class="check span2"><input name="removeCover" type="checkbox">Remover capa atual</label>
  </div>`, async fd => {
    if (!canEditBook(id)) throw Error('Você não tem mais acesso a este livro.');
    const title = fd.get('title').trim();
    const author = fd.get('author').trim();
    const pages = Number(fd.get('pages'));
    if (!title || !author) throw Error('Preencha o título e o autor.');
    if (!Number.isInteger(pages) || pages < minimumBookPages(id) || pages > 100000) throw Error(`O total deve ser entre ${minimumBookPages(id)} e 100000 páginas.`);
    let newCover = fd.get('cover').trim();
    if (newCover && !safeUrl(newCover)) throw Error('Use uma URL válida para a capa.');
    if (!newCover && uploadedCover) newCover = b.cover;
    if (newCover === new URL(b.cover || '.',location.href).href) newCover = b.cover;
    const file = fd.get('upload');
    if (file?.size) {
      if (file.size > 600000) throw Error('Use uma imagem de até 600 KB.');
      newCover = await readImage(file);
    }
    if (fd.has('removeCover')) newCover = '';
    Object.assign(book(id), { title, author, genre:fd.get('genre').trim(), pages, cover:newCover });
  });
}
function details(id){const b=book(id);const own=state.readings.find(r=>r.bookId===id&&r.userId===user().id);const readers=state.readings.filter(r=>r.bookId===id&&(r.userId===user().id||r.clubs.some(cid=>memberships().some(c=>c.id===cid))));modal(b.title,`<div class="detail">${image(b)}<div><p>${esc(b.author)}</p><p class="muted">${esc(b.genre)} · ${esc(b.pages)} páginas</p><div class="actions" style="margin-top:16px">${canEditBook(id)?`<button type="button" data-action="edit-book" data-id="${esc(id)}">Editar livro</button>`:''}${own?`<button type="button" class="primary" data-action="log" data-id="${esc(own.id)}">Registrar leitura</button><button type="button" data-action="edit-reading" data-id="${esc(own.id)}">Minha leitura</button>`:`<button type="button" class="primary" data-action="adopt" data-id="${esc(id)}">Adicionar à estante</button>`}</div></div></div>${readers.map(r=>`<div class="person-row">${avatar(r.userId)}<div><strong>${esc(person(r.userId)?.name)}</strong><small> · ${statusNames[r.status]}</small><div class="progress"><i style="width:${pct(r)}%"></i></div><small>${esc(r.page)} / ${esc(b.pages)} páginas · ${pct(r)}%</small></div></div>`).join('')}`,null);}
function logReading(id){const r=state.readings.find(r=>r.id===id&&r.userId===user().id);if(!r)return;const b=book(r.bookId);modal('Mais um capítulo da sua história',`<p style="margin-bottom:18px"><strong>${esc(b.title)}</strong><br><small>Você está na página ${esc(r.page)} de ${esc(b.pages)}.</small></p><div class="form-grid">${field('Parei na página','page',r.page,'number',`required min="0" max="${esc(b.pages)}"`)}${field('Data da leitura','date',today(),'date',`required max="${today()}"`)}<label class="span2">Impressão da leitura (opcional)<textarea name="note" maxlength="1000"></textarea></label><label class="check span2"><input type="checkbox" name="spoiler">Este comentário contém spoiler</label></div>`,fd=>{const next=Number(fd.get('page'));const delta=next-r.page;r.logs.push({id:uid(),date:fd.get('date'),from:r.page,to:next,delta,note:fd.get('note')});r.page=next;r.status=next===b.pages?'done':'reading';r.finished=next===b.pages?fd.get('date'):'';if(delta>0)state.activities.push({id:uid(),userId:user().id,clubs:[...r.clubs],date:fd.get('date'),text:next===b.pages?`terminou ${b.title}.`:`avançou ${delta} páginas em ${b.title}.`,likes:[]});if(fd.get('note').trim())r.clubs.forEach(cid=>{const c=state.clubs.find(c=>c.id===cid);if(c&&c.members.includes(user().id))c.comments.push({id:uid(),userId:user().id,text:`${b.title}: ${fd.get('note')}`,spoiler:fd.has('spoiler')});});},'Registrar');}
function editReading(id){const r=state.readings.find(r=>r.id===id&&r.userId===user().id);modal('Minha leitura',`<div class="form-grid">${select('Status','status',Object.entries(statusNames),r.status)}${field('Página atual','page',r.page,'number',`required min="0" max="${book(r.bookId).pages}"`)}${shares(r)}</div><div class="subsection" style="margin-top:20px"><h3>Registros</h3>${r.logs.slice().reverse().map(l=>`<p class="muted">${date(l.date)} · página ${esc(l.from)} → ${esc(l.to)}</p>`).join('')||'<p class="muted">Nenhum registro ainda.</p>'}</div><button type="button" class="danger" data-action="remove-reading" data-id="${esc(id)}">Remover da minha estante</button>`,fd=>{r.status=fd.get('status');r.page=r.status==='done'?book(r.bookId).pages:Number(fd.get('page'));if(r.page===book(r.bookId).pages)r.status='done';r.finished=r.status==='done'?today():'';r.clubs=fd.getAll('clubs');});}
function clubForm(edit=false){const c=edit?club():{};modal(edit?'Configurar clube':'Criar clube',`<div class="form-grid">${field('Nome','name',c.name,'text','required maxlength="80"')}${field('Meta coletiva de dias por mês','target',c.target||40,'number','required min="1" max="10000"')}<label class="span2">Descrição<textarea name="description" maxlength="240">${esc(c.description)}</textarea></label></div>`,fd=>{const data={name:fd.get('name').trim(),description:fd.get('description'),target:Number(fd.get('target'))};if(edit)Object.assign(c,data);else{const n={...data,id:uid(),owner:user().id,members:[user().id],token:uid(),votes:{},proposals:[],meetings:[],comments:[]};state.clubs.push(n);state.activeClub=n.id;view='clube';location.hash='clube';}});}
function download(data,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function chooseFile(kind){$('#fileInput').dataset.kind=kind;$('#fileInput').value='';$('#fileInput').click();}
document.addEventListener('click',async e=>{const target=e.target.closest('[data-action]');if(!target)return;const a=target.dataset.action,id=target.dataset.id;e.preventDefault();
  if(a==='google-login')return googleLogin();
  if(a==='sign-out')return googleLogout();
  if(!sessionUser)return;
  if(a==='retry-cloud')return loadCloud(sessionUser);
  if(a==='refresh-cloud')return cloudReady?refreshCloud(true):(!dataLoading&&loadCloud(sessionUser));
  if(a==='dismiss-invite'){clearInvite();$('#modal').close();return;}
  if(a==='copy-invite'){
    const input=$('#inviteLink');try{await navigator.clipboard.writeText(input.value);toast('Link copiado.');}catch{input.focus();input.select();toast('Selecione e copie o link.');}return;
  }
  if(!cloudReady||dataSaving||dataLoading){
    if(!state)return;
    if(a==='close')return $('#modal').close();
    if(a==='app-menu')return appMenu();
    if(a==='menu-route'){$('#modal').close();return navigate(id);}
    if(a==='profile')return navigate('perfil');
    if(a==='theme')return toggleTheme();
    if(a==='filter'){filter=id;return render();}
    if(a==='book')return details(id);
    return toast('Aguarde a sincroniza��o para alterar seus dados.');
  }
  const before=JSON.stringify(state), originalStore=cloudStore;
  try {
  const c=club();
  if(a==='invite'||a==='renew-invite')return showInvite(id||c.id,a==='renew-invite');
  if(a==='revoke-invite'){
    if(!confirm('Revogar o link atual? Quem já entrou continuará no clube.'))return;
    dataSaving=true;try{await cloudStore.revokeInvite(id);$('#modal').close();toast('Convite revogado.');}finally{dataSaving=false;}return refreshCloud(true);
  }
  if(a==='accept-invite')return acceptPendingInvite();
  if(a==='app-menu')return appMenu();
  if(a==='edit-book')return editBook(id);
  if(a==='theme')return toggleTheme();
  if(a==='menu-route'){$('#modal').close();return navigate(id);}
  if(a==='switch-club'){$('#modal').close();clubTab='activity';}
  if(a==='club-tab'){
    clubTab=id;
    document.querySelectorAll('[role=tab]').forEach(tab=>{const active=tab.dataset.id===id;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
    $('#club-panel').setAttribute('aria-labelledby',`tab-${id}`);
    $('#club-panel').innerHTML=clubPanel(c);
    return;
  }
  if(a==='ranking-period'){
    rankingPeriod=id;
    $('#club-panel').innerHTML=rankingPanel(c);
    $(`[data-action="ranking-period"][data-id="${esc(id)}"]`).focus({preventScroll:true});
    return;
  }
  if(a==='close'){$('#modal').close();return refreshCloud();}if(a==='profile')return navigate('perfil');if(a==='add-book')return addBook();if(a==='book')return details(id);if(a==='adopt')return addBook(book(id));if(a==='log')return logReading(id);if(a==='edit-reading')return editReading(id);if(a==='new-club')return clubForm();if(a==='edit-club'&&c?.owner===user().id)return clubForm(true);
  if(a==='switch-club'){state.activeClub=id;await save();return navigate('clube');}if(a==='filter'){filter=id;return render();}
  if(a==='log-picker'){const rs=state.readings.filter(r=>r.userId===user().id);return modal('Registrar leitura',rs.map(r=>`<div class="person-row"><div><strong>${esc(book(r.bookId).title)}</strong><p class="muted">Página ${esc(r.page)} de ${book(r.bookId).pages}</p></div><button type="button" data-action="log" data-id="${esc(r.id)}">Registrar</button></div>`).join('')||'<button type="button" data-action="add-book">Adicionar primeiro livro</button>',null);}
  if(a==='remove-reading'){if(!confirm('Remover este livro da sua estante e seu histórico pessoal?'))return;state.readings=state.readings.filter(r=>!(r.id===id&&r.userId===user().id));$('#modal').close();}
  if(a==='react'){const item=state.activities.find(a=>a.id===id);item.likes=item.likes.includes(user().id)?item.likes.filter(x=>x!==user().id):[...item.likes,user().id];}
  if(a==='vote'){if(c.votes[user().id]===id)delete c.votes[user().id];else c.votes[user().id]=id;}
  if(a==='propose')return modal('Sugerir próxima leitura',select('Livro','bookId',state.books.filter(b=>!c.shared||state.readings.some(r=>r.bookId===b.id&&r.clubs.includes(c.id))).map(b=>[b.id,b.title])),fd=>{if(!c.proposals.includes(fd.get('bookId')))c.proposals.push(fd.get('bookId'));},'Sugerir');
  if(a==='meeting')return modal('Agendar encontro',`<div class="form-grid">${field('Título','title','','text','required maxlength="120"')}${field('Data','date',today(),'date','required')}${field('Horário','time','19:00','time','required')}${field('Local ou link','place','','text','required maxlength="250"')}</div>`,fd=>c.meetings.push({id:uid(),userId:user().id,...Object.fromEntries(fd)}),'Agendar');
  if(a==='delete-meeting'){const m=c.meetings.find(m=>m.id===id);if(m&&(m.userId===user().id||c.owner===user().id))c.meetings=c.meetings.filter(m=>m.id!==id);}
  if(a==='comment')return modal('Conversa do clube','<label>Comentário<textarea name="text" required maxlength="2000"></textarea></label><label class="check" style="margin-top:14px"><input type="checkbox" name="spoiler">Contém spoiler</label>',fd=>c.comments.push({id:uid(),userId:user().id,text:fd.get('text'),spoiler:fd.has('spoiler')}),'Publicar');
  if(a==='edit-profile'){const u=user();return modal('Editar perfil',`<div class="form-grid">${field('Nome','name',u.name,'text','required maxlength="80"')}${field('Meta de dias por semana','goal',u.goal||4,'number','required min="1" max="7"')}${field('URL da foto','photo',u.photo,'url')}${field('Cor do avatar','color',u.color||'#c8dfe8','color')}</div>`,fd=>{const data={name:fd.get('name').trim(),goal:Number(fd.get('goal')),photo:fd.get('photo'),color:fd.get('color')};Object.assign(u,data);});}
  if(a==='person'){const p=person(id);const shared=state.readings.filter(r=>r.userId===id&&(id===user().id||r.clubs.some(cid=>memberships().some(c=>c.id===cid))));return modal(p.name,`<div class="person-row">${avatar(id)}<div><p>${shared.length} livros compartilhados com você</p></div></div>${shared.map(r=>`<div class="person-row"><div><strong>${esc(book(r.bookId).title)}</strong><p class="muted">${statusNames[r.status]} · ${pct(r)}%</p></div></div>`).join('')}`,null);}
  if(a==='members')return modal('Pessoas do clube',c.members.map(id=>`<div class="person-row">${avatar(id)}<div><strong>${esc(person(id)?.name)}</strong><small> · ${id===c.owner?'Administrador':'Membro'}</small></div>${c.owner===user().id&&id!==user().id?`<button type="button" class="small danger" data-action="remove-member" data-id="${esc(id)}">Remover</button>`:''}</div>`).join('')+(c.owner!==user().id?'<button type="button" class="danger" style="margin-top:18px" data-action="leave">Sair do clube</button>':''),null);
  if(a==='remove-member'||a==='leave'){
    const who=a==='leave'?user().id:id;
    if(c.shared){
      if(!confirm(a==='leave'?'Sair deste clube?':'Remover este membro? O convite atual também será revogado.'))return;
      dataSaving=true;try{await cloudStore.removeMember(c.id,who);$('#modal').close();}finally{dataSaving=false;}return refreshCloud(true);
    }
    if((a==='leave'||c.owner===user().id)&&who!==c.owner){c.members=c.members.filter(x=>x!==who);delete c.votes[who];state.readings.filter(r=>r.userId===who).forEach(r=>r.clubs=r.clubs.filter(x=>x!==c.id));$('#modal').close();}
  }
  if(a==='export')return download(state,`bookrats-backup-${today()}.json`);if(a==='import')return chooseFile('backup');await save();render();await refreshCloud();
  }catch(error){if(originalStore===cloudStore){state=JSON.parse(before);render();toast(cloudMessage(error));}}
});
$('#modalForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!submit||!sessionUser||!cloudReady||dataSaving||dataLoading)return;
  const button=$('#modalForm button[type=submit]'), before=JSON.stringify(state), originalState=state, originalStore=cloudStore;
  button.disabled=true;dataSaving=true;
  try{
    await submit(new FormData(e.target));
    if(originalStore!==cloudStore)return;
    if(state===originalState)stampChanges(JSON.parse(before));
    await save();
    if(originalStore!==cloudStore)return;
    $('#modal').close();render();toast('Salvo no Firestore.');
  }catch(error){if(originalStore===cloudStore){restoreState(JSON.parse(before));toast(cloudMessage(error));}}
  finally{button.disabled=false;if(originalStore===cloudStore){dataSaving=false;refreshCloud();}}
});
$('#modal').addEventListener('close',()=>refreshCloud());
window.addEventListener('online',()=>{if(sessionUser){if(cloudReady)refreshCloud(true);else if(!dataLoading)loadCloud(sessionUser);}});

document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;const rs=view==='estante'?state.readings.filter(r=>r.userId===user().id):state.readings.filter(r=>r.clubs.includes(club().id)&&club().members.includes(r.userId));$('.shelf').innerHTML=shelf(rs);}});
$('#fileInput').addEventListener('change',async e=>{
  if(!sessionUser)return;
  const accountId=sessionUser.uid, f=e.target.files[0];if(!f)return;
  try{
    const data=JSON.parse(await f.text());
    if(sessionUser?.uid!==accountId)return;
    validateBackup(data);
    if(data.currentUser!==accountId)throw Error('Este backup pertence a outra conta.');
    if(state.clubs.some(c=>c.shared)||data.clubs.some(c=>c.shared))throw Error('Restauração indisponível enquanto houver clubes compartilhados, para preservar os dados dos outros membros.');
    modal('Restaurar backup','<p>Esta ação substitui os dados desta conta no Firestore, em todos os dispositivos. Exporte um backup antes de continuar.</p>',()=>{state=JSON.parse(JSON.stringify(data));},'Substituir dados');
  }catch(error){toast(error.message);}
});
function validateBackup(d){if(d.version!==1||!['users','books','readings','clubs','activities'].every(k=>Array.isArray(d[k]))||!d.users.some(u=>u.id===d.currentUser))throw Error('Backup Bookrats inválido.');const ids=new Set(d.users.map(u=>u.id));for(const u of d.users)if(typeof u.name!=='string'||!Number.isInteger(u.goal)||u.goal<1||u.goal>7)throw Error('Perfil inválido no backup.');for(const b of d.books)if(typeof b.title!=='string'||typeof b.author!=='string'||!Number.isInteger(b.pages)||b.pages<1)throw Error('Livro inválido no backup.');for(const c of d.clubs)if(typeof c.name!=='string'||!Array.isArray(c.members)||!c.members.every(id=>ids.has(id))||!c.members.includes(c.owner)||!Array.isArray(c.proposals)||!Array.isArray(c.meetings)||!Array.isArray(c.comments)||!c.votes||!(c.target>0))throw Error('Clube inválido no backup.');for(const r of d.readings)if(!ids.has(r.userId)||!d.books.some(b=>b.id===r.bookId&&r.page>=0&&r.page<=b.pages)||!Array.isArray(r.clubs)||!Array.isArray(r.logs)||!statusNames[r.status])throw Error('Leitura inválida no backup.');for(const a of d.activities)if(!Array.isArray(a.clubs)||!Array.isArray(a.likes)||!ids.has(a.userId))throw Error('Atividade inválida no backup.');}
window.addEventListener('hashchange',()=>{view=location.hash.slice(1)||'clube';filter='all';query='';render();});
document.addEventListener('keydown',e=>{
  if(!e.target.matches('[role=tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  const tabs=[...document.querySelectorAll('[role=tab]')];
  const index=tabs.indexOf(e.target);
  const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].focus();tabs[next].click();
});
render();
initializeLogin();

function renderLogin() {
  $('#app').innerHTML = '<main class="login-page"><section class="login-card"><h1>bookrats</h1><p>Mais um capítulo, em boa companhia.</p><button class="primary" data-action="google-login" '+(authBusy?'disabled':'')+'>Entrar com Google</button><p role="status">'+esc(authMessage)+'</p><small>'+ (pendingInvite?'Entre com Google para ver e aceitar o convite do clube.':'Acesse seus livros com sua conta Google.') +'</small></section></main>';
}
async function initializeLogin() {
  if(authBusy)return;
  authBusy=true;authReady=false;authMessage='Verificando sessão…';render();
  const config=window.BOOKRATS_FIREBASE_CONFIG;
  if(!config?.apiKey||!config?.authDomain||!config?.projectId||!config?.appId) {
    authMessage='Login Google aguardando configuração do Firebase.';authBusy=false;render();return;
  }
  try {
    if(location.protocol==='file:')throw Error('Abra pelo Live Server em http://localhost; o Google não permite login em file://');
    authModule=window.BookratsAuth;
    if(!authModule)throw Error('Arquivo de autenticação não carregado. Recarregue a página');
    await authModule.startAuth(config, account=>{
      cloudStore?.stop();cloudStore=null;cloudReady=false;dataSaving=false;dataLoading=false;remotePending=false;
      $('#modal').close();submit=null;
      if(sessionUser&&sessionUser.uid!==account?.uid)authModule.removeCachedState?.(sessionUser.uid);
      sessionUser=account;state=null;
      if(account){KEY='bookrats.account.v1:'+account.uid;loadCloud(account);}
      else {authMessage='Entre para acessar sua conta.';render();}
      filter='all';query='';
    });
    authReady=true;render();
  } catch(error) {authMessage=authModule?.authError(error)||error.message;}
  finally{authBusy=false;render();}
}
async function googleLogin() {
  if(authBusy)return;
  if(!authReady){await initializeLogin();return;}
  authBusy=true;authMessage='Aguardando o Google…';render();
  try {await authModule.login();}
  catch(error){authMessage=authModule.authError(error);}
  finally{authBusy=false;render();}
}
async function googleLogout() {
  if(authBusy)return;
  authBusy=true;
  try{await authModule.logout();}
  catch{toast('Não foi possível sair. Tente novamente.');}
  finally{authBusy=false;render();}
}

function renderCloudLoading(){
  $('#app').innerHTML='<main class="login-page"><section class="login-card"><h1>bookrats</h1><p role="status">'+esc(dataMessage)+'</p>'+(!dataLoading?'<button class="primary" data-action="retry-cloud">Tentar carregar novamente</button>':'')+'<button data-action="sign-out">Sair da conta</button></section></main>';
}

function restoreState(previous){
  for(const key of ['users','books','readings','clubs','activities']){
    const existing=new Map(state[key].map(item=>[item.id,item]));
    state[key]=previous[key].map(item=>{const target=existing.get(item.id);if(!target)return item;for(const k of Object.keys(target))delete target[k];return Object.assign(target,item);});
  }
  state.currentUser=previous.currentUser;state.activeClub=previous.activeClub;state.version=previous.version;
}

function clearInvite(){pendingInvite='';const url=new URL(location.href);url.searchParams.delete('invite');history.replaceState(null,'',url);}
async function openPendingInvite(){
  if(!pendingInvite||inviteOpening||!cloudReady)return;
  inviteOpening=true;const store=cloudStore,token=pendingInvite;
  try{
    const info=await store.previewInvite(token);
    if(store!==cloudStore||token!==pendingInvite)return;
    const joined=state.clubs.some(c=>c.id===info.clubId&&c.shared);
    modal('Convite para o clube', '<p>Você recebeu um convite para <strong>'+esc(info.name)+'</strong>.</p><p class="muted">Ao entrar, os membros verão seu nome e sua foto. Seus livros só aparecem quando você os compartilha neste clube.</p><div class="form-actions"><button type="button" data-action="dismiss-invite">Agora não</button><button type="button" class="primary" data-action="accept-invite">'+(joined?'Abrir clube':'Entrar no clube')+'</button></div>',null);
  }catch(error){if(store===cloudStore)modal('Convite indisponível','<p>'+esc(cloudMessage(error))+'</p><button type="button" data-action="dismiss-invite">Fechar</button>',null);}
  finally{inviteOpening=false;}
}
async function acceptPendingInvite(){
  const store=cloudStore;dataSaving=true;
  const button=$('[data-action="accept-invite"]');if(button)button.disabled=true;
  try{
    const cid=await store.acceptInvite(pendingInvite);
    if(store!==cloudStore)return;
    clearInvite();$('#modal').close();state=await store.read();state.activeClub=cid;await save();view='clube';location.hash='clube';render();toast('Você entrou no clube.');
  }catch(error){if(store===cloudStore)toast(cloudMessage(error));}
  finally{if(store===cloudStore){dataSaving=false;if(button)button.disabled=false;refreshCloud();}}
}
async function showInvite(cid,renew=false){
  const store=cloudStore;dataSaving=true;setSyncStatus('Preparando convite…');
  try{
    const invitation=await store.createInvite(cid,renew);
    if(store!==cloudStore)return;
    state=await store.read();render();
    const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    const url=new URL(local?'https://maximusgugu.github.io/bookrats/':location.href);
    url.search='';url.hash='';url.searchParams.set('invite',invitation.token);
    modal('Convidar por link','<p>Compartilhe este link para entrar em <strong>'+esc(invitation.name)+'</strong>.</p><label style="margin-top:16px">Link do convite<input id="inviteLink" readonly value="'+esc(url.href)+'"></label><p class="muted">Válido até '+esc(new Date(invitation.expiresAt).toLocaleDateString('pt-BR'))+'. Quem abrir precisa entrar com Google.</p><div class="form-actions"><button type="button" class="primary" data-action="copy-invite">Copiar link</button><button type="button" data-action="renew-invite" data-id="'+esc(cid)+'">Gerar novo link</button><button type="button" class="danger" data-action="revoke-invite" data-id="'+esc(cid)+'">Revogar link</button></div>',null);
    setSyncStatus('Sincronizado com o Firestore');
  }catch(error){if(store===cloudStore)toast(cloudMessage(error));}
  finally{if(store===cloudStore)dataSaving=false;}
}
