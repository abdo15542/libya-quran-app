// ============ مسارات الملفات ============
const DATA_PATHS = {
  surahs: 'data/surahs.json',
  quran:  'data/quran.json',
};

let _surahsCache = null;
let _quranCache = null;

// ============ فك ضغط gzip (للتفاسير والترجمات فقط) ============
async function fetchAndDecompress(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);

  if (url.endsWith('.gz')) {
    const buffer = await res.arrayBuffer();

    // pako أولاً (الأكثر توافقاً)
    if (typeof pako !== 'undefined') {
      const text = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
      return JSON.parse(text);
    }

    // DecompressionStream كاحتياطي
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('gzip');
        const blob = new Blob([buffer]);
        const stream = blob.stream().pipeThrough(ds);
        return JSON.parse(await new Response(stream).text());
      } catch (e) {
        console.warn('DecompressionStream فشل:', e.message);
      }
    }

    throw new Error('فك الضغط غير مدعوم');
  }

  return await res.json();
}

// ============ تحميل فهرس السور ============
async function loadSurahsMeta() {
  if (_surahsCache) return _surahsCache;
  try {
    const res = await fetch(DATA_PATHS.surahs);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _surahsCache = await res.json();
    console.log('✓ فهرس السور:', _surahsCache.length);
  } catch (e) {
    console.warn('فهرس السور:', e.message);
    _surahsCache = [];
  }
  return _surahsCache;
}

// ============ تحميل المصحف الكامل ============
async function loadFullQuran(onProgress = () => {}) {
  if (_quranCache) return _quranCache;

  // 1. IndexedDB
  try {
    const cached = await DB.dbGet('quran', 'text');
    if (cached && cached.surahs && cached.surahs.length >= 100) {
      _quranCache = cached;
      onProgress(1);
      console.log('✓ تحميل من IndexedDB');
      return cached;
    }
  } catch (e) {
    console.warn('IndexedDB:', e.message);
  }

  // 2. الملف المحلي غير المضغوط
  try {
    onProgress(0.1);
    const res = await fetch(DATA_PATHS.quran);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    onProgress(0.5);
    const raw = await res.json();
    const normalized = normalizeQuran(raw);
    console.log('✓ عدد السور:', normalized.surahs.length);
    if (normalized.surahs.length >= 100) {
      await DB.dbPut('quran', 'text', normalized).catch(() => {});
      _quranCache = normalized;
      onProgress(1);
      return normalized;
    }
    console.warn('بنية غير متوقعة:', normalized.surahs.length);
  } catch (e) {
    console.warn('التحميل المحلي فشل:', e.message);
  }

  // 3. احتياطي
  const builtin = buildBuiltinQuran(await loadSurahsMeta());
  _quranCache = builtin;
  onProgress(1);
  return builtin;
}

// ============ توحيد البنية ============
function normalizeQuran(raw) {
  const surahArray = extractSurahArray(raw);
  return { surahs: surahArray };
}

function extractSurahArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return normalizeSurahList(raw);

  if (raw.data) {
    if (Array.isArray(raw.data)) return normalizeSurahList(raw.data);
    if (raw.data.surahs && Array.isArray(raw.data.surahs)) return normalizeSurahList(raw.data.surahs);
    const keys = Object.keys(raw.data).filter(k => /^\d+$/.test(k));
    if (keys.length >= 100) {
      keys.sort((a, b) => +a - +b);
      return keys.map(k => normalizeSurah(raw.data[k], parseInt(k, 10)));
    }
    if (raw.data.quran) return extractSurahArray(raw.data.quran);
    if (raw.data.mushaf) return extractSurahArray(raw.data.mushaf);
  }

  if (raw.surahs && Array.isArray(raw.surahs)) return normalizeSurahList(raw.surahs);

  const rootKeys = Object.keys(raw).filter(k => /^\d+$/.test(k));
  if (rootKeys.length >= 100) {
    rootKeys.sort((a, b) => +a - +b);
    return rootKeys.map(k => normalizeSurah(raw[k], parseInt(k, 10)));
  }

  return [];
}

function normalizeSurahList(list) {
  return list.map((s, i) => normalizeSurah(s, i + 1));
}

function normalizeSurah(s, defaultNum) {
  if (!s) return emptySurah(defaultNum);

  const verseList = s.verses || s.ayahs || s.ayat || s.versets || [];

  let name = s.name || s.title || s.sura_name || s.arabic_name || s.surahName || ('سورة ' + defaultNum);
  name = String(name).replace(/^سورة\s+/, '').trim();
  if (!name) name = 'سورة ' + defaultNum;

  return {
    number: s.number || s.n || s.id || s.sura || defaultNum,
    name:   name,
    verses: (verseList || []).map((v, j) => normalizeVerse(v, j + 1)),
  };
}

function normalizeVerse(v, defaultNum) {
  if (v == null) return { number: defaultNum, text: '' };
  if (typeof v === 'string') return { number: defaultNum, text: v };
  return {
    number: v.number || v.n || v.id || v.ayah || v.verse_number || defaultNum,
    text:   v.text || v.arab || v.arabic || v.arabic_text || v.content || '',
  };
}

function emptySurah(num) {
  return { number: num, name: 'سورة ' + num, verses: [] };
}

function buildBuiltinQuran(surahsMeta) {
  return { surahs: (surahsMeta || []).map(s => ({
    number: s.n,
    name: s.name,
    verses: Array.from({ length: s.verses || 0 }, (_, i) => ({
      number: i + 1,
      text: '[النص غير متوفر]',
    })),
  }))};
}

window.DataLoader = {
  loadSurahsMeta,
  loadFullQuran,
  normalizeQuran,
  buildBuiltinQuran,
  fetchAndDecompress,
};
