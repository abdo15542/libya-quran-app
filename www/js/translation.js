// ============ وحدة الترجمات — مع تحميل ديناميكي ============

const TRANSLATION_SOURCES = {
  en:  { name: 'English',   flag: '🇬🇧', script: 'trans-en', bundled: true },
  fr:  { name: 'Français',  flag: '🇫🇷', script: 'trans-fr', bundled: false },
  it:  { name: 'Italiano',  flag: '🇮🇹', script: 'trans-it', bundled: false },
  ber: { name: 'ⴰⵎⴰⵣⵉⵖ',    flag: '🇱🇾', script: 'trans-ber', bundled: false },
  es:  { name: 'Español',   flag: '🇪🇸', script: 'trans-es', bundled: false },
  de:  { name: 'Deutsch',   flag: '🇩🇪', script: 'trans-de', bundled: false },
  ru:  { name: 'Русский',   flag: '🇷🇺', script: 'trans-ru', bundled: false },
  tr:  { name: 'Türkçe',    flag: '🇹🇷', script: 'trans-tr', bundled: false },
};

let _transCache = {};
const _tScriptState = {};

function tLoadScript(src) {
  return new Promise((resolve, reject) => {
    if (_tScriptState[src] === 'ok') return resolve();
    if (_tScriptState[src] === 'error') return reject(new Error('فشل سابق'));
    _tScriptState[src] = 'pending';
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { _tScriptState[src] = 'ok'; resolve(); };
    s.onerror = () => {
      _tScriptState[src] = 'error';
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('فشل تحميل: ' + src));
    };
    document.head.appendChild(s);
  });
}

function tBase64ToUint8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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
  } catch (e) {}

  const info = TRANSLATION_SOURCES[lang];
  const baseName = info.script;

  if (info.bundled) {
    if (!window.QURAN_DATA || !window.QURAN_DATA[baseName]) {
      await tLoadScript('data/' + baseName + '.js');
    }
  } else {
    if (!window.QURAN_DATA || !window.QURAN_DATA[baseName]) {
      throw new Error('هذه الترجمة تحتاج إلى تحميل حزمة البيانات الإضافية أولاً. اضغط على "تحميل التفاسير الإضافية" في الإعدادات.');
    }
  }

  const b64 = window.QURAN_DATA && window.QURAN_DATA[baseName];
  if (!b64) throw new Error('البيانات مفقودة: ' + baseName);

  const gzBytes = tBase64ToUint8(b64);
  let jsonStr;
  if (typeof pako !== 'undefined') {
    jsonStr = pako.ungzip(gzBytes, { to: 'string' });
  } else {
    throw new Error('pako غير محمّل');
  }

  const data = JSON.parse(jsonStr);
  if (!data.verses || !data.verses.length) throw new Error('الملف فارغ');

  try { delete window.QURAN_DATA[baseName]; } catch (e) {}
  try { await DB.dbPut('translations', lang, data); } catch (e) {}
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
    lang, name: info.name, flag: info.flag, bundled: info.bundled, downloaded: true,
  }));
}

window.TranslationModule = {
  sources: TRANSLATION_SOURCES,
  load: loadTranslation,
  getVerse: getVerseTranslation,
  available: getAvailableTranslations,
};
