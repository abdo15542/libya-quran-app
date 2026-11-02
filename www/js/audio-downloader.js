// ============ المصحف الصوتي المدمج ============
// منذ الإصدار 1.2.0 التلاوة كاملة مدمجة داخل التطبيق (ملفات Opus محلية)،
// فلا يوجد تنزيل ولا حذف ولا اتصال بالشبكة. تبقى هذه الواجهة بنفس الشكل
// القديم حتى تعمل شاشة الإعدادات وأي كود يعتمد عليها دون تغيير.

window.AudioDownloader = {
  // كل شيء موجود مسبقاً: «التحميل» مكتمل دائماً
  downloadAll: async function (readerKey, onProgress) {
    if (typeof onProgress === 'function') {
      onProgress({ completed: 114, total: 114, current: 114, status: 'done', surahName: '' });
    }
  },
  getStats: async function () {
    const m = window.AUDIO_BUNDLED || {};
    return { count: m.count || 114, bytes: m.totalBytes || 0 };
  },
  getState: async function () {
    return { finished: true, completed: 114, total: 114 };
  },
  deleteAll: async function () { /* مدمج داخل التطبيق — لا يُحذف */ },
  has: async function () { return true; },
  get: async function () { return null; },
  isDownloading: function () { return false; },
  cancel: function () {},
};
