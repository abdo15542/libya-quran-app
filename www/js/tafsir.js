// ============ وحدة التفاسير ============

const TAFSIR_SOURCES = {
  muyassar:     { id: 'muyassar',     name: 'التفسير الميسر', file: 'tafsir-muyassar.txt.gz' },
  'ibn-kathir': { id: 'ibn-kathir',   name: 'تفسير ابن كثير', file: 'tafsir-ibn-kathir.txt.gz' },
  jalalayn:     { id: 'jalalayn',     name: 'تفسير الجلالين', file: 'tafsir-jalalayn.txt.gz' },
  saadi:        { id: 'saadi',        name: 'تفسير السعدي',   file: 'tafsir-saadi.txt.gz' },
  tabari:       { id: 'tabari',       name: 'تفسير الطبري',   file: 'tafsir-tabari.txt.gz' },
  qurtubi:      { id: 'qurtubi',      name: 'تفسير القرطبي',  file: 'tafsir-qurtubi.txt.gz' },
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

  // 2. حمّل الملف
  const url = 'data/' + TAFSIR_SOURCES[tafsirId].file;
  console.log('📖 تحميل:', url);
  const res = await fetch(url);
  console.log('استجابة:', res.status);
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const data = await decompressGzip(res);
  if (!data.surahs || data.surahs.length === 0) {
    throw new Error('الملف فارغ');
  }

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
