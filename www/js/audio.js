// ============ مشغل الصوت — يقرأ من التخزين المحلي أولاً ============

const QuranAudio = {
  player: null,
  currentSrc: null,
  currentBlobUrl: null,
  repeatTarget: 0,
  repeatCount: 0,
  _listeners: {},

  async play(readerKey, surahNum, ayahNum) {
    const key = readerKey + '_' + surahNum;
    
    try {
      // 1. جرّب من IndexedDB أولاً
      let blob = null;
      if (window.AudioDownloader) {
        blob = await AudioDownloader.get(key);
      }
      
      // 2. إذا لم يوجد محلياً، حمّله من الإنترنت
      if (!blob) {
        const url = window.RecitersModule.buildUrl(readerKey, surahNum, ayahNum || 1);
        console.log('🌐 تحميل من الإنترنت:', url);
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        blob = await res.blob();
      } else {
        console.log('💾 تشغيل من التخزين المحلي');
      }
      
      // 3. شغّل
      await this._playBlob(blob);
      this._emit('success', { readerKey, surahNum });
      return true;
    } catch (e) {
      console.warn('❌ فشل التشغيل:', e.message);
      this._emit('error', { error: e.message });
      throw e;
    }
  },

  _playBlob(blob) {
    // ألغِ الرابط السابق
    if (this.currentBlobUrl) {
      try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
    }

    const blobUrl = URL.createObjectURL(blob);
    this.currentBlobUrl = blobUrl;

    if (this.player) {
      try { this.player.pause(); } catch (e) {}
    }

    const audio = new Audio();
    audio.src = blobUrl;
    audio.preload = 'auto';

    audio.onended = () => this._onEnd();
    audio.onerror = () => {
      console.warn('❌ خطأ الصوت:', audio.error?.code);
      this._emit('error', { code: audio.error?.code });
    };
    audio.oncanplay = () => this._emit('ready', {});

    this.player = audio;
    this.currentSrc = blobUrl;

    return audio.play();
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
      if (this.player) {
        this.player.currentTime = 0;
        this.player.play().catch(() => {});
      }
    } else {
      this.repeatCount = 0;
      this._emit('ended', {});
      window.dispatchEvent(new CustomEvent('audio-ended'));
    }
  },

  _emit(event, data) { (this._listeners[event] || []).forEach(cb => cb(data)); },
  on(event, cb) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(cb); },
  off(event, cb) { if (!this._listeners[event]) return; this._listeners[event] = this._listeners[event].filter(x => x !== cb); },
  once(event, cb) { const wrapper = (data) => { cb(data); this.off(event, wrapper); }; this.on(event, wrapper); },
};

window.QuranAudio = QuranAudio;
