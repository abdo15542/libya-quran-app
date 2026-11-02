// ============ واجهة توافق لصندوق الصوت في الإعدادات ============
// منذ 1.4.0 التلاوة تُنزّل بعد التثبيت عبر AudioStore الأصلي.
// هذه الواجهة تبقى بنفس الشكل القديم لكنها تعكس حالة التنزيل
// الحقيقية من المخزن (لا أرقامًا ثابتة).

window.AudioDownloader = {
  downloadAll: async function (readerKey, onProgress) {
    if (window.AudioStore) {
      await AudioStore.startAll();
      if (typeof onProgress === 'function') {
        const m = AudioStore.mirror;
        onProgress({ completed: m.doneCount, total: 114, current: m.doneCount, status: m.running ? 'downloading' : 'done', surahName: '' });
      }
    }
  },
  getStats: async function () {
    if (window.AudioStore && AudioStore.present()) {
      const m = await AudioStore.refresh();
      return { count: m.doneCount, bytes: m.doneBytes, totalBytes: m.totalBytes, running: m.running };
    }
    return { count: 0, bytes: 0, totalBytes: (window.AUDIO_REMOTE || {}).totalBytes || 0, running: false };
  },
  getState: async function () {
    if (window.AudioStore && AudioStore.present()) {
      const m = await AudioStore.refresh();
      return { finished: m.doneCount >= 114, completed: m.doneCount, total: 114, running: m.running };
    }
    return { finished: false, completed: 0, total: 114, running: false };
  },
  deleteAll: async function () {
    if (window.AudioStore) await AudioStore.deleteAll();
  },
  has: async function () { return false; },
  get: async function () { return null; },
  isDownloading: function () {
    return !!(window.AudioStore && AudioStore.mirror.running);
  },
  cancel: function () {
    if (window.AudioStore) AudioStore.pauseAll();
  },
};
