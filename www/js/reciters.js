// ============ قائمة القراء — مصادر موثوقة (تُستخدم في التطبيقات العالمية) ============

const READERS = {
  // كل الرابط بصيغة: {S} = 3 أرقام السورة، {A} = 3 أرقام الآية
  
  // ========== رواية قالون ==========
  qaloon_husary: {
    name: 'الحصري (قالون)',
    country: '🌍 عالمي',
    type: 'ayah',  // per-ayah
    pattern: 'https://everyayah.com/data/Quran_qaloon/Abdul_Basit_Murattal_64kbps/{S}{A}.mp3',
  },
  qaloon_minshawi: {
    name: 'المنشاوي (قالون)',
    country: '🌍 عالمي',
    type: 'ayah',
    pattern: 'https://everyayah.com/data/quran_qaloon/Minshawy_Murattal_128kbps/{S}{A}.mp3',
  },
  
  // ========== رواية حفص (للمقارنة) ==========
  husary: {
    name: 'محمود خليل الحصري',
    country: '🌍 عالمي',
    type: 'ayah',
    pattern: 'https://everyayah.com/data/Husary_128kbps/{S}{A}.mp3',
  },
  minshawi: {
    name: 'محمد صديق المنشاوي',
    country: '🌍 عالمي',
    type: 'ayah',
    pattern: 'https://everyayah.com/data/Minshawy_Murattal_128kbps/{S}{A}.mp3',
  },
  abdulbasit: {
    name: 'عبد الباسط عبد الصمد',
    country: '🌍 عالمي',
    type: 'ayah',
    pattern: 'https://everyayah.com/data/Abdul_Basit_Murattal_192kbps/{S}{A}.mp3',
  },
  
  // ========== سورة كاملة (سريع التحميل) ==========
  full_husary: {
    name: 'الحصري (سورة كاملة)',
    country: '🌍 عالمي',
    type: 'surah',
    pattern: 'https://download.quranicaudio.com/quran/mahmoud_khalil_al_husary/{S}.mp3',
  },
  full_minshawi: {
    name: 'المنشاوي (سورة كاملة)',
    country: '🌍 عالمي',
    type: 'surah',
    pattern: 'https://download.quranicaudio.com/quran/mohammad_siddiq_al_minshawi/{S}.mp3',
  },
};

// بناء رابط الآية أو السورة
function buildAudioUrl(readerKey, surahNum, ayahNum) {
  const reader = READERS[readerKey];
  if (!reader) return null;
  
  const S = String(surahNum).padStart(3, '0');
  
  if (reader.type === 'ayah') {
    const A = String(ayahNum).padStart(3, '0');
    return reader.pattern.replace('{S}', S).replace('{A}', A);
  }
  
  // سورة كاملة
  return reader.pattern.replace('{S}', S);
}

window.RecitersModule = {
  readers: READERS,
  buildUrl: buildAudioUrl,
};
