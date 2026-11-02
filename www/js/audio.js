// ============ مشغل الصوت ============
// - التلاوة مدمجة داخل التطبيق: ملفات MP3 محلية (audio/NNN.mp3)
// - المحرك الأساسي على الجهاز: المشغّل الأصلي (إضافة NativeAudio فوق
//   MediaPlayer) لأنه يتجاوز مشغّل وسائط WebView. وإن فشل الأصلي لأي
//   سبب جرّبنا عنصر <audio> القياسي تلقائياً، وسجّلنا النتيجتين.
// - كل محاولة ونتيجتها تُحفظ في window.__AUDIO_DIAG__ وتظهر في شاشة
//   الإعدادات، حتى يكون سبب أي فشل ظاهراً لا مخفياً خلف رسالة عامة.
// - لا شبكة إطلاقاً: التشغيل من أصول التطبيق فقط.

const QuranAudio = {
  player: null,
  currentReader: null,
  currentSurah: null,
  repeatTarget: 0,
  repeatCount: 0,
  _listeners: {},
  _token: 0,
  _engine: null,        // 'native' | 'web'
  _nativeEnded: false,
  _nativeBound: false,

  _diag: {
    version: (typeof window !== 'undefined' && window.APP_VERSION) || '?',
    plugin: 'unknown',  // 'present' | 'absent'
    engine: null,
    probe: null,        // نتيجة الفحص الأرضي من الإضافة الأصلية
    entries: [],
  },

  // فحص أرضي لمرة واحدة: ماذا تحتوي النسخة المثبتة فعليًا؟
  async probe() {
    const np = this._native();
    if (!np || typeof np.probe !== 'function') return null;
    if (this._diag.probe) return this._diag.probe;
    try {
      const p = await np.probe();
      this._diag.probe = p;
      this._note('probe', 'apkMB=' + Math.round((p.apkBytes || 0) / 1048576) +
        ' audioCount=' + p.audioCount +
        ' fd=' + (p.fdBytes != null ? p.fdBytes : (p.fdError || '?')) +
        ' stream=' + (p.streamRead != null ? p.streamRead : (p.streamError || '?')));
      return p;
    } catch (e) {
      this._note('probe-failed', e && e.message);
      return null;
    }
  },

  _note(kind, detail) {
    try {
      const d = this._diag;
      d.engine = this._engine;
      d.entries.push({ t: new Date().toISOString(), kind, detail: String(detail || '') });
      if (d.entries.length > 20) d.entries.shift();
      window.__AUDIO_DIAG__ = d;
      window.dispatchEvent(new CustomEvent('audio-diag', { detail: d }));
    } catch (e) {}
  },

  _native() {
    let np = null;
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        np = window.Capacitor.Plugins.NativeAudio;
      }
    } catch (e) {}
    this._diag.plugin = np ? 'present' : 'absent';
    try { window.__AUDIO_DIAG__ = this._diag; } catch (e) {}
    return np;
  },

  isCurrent(readerKey, surahNum) {
    const loaded = !!this.player || this._engine === 'native';
    return loaded && this.currentReader === readerKey && this.currentSurah === surahNum;
  },

  _dispatchState(playing) {
    window.dispatchEvent(new CustomEvent('audio-state', { detail: { playing: !!playing } }));
  },

  _bindNative(np) {
    if (this._nativeBound || !np || !np.addListener) return;
    this._nativeBound = true;
    np.addListener('ended', () => { this._nativeEnded = true; this._onEnd(); });
    np.addListener('error', (ev) => {
      this._note('native-event-error', 'what=' + (ev && ev.what) + ' extra=' + (ev && ev.extra));
      this._dispatchState(false);
      this._emit('error', { readerKey: this.currentReader, surahNum: this.currentSurah, error: 'native' });
    });
    np.addListener('playing', () => this._dispatchState(true));
    np.addListener('paused', () => this._dispatchState(false));
  },

  _ensurePlayer() {
    if (this.player) return this.player;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.onended = () => this._onEnd();
    audio.onerror = () => this._emit('error', { code: audio.error && audio.error.code });
    audio.onplay = () => this._dispatchState(true);
    audio.onpause = () => {
      if (!audio.ended) this._dispatchState(false);
    };
    this.player = audio;
    return audio;
  },

  async play(readerKey, surahNum) {
    const np = this._native();
    if (np) this.probe(); // فحص أرضي في الخلفية لتشخيص النسخة المثبتة

    // نفس التلاوة محمّلة: استئناف فقط
    if (this.isCurrent(readerKey, surahNum)) {
      try {
        if (np && this._engine === 'native') {
          if (this._nativeEnded) {
            this._nativeEnded = false;
            const lp = window.AudioStore && AudioStore.present() ? await AudioStore.localPath(surahNum) : null;
            if (lp) await np.play({ filePath: lp, seek: 0 });
            else await np.play({ path: 'public/' + window.RecitersModule.buildUrl(readerKey, surahNum), seek: 0 });
          } else {
            await np.resume();
          }
        } else if (this.player) {
          if (this.player.ended) this.player.currentTime = 0;
          await this.player.play();
        } else if (np) {
          await np.resume();
        }
        this._dispatchState(true);
        this._note('resume-ok', 'surah ' + surahNum);
        return;
      } catch (e) {
        this._note('resume-failed', e && e.message);
        // نكمل إلى تحميل جديد كامل بالأسفل
        this.currentReader = null;
        this.currentSurah = null;
      }
    }

    const url = window.RecitersModule ? window.RecitersModule.buildUrl(readerKey, surahNum) : null;
    if (!url) {
      const err = new Error('لا توجد تلاوة مدمجة لهذه السورة');
      this._emit('error', { readerKey, surahNum, error: err.message });
      throw err;
    }

    const token = ++this._token;
    this.currentReader = readerKey;
    this.currentSurah = surahNum;
    const failures = [];
    let missingFile = false;

    // منذ 1.4.0: التلاوة تُنزّل إلى الجهاز أولًا (إن لم تكن منزّلة)،
    // ثم تُشغّل من الملف المحلي. تنزيل السورة المطلوبة له أولوية قصوى.
    let filePath = null;
    const store = (window.AudioStore && AudioStore.present()) ? AudioStore : null;
    if (store) {
      filePath = await store.localPath(surahNum);
      if (token !== this._token) return;
      if (!filePath) {
        this._note('play-download-first', 'surah ' + surahNum);
        this._emit('downloading', { readerKey, surahNum });
        try {
          filePath = await store.downloadPriority(surahNum);
        } catch (e) {
          this._note('play-download-failed', e && e.message);
          this._dispatchState(false);
          const err = new Error('تعذّر تنزيل السورة — تحقّق من اتصال الإنترنت ثم أعد المحاولة');
          this._emit('error', { readerKey, surahNum, error: err.message });
          throw err;
        }
        if (token !== this._token) return;
        this._note('play-download-done', 'surah ' + surahNum);
      }
    }

    // المحاولة 1: المشغّل الأصلي
    if (np) {
      try {
        this._engine = 'native';
        this._nativeEnded = false;
        this._bindNative(np);
        await np.play(filePath ? { filePath } : { path: 'public/' + url });
        if (token !== this._token) return;
        this._dispatchState(true);
        this._setMediaSession(readerKey, surahNum);
        this._note('play-ok-native', 'surah ' + surahNum);
        this._emit('success', { readerKey, surahNum, source: 'builtin' });
        return;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (msg.indexOf('FileNotFoundException') >= 0) missingFile = true;
        failures.push('الأصلي: ' + msg);
        this._note('play-failed-native', failures[failures.length - 1]);
      }
    } else {
      this._note('plugin-absent', 'Capacitor.Plugins.NativeAudio غير موجود');
    }

    // المحاولة 2: عنصر الصوت القياسي
    try {
      this._engine = 'web';
      const webSrc = filePath && window.Capacitor && window.Capacitor.convertFileSrc
        ? window.Capacitor.convertFileSrc(filePath)
        : url;
      await this._playSrc(webSrc);
      if (token !== this._token) return;
      this._dispatchState(true);
      this._setMediaSession(readerKey, surahNum);
      this._note('play-ok-web', 'surah ' + surahNum);
      this._emit('success', { readerKey, surahNum, source: 'builtin' });
    } catch (e) {
      const el = this.player;
      const code = el && el.error ? el.error.code : null;
      failures.push('المتصفح: ' + (e && e.message ? e.message : e) + (code ? ' (code ' + code + ')' : ''));
      this._note('play-failed-web', failures[failures.length - 1]);
      this._dispatchState(false);
      const err = new Error(missingFile
        ? 'ملفات الصوت غير موجودة داخل النسخة المثبّتة على هاتفك — هذه نسخة بلا تلاوة مدمجة. ثبّت الملف الكامل المرفق في المحادثة (468 MB) ثم جرّب مجددًا'
        : failures.join(' | '));
      this._emit('error', { readerKey, surahNum, error: err.message });
      throw err;
    }
  },

  async playUrl(url) {
    this.currentReader = null;
    this.currentSurah = null;
    this._engine = 'web';
    return this._playSrc(url);
  },

  _playSrc(src) {
    const audio = this._ensurePlayer();
    if (audio.getAttribute('src') !== src) {
      audio.src = src;
    } else if (audio.ended) {
      audio.currentTime = 0;
    }
    return audio.play();
  },

  _restart() {
    if (this._engine === 'native') {
      const np = this._native();
      if (np && this.currentReader && this.currentSurah) {
        this._nativeEnded = false;
        const surah = this.currentSurah;
        const fallback = () => np.play({ path: 'public/' + window.RecitersModule.buildUrl(this.currentReader, surah), seek: 0 }).catch(() => {});
        if (window.AudioStore && AudioStore.present()) {
          AudioStore.localPath(surah).then(lp => {
            if (lp) np.play({ filePath: lp, seek: 0 }).catch(() => {});
            else fallback();
          }).catch(fallback);
        } else fallback();
      }
    } else if (this.player) {
      this.player.currentTime = 0;
      this.player.play().catch(() => {});
    }
  },

  _setMediaSession(readerKey, surahNum) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      const reader = window.READERS && window.READERS[readerKey];
      const surah = (typeof state !== 'undefined' && state.data && state.data.surahs && state.data.surahs[surahNum - 1]) || null;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'سورة ' + (surah ? surah.name : surahNum),
        artist: reader ? reader.name : '',
        album: 'مصحف ليبيا',
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (this._engine === 'native') { const np = this._native(); if (np) np.resume().catch(() => {}); }
        else if (this.player) this.player.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
    } catch (e) {}
  },

  pause() {
    if (this._engine === 'native') {
      const np = this._native();
      if (np) np.pause().catch(() => {});
      this._dispatchState(false);
    } else if (this.player) {
      try { this.player.pause(); } catch (e) {}
    }
  },

  stop() {
    if (this._engine === 'native') {
      const np = this._native();
      if (np) np.stop().catch(() => {});
      this._dispatchState(false);
    } else if (this.player) {
      try { this.player.pause(); this.player.currentTime = 0; } catch (e) {}
    }
    this.repeatCount = 0;
  },

  setRepeat(n) { this.repeatTarget = n || 0; this.repeatCount = 0; },

  _onEnd() {
    this.repeatCount++;
    if (this.repeatTarget > 0 && this.repeatCount < this.repeatTarget) {
      this._restart();
    } else {
      this.repeatCount = 0;
      this._dispatchState(false);
      this._emit('ended', {});
      window.dispatchEvent(new CustomEvent('audio-ended'));
    }
  },

  _emit(event, data) { (this._listeners[event] || []).forEach(cb => { try { cb(data); } catch (e) {} }); },
  on(event, cb) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(cb); },
  off(event, cb) { if (!this._listeners[event]) return; this._listeners[event] = this._listeners[event].filter(x => x !== cb); },
  once(event, cb) { const wrapper = (data) => { cb(data); this.off(event, wrapper); }; this.on(event, wrapper); },
};

window.QuranAudio = QuranAudio;
try { window.__AUDIO_DIAG__ = QuranAudio._diag; } catch (e) {}
