// ============ وحدة الترجمات ============

const TRANSLATION_SOURCES = {
  en:  { name: 'English',   flag: '🇬🇧', file: 'trans-en.txt.gz' },
  fr:  { name: 'Français',  flag: '🇫🇷', file: 'trans-fr.txt.gz' },
  it:  { name: 'Italiano',  flag: '🇮🇹', file: 'trans-it.txt.gz' },
  ber: { name: 'ⴰⵎⴰⵣⵉⵖ',    flag: '🇱🇾', file: 'trans-ber.txt.gz' },
  es:  { name: 'Español',   flag: '🇪🇸', file: 'trans-es.txt.gz' },
  de:  { name: 'Deutsch',   flag: '🇩🇪', file: 'trans-de.txt.gz' },
  ru:  { name: 'Русский',   flag: '🇷🇺', file: 'trans-ru.txt.gz' },
  tr:  { name: 'Türkçe',    flag: '🇹🇷', file: 'trans-tr.txt.gz' },
};

let _transCache = {};

async function decompressGzip(response) {
  const buffer = await response.arrayBuffer();
  if (typeof pako !== 'undefined') {
    return JSON.parse(pako.ungzip(new Uint8Array(buffer), { to: 'string' }));
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
  if (!TRANSLATION_SOURCES[lang]) throw new Error('لغة غير معروفة');
  if (_transCache[lang]) return _transCache[lang];

  try {
    const cached = await DB.dbGet('translations', lang);
    if (cached && cached.verses && cached.verses.length > 0) {
      _transCache[lang] = cached;
      return cached;
    }
  } catch (e) { /* تجاهل */ }

  const url = 'data/' + TRANSLATION_SOURCES[lang].file;
  console.log('🌐 تحميل:', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const data = await decompressGzip(res);
  if (!data.verses || data.verses.length === 0) throw new Error('الملف فارغ');

  try { await DB.dbPut('translations', lang, data); } catch (e) { /* تجاهل */ }
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

async function getAvailableTranslations() {
  return Object.entries(TRANSLATION_SOURCES).map(([lang, info]) => ({
    lang, name: info.name, flag: info.flag, downloaded: true,
  }));
}

window.TranslationModule = {
  sources: TRANSLATION_SOURCES,
  load: loadTranslation,
  getVerse: getVerseTranslation,
  available: getAvailableTranslations,
};
