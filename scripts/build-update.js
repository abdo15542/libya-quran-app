const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WWW_DIR = path.join(__dirname, '..', 'www');
const VERSION = process.argv[2] || '1.0.' + Date.now();

// حساب checksum لملفات مهمة
function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

console.log('📋 إصدار:', VERSION);
console.log('📁 www:', WWW_DIR);
console.log('📊 عدد الملفات:', fs.readdirSync(WWW_DIR).length);
