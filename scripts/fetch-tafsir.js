const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'www', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'libya-quran-app' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchTafsir(tafsir) {
  console.log('\n📖 تحميل: ' + tafsir.name);
  const result = { surahs: [] };
  let ok = 0, fail = 0;

  for (let s = 1; s <= 114; s++) {
    const url = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/'
                + tafsir.slug + '/' + s + '.json';
    try {
      const data = await fetchUrl(url);
      const verses = JSON.parse(data);
      result.surahs.push({ number: s, verses: verses });
      ok++;
      process.stdout.write('  ✓ ' + s + ' ');
    } catch (e) {
      fail++;
      process.stdout.write('  ✗ ' + s + ' ');
    }
  }

  console.log('\n  النتيجة: ' + ok + '/114 نجحت، ' + fail + ' فشلت');
  const outFile = path.join(DATA_DIR, 'tafsir-' + tafsir.id + '.json');
  fs.writeFileSync(outFile, JSON.stringify(result));
  console.log('  💾 حُفظ في: ' + path.basename(outFile));
}

async function main() {
  console.log('=== تجميع التفاسير الستة ===\n');

  const tafsirList = [
    { id: 'muyassar',   name: 'التفسير الميسر',  slug: 'ar-tafsir-muyassar' },
    { id: 'ibn-kathir', name: 'تفسير ابن كثير',  slug: 'ar-tafsir-ibn-kathir' },
    { id: 'jalalayn',   name: 'تفسير الجلالين',  slug: 'ar-tafsir-al-jalalayn' },
    { id: 'saadi',      name: 'تفسير السعدي',    slug: 'ar-tafsir-as-saadi' },
    { id: 'tabari',     name: 'تفسير الطبري',    slug: 'ar-tafsir-al-tabari' },
    { id: 'qurtubi',    name: 'تفسير القرطبي',   slug: 'ar-tafseer-al-qurtubi' },
  ];

  for (const tafsir of tafsirList) {
    await fetchTafsir(tafsir);
  }

  console.log('\n✅ اكتمل تجميع التفاسير!');
  console.log('\nالملفات المحفوظة:');
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('tafsir-'));
  files.forEach(f => {
    const size = (fs.statSync(path.join(DATA_DIR, f)).size / 1024 / 1024).toFixed(2);
    console.log('  ' + f + ' — ' + size + ' MB');
  });
}

main().catch(console.error);
