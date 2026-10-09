// A display cache, never a source of authentication or a queue of writes.
let database;
function openCache() {
  return database ||= new Promise(resolve => {
    try {
      const request = indexedDB.open('bookrats-view-cache', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function access(uid, mode, operation) {
  try {
    const db = await openCache();
    if (!db) return null;
    return await new Promise(resolve => {
      const tx = db.transaction('accounts', mode);
      const request = operation(tx.objectStore('accounts'), uid);
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onerror = tx.onabort = () => resolve(null);
    });
  } catch { return null; }
}
export const loadCachedState = uid => access(uid, 'readonly', (store, key) => store.get(key));
export const saveCachedState = (uid, state) => access(uid, 'readwrite', (store, key) => store.put(state, key));
export const removeCachedState = uid => access(uid, 'readwrite', (store, key) => store.delete(key));
