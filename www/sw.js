// Service Worker — شبكة أولاً (حتى تظهر التحديثات) مع احتياطي من الذاكرة
const VERSION = 'v2';
const CACHE_STATIC = 'libya-quran-static-' + VERSION;
const KEEP_CACHES = [CACHE_STATIC, 'libya-quran-audio-v1'];

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/version.js',
  './js/pako.min.js',
  './js/db.js',
  './js/data-loader.js',
  './js/reciters.js',
  './js/audio-downloader.js',
  './js/audio.js',
  './js/tajweed.js',
  './js/search.js',
  './js/tafsir.js',
  './js/translation.js',
  './js/memorization.js',
  './js/app.js',
  './js/app-patches.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;        // الصوت والخدمات الخارجية: بدون تدخل
  if (url.pathname.includes('/data/')) return;       // البيانات الكبيرة مخزّنة في IndexedDB
  if (url.pathname.endsWith('.mp3')) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached =>
          cached || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
