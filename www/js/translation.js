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
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = response.body.pipeThrough(ds);
    const text = await new Response(decompressedStream).text();
    return JSON.parse(text);
  }
  if (typeof pako !== 'undefined') {
    const buffer = await response.arrayBuffer();
    const inflated = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
    return JSON.parse(inflated);
  }
  throw new Error('فك الضغط غير مدعوم');
}

async function loadTranslation(lang) {
  if (!TRANSLATION_SOURCES[lang]) throw new Error('لغة غير معروفة: ' + lang);
  if (_transCache[lang]) return _transCache[lang];

  // 1. IndexedDB
  const cached = await DB.dbGet('translations', lang);
  if (cached && cached.verses && cached.verses.length > 0) {
    _transCache[lang] = cached;
    return cached;
  }

  // 2. من ملف gzip محلي
  try {
    const url = 'data/' + TRANSLATION_SOURCES[lang].file;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await decompressGzip(res);
    await DB.dbPut('translations', lang, data);
    _transCache[lang] = data;
    return data;
  } catch (e) {
    console.warn('فشل تحميل الترجمة:', e.message);
    throw new Error('لم يتم العثور على الترجمة: ' + lang);
  }
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
  const available = [];
  for (const [lang, info] of Object.entries(TRANSLATION_SOURCES)) {
    const cached = await DB.dbGet('translations', lang);
    let hasFile = false;

    if (cached && cached.verses && cached.verses.length > 0) {
      hasFile = true;
    } else {
      try {
        const res = await fetch('data/' + info.file, { method: 'HEAD' });
        hasFile = res.ok;
      } catch (e) {
        hasFile = false;
      }
    }

    available.push({ 
      lang, name: info.name, flag: info.flag, downloaded: hasFile 
    });
  }
  return available;
}

window.TranslationModule = {
  sources: TRANSLATION_SOURCES,
  load: loadTranslation,
  getVerse: getVerseTranslation,
  available: getAvailableTranslations,
};
