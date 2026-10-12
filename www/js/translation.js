// ============ وحدة الترجمات — مع إصلاح loadScript ============

const TRANSLATION_SOURCES = {
  en:  { name: 'English',   flag: '🇬🇧', script: 'trans-en' },
  fr:  { name: 'Français',  flag: '🇫🇷', script: 'trans-fr' },
  it:  { name: 'Italiano',  flag: '🇮🇹', script: 'trans-it' },
  ber: { name: 'ⴰⵎⴰⵣⵉⵖ',    flag: '🇱🇾', script: 'trans-ber' },
  es:  { name: 'Español',   flag: '🇪🇸', script: 'trans-es' },
  de:  { name: 'Deutsch',   flag: '🇩🇪', script: 'trans-de' },
  ru:  { name: 'Русский',   flag: '🇷🇺', script: 'trans-ru' },
  tr:  { name: 'Türkçe',    flag: '🇹🇷', script: 'trans-tr' },
};

let _transCache = {};
const _tScriptState = {};

function tLoadScript(src) {
  return new Promise((resolve, reject) => {
    if (_tScriptState[src] === 'ok') return resolve();
    if (_tScriptState[src] === 'pending') {
      const t = setInterval(() => {
        if (_tScriptState[src] === 'ok') { clearInterval(t); resolve(); }
        else if (_tScriptState[src] === 'error') { clearInterval(t); reject(new Error('فشل سابق')); }
      }, 100);
      setTimeout(() => { clearInterval(t); reject(new Error('مهلة')); }, 30000);
      return;
    }
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

  const baseName = TRANSLATION_SOURCES[lang].script;
  const scriptPath = 'data/' + baseName + '.js';

  if (!window.QURAN_DATA || !window.QURAN_DATA[baseName]) {
    console.log('🌐 تحميل سكربت:', scriptPath);
    await tLoadScript(scriptPath);
    console.log('✓ تم تحميل السكربت');
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
    lang, name: info.name, flag: info.flag, downloaded: true,
  }));
}

window.TranslationModule = {
  sources: TRANSLATION_SOURCES,
  load: loadTranslation,
  getVerse: getVerseTranslation,
  available: getAvailableTranslations,
};
