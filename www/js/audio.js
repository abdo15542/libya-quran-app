// ============ مشغل صوت HTML5 أصلي ============

const QuranAudio = {
  player: null,
  currentSrc: null,
  repeatTarget: 0,
  repeatCount: 0,
  _listeners: {},

  load(url) {
    if (this.player) {
      try { this.player.pause(); } catch (e) {}
      this.player = null;
    }

    const audio = new Audio();  // ← Audio الأصلي الآن (لأننا سمّينا كائننا QuranAudio)
    audio.preload = 'auto';
    audio.src = url;
    // لا نضع crossOrigin (يسبب مشاكل CORS)

    audio.onended = () => this._onEnd();
    audio.onerror = () => {
      console.warn('❌ خطأ الصوت:', url, audio.error?.code);
      this._emit('error', { url, error: audio.error });
    };
    audio.oncanplay = () => this._emit('ready', { url });
    audio.onplay = () => this._emit('play', { url });
    audio.onpause = () => this._emit('pause', { url });
    audio.onwaiting = () => this._emit('waiting', { url });
    audio.onplaying = () => this._emit('playing', { url });

    this.player = audio;
    this.currentSrc = url;
    return audio;
  },

  async play(url) {
    if (!url) return;

    if (this.currentSrc === url && this.player) {
      try { await this.player.play(); return; } catch (e) {}
    }

    const audio = this.load(url);

    try {
      await audio.play();
      this._emit('success', { url });
    } catch (err) {
      console.warn('فشل التشغيل:', err.message);
      this._emit('error', { url, error: err.message });
    }
  },

  pause() {
    if (this.player) {
      try { this.player.pause(); } catch (e) {}
    }
  },

  stop() {
    if (this.player) {
      try {
        this.player.pause();
        this.player.currentTime = 0;
      } catch (e) {}
    }
    this.repeatCount = 0;
  },

  setRepeat(n) {
    this.repeatTarget = n || 0;
    this.repeatCount = 0;
  },

  _onEnd() {
    this.repeatCount++;
    if (this.repeatTarget > 0 && this.repeatCount < this.repeatTarget) {
      if (this.player) {
        this.player.currentTime = 0;
        this.player.play().catch(() => {});
      }
    } else {
      this.repeatCount = 0;
      this._emit('ended', { url: this.currentSrc });
      window.dispatchEvent(new CustomEvent('audio-ended'));
    }
  },

  _emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  },

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  },

  off(event, cb) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(x => x !== cb);
  },

  once(event, cb) {
    const wrapper = (data) => {
      cb(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  },
};

window.QuranAudio = QuranAudio;
