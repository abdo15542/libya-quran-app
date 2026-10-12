const DATA_SOURCES = {
  quran: 'https://raw.githubusercontent.com/rn0x/quran-data/main/quran.json',
};

const BUILTIN_QURAN = {
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
    { number: 2, name: 'البقرة', verses: [
      { number: 1, text: 'الم' },
      { number: 2, text: 'ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ' },
      { number: 3, text: 'الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ وَيُقِيمُونَ الصَّلَاةَ وَمِمَّا رَزَقْنَاهُمْ يُنفِقُونَ' },
    ]},
    { number: 112, name: 'الإخلاص', verses: [
      { number: 1, text: 'قُلْ هُوَ اللَّهُ أَحَدٌ' },
      { number: 2, text: 'اللَّهُ الصَّمَدُ' },
      { number: 3, text: 'لَمْ يَلِدْ وَلَمْ يُولَدْ' },
      { number: 4, text: 'وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ' },
    ]},
  ],
};

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }
  return JSON.parse(await new Blob(chunks).text());
}

async function loadQuranData(onProgress = () => {}) {
  const cached = await DB.dbGet('quran', 'text');
  if (cached) return cached;
  try {
    const data = await fetchWithProgress(DATA_SOURCES.quran, onProgress);
    await DB.dbPut('quran', 'text', data);
    return data;
  } catch (e) {
    console.warn('تعذّر التحميل من الإنترنت، استخدام البيانات المدمجة:', e.message);
    return null;
  }
}

async function ensureData(progressCb) {
  let data = await loadQuranData(progressCb);
  if (!data || !data.surahs || data.surahs.length === 0) {
    data = BUILTIN_QURAN;
    await DB.dbPut('quran', 'text', data);
  }
  return data;
}

window.DataLoader = { ensureData, loadQuranData, BUILTIN_QURAN };
