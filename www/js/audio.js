// ============ مشغل الصوت ============
// - يقرأ من الملفات المحمّلة (IndexedDB) أولاً ثم من الإنترنت
// - استئناف بعد الإيقاف المؤقت بدل إعادة التحميل
// - يحتفظ بتلاوة واحدة فقط في الذاكرة

const QuranAudio = {
  player: null,
  currentBlobUrl: null,
  currentReader: null,
  currentSurah: null,
  repeatTarget: 0,
  repeatCount: 0,
  _listeners: {},
  _token: 0,

  isCurrent(readerKey, surahNum) {
    return !!this.player && this.currentReader === readerKey && this.currentSurah === surahNum;
  },

  async _fetchBlob(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    if (!blob.size) throw new Error('ملف فارغ');
    return blob;
  },

  async _getBlob(readerKey, surahNum) {
    // 1) الملف المحمّل أوفلاين
    if (window.AudioDownloader) {
      try {
        const saved = await AudioDownloader.get(readerKey + '_' + surahNum);
        if (saved && saved.size) return { blob: saved, source: 'offline' };
      } catch (e) {
        console.warn('قراءة الملف المحمّل فشلت:', e.message);
      }
    }

    // 2) من الإنترنت
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('لا يوجد اتصال بالإنترنت — حمّل المصحف الصوتي من الإعدادات للاستماع بدون إنترنت');
    }

    const urls = [
      window.RecitersModule.buildUrl(readerKey, surahNum),
      window.RecitersModule.buildUrlFallback(readerKey, surahNum),
    ].filter(Boolean);
    if (!urls.length) throw new Error('لا يوجد رابط لهذه التلاوة');

    let lastError = null;
    for (const url of urls) {
      try {
        return { blob: await this._fetchBlob(url), source: 'online', url };
      } catch (e) {
        lastError = e;
        console.warn('فشل الرابط:', url, e.message);
      }
    }
    throw lastError || new Error('تعذّر تحميل التلاوة');
  },

  async playUrl(url) {
    const blob = await this._fetchBlob(url);
    this.currentReader = null;
    this.currentSurah = null;
    return this._playBlob(blob);
  },

  async play(readerKey, surahNum) {
    // نفس التلاوة محمّلة: استئناف فقط
    if (this.isCurrent(readerKey, surahNum)) {
      if (this.player.ended) this.player.currentTime = 0;
      await this.player.play();
      return;
    }

    const token = ++this._token;
    try {
      const { blob, source } = await this._getBlob(readerKey, surahNum);
      if (token !== this._token) return; // طُلبت تلاوة أحدث
      this.currentReader = readerKey;
      this.currentSurah = surahNum;
      await this._playBlob(blob);
      this._setMediaSession(readerKey, surahNum);
      this._emit('success', { readerKey, surahNum, source });
    } catch (e) {
      this._emit('error', { readerKey, surahNum, error: e.message });
      throw e;
    }
  },

  _playBlob(blob) {
    if (this.player) {
      const old = this.player;
      old.onpause = old.onplay = old.onended = old.onerror = null;
      try { old.pause(); } catch (e) {}
    }
    if (this.currentBlobUrl) {
      try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
    }

    const blobUrl = URL.createObjectURL(blob);
    this.currentBlobUrl = blobUrl;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = blobUrl;
    audio.onended = () => this._onEnd();
    audio.onerror = () => this._emit('error', { code: audio.error && audio.error.code });
    audio.onplay = () => window.dispatchEvent(new CustomEvent('audio-state', { detail: { playing: true } }));
    audio.onpause = () => {
      if (!audio.ended) window.dispatchEvent(new CustomEvent('audio-state', { detail: { playing: false } }));
    };

    this.player = audio;
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
