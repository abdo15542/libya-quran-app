// ============ وحدة التفاسير — مع تحميل ديناميكي ============

const TAFSIR_SOURCES = {
  muyassar:     { id: 'muyassar',     name: 'التفسير الميسر', script: 'tafsir-muyassar', bundled: true },
  'ibn-kathir': { id: 'ibn-kathir',   name: 'تفسير ابن كثير', script: 'tafsir-ibn-kathir', bundled: false },
  jalalayn:     { id: 'jalalayn',     name: 'تفسير الجلالين', script: 'tafsir-jalalayn', bundled: false },
  saadi:        { id: 'saadi',        name: 'تفسير السعدي',   script: 'tafsir-saadi', bundled: false },
  tabari:       { id: 'tabari',       name: 'تفسير الطبري',   script: 'tafsir-tabari', bundled: false },
  qurtubi:      { id: 'qurtubi',      name: 'تفسير القرطبي',  script: 'tafsir-qurtubi', bundled: false },
};

// رابط التنزيل من GitHub Releases (استبدله برابطك الفعلي)
const REMOTE_DATA_URL = 'https://github.com/abdo15542/libya-quran-app/releases/download/data-v1/extra-data.zip';

let _cache = {};
const _scriptState = {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (_scriptState[src] === 'ok') return resolve();
    if (_scriptState[src] === 'error') return reject(new Error('فشل سابق: ' + src));
    _scriptState[src] = 'pending';
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { _scriptState[src] = 'ok'; resolve(); };
    s.onerror = () => {
      _scriptState[src] = 'error';
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('فشل تحميل: ' + src));
    };
    document.head.appendChild(s);
  });
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function loadTafsir(tafsirId) {
  if (!TAFSIR_SOURCES[tafsirId]) throw new Error('تفسير غير معروف');
  if (_cache[tafsirId]) return _cache[tafsirId];

  // 1. IndexedDB
  try {
    const cached = await DB.dbGet('tafsir', tafsirId);
    if (cached && cached.surahs && cached.surahs.length > 0) {
      _cache[tafsirId] = cached;
      return cached;
    }
  } catch (e) {}

  const info = TAFSIR_SOURCES[tafsirId];
  const baseName = info.script;

  // 2. إذا كان مضمّناً — حمّله من www/data
  if (info.bundled) {
    if (!window.QURAN_DATA || !window.QURAN_DATA[baseName]) {
      await loadScript('data/' + baseName + '.js');
    }
  } else {
    // 3. إذا لم يكن مضمّناً — تحقق من وجوده في المساحة المحلية
    // (بعد تحميل الحزمة الإضافية)
    if (!window.QURAN_DATA || !window.QURAN_DATA[baseName]) {
      throw new Error('هذا التفسير يحتاج إلى تحميل حزمة البيانات الإضافية أولاً. اضغط على "تحميل التفاسير الإضافية" في الإعدادات.');
    }
  }

  const b64 = window.QURAN_DATA && window.QURAN_DATA[baseName];
  if (!b64) throw new Error('البيانات مفقودة: ' + baseName);

  const gzBytes = base64ToUint8(b64);
  let jsonStr;
  if (typeof pako !== 'undefined') {
    jsonStr = pako.ungzip(gzBytes, { to: 'string' });
  } else {
    throw new Error('pako غير محمّل');
  }

  const data = JSON.parse(jsonStr);
  if (!data.surahs || !data.surahs.length) throw new Error('الملف فارغ');

  try { delete window.QURAN_DATA[baseName]; } catch (e) {}
  try { await DB.dbPut('tafsir', tafsirId, data); } catch (e) {}
  _cache[tafsirId] = data;
  return data;
}

function getVerseTafsir(tafsirData, surahNum, ayahNum) {
  if (!tafsirData || !tafsirData.surahs) return null;
  const surah = tafsirData.surahs.find(s => s.number === surahNum);
  if (!surah || !surah.verses) return null;
  const entry = surah.verses.find(v => (v.ayah || v.number) === ayahNum);
  return entry ? (entry.text || entry.tafsir || '') : null;
}

async function getAvailableTafsirs() {
  return Object.entries(TAFSIR_SOURCES).map(([id, info]) => ({
    id, name: info.name, bundled: info.bundled, downloaded: true,
  }));
}

// دالة تحميل الحزمة الإضافية
async function downloadExtraData(onProgress) {
  try {
    if (onProgress) onProgress(0, 'جاري التحميل...');

    const res = await fetch(REMOTE_DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const buffer = await res.arrayBuffer();
    if (onProgress) onProgress(50, 'جاري فك الضغط...');

    // استخدم pako لفك ضغط ZIP (يحتاج مكتبة JSZip)
    if (typeof JSZip === 'undefined') {
      throw new Error('مكتبة JSZip غير محمّلة');
    }

    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files).filter(f => f.endsWith('.js'));
    let processed = 0;

    for (const filename of files) {
      const content = await zip.files[filename].async('string');
      // شغّل محتوى السكربت في السياق الحالي
      const script = document.createElement('script');
      script.textContent = content;
      document.head.appendChild(script);
      processed++;
      if (onProgress) {
        onProgress(50 + (processed / files.length) * 50, 
                   `تم تحميل ${processed}/${files.length}`);
      }
    }

    if (onProgress) onProgress(100, '✓ اكتمل التحميل');
    return true;
  } catch (e) {
    console.error('فشل تحميل الحزمة الإضافية:', e);
    throw e;
  }
}

window.TafsirModule = {
  sources: TAFSIR_SOURCES,
  load: loadTafsir,
  getVerse: getVerseTafsir,
  available: getAvailableTafsirs,
  downloadExtra: downloadExtraData,
};
