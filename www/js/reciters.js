// ============ قائمة القراء ============
// التلاوة مدمجة داخل التطبيق (ملفات MP3 محلية في مجلد audio) —
// لا بثّ ولا تنزيل ولا إنترنت إطلاقاً، والتشغيل فوري من الجهاز.
// MP3 تحديدًا لأنه الصيغة الأكثر توافقًا مع مشغّل WebView على كل الهواتف.

window.READERS = {
  abdulbasit: {
    name: 'عبد الباسط عبد الصمد',
    country: '🌍 عالمي',
    type: 'surah',  // ← سورة كاملة
    pattern: 'audio/{S}.mp3',
  },
};

function buildAudioUrl(readerKey, surahNum) {
  const reader = window.READERS[readerKey];
  if (!reader) return null;
  const S = String(surahNum).padStart(3, '0');
  return reader.pattern.replace(/\{S\}/g, S).replace(/\{A\}/g, '001');
}

function buildAudioUrlFallback(readerKey, surahNum) {
  // لا روابط خارجية بعد اليوم — الاحتياطي هو نفس الملف المحلي
  return buildAudioUrl(readerKey, surahNum);
}

window.RecitersModule = {
  readers: window.READERS,
  buildUrl: buildAudioUrl,
  buildUrlFallback: buildAudioUrlFallback,
};
