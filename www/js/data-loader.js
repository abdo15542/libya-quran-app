// تحميل بيانات المصحف من الملفات المحلية أو من الإنترنت
const DATA_PATHS = {
  surahs: 'data/surahs.json',
  quran:  'data/quran.json',
};

let _surahsCache = null;

async function loadSurahsMeta() {
  if (_surahsCache) return _surahsCache;
  try {
    const res = await fetch(DATA_PATHS.surahs);
    _surahsCache = await res.json();
  } catch (e) {
    _surahsCache = [];
  }
  return _surahsCache;
}

async function loadFullQuran(onProgress = () => {}) {
  // 1. جرّب IndexedDB أولاً
  const cached = await DB.dbGet('quran', 'text');
  if (cached && cached.surahs && cached.surahs.length > 10) return cached;

  // 2. حمّل من الملف المحلي
  try {
    const res = await fetch(DATA_PATHS.quran);
    if (res.ok) {
      const raw = await res.json();
      const normalized = normalizeQuran(raw);
      await DB.dbPut('quran', 'text', normalized);
      return normalized;
    }
  } catch (e) {
    console.warn('لم يوجد ملف quran.json محلي:', e.message);
  }

  // 3. جرّب التحميل من الإنترنت (مرة واحدة)
  try {
    const url = 'https://cdn.jsdelivr.net/gh/bwail/riwayat-quran-json@master/qaloon/quran.json';
    const res = await fetch(url);
    if (res.ok) {
      const raw = await res.json();
      const normalized = normalizeQuran(raw);
      await DB.dbPut('quran', 'text', normalized);
      return normalized;
    }
  } catch (e) {
    console.warn('فشل التحميل من الإنترنت:', e.message);
  }

  // 4. احتياطي: النص المدمج
  const builtin = buildBuiltinQuran(await loadSurahsMeta());
  await DB.dbPut('quran', 'text', builtin);
  return builtin;
}

// توحيد بنية البيانات من مصادر مختلفة
function normalizeQuran(raw) {
  // الحالة 1: { surahs: [...] } جاهزة
  if (raw.surahs && Array.isArray(raw.surahs)) {
    return { surahs: raw.surahs.map((s, i) => ({
      number: s.number || i + 1,
      name: s.name || s.title || ('سورة ' + (i + 1)),
      verses: (s.verses || s.ayahs || []).map((v, j) => ({
        number: v.number || v.id || j + 1,
        text: v.text || v.arab || '',
      })),
    }))};
  }

  // الحالة 2: مصفوفة مباشرة
  if (Array.isArray(raw)) {
    return { surahs: raw.map((s, i) => ({
      number: i + 1,
      name: s.name || s.title || ('سورة ' + (i + 1)),
      verses: (s.verses || s.ayahs || []).map((v, j) => ({
        number: v.number || j + 1,
        text: typeof v === 'string' ? v : (v.text || ''),
      })),
    }))};
  }

  // الحالة 3: كائن مفاتيحه أرقام السور
  if (typeof raw === 'object') {
    const keys = Object.keys(raw).filter(k => /^\d+$/.test(k));
    if (keys.length) {
      return { surahs: keys.map(k => {
        const s = raw[k];
        return {
          number: parseInt(k, 10),
          name: s.name || s.title || ('سورة ' + k),
          verses: (s.verses || s.ayahs || []).map((v, j) => ({
            number: v.number || j + 1,
            text: typeof v === 'string' ? v : (v.text || ''),
          })),
        };
      })};
    }
  }

  return { surahs: [] };
}

// بناء مصحف احتياطي من بيانات السور (نصوص فارغة، فقط للعرض)
function buildBuiltinQuran(surahsMeta) {
  return { surahs: (surahsMeta || []).map(s => ({
    number: s.n,
    name: s.name,
    verses: Array.from({ length: s.verses }, (_, i) => ({
      number: i + 1,
      text: '[النص غير متوفر — أعد بناء التطبيق بعد تشغيل سكربت التنزيل]',
    })),
  }))};
}

// تحميل النص المدمج القديم (للسور الثلاث) عند الحاجة
const BUILTIN_QURAN_FALLBACK = {
  surahs: [
    { number: 1, name: 'الفاتحة', verses: [
      { number: 1, text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' },
      { number: 2, text: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ' },
      { number: 3, text: 'الرَّحْمَٰنِ الرَّحِيمِ' },
      { number: 4, text: 'مَالِكِ يَوْمِ الدِّينِ' },
      { number: 5, text: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ' },
      { number: 6, text: 'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ' },
      { number: 7, text: 'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ' },
    ]},
  ],
};

window.DataLoader = {
  loadSurahsMeta,
  loadFullQuran,
  normalizeQuran,
  buildBuiltinQuran,
  BUILTIN_QURAN_FALLBACK,
};
