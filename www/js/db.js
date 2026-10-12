const DB_NAME = 'LibyaQuranDB';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      ['quran','tafseer','translations','user_data','audio_cache'].forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readonly').objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbPut(store, key, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).put(value, key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
async function saveUserData(key, value) { return dbPut('user_data', key, value); }
async function getUserData(key) { return dbGet('user_data', key); }

window.DB = { openDB, dbGet, dbPut, dbDelete, saveUserData, getUserData };
