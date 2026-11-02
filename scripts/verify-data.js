// فحص سلامة البيانات — يُشغَّل بـ npm run verify وفي CI قبل بناء الـ APK.
// يتحقق من: اكتمال المصحف وعدّ آياته (قالون/المدني = 6214)، توافق فهرس السور
// مع النص الفعلي، قابلية فكّ كل التفاسير والترجمات وسلامة بنيتها، ووجود خط المصحف.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA = path.join(__dirname, '..', 'www', 'data');
let failures = 0;
function check(cond, msg) {
  if (cond) { console.log('✓ ' + msg); }
  else { failures++; console.error('✗ ' + msg); }
}
function decodeJsData(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/=\s*"([A-Za-z0-9+/=]+)"/);
  if (!m) throw new Error('لا توجد بيانات base64 في ' + path.basename(file));
  return JSON.parse(zlib.gunzipSync(Buffer.from(m[1], 'base64')).toString('utf8'));
}

// 1) فهرس السور
const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'surahs.json'), 'utf8'));
check(Array.isArray(meta) && meta.length === 114, 'surahs.json: 114 سورة');
check(meta.every((s, i) => s.n === i + 1), 'surahs.json: ترقيم متسلسل 1..114');

// 2) نص المصحف (قالون — مصحف الأوقاف الليبية، العدّ المدني الأخير)
const quran = JSON.parse(fs.readFileSync(path.join(DATA, 'quran.json'), 'utf8'));
const surahs = quran.data && quran.data.surahs;
check(Array.isArray(surahs) && surahs.length === 114, 'quran.json: 114 سورة');
let total = 0, structureOk = true, mappingOk = true;
surahs.forEach((s, i) => {
  if (!Array.isArray(s.ayahs) || !s.ayahs.length) structureOk = false;
  s.ayahs.forEach((a, j) => {
    if (a.number !== j + 1 || !a.text) structureOk = false;
    if (!Array.isArray(a.number_in_hafs) || !a.number_in_hafs.length) mappingOk = false;
  });
  total += s.ayahs.length;
  if (meta[i].verses !== s.ayahs.length) {
    failures++; console.error(`✗ عدد آيات سورة ${i + 1}: الفهرس ${meta[i].verses} ≠ النص ${s.ayahs.length}`);
  }
});
check(structureOk, 'quran.json: كل آية مرقّمة وذات نص');
check(mappingOk, 'quran.json: كل آية لها number_in_hafs (ربط عدّ حفص)');
check(total === 6214, `quran.json: مجموع الآيات 6214 (العدّ المدني) — الفعلي ${total}`);
check(meta.reduce((a, s) => a + s.verses, 0) === 6214, 'surahs.json: المجموع متوافق 6214');

// 3) التفاسير الستة (مرقّمة بحفص، بلا اشتراط تطابق العدّ)
for (const name of ['tafsir-muyassar', 'tafsir-ibn-kathir', 'tafsir-jalalayn', 'tafsir-saadi', 'tafsir-tabari', 'tafsir-qurtubi']) {
  try {
    const t = decodeJsData(path.join(DATA, name + '.js'));
    const ok = t.surahs && t.surahs.length === 114 && t.surahs.every(s => s.verses && s.verses.length && s.verses[0].ayah !== undefined);
    check(!!ok, `${name}: 114 سورة بمداخل مرقّمة`);
  } catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
}

// 4) الترجمات الثماني (عدّ حفص = 6236 مدخلًا)
for (const name of ['trans-en', 'trans-fr', 'trans-de', 'trans-es', 'trans-tr', 'trans-it', 'trans-ru', 'trans-ber']) {
  try {
    const t = decodeJsData(path.join(DATA, name + '.js'));
    check(!!(t.verses && t.verses.length === 6236), `${name}: 6236 مدخلًا — الفعلي ${t.verses && t.verses.length}`);
  } catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
}

// 5) خط المصحف مضمّن فعلًا
const font = path.join(__dirname, '..', 'www', 'fonts', 'AmiriQuran-Regular.woff2');
check(fs.existsSync(font) && fs.statSync(font).size > 10000, 'خط Amiri Quran مضمّن في www/fonts');

// 6) لا أثر لملف الترقيع القديم
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
check(!indexHtml.includes('app-patches'), 'index.html: لا يحمّل app-patches.js');
check(!fs.existsSync(path.join(__dirname, '..', 'www', 'js', 'app-patches.js')), 'app-patches.js محذوف (دُمج في app.js)');

if (failures) { console.error(`\nفشل الفحص: ${failures} مشكلة`); process.exit(1); }
console.log('\n✅ كل فحوص البيانات سليمة');
