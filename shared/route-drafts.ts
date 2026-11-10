/** IndexedDB keeps large GPS recordings out of synchronous localStorage. Scoped by account. */
const DB = '1locate-route-drafts-v1';
function open(): Promise<IDBDatabase> { return new Promise((resolve, reject) => {
  const request = indexedDB.open(DB, 1);
  request.onupgradeneeded = () => { request.result.createObjectStore('drafts'); };
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
}); }
export async function readRouteDraft(key: string): Promise<unknown> {
  const db = await open();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('drafts', 'readonly'); const request = tx.objectStore('drafts').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); }
}
export async function writeRouteDraft(key: string, value: unknown): Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('drafts', 'readwrite'); if (value == null) tx.objectStore('drafts').delete(key); else tx.objectStore('drafts').put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Draft storage aborted')); }); } finally { db.close(); }
}
