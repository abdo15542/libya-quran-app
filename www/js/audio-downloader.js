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
let _downloadCancelled = false;

async function downloadAllAudio(readerKey, onProgress) {
  if (_downloadInProgress) throw new Error('التحميل جارٍ بالفعل');
  
  _downloadInProgress = true;
  _downloadCancelled = false;

  const reader = window.READERS[readerKey];
  if (!reader) {
    _downloadInProgress = false;
    throw new Error('قارئ غير معروف: ' + readerKey);
  }

  const quran = window.QURAN_DATA_CACHE;
  if (!quran || !quran.surahs) {
    _downloadInProgress = false;
    throw new Error('المصحف غير محمّل في الذاكرة');
  }

  const total = 114;
  let completed = 0;
  let failed = 0;
  const failedList = [];

  try {
    for (let s = 1; s <= 114; s++) {
      if (_downloadCancelled) break;

      const key = readerKey + '_' + s;
      const exists = await hasAudioFile(key);
      
      if (exists) {
        completed++;
        if (onProgress) onProgress({ 
          completed, total, current: s, status: 'skip',
          surahName: quran.surahs[s - 1]?.name || '' 
        });
        continue;
      }

      try {
        let url;
        const S = String(s).padStart(3, '0');

        // دعم النوعين: ayah و surah
        if (reader.type === 'surah') {
          url = reader.pattern.replace(/\{S\}/g, S);
        } else {
          // ayah type — للسور كاملة، نأخذ أول آية فقط كعينة
          // (لأن السور الكاملة تحتوي على مئات الآيات)
          const A = '001';
          url = reader.pattern.replace(/\{S\}/g, S).replace(/\{A\}/g, A);
        }
        
        if (onProgress) onProgress({ 
          completed, total, current: s, status: 'downloading',
          surahName: quran.surahs[s - 1]?.name || '',
          url: url
        });

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
          size: blob.size,
          surahName: quran.surahs[s - 1]?.name || ''
        });
      } catch (e) {
        failed++;
        failedList.push(s);
        if (onProgress) onProgress({ 
          completed, 
          total, 
          current: s, 
          status: 'failed', 
          error: e.message,
          surahName: quran.surahs[s - 1]?.name || ''
        });
      }
      
      // استراحة قصيرة لتجنب rate limiting
      await new Promise(r => setTimeout(r, 300));
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

function cancelDownload() {
  _downloadCancelled = true;
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
  cancel: cancelDownload,
};
