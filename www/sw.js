const CACHE_STATIC = 'libya-quran-static-v1';
const CACHE_DATA = 'libya-quran-data-v1';
const CACHE_AUDIO = 'libya-quran-audio-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/data-loader.js',
  './js/audio.js',
  './js/pako.min.js',
  './js/tajweed.js',
  './js/search.js',
  './js/tafsir.js',
  './js/translation.js',
  './js/memorization.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('SW install:', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => ![CACHE_STATIC, CACHE_DATA, CACHE_AUDIO].includes(k))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // ملفات الصوت — Cache First (بعد التحميل)
  if (url.pathname.endsWith('.mp3') || e.request.destination === 'audio') {
    e.respondWith(
      caches.open(CACHE_AUDIO).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res && res.status === 200) {
              cache.put(e.request, res.clone());
            }
            return res;
          }).catch(() => new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // الملفات المحلية — Cache First
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200 && e.request.method === 'GET') {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }
});
