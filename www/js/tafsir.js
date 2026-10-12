// ============ وحدة التفاسير مع دعم gzip ============

const TAFSIR_SOURCES = {
  muyassar:     { id: 'muyassar',     name: 'التفسير الميسر', file: 'tafsir-muyassar.json.gz' },
  'ibn-kathir': { id: 'ibn-kathir',   name: 'تفسير ابن كثير', file: 'tafsir-ibn-kathir.json.gz' },
  jalalayn:     { id: 'jalalayn',     name: 'تفسير الجلالين', file: 'tafsir-jalalayn.json.gz' },
  saadi:        { id: 'saadi',        name: 'تفسير السعدي',   file: 'tafsir-saadi.json.gz' },
  tabari:       { id: 'tabari',       name: 'تفسير الطبري',   file: 'tafsir-tabari.json.gz' },
  qurtubi:      { id: 'qurtubi',      name: 'تفسير القرطبي',  file: 'tafsir-qurtubi.json.gz' },
};

let _cache = {};

async function decompressGzip(response) {
  const buffer = await response.arrayBuffer();
  if (typeof pako !== 'undefined') {
    const text = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
    return JSON.parse(text);
  }
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const blob = new Blob([buffer]);
    const stream = blob.stream().pipeThrough(ds);
    return JSON.parse(await new Response(stream).text());
  }
  throw new Error('فك الضغط غير مدعوم');
}

async function loadTafsir(tafsirId) {
  if (!TAFSIR_SOURCES[tafsirId]) throw new Error('تفسير غير معروف: ' + tafsirId);
  if (_cache[tafsirId]) return _cache[tafsirId];

  // 1. جرّب IndexedDB
  try {
    const cached = await DB.dbGet('tafsir', tafsirId);
    if (cached && cached.surahs && cached.surahs.length > 0) {
      _cache[tafsirId] = cached;
      return cached;
    }
  } catch (e) {
    console.warn('DB read:', e.message);
  }

  // 2. حمّل من الملف
  const url = 'data/' + TAFSIR_SOURCES[tafsirId].file;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
  const data = await decompressGzip(res);

  if (!data.surahs || data.surahs.length === 0) {
    throw new Error('ملف التفسير فارغ');
  }

  // احفظ في IndexedDB
  try {
    await DB.dbPut('tafsir', tafsirId, data);
  } catch (e) {
    console.warn('DB write:', e.message);
  }

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

// ✅ إرجاع كل التفاسير كما هي (بدون فحص HEAD الذي لا يعمل في WebView)
async function getAvailableTafsirs() {
  return Object.entries(TAFSIR_SOURCES).map(([id, info]) => ({
    id,
    name: info.name,
    downloaded: true,   // ← نجرب تحميل الكل، والفشل سيظهر عند المحاولة
  }));
}

window.TafsirModule = {
  sources: TAFSIR_SOURCES,
  load: loadTafsir,
  getVerse: getVerseTafsir,
  available: getAvailableTafsirs,
};
