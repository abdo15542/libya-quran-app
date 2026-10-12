// ============ وحدة التفاسير — تحميل عبر <script> ============

const TAFSIR_SOURCES = {
  muyassar:     { id: 'muyassar',     name: 'التفسير الميسر', script: 'tafsir-muyassar' },
  'ibn-kathir': { id: 'ibn-kathir',   name: 'تفسير ابن كثير', script: 'tafsir-ibn-kathir' },
  jalalayn:     { id: 'jalalayn',     name: 'تفسير الجلالين', script: 'tafsir-jalalayn' },
  saadi:        { id: 'saadi',        name: 'تفسير السعدي',   script: 'tafsir-saadi' },
  tabari:       { id: 'tabari',       name: 'تفسير الطبري',   script: 'tafsir-tabari' },
  qurtubi:      { id: 'qurtubi',      name: 'تفسير القرطبي',  script: 'tafsir-qurtubi' },
};

let _cache = {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-qd="' + src + '"]')) {
      return resolve();
    }
    const s = document.createElement('script');
    s.src = src;
    s.setAttribute('data-qd', src);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('فشل تحميل: ' + src));
    document.head.appendChild(s);
  });
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function loadTafsir(tafsirId) {
  if (!TAFSIR_SOURCES[tafsirId]) throw new Error('تفسير غير معروف');
  if (_cache[tafsirId]) return _cache[tafsirId];

  // 1. IndexedDB
  try {
    const cached = await DB.dbGet('tafsir', tafsirId);
    if (cached && cached.surahs && cached.surahs.length > 0) {
      _cache[tafsirId] = cached;
      return cached;
    }
  } catch (e) { /* تجاهل */ }

  // 2. حمّل السكربت
  const baseName = TAFSIR_SOURCES[tafsirId].script;
  const scriptPath = 'data/' + baseName + '.js';

  if (!window.QURAN_DATA || !window.QURAN_DATA[baseName]) {
    await loadScript(scriptPath);
  }

  const b64 = window.QURAN_DATA && window.QURAN_DATA[baseName];
  if (!b64) throw new Error('البيانات مفقودة: ' + baseName);

  // فك الترميز والضغط
  const gzBytes = base64ToUint8(b64);
  let jsonStr;
  if (typeof pako !== 'undefined') {
    jsonStr = pako.ungzip(gzBytes, { to: 'string' });
  } else if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const blob = new Blob([gzBytes]);
    const stream = blob.stream().pipeThrough(ds);
    jsonStr = await new Response(stream).text();
  } else {
    throw new Error('فك الضغط غير مدعوم');
  }

  const data = JSON.parse(jsonStr);
  if (!data.surahs || !data.surahs.length) throw new Error('الملف فارغ');

  // حرّر الذاكرة
  try { delete window.QURAN_DATA[baseName]; } catch (e) {}

  // احفظ في IndexedDB
  try { await DB.dbPut('tafsir', tafsirId, data); } catch (e) { /* تجاهل */ }
  _cache[tafsirId] = data;
  return data;
}

function getVerseTafsir(tafsirData, surahNum, ayahNum) {
  if (!tafsirData || !tafsirData.surahs) return null;
  const surah = tafsirData.surahs.find(s => s.number === surahNum);
  if (!surah || !surah.verses) return null;
  const entry = surah.verses.find(v => (v.ayah || v.number) === ayahNum);
  return entry ? (entry.text || entry.tafsir || '') : null;
}

async function getAvailableTafsirs() {
  return Object.entries(TAFSIR_SOURCES).map(([id, info]) => ({
    id, name: info.name, downloaded: true,
  }));
}

window.TafsirModule = {
  sources: TAFSIR_SOURCES,
  load: loadTafsir,
  getVerse: getVerseTafsir,
  available: getAvailableTafsirs,
};
