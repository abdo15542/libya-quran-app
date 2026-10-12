const https = require('https');
const fs = require('fs');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'test' } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  console.log('تحميل الترجمة الإنجليزية...');
  const url = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/eng-saheeh.json';
  const data = await fetchUrl(url);
  const parsed = JSON.parse(data);
  const verses = parsed.quran || parsed.chapter || [];
  console.log('✓ عدد الآيات:', verses.length);
  fs.writeFileSync('www/data/trans-en.json', JSON.stringify({
    lang: 'en', name: 'English — Saheeh International', verses
  }));
  console.log('💾 حُفظ: www/data/trans-en.json');
})().catch(e => console.error('✗', e.message));
