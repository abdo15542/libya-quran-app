const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'www', 'data');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'libya-quran-app' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// جلب قائمة الترجمات
async function getEditions() {
  console.log('📋 جلب قائمة الترجمات...');
  const data = await fetchUrl('https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions.json');
  const editions = JSON.parse(data.toString('utf8'));
  console.log('✓ عدد الترجمات:', Object.keys(editions).length);
  return editions;
}

// البحث عن أفضل ترجمة لكل لغة — يعيد الكائن كاملاً (بما فيه link)
function findBestEdition(editions, language) {
  const candidates = [];
  for (const [key, info] of Object.entries(editions)) {
    if (info.language === language && info.link) {
      candidates.push({ key, ...info });
    }
  }
  return candidates[0] || null;
}

async function main() {
  console.log('=== تجميع الترجمات ===\n');

  const editions = await getEditions();
  console.log('');

  const wanted = [
    { lang: 'en',  language: 'English' },
    { lang: 'fr',  language: 'French' },
    { lang: 'it',  language: 'Italian' },
    { lang: 'ber', language: 'Berber' },
    { lang: 'es',  language: 'Spanish' },
    { lang: 'de',  language: 'German' },
    { lang: 'ru',  language: 'Russian' },
    { lang: 'tr',  language: 'Turkish' },
  ];

  const used = new Set();

  for (const item of wanted) {
    if (used.has(item.lang)) continue;

    const edition = findBestEdition(editions, item.language);
    if (!edition) {
      console.log('⚠ لا توجد ترجمة للغة:', item.language);
      continue;
    }

    console.log('\n🌐 تحميل: ' + item.language + ' — ' + edition.key);
    console.log('   المؤلف:', edition.author || 'غير محدد');

    // استخدم رابط min.json أولاً (أسرع)، ثم json كاحتياطي
    const urls = [];
    if (edition.linkmin) urls.push(edition.linkmin);
    if (edition.link) urls.push(edition.link);

    let success = false;
    for (const url of urls) {
      try {
        const buffer = await fetchUrl(url);
        const parsed = JSON.parse(buffer.toString('utf8'));
        const verses = parsed.quran || parsed.chapter || [];

        if (!verses.length) continue;

        const jsonStr = JSON.stringify({
          lang: item.lang,
          name: item.language,
          author: edition.author || '',
          verses
        });
        const gz = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });
        const gzFile = path.join(DATA_DIR, 'trans-' + item.lang + '.json.gz');
        fs.writeFileSync(gzFile, gz);

        console.log('   ✓ ' + verses.length + ' آية → '
                    + (gz.length / 1024).toFixed(1) + ' KB');
        used.add(item.lang);
        success = true;
        break;
      } catch (e) {
        console.log('   ✗ فشل الرابط: ' + e.message);
      }
    }

    if (!success) console.log('   ✗ جميع الروابط فشلت');
  }

  console.log('\n✅ اكتمل!');
  const files = fs.readdirSync(DATA_DIR).filter(f =>
    f.startsWith('trans-') && f.endsWith('.gz')
  );
  console.log('عدد الملفات المحفوظة:', files.length);
  files.forEach(f => {
    const size = (fs.statSync(path.join(DATA_DIR, f)).size / 1024).toFixed(1);
    console.log('  ' + f + ' — ' + size + ' KB');
  });
}

main().catch(console.error);
