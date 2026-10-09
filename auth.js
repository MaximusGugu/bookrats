import { createSharedStore } from './shared.js';
import { getFirestore } from 'firebase/firestore';
import { createCloudStore } from './cloud.js';
export { cloudError } from './cloud.js';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
let auth;
let unsubscribe;
export async function startAuth(config, onChange) {
  auth = getAuth(getApps()[0] || initializeApp(config));
  auth.languageCode = 'pt-BR';
  let persistenceSet = false;
  for (const persistence of [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]) {
    try { await setPersistence(auth, persistence); persistenceSet = true; break; }
    catch (error) { if (persistence === inMemoryPersistence) throw error; }
  }
  if (!persistenceSet) throw Error('Não foi possível configurar a sessão.');
  unsubscribe?.();
  unsubscribe = onAuthStateChanged(auth, onChange);
  await auth.authStateReady();
}
export function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}
export function logout() { return signOut(auth); }
export function authError(error) {
  return ({
    'auth/popup-closed-by-user': 'Login cancelado. Você pode tentar novamente.',
    'auth/cancelled-popup-request': 'Já existe uma tentativa de login em andamento.',
    'auth/popup-blocked': 'Permita pop-ups neste site e tente novamente.',
    'auth/unauthorized-domain': 'Autorize este endereço (' + location.hostname + ') em Firebase Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Ative o provedor Google no Firebase Authentication.',
    'auth/configuration-not-found': 'Configure o Firebase Authentication e habilite o provedor Google no projeto bookrats-ea53d.',
    'auth/network-request-failed': 'Não foi possível conectar ao Google. Verifique sua internet e tente novamente.',
    'auth/web-storage-unsupported': 'O navegador bloqueou o armazenamento da sessão. Permita os dados deste site.',
    'auth/invalid-api-key': 'A chave pública do Firebase é inválida. Confira firebase-config.js.'
  })[error.code] || ('Não foi possível iniciar o login (' + (error.code || error.message || 'erro desconhecido') + '). Tente novamente.');
}

export function accountStore(uid) {
  if(auth.currentUser?.uid!==uid)throw Error('Entre na conta antes de carregar seus dados.');
  const db=getFirestore(auth.app);
  return createSharedStore(db,uid,createCloudStore(db,uid));
}
