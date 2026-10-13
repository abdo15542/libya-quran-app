// ============ مشغل صوت HTML5 أصلي (حل تجاوز Capacitor) ============

const QuranAudio = {
  player: null,
  currentSrc: null,
  repeatTarget: 0,
  repeatCount: 0,
  _listeners: {},
  _cache: {}, // لتخزين الملفات المسحوبة

  load(url) {
    if (this.player) {
      try { this.player.pause(); } catch (e) {}
      this.player = null;
    }
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    audio.onended = () => this._onEnd();
    audio.onerror = () => {
      console.warn('❌ خطأ الصوت:', url, audio.error?.code);
      this._emit('error', { url, error: audio.error });
    };
    audio.oncanplay = () => this._emit('ready', { url });
    this.player = audio;
    this.currentSrc = url;
    return audio;
  },

  // الحل الجذري: جلب الملف كـ blob ثم تشغيله
  async playViaBlob(url) {
    try {
      // إذا كان الملف مخزناً مؤقتاً، استخدمه مباشرة
      if (this._cache[url]) {
        return this._playBlob(this._cache[url]);
      }

      console.log('🔄 جلب الصوت:', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      
      const blob = await res.blob();
      this._cache[url] = blob; // تخزين مؤقت
      
      return this._playBlob(blob);
    } catch (e) {
      console.warn('❌ فشل جلب الصوت:', e.message);
      // محاولة بديلة: استخدام الرابط مباشرة (قد يعمل أحياناً)
      this._emit('error', { url, error: e.message });
      throw e;
    }
  },

  _playBlob(blob) {
    const blobUrl = URL.createObjectURL(blob);
    if (this.player) {
      try { this.player.pause(); URL.revokeObjectURL(this.currentSrc); } catch (e) {}
    }

    const audio = new Audio();
    audio.src = blobUrl;
    audio.preload = 'auto';
    
    // أحداث
    audio.onended = () => this._onEnd();
    audio.onerror = () => {
      console.warn('❌ خطأ الصوت:', audio.error?.code);
      this._emit('error', { error: audio.error });
    };
    audio.oncanplay = () => this._emit('ready', { url: blobUrl });

    this.player = audio;
    this.currentSrc = blobUrl;

    return audio.play();
  },

  async play(url) {
    if (!url) return;
    try {
      await this.playViaBlob(url);
      this._emit('success', { url });
    } catch (err) {
      console.warn('فشل التشغيل النهائي:', err.message);
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
      try { this.player.pause(); this.player.currentTime = 0; } catch (e) {}
    }
    this.repeatCount = 0;
  },

  setRepeat(n) { this.repeatTarget = n || 0; this.repeatCount = 0; },

  _onEnd() {
    this.repeatCount++;
    if (this.repeatTarget > 0 && this.repeatCount < this.repeatTarget) {
      if (this.player) { this.player.currentTime = 0; this.player.play().catch(() => {}); }
    } else {
      this.repeatCount = 0;
      this._emit('ended', { url: this.currentSrc });
      window.dispatchEvent(new CustomEvent('audio-ended'));
    }
  },

  _emit(event, data) { (this._listeners[event] || []).forEach(cb => cb(data)); },
  on(event, cb) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(cb); },
  off(event, cb) { if (!this._listeners[event]) return; this._listeners[event] = this._listeners[event].filter(x => x !== cb); },
  once(event, cb) { const wrapper = (data) => { cb(data); this.off(event, wrapper); }; this.on(event, wrapper); },
};

window.QuranAudio = QuranAudio;
