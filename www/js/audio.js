// ============ مشغل الصوت ============

const QuranAudio = {
  player: null,
  currentBlobUrl: null,
  repeatTarget: 0,
  repeatCount: 0,
  _listeners: {},
  _cache: {},

  async playUrl(url) {
    try {
      let blob = this._cache[url];
      if (!blob) {
        console.log('🌐 جلب:', url);
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        blob = await res.blob();
        this._cache[url] = blob;
      }
      return this._playBlob(blob);
    } catch (e) {
      this._emit('error', { url, error: e.message });
      throw e;
    }
  },

  async play(readerKey, surahNum) {
    const url = window.RecitersModule.buildUrl(readerKey, surahNum);
    const fallback = window.RecitersModule.buildUrlFallback(readerKey, surahNum);

    try {
      await this.playUrl(url);
      this._emit('success', { readerKey, surahNum });
      return;
    } catch (e) {
      console.warn('⚠ فشل الرابط الأساسي، تجربة البديل...');
      if (fallback) {
        await this.playUrl(fallback);
        this._emit('success', { readerKey, surahNum, fallback: true });
        return;
      }
      throw e;
    }
  },

  _playBlob(blob) {
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
    audio.onerror = () => this._emit('error', { code: audio.error?.code });

    this.player = audio;
    return audio.play();
  },

  pause() { if (this.player) { try { this.player.pause(); } catch (e) {} } },
  stop() { if (this.player) { try { this.player.pause(); this.player.currentTime = 0; } catch (e) {} } this.repeatCount = 0; },
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

  _emit(event, data) { (this._listeners[event] || []).forEach(cb => cb(data)); },
  on(event, cb) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(cb); },
  off(event, cb) { if (!this._listeners[event]) return; this._listeners[event] = this._listeners[event].filter(x => x !== cb); },
  once(event, cb) { const wrapper = (data) => { cb(data); this.off(event, wrapper); }; this.on(event, wrapper); },
};

window.QuranAudio = QuranAudio;
