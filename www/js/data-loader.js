// ============ مسارات الملفات ============
const DATA_PATHS = {
  surahs: 'data/surahs.json',
  quran:  'data/quran.json',
};

let _surahsCache = null;
let _quranCache = null;

// ============ تحميل فهرس السور ============
async function loadSurahsMeta() {
  if (_surahsCache) return _surahsCache;
  try {
    const res = await fetch(DATA_PATHS.surahs);
    _surahsCache = await res.json();
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
  const cached = await DB.dbGet('quran', 'text');
  if (cached && cached.surahs && cached.surahs.length >= 100) {
    _quranCache = cached;
    onProgress(1);
    return cached;
  }

  // 2. الملف المحلي
  try {
    onProgress(0.1);
    const res = await fetch(DATA_PATHS.quran);
    if (res.ok) {
      onProgress(0.5);
      const raw = await res.json();
      const normalized = normalizeQuran(raw);
      if (normalized.surahs.length >= 100) {
        await DB.dbPut('quran', 'text', normalized);
        _quranCache = normalized;
        onProgress(1);
        return normalized;
      } else {
        console.warn('بنية غير متوقعة — عدد السور:', normalized.surahs.length);
      }
    }
  } catch (e) {
    console.warn('التحميل المحلي فشل:', e.message);
  }

  // 3. احتياطي
  const builtin = buildBuiltinQuran(await loadSurahsMeta());
  _quranCache = builtin;
  return builtin;
}

// ============ توحيد البنية (يعمل مع جميع المصادر) ============
function normalizeQuran(raw) {
  console.log('normalizeQuran: تحليل البنية...');

  // استخرج المصفوفة الأساسية من أي بنية
  const surahArray = extractSurahArray(raw);
  console.log('normalizeQuran: عدد السور المكتشفة:', surahArray.length);

  return { surahs: surahArray };
}

function extractSurahArray(raw) {
  if (!raw) return [];

  // الحالة 1: مصفوفة مباشرة
  if (Array.isArray(raw)) {
    return normalizeSurahList(raw);
  }

  // الحالة 2: Quranpedia أو مشابه — { data: ... }
  if (raw.data) {
    // 2أ: data مصفوفة
    if (Array.isArray(raw.data)) {
      return normalizeSurahList(raw.data);
    }
    // 2ب: data.surahs
    if (raw.data.surahs && Array.isArray(raw.data.surahs)) {
      return normalizeSurahList(raw.data.surahs);
    }
    // 2ج: data كائن بمفاتيح رقمية (1..114)
    const keys = Object.keys(raw.data).filter(k => /^\d+$/.test(k));
    if (keys.length >= 100) {
      keys.sort((a, b) => +a - +b);
      return keys.map(k => normalizeSurah(raw.data[k], parseInt(k, 10)));
    }
    // 2د: data.quran أو data.mushaf
    if (raw.data.quran) return extractSurahArray(raw.data.quran);
    if (raw.data.mushaf) return extractSurahArray(raw.data.mushaf);
  }

  // الحالة 3: { surahs: [...] }
  if (raw.surahs && Array.isArray(raw.surahs)) {
    return normalizeSurahList(raw.surahs);
  }

  // الحالة 4: مفاتيح رقمية في الجذر
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

  // ابحث عن قائمة الآيات في أي حقل محتمل
  const verseList = s.verses || s.ayahs || s.ayat || s.versets || [];

  let name = s.name || s.title || s.sura_name || s.arabic_name || s.surahName || ('سورة ' + defaultNum);
  // إزالة بادئة "سورة " إن وُجدت لتجنب التكرار
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

// ============ بناء مصحف احتياطي ============
function buildBuiltinQuran(surahsMeta) {
  return { surahs: (surahsMeta || []).map(s => ({
    number: s.n,
    name: s.name,
    verses: Array.from({ length: s.verses }, (_, i) => ({
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
};
