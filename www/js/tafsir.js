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
let _currentId = null;

// فك ضغط gzip في المتصفح
async function decompressGzip(response) {
  // الطريقة 1: DecompressionStream (المتصفحات الحديثة)
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = response.body.pipeThrough(ds);
    const text = await new Response(decompressedStream).text();
    return JSON.parse(text);
  }

  // الطريقة 2: fallback — pako (إذا كان محمّلاً)
  if (typeof pako !== 'undefined') {
    const buffer = await response.arrayBuffer();
    const inflated = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
    return JSON.parse(inflated);
  }

  throw new Error('فك الضغط غير مدعوم في هذا المتصفح');
}

async function loadTafsir(tafsirId) {
  if (!TAFSIR_SOURCES[tafsirId]) throw new Error('تفسير غير معروف: ' + tafsirId);
  if (_cache[tafsirId]) return _cache[tafsirId];

  // 1. IndexedDB
  const cached = await DB.dbGet('tafsir', tafsirId);
  if (cached && cached.surahs && cached.surahs.length > 0) {
    _cache[tafsirId] = cached;
    _currentId = tafsirId;
    return cached;
  }

  // 2. من ملف gzip المحلي
  try {
    const url = 'data/' + TAFSIR_SOURCES[tafsirId].file;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await decompressGzip(res);
    await DB.dbPut('tafsir', tafsirId, data);
    _cache[tafsirId] = data;
    _currentId = tafsirId;
    return data;
  } catch (e) {
    console.warn('فشل تحميل التفسير:', e.message);
    throw new Error('لم يتم العثور على التفسير: ' + tafsirId);
  }
}

function getVerseTafsir(tafsirData, surahNum, ayahNum) {
  if (!tafsirData || !tafsirData.surahs) return null;
  const surah = tafsirData.surahs.find(s => s.number === surahNum);
  if (!surah || !surah.verses) return null;

  const entry = surah.verses.find(v => (v.ayah || v.number) === ayahNum);
  return entry ? (entry.text || entry.tafsir || '') : null;
}

async function getAvailableTafsirs() {
  const available = [];
  for (const [id, info] of Object.entries(TAFSIR_SOURCES)) {
    // تحقق من IndexedDB أولاً
    const cached = await DB.dbGet('tafsir', id);
    let available_flag = false;

    if (cached && cached.surahs && cached.surahs.length > 0) {
      available_flag = true;
    } else {
      // تحقق من وجود الملف
      try {
        const res = await fetch('data/' + info.file, { method: 'HEAD' });
        available_flag = res.ok;
      } catch (e) {
        available_flag = false;
      }
    }

    available.push({ id, name: info.name, downloaded: available_flag });
  }
  return available;
}

window.TafsirModule = {
  sources: TAFSIR_SOURCES,
  load: loadTafsir,
  getVerse: getVerseTafsir,
  available: getAvailableTafsirs,
};
