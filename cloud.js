import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';

const kinds = ['users', 'books', 'readings', 'clubs', 'activities'];
const clone = value => JSON.parse(JSON.stringify(value));
const conflict = () => Object.assign(new Error('Os dados mudaram em outro dispositivo. Atualize os dados e tente novamente.'), {code:'bookrats/conflict'});

export function encodeState(state, uid) {
  if (state.currentUser !== uid || state.version !== 1) throw Error('Os dados não pertencem à conta conectada.');
  const records = new Map();
  for (const kind of kinds) {
    if (!Array.isArray(state[kind])) throw Error('Dados inválidos: ' + kind);
    state[kind].forEach((data, position) => {
      if (typeof data.id !== 'string' || !data.id || data.id.includes('/') || data.id.length > 256) throw Error('Identificador inválido no backup.');
      const key = kind + '_' + data.id;
      if (records.has(key)) throw Error('Identificador duplicado no backup.');
      const record = {kind, position, data:clone(data)};
      if (new TextEncoder().encode(JSON.stringify(record)).length > 900000) throw Error('Um registro excede o limite do Firestore. Reduza a capa ou o histórico e tente novamente.');
      records.set(key, record);
    });
  }
  return records;
}

export function createCloudStore(db, uid) {
  const root = doc(db, 'bookratsAccounts', uid);
  const items = collection(root, 'items');
  let revision = null, baseline = null, stopped = false;
  let unwatch = () => {};
  const active = () => { if (stopped) throw Error('A sessão mudou. Entre novamente.'); };

  async function read() {
    active();
    // Read the revision on both sides to avoid assembling records from different commits.
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await getDocFromServer(root);
      if (!before.exists()) return null;
      const documents = await getDocsFromServer(items);
      const after = await getDocFromServer(root);
      active();
      if (!after.exists() || before.data().revision !== after.data().revision) continue;
      const meta = after.data();
      const state = {version:1,currentUser:uid,activeClub:meta.activeClub || ''};
      for (const kind of kinds) state[kind] = documents.docs.map(d=>d.data()).filter(d=>d.kind===kind).sort((a,b)=>a.position-b.position).map(d=>d.data);
      revision = meta.revision;
      baseline = clone(state);
      return clone(state);
    }
    throw conflict();
  }

  function limitWrites(changes) {
    if (changes.length > 450) throw Error('Esta operação altera mais de 450 registros. Importe um backup menor.');
    const bytes = changes.reduce((n,[,value])=>n+(value ? new TextEncoder().encode(JSON.stringify(value)).length : 0),0);
    if(bytes>8000000) throw Error('Esta operação excede 8 MB. Reduza as imagens do backup.');
  }

  return {
    async load(initialData) {
      const existing = await read();
      if (existing) return existing;
      const {state, migrated} = initialData();
      const records = [...encodeState(state,uid)];
      limitWrites(records);
      await runTransaction(db, async tx => {
        active();
        const current = await tx.get(root);
        if (current.exists()) return; // Another device initialized first; never overwrite it.
        tx.set(root,{version:1,currentUser:uid,activeClub:state.activeClub||'',revision:1,migratedFromLocal:!!migrated,updatedAt:serverTimestamp()});
        records.forEach(([id,value])=>tx.set(doc(items,id),value));
      });
      return read();
    },
    read,
    async save(state, extension) {
      active();
      if (!baseline) throw Error('Os dados ainda não foram carregados.');
      const snapshot = clone(state);
      const previous = encodeState(baseline,uid), next = encodeState(snapshot,uid);
      const changes = [...next].filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(previous.get(key)));
      for(const key of previous.keys()) if(!next.has(key)) changes.push([key,null]);
      if(!changes.length && snapshot.activeClub===baseline.activeClub&&!extension)return;
      limitWrites(changes);
      const expected = revision;
      await runTransaction(db, async tx => {
        active();
        const current = await tx.get(root);
        if(!current.exists() || current.data().revision!==expected)throw conflict();
        const writeShared=extension?await extension(tx):null;
        tx.update(root,{activeClub:snapshot.activeClub||'',revision:expected+1,updatedAt:serverTimestamp()});
        for(const [id,value] of changes) value ? tx.set(doc(items,id),value) : tx.delete(doc(items,id));
        writeShared?.();
      });
      active();
      revision=expected+1;baseline=snapshot;
    },
    watch(onChange,onError) {
      unwatch();
      unwatch=onSnapshot(root,{includeMetadataChanges:true},snapshot=>{
        if(stopped||snapshot.metadata.hasPendingWrites||snapshot.metadata.fromCache)return;
        if(!snapshot.exists()||snapshot.data().revision!==revision)onChange();
      },onError);
      return unwatch;
    },
    stop(){stopped=true;unwatch();},
    get revision(){return revision;}
  };
}

export function cloudError(error) {
  return ({
    'permission-denied':'O Firestore negou o acesso. Publique as regras do Bookrats no Firebase Console.',
    'unavailable':'Não foi possível conectar ao Firestore. Verifique a internet e tente novamente.',
    'failed-precondition':'O Firestore ainda não está pronto. Verifique se o banco (default) foi criado.',
    'not-found':'O banco Firestore não foi encontrado. Crie o banco (default) no projeto bookrats-ea53d.',
    'resource-exhausted':'O Firestore atingiu um limite de uso. Tente novamente mais tarde.',
    'bookrats/conflict':'Os dados mudaram em outro dispositivo. Atualize os dados antes de salvar novamente.'
  })[error.code] || error.message || 'Não foi possível salvar no Firestore.';
}
