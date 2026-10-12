// ============ وحدة الترجمات — تحميل عبر <script> ============

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

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-qd="' + src + '"]')) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.setAttribute('data-qd', src);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('فشل تحميل: ' + src));
    document.head.appendChild(s);
  });
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
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
  } catch (e) { /* تجاهل */ }

  const baseName = TRANSLATION_SOURCES[lang].script;
  const scriptPath = 'data/' + baseName + '.js';

  if (!window.QURAN_DATA || !window.QURAN_DATA[baseName]) {
    await loadScript(scriptPath);
  }

  const b64 = window.QURAN_DATA && window.QURAN_DATA[baseName];
  if (!b64) throw new Error('البيانات مفقودة: ' + baseName);

  const gzBytes = base64ToUint8(b64);
  let jsonStr;
  if (typeof pako !== 'undefined') {
    jsonStr = pako.ungzip(gzBytes, { to: 'string' });
  } else {
    throw new Error('pako مطلوب');
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
