// ============ مشغل الصوت ============
// - التلاوة مدمجة داخل التطبيق: ملفات MP3 محلية (audio/NNN.mp3)
// - على الجهاز يُستخدم المشغّل الأصلي (إضافة NativeAudio المبنية على
//   MediaPlayer) لأنه يتجاوز مشغّل وسائط WebView الذي رفض التشغيل من
//   خادم الأصول المحلي على بعض الهواتف. وفي المتصفح (للتطوير) نعود
//   لعنصر <audio> القياسي.
// - لا شبكة إطلاقاً في الحالتين: التشغيل من أصول التطبيق فقط.

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

  _native() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        return window.Capacitor.Plugins.NativeAudio;
      }
    } catch (e) {}
    return null;
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
    np.addListener('error', () => {
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

    // نفس التلاوة محمّلة: استئناف فقط
    if (this.isCurrent(readerKey, surahNum)) {
      if (np && this._engine === 'native') {
        if (this._nativeEnded) {
          this._nativeEnded = false;
          await np.play({ path: 'public/' + window.RecitersModule.buildUrl(readerKey, surahNum), seek: 0 });
        } else {
          await np.resume();
        }
        this._dispatchState(true);
        return;
      }
      if (this.player) {
        if (this.player.ended) this.player.currentTime = 0;
        await this.player.play();
        return;
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
    try {
      if (np) {
        this._engine = 'native';
        this._nativeEnded = false;
        this._bindNative(np);
        await np.play({ path: 'public/' + url });
      } else {
        this._engine = 'web';
        await this._playSrc(url);
      }
      if (token !== this._token) return; // طُلبت تلاوة أحدث
      this._dispatchState(true);
      this._setMediaSession(readerKey, surahNum);
      this._emit('success', { readerKey, surahNum, source: 'builtin' });
    } catch (e) {
      this._dispatchState(false);
      this._emit('error', { readerKey, surahNum, error: e && e.message });
      throw e;
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
        np.play({ path: 'public/' + window.RecitersModule.buildUrl(this.currentReader, this.currentSurah), seek: 0 }).catch(() => {});
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
