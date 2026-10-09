import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp, Timestamp, increment } from 'firebase/firestore';

const copy = value => JSON.parse(JSON.stringify(value));
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const conflict = () => Object.assign(Error('O clube mudou em outro dispositivo. Atualize os dados e tente novamente.'),{code:'bookrats/conflict'});
const fields = ['id','name','description','owner','target','proposals','votes','meetings','comments'];
const metadata = c => Object.fromEntries(fields.map(k=>[k,c[k] ?? ({proposals:[],votes:{},meetings:[],comments:[],description:''}[k] ?? '')]));
const profile = (s,uid) => copy(s.users.find(u=>u.id===uid));
function shares(s,cid,uid) {
  return new Map(s.readings.filter(r=>r.userId===uid&&r.clubs.includes(cid)).map(r=>[r.id,{
    userId:uid,
    reading:{...copy(r),clubs:[cid],logs:r.logs.map(({id,date,from,to,delta})=>({id,date,from,to,delta}))},
    book:copy(s.books.find(b=>b.id===r.bookId))
  }]));
}
function activities(s,cid,uid) {return new Map(s.activities.filter(a=>a.clubs.includes(cid)&&a.userId===uid).map(a=>[a.id,{...copy(a),clubs:[cid]}]));}
function delta(previous,next){const result=[...next].filter(([id,v])=>!same(previous.get(id),v));for(const id of previous.keys())if(!next.has(id))result.push([id,null]);return result;}
function sizeCheck(writes){if(writes.length>400)throw Error('O clube tem muitos registros para esta operação. Reduza o compartilhamento antes de continuar.');for(const [,v] of writes)if(v&&new TextEncoder().encode(JSON.stringify(v)).length>900000)throw Error('Uma leitura compartilhada é muito grande. Reduza a capa ou o histórico.');}

export function createSharedStore(db,uid,privateStore){
  const links=collection(db,'bookratsAccounts',uid,'clubLinks');
  const clubRef=id=>doc(db,'bookratsClubs',id);
  const memberRef=(cid,id=uid)=>doc(clubRef(cid),'members',id);
  let personal,baseline,linked=new Set(),revisions=new Map(),stopped=false,onChange,onError;
  let watchers=[];
  const active=()=>{if(stopped)throw Error('A sessão mudou. Entre novamente.');};
  function listen(){
    watchers.forEach(fn=>fn());watchers=[];
    if(!onChange||stopped)return;
    watchers.push(onSnapshot(links,s=>{if(!s.metadata.hasPendingWrites&&!s.metadata.fromCache&&!same(s.docs.map(d=>d.id).sort(),[...linked].sort()))onChange();},onError));
    for(const cid of [...linked].filter(id=>revisions.has(id)))watchers.push(onSnapshot(clubRef(cid),s=>{if(!s.metadata.hasPendingWrites&&!s.metadata.fromCache&&s.data()?.revision!==revisions.get(cid))onChange();},e=>{if(e.code==='permission-denied')onChange();else onError(e);}));
  }
  async function compose(raw){
    active();personal=copy(raw);
    const linkDocs=await getDocsFromServer(links);linked=new Set(linkDocs.docs.map(d=>d.id));
    const result=copy(raw);result.clubs=result.clubs.filter(c=>!linked.has(c.id));
    const people=new Map(result.users.map(u=>[u.id,u])),books=new Map(result.books.map(b=>[b.id,b]));
    const readings=new Map(result.readings.map(r=>[r.id,r])),events=new Map(result.activities.map(a=>[a.id,a]));
    for(const cid of linked){
      try{
        let shared;
        for(let attempt=0;attempt<4;attempt++){
          const before=await getDocFromServer(clubRef(cid));
          if(!before.exists())break;
          const [members,rs,as]=await Promise.all(['members','readings','activities'].map(k=>getDocsFromServer(collection(clubRef(cid),k))));
          const after=await getDocFromServer(clubRef(cid));
          if(before.data().revision!==after.data()?.revision)continue;
          shared={club:after.data(),members:members.docs.map(d=>d.data()),readings:rs.docs.map(d=>d.data()),activities:as.docs.map(d=>d.data())};break;
        }
        if(!shared)throw conflict();
        const memberIds=shared.members.map(m=>m.userId);
        if(!memberIds.includes(uid))continue;
        revisions.set(cid,shared.club.revision);
        result.clubs.push({...metadata(shared.club),members:memberIds,shared:true});
        for(const m of shared.members)if(m.userId!==uid)people.set(m.userId,m.profile);
        for(const row of shared.readings){
          if(row.userId===uid||!memberIds.includes(row.userId))continue;
          if(!books.has(row.book.id))books.set(row.book.id,row.book);
          row.reading.logs=(row.reading.logs||[]).filter(l=>typeof l.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(l.date)&&['from','to','delta'].every(k=>Number.isFinite(l[k])));
          const existing=readings.get(row.reading.id);
          readings.set(row.reading.id,{...row.reading,clubs:[...new Set([...(existing?.clubs||[]),cid])]});
        }
        for(const event of shared.activities){
          if(!memberIds.includes(event.userId))continue;
          const existing=events.get(event.id);
          // Shared reactions are authoritative, even for the author.
          events.set(event.id,{...event,clubs:[...new Set([...(existing?.clubs||[]),cid])]});
        }
      }catch(e){if(e.code!=='permission-denied')throw e;revisions.delete(cid);}
    }
    active();result.users=[...people.values()];result.books=[...books.values()];result.readings=[...readings.values()];result.activities=[...events.values()];
    baseline=copy(result);listen();return result;
  }
  function privateSnapshot(state){
    const result=copy(personal);
    result.currentUser=uid;result.activeClub=state.activeClub;
    result.users=result.users.map(u=>u.id===uid?profile(state,uid):u);
    const ownReadings=state.readings.filter(r=>r.userId===uid);
    result.readings=[...personal.readings.filter(r=>r.userId!==uid),...copy(ownReadings)];
    const ids=new Set([...personal.books.map(b=>b.id),...ownReadings.map(r=>r.bookId)]);
    result.books=copy(state.books.filter(b=>ids.has(b.id)));
    result.clubs=[...personal.clubs.filter(c=>linked.has(c.id)),...copy(state.clubs.filter(c=>!linked.has(c.id)))];
    result.activities=[...personal.activities.filter(a=>a.userId!==uid),...copy(state.activities.filter(a=>a.userId===uid))];
    return result;
  }
  async function save(state){
    active();const snapshot=copy(state),nextPrivate=privateSnapshot(snapshot);const plans=[];
    for(const c of snapshot.clubs.filter(c=>c.shared)){
      const old=baseline.clubs.find(x=>x.id===c.id);if(!old)throw conflict();
      const writes=[];
      for(const [id,v] of delta(shares(baseline,c.id,uid),shares(snapshot,c.id,uid)))writes.push([doc(clubRef(c.id),'readings',id),v]);
      for(const [id,v] of delta(activities(baseline,c.id,uid),activities(snapshot,c.id,uid)))writes.push([doc(clubRef(c.id),'activities',id),v]);
      for(const a of snapshot.activities.filter(a=>a.userId!==uid&&a.clubs.includes(c.id))){const prev=baseline.activities.find(x=>x.id===a.id);if(prev&&!same(prev.likes,a.likes))writes.push([doc(clubRef(c.id),'activities',a.id),{...a,clubs:[c.id]}]);}
      if(!same(profile(baseline,uid),profile(snapshot,uid)))writes.push([memberRef(c.id),{profile:profile(snapshot,uid)},'update']);
      const changed=!same(metadata(old),metadata(c));
      if(changed||writes.length)plans.push({cid:c.id,expected:revisions.get(c.id),meta:changed?metadata(c):null,writes});
    }
    if(plans.length>5)throw Error('Atualize até cinco clubes por vez.');
    sizeCheck(plans.flatMap(p=>p.writes));
    await privateStore.save(nextPrivate,plans.length?async tx=>{
      const current=await Promise.all(plans.map(p=>tx.get(clubRef(p.cid))));
      current.forEach((s,i)=>{if(!s.exists()||s.data().revision!==plans[i].expected)throw conflict();});
      return ()=>plans.forEach(p=>{
        tx.update(clubRef(p.cid),{...(p.meta||{}),revision:p.expected+1,updatedAt:serverTimestamp()});
        for(const [ref,value,mode] of p.writes)value?(mode==='update'?tx.update(ref,value):tx.set(ref,value)):tx.delete(ref);
      });
    }:undefined);
    active();personal=nextPrivate;baseline=snapshot;plans.forEach(p=>revisions.set(p.cid,p.expected+1));
  }
  async function publishClub(cid){
    if(linked.has(cid))return;
    const c=baseline.clubs.find(c=>c.id===cid);if(!c||c.owner!==uid)throw Error('Somente o administrador pode convidar.');
    const writes=[...shares(baseline,cid,uid)].map(([id,v])=>[doc(clubRef(cid),'readings',id),v]);
    for(const [id,v]of activities(baseline,cid,uid))writes.push([doc(clubRef(cid),'activities',id),v]);
    sizeCheck(writes);
    await runTransaction(db,async tx=>{
      active();const own=await tx.get(memberRef(cid));
      if(own.exists()){tx.set(doc(links,cid),{id:cid});return;}
      tx.set(clubRef(cid),{...metadata(c),revision:1,inviteToken:'',updatedAt:serverTimestamp()});
      tx.set(memberRef(cid),{userId:uid,profile:profile(baseline,uid),joinedAt:serverTimestamp(),inviteToken:''});
      tx.set(doc(links,cid),{id:cid});writes.forEach(([r,v])=>tx.set(r,v));
    });
    await compose(await privateStore.read());
  }
  async function previewInvite(token){
    if(!/^[a-f0-9]{64}$/.test(token))throw Error('Convite inválido.');
    try{const s=await getDocFromServer(doc(db,'bookratsInvites',token));if(!s.exists()||s.data().expiresAt.toMillis()<=Date.now())throw Error('expired');return {clubId:s.data().clubId,name:s.data().name,expiresAt:s.data().expiresAt.toMillis()};}
    catch(e){if(e.code==='unavailable')throw e;throw Error('Este convite é inválido, expirou ou foi revogado. Peça um novo link ao administrador.');}
  }
  return {
    async load(initial){return compose(await privateStore.load(initial));},
    async read(){return compose(await privateStore.read());},save,
    watch(change,error){onChange=change;onError=error;privateStore.watch(change,error);listen();},
    stop(){stopped=true;watchers.forEach(fn=>fn());privateStore.stop();},
    async createInvite(cid,renew=false){
      active();await publishClub(cid);
      const ref=clubRef(cid),current=await getDocFromServer(ref);
      if(current.data()?.owner!==uid)throw Error('Somente o administrador pode convidar.');
      if(!renew&&current.data().inviteToken){try{const info=await previewInvite(current.data().inviteToken);return {...info,token:current.data().inviteToken};}catch{}}
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
      const expiresAt=Timestamp.fromMillis(Date.now()+7*24*60*60*1000);
      await runTransaction(db,async tx=>{active();const c=await tx.get(ref);if(c.data()?.owner!==uid)throw Error('Sem permissão.');tx.update(ref,{inviteToken:token,revision:c.data().revision+1,updatedAt:serverTimestamp()});tx.set(doc(db,'bookratsInvites',token),{clubId:cid,name:c.data().name,owner:uid,expiresAt});});
      return {token,clubId:cid,name:current.data().name,expiresAt:expiresAt.toMillis()};
    },
    async revokeInvite(cid){active();await runTransaction(db,async tx=>{const c=await tx.get(clubRef(cid));if(c.data()?.owner!==uid)throw Error('Sem permissão.');tx.update(clubRef(cid),{inviteToken:'',revision:c.data().revision+1,updatedAt:serverTimestamp()});});},
    previewInvite,
    async acceptInvite(token){
      active();const info=await previewInvite(token),cid=info.clubId;
      await runTransaction(db,async tx=>{
        active();const invitation=await tx.get(doc(db,'bookratsInvites',token));const membership=await tx.get(memberRef(cid));
        if(!invitation.exists()||invitation.data().expiresAt.toMillis()<=Date.now())throw Error('Convite expirado.');
        if(!membership.exists()){
          tx.set(memberRef(cid),{userId:uid,profile:profile(baseline,uid),joinedAt:serverTimestamp(),inviteToken:token});
          tx.update(clubRef(cid),{revision:increment(1),updatedAt:serverTimestamp()});
        }
        tx.set(doc(links,cid),{id:cid});
      });
      return cid;
    },
    async removeMember(cid,memberId){
      active();if(memberId===baseline.clubs.find(c=>c.id===cid)?.owner)throw Error('O administrador não pode sair do próprio clube.');
      const expected=(await getDocFromServer(clubRef(cid))).data()?.revision;
      const [rs,as]=await Promise.all(['readings','activities'].map(k=>getDocsFromServer(collection(clubRef(cid),k))));
      const docs=[...rs.docs,...as.docs].filter(d=>d.data().userId===memberId);if(docs.length>400)throw Error('Muitos registros para remover de uma vez.');
      await runTransaction(db,async tx=>{
        active();const c=await tx.get(clubRef(cid));
        if(c.data()?.revision!==expected)throw conflict();
        if(memberId!==uid&&c.data()?.owner!==uid)throw Error('Somente o administrador pode remover membros.');
        tx.delete(memberRef(cid,memberId));docs.forEach(d=>tx.delete(d.ref));
        tx.update(clubRef(cid),{...(memberId!==uid?{inviteToken:''}:{}),revision:c.data().revision+1,updatedAt:serverTimestamp()});
        // Keep the link as a tombstone: old private club snapshots must never reappear.
      });
    }
  };
}
