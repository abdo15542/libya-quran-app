// ============ نظام تحميل المصحف الصوتي ============

const AUDIO_DB_NAME = 'LibyaQuranAudioDB';
const AUDIO_DB_VERSION = 1;

let _audioDB = null;

async function openAudioDB() {
  if (_audioDB) return _audioDB;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio_files')) {
        db.createObjectStore('audio_files');
      }
      if (!db.objectStoreNames.contains('download_state')) {
        db.createObjectStore('download_state');
      }
    };
    req.onsuccess = () => { _audioDB = req.result; resolve(_audioDB); };
    req.onerror = () => reject(req.error);
  });
}

async function saveAudioFile(key, blob) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_files', 'readwrite');
    tx.objectStore('audio_files').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAudioFile(key) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_files', 'readonly');
    const req = tx.objectStore('audio_files').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function hasAudioFile(key) {
  const blob = await getAudioFile(key);
  return !!blob;
}

async function saveDownloadState(state) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('download_state', 'readwrite');
    tx.objectStore('download_state').put(state, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDownloadState() {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('download_state', 'readonly');
    const req = tx.objectStore('download_state').get('current');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getAudioStats() {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_files', 'readonly');
    const store = tx.objectStore('audio_files');
    const countReq = store.count();
    let totalSize = 0;
    const cursorReq = store.openCursor();
    
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value && cursor.value.size) totalSize += cursor.value.size;
        cursor.continue();
      }
    };
    
    tx.oncomplete = () => resolve({ count: countReq.result || 0, bytes: totalSize });
    tx.onerror = () => reject(tx.error);
  });
}

// ============ التحميل الفعلي ============

let _downloadInProgress = false;
let _downloadCallbacks = {};

async function downloadAllAudio(readerKey, onProgress) {
  if (_downloadInProgress) return;
  _downloadInProgress = true;
  _downloadCallbacks.onProgress = onProgress;
  
  const readers = window.RecitersModule.readers;
  const reader = readers[readerKey];
  if (!reader) {
    _downloadInProgress = false;
    throw new Error('قارئ غير معروف');
  }

  const quran = window.QURAN_DATA_CACHE; // تأتي من التطبيق الرئيسي
  if (!quran || !quran.surahs) {
    _downloadInProgress = false;
    throw new Error('المصحف غير محمّل');
  }

  const total = 114;
  let completed = 0;
  let failed = 0;
  const failedList = [];

  try {
    for (let s = 1; s <= 114; s++) {
      const key = readerKey + '_' + s;
      const exists = await hasAudioFile(key);
      
      if (exists) {
        completed++;
        if (onProgress) onProgress({ completed, total, current: s, status: 'skip' });
        continue;
      }

      try {
        // للقراء من نوع سورة كاملة
        const url = reader.pattern.replace('{S}', String(s).padStart(3, '0'));
        
        if (onProgress) onProgress({ completed, total, current: s, status: 'downloading' });

        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'audio/mpeg,*/*' },
        });
        
        if (!res.ok) throw new Error('HTTP ' + res.status);
        
        const blob = await res.blob();
        await saveAudioFile(key, blob);
        
        completed++;
        await saveDownloadState({ readerKey, completed, total, lastUpdate: Date.now() });
        
        if (onProgress) onProgress({ 
          completed, 
          total, 
          current: s, 
          status: 'done',
          size: blob.size 
        });
      } catch (e) {
        failed++;
        failedList.push(s);
        if (onProgress) onProgress({ 
          completed, 
          total, 
          current: s, 
          status: 'failed', 
          error: e.message 
        });
      }
      
      // استراحة قصيرة لتجنب rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
  } finally {
    _downloadInProgress = false;
    await saveDownloadState({ 
      readerKey, 
      completed, 
      total, 
      failed, 
      failedList,
      finished: true, 
      finishedAt: Date.now() 
    });
  }
}

async function deleteAllAudio() {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_files', 'readwrite');
    tx.objectStore('audio_files').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

window.AudioDownloader = {
  downloadAll: downloadAllAudio,
  getStats: getAudioStats,
  getState: getDownloadState,
  deleteAll: deleteAllAudio,
  has: hasAudioFile,
  get: getAudioFile,
  isDownloading: () => _downloadInProgress,
};
