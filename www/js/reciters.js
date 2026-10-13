// ============ قائمة القراء ============

window.READERS = {
  abdulbasit: {
    name: 'عبد الباسط عبد الصمد',
    country: '🌍 عالمي',
    type: 'surah',  // ← سورة كاملة
    pattern: 'https://server7.mp3quran.net/basit/{S}.mp3',
    fallback: 'https://server11.mp3quran.net/basit/{S}.mp3',
    type_second: 'https://server8.mp3quran.net/basit/{S}.mp3',
  },
};

function buildAudioUrl(readerKey, surahNum) {
  const reader = window.READERS[readerKey];
  if (!reader) return null;
  const S = String(surahNum).padStart(3, '0');
  return reader.pattern.replace(/\{S\}/g, S).replace(/\{A\}/g, '001');
}

function buildAudioUrlFallback(readerKey, surahNum) {
  const reader = window.READERS[readerKey];
  if (!reader || !reader.fallback) return null;
  const S = String(surahNum).padStart(3, '0');
  return reader.fallback.replace(/\{S\}/g, S).replace(/\{A\}/g, '001');
}

window.RecitersModule = {
  readers: window.READERS,
  buildUrl: buildAudioUrl,
  buildUrlFallback: buildAudioUrlFallback,
};
