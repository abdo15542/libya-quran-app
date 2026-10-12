// ============ وحدة الترجمات مع دعم gzip ============

const TRANSLATION_SOURCES = {
  en:  { name: 'English',   flag: '🇬🇧', file: 'trans-en.json.gz' },
  fr:  { name: 'Français',  flag: '🇫🇷', file: 'trans-fr.json.gz' },
  it:  { name: 'Italiano',  flag: '🇮🇹', file: 'trans-it.json.gz' },
  ber: { name: 'ⴰⵎⴰⵣⵉⵖ',    flag: '🇱🇾', file: 'trans-ber.json.gz' },
  es:  { name: 'Español',   flag: '🇪🇸', file: 'trans-es.json.gz' },
  de:  { name: 'Deutsch',   flag: '🇩🇪', file: 'trans-de.json.gz' },
  ru:  { name: 'Русский',   flag: '🇷🇺', file: 'trans-ru.json.gz' },
  tr:  { name: 'Türkçe',    flag: '🇹🇷', file: 'trans-tr.json.gz' },
};

let _transCache = {};

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

async function loadTranslation(lang) {
  if (!TRANSLATION_SOURCES[lang]) throw new Error('لغة غير معروفة: ' + lang);
  if (_transCache[lang]) return _transCache[lang];

  // 1. IndexedDB
  try {
    const cached = await DB.dbGet('translations', lang);
    if (cached && cached.verses && cached.verses.length > 0) {
      _transCache[lang] = cached;
      return cached;
    }
  } catch (e) {
    console.warn('DB read:', e.message);
  }

  // 2. حمّل من الملف
  const url = 'data/' + TRANSLATION_SOURCES[lang].file;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
  const data = await decompressGzip(res);

  if (!data.verses || data.verses.length === 0) {
    throw new Error('ملف الترجمة فارغ');
  }

  // احفظ
  try {
    await DB.dbPut('translations', lang, data);
  } catch (e) {
    console.warn('DB write:', e.message);
  }

  _transCache[lang] = data;
  return data;
}

function getVerseTranslation(data, surahNum, ayahNum) {
  if (!data || !data.verses) return null;
  const entry = data.verses.find(v => 
    (v.chapter === surahNum || v.surah === surahNum) && 
    (v.verse === ayahNum || v.ayah === ayahNum)
  );
  return entry ? (entry.text || '') : null;
}

// ✅ إرجاع كل الترجمات كما هي (بدون فحص HEAD)
async function getAvailableTranslations() {
  return Object.entries(TRANSLATION_SOURCES).map(([lang, info]) => ({
    lang,
    name: info.name,
    flag: info.flag,
    downloaded: true,
  }));
}

window.TranslationModule = {
  sources: TRANSLATION_SOURCES,
  load: loadTranslation,
  getVerse: getVerseTranslation,
  available: getAvailableTranslations,
};
