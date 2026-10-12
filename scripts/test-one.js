const https = require('https');
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'www', 'data');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'test' } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  const url = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/ar-tafsir-muyassar/1.json';
  console.log('اختبار:', url);
  const data = await fetchUrl(url);
  const parsed = JSON.parse(data);
  console.log('✓ نجح! عدد الآيات:', parsed.length);
  console.log('أول آية (أول 200 حرف):', parsed[0].text.substring(0, 200));
  console.log('حقول الآية:', Object.keys(parsed[0]));
})().catch(e => console.error('✗ فشل:', e.message));
