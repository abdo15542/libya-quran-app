// ============ مشغل الصوت ============
// - التلاوة مدمجة داخل التطبيق: ملفات Opus محلية (audio/NNN.ogg)
// - التشغيل مباشرة من الجهاز: بدء فوري، تقديم/ترجيع فوري، بدون أي شبكة
// - عنصر صوت واحد يُعاد استخدامه، واستئناف بعد الإيقاف المؤقت

const QuranAudio = {
  player: null,
  currentReader: null,
  currentSurah: null,
  repeatTarget: 0,
  repeatCount: 0,
  _listeners: {},
  _token: 0,

  isCurrent(readerKey, surahNum) {
    return !!this.player && this.currentReader === readerKey && this.currentSurah === surahNum;
  },

  _ensurePlayer() {
    if (this.player) return this.player;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.onended = () => this._onEnd();
    audio.onerror = () => this._emit('error', { code: audio.error && audio.error.code });
    audio.onplay = () => window.dispatchEvent(new CustomEvent('audio-state', { detail: { playing: true } }));
    audio.onpause = () => {
      if (!audio.ended) window.dispatchEvent(new CustomEvent('audio-state', { detail: { playing: false } }));
    };
    this.player = audio;
    return audio;
  },

  async play(readerKey, surahNum) {
    // نفس التلاوة جاهزة: استئناف فقط
    if (this.isCurrent(readerKey, surahNum)) {
      if (this.player.ended) this.player.currentTime = 0;
      await this.player.play();
      return;
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
      await this._playSrc(url);
      if (token !== this._token) return; // طُلبت تلاوة أحدث
      this._setMediaSession(readerKey, surahNum);
      this._emit('success', { readerKey, surahNum, source: 'builtin' });
    } catch (e) {
      this._emit('error', { readerKey, surahNum, error: e.message });
      throw e;
    }
  },

  async playUrl(url) {
    this.currentReader = null;
    this.currentSurah = null;
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
      navigator.mediaSession.setActionHandler('play', () => { if (this.player) this.player.play().catch(() => {}); });
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
    } catch (e) {}
  },

  pause() { if (this.player) { try { this.player.pause(); } catch (e) {} } },
  stop() {
    if (this.player) { try { this.player.pause(); this.player.currentTime = 0; } catch (e) {} }
    this.repeatCount = 0;
  },
  setRepeat(n) { this.repeatTarget = n || 0; this.repeatCount = 0; },

  _onEnd() {
    this.repeatCount++;
    if (this.repeatTarget > 0 && this.repeatCount < this.repeatTarget) {
      if (this.player) { this.player.currentTime = 0; this.player.play().catch(() => {}); }
    } else {
      this.repeatCount = 0;
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
