// IndexedDB key-value cache for large election datasets.
// localStorage is typically capped at 5–10 MB; 35k+ election records
// exceed that limit, causing silent save failures and data loss on restart.
// IndexedDB has no practical size limit (browser allocates from disk quota).

const DB_NAME    = 'ga_election_db'
const DB_VERSION = 1
const STORE      = 'keyval'

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE)
    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror   = e => reject(e.target.error)
  })
}

export async function idbGet(key, fallback) {
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = e => resolve(e.target.result !== undefined ? e.target.result : fallback)
      req.onerror   = () => resolve(fallback)
    })
  } catch {
    return fallback
  }
}

export async function idbSet(key, value) {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = resolve
      tx.onerror    = e => reject(e.target.error)
    })
  } catch (e) {
    console.error('[IDBCache] write failed for key:', key, e)
  }
}

export async function idbDelete(...keys) {
  try {
    const db = await openDB()
    await Promise.all(keys.map(key => new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = resolve
      tx.onerror    = resolve
    })))
  } catch {}
}
