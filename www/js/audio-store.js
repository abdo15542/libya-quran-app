// ============ مخزن التلاوة القابلة للتنزيل (1.4.0) ============
// التطبيق صغير الحجم؛ التلاوة تُنزّل بعد التثبيت من مصدرها على
// mp3quran عبر الإضافة الأصلية AudioStore (5 تنزيلات متزامنة،
// استئناف كامل عند الإيقاف/الإغلاق/الانقطاع)، وتُحفظ على الجهاز
// وتعمل بعدها دون إنترنت.
// - يبدأ التنزيل تلقائيًا على Wi-Fi بعد أول تشغيل.
// - على بيانات الهاتف ننتظر أمرًا صريحًا (زر أو تشغيل سورة) احترامًا لباقته.
// - مرآة الحالة في window.__AUDIO_STORE__ وتُبثّ بحدث audio-store.

const AudioStore = {
  _plugin: null,
  _bound: false,
  _configured: false,
  _waiters: {},        // surah -> [{resolve, reject}]
  _speed: { lastBytes: 0, lastTime: 0, mbps: 0 },
  mirror: { doneCount: 0, doneBytes: 0, totalBytes: 0, running: false, files: {}, ready: false },

  plugin() {
    if (this._plugin) return this._plugin;
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AudioStore) {
        this._plugin = window.Capacitor.Plugins.AudioStore;
      }
    } catch (e) {}
    return this._plugin;
  },

  present() { return !!this.plugin(); },

  async init() {
    const sp = this.plugin();
    if (!sp || this._configured) return;
    this._bind(sp);
    try {
      const m = window.AUDIO_REMOTE || {};
      const st = await sp.configure({ baseUrl: m.baseUrl, sizes: m.sizes || {} });
      this._configured = true;
      this._apply(st);
      this._autoStart();
    } catch (e) {
      console.warn('تهيئة مخزن الصوت:', e);
    }
  },

  _bind(sp) {
    if (this._bound || !sp.addListener) return;
    this._bound = true;
    sp.addListener('progress', (st) => this._apply(st));
    sp.addListener('fileDone', (ev) => {
      const ws = this._waiters[ev.surah] || [];
      delete this._waiters[ev.surah];
      ws.forEach(w => { try { w.resolve(ev.path); } catch (e) {} });
      this.refresh();
    });
    sp.addListener('storeError', (ev) => {
      const ws = this._waiters[ev.surah] || [];
      delete this._waiters[ev.surah];
      ws.forEach(w => { try { w.reject(new Error(ev.message || 'خطأ في التنزيل')); } catch (e) {} });
    });
    sp.addListener('allDone', () => this.refresh());
  },

  _apply(st) {
    if (!st) return;
    const now = Date.now();
    if (this._speed.lastTime && st.doneBytes != null) {
      const dt = (now - this._speed.lastTime) / 1000;
      const db = st.doneBytes - this._speed.lastBytes;
      if (dt > 0.3 && db >= 0) this._speed.mbps = db / dt / 1048576;
      if (!st.running) this._speed.mbps = 0;
    }
    this._speed.lastBytes = st.doneBytes || 0;
    this._speed.lastTime = now;
    this.mirror = {
      doneCount: st.doneCount || 0,
      doneBytes: st.doneBytes || 0,
      totalBytes: st.totalBytes || (window.AUDIO_REMOTE ? window.AUDIO_REMOTE.totalBytes : 0),
      running: !!st.running,
      files: st.files || {},
      lastError: st.lastError || '',
      ready: true,
    };
    try {
      window.__AUDIO_STORE__ = this.mirror;
      window.dispatchEvent(new CustomEvent('audio-store', { detail: this.mirror }));
    } catch (e) {}
  },

  async refresh() {
    const sp = this.plugin();
    if (!sp) return this.mirror;
    try { this._apply(await sp.getState()); } catch (e) {}
    return this.mirror;
  },

  async _autoStart() {
    try {
      if (this.mirror.doneCount >= 114) return;
      if (localStorage.getItem('audioDlFinished') === '1') return;
      const sp = this.plugin();
      const net = await sp.netType();
      if (net && net.type === 'wifi') {
        await this.startAll();
      } else {
        // بيانات هاتف: لا تنزيل تلقائيًا — التنزيل يبدأ بزرّ أو بتشغيل سورة
        try { localStorage.setItem('audioDlNeedsStart', '1'); } catch (e) {}
      }
    } catch (e) {}
  },

  async startAll() {
    const sp = this.plugin();
    if (!sp) return;
    if (!this._configured) await this.init();
    try { localStorage.removeItem('audioDlNeedsStart'); } catch (e) {}
    this._apply(await sp.startAll());
  },

  async pauseAll() {
    const sp = this.plugin();
    if (!sp) return;
    // أي انتظار تشغيل معلّق يُرفض بلطف
    Object.keys(this._waiters).forEach(k => {
      this._waiters[k].forEach(w => { try { w.reject(new Error('أُوقف التنزيل مؤقتًا')); } catch (e) {} });
      delete this._waiters[k];
    });
    this._apply(await sp.pauseAll());
  },

  async deleteAll() {
    const sp = this.plugin();
    if (!sp) return;
    this._apply(await sp.deleteAll());
  },

  /** مسار ملف سورة منزّلة، أو null. */
  async localPath(surah) {
    const sp = this.plugin();
    if (!sp) return null;
    if (!this._configured) await this.init();
    try {
      const r = await sp.localPath({ surah });
      return r && r.done ? r.path : null;
    } catch (e) { return null; }
  },

  isDone(surah) {
    const f = this.mirror.files && this.mirror.files[String(surah)];
    return !!(f && f.status === 'done');
  },

  /**
   * تنزيل سورة بأولوية قصوى والانتظار حتى تكتمل (لأجل التشغيل).
   * يعيد وعدًا بمسار الملف.
   */
  downloadPriority(surah) {
    const sp = this.plugin();
    if (!sp) return Promise.reject(new Error('إضافة التنزيل غير موجودة'));
    return new Promise(async (resolve, reject) => {
      try {
        if (!this._configured) await this.init();
        const existing = await this.localPath(surah);
        if (existing) { resolve(existing); return; }
        if (!this._waiters[surah]) this._waiters[surah] = [];
        this._waiters[surah].push({ resolve, reject });
        const r = await sp.downloadSurah({ surah });
        if (r && r.done && r.path) {
          const ws = this._waiters[surah] || [];
          delete this._waiters[surah];
          ws.forEach(w => { try { w.resolve(r.path); } catch (e) {} });
        }
      } catch (e) { reject(e); }
    });
  },

  speedMbps() { return this.mirror.running ? this._speed.mbps : 0; },
};

window.AudioStore = AudioStore;

// تهيئة مبكرة: تهيئة الإضافة وبدء التنزيل التلقائي (Wi-Fi) عند أول تشغيل
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AudioStore.init());
} else {
  AudioStore.init();
}
window.addEventListener('audio-store', () => {
  if (window.AudioStore && AudioStore.mirror.doneCount >= 114) {
    try { localStorage.setItem('audioDlFinished', '1'); } catch (e) {}
  }
});
