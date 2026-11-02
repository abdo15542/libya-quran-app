// عامل خدمة مُعطِّل (إصدار 1.1.1): إصدارات سابقة سجّلت عاملاً يخزّن الملفات مؤقتاً،
// وبقايا ذلك الكاش قد تعرض نسخاً قديمة بعد التحديث. هذا العامل يحذف كل الكاش
// ثم يلغي تسجيل نفسه، ولا يعترض أي طلب إطلاقاً.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch (e) { /* تجاهل */ }
  try { await self.registration.unregister(); } catch (e) { /* تجاهل */ }
});
