const Audio = {
  player: null,
  currentSrc: null,
  repeatCount: 0,
  repeatTarget: 0,

  load(url) {
    if (this.player) this.player.unload();
    this.player = new Howl({
      src: [url],
      html5: true,
      onend: () => this.onEnd(),
      onloaderror: () => console.warn('خطأ تحميل الصوت'),
    });
    this.currentSrc = url;
    return this.player;
  },
  play(url) {
    if (this.currentSrc !== url) this.load(url);
    this.player.play();
  },
  pause() { if (this.player) this.player.pause(); },
  stop() { if (this.player) this.player.stop(); },
  setRepeat(n) { this.repeatTarget = n; this.repeatCount = 0; },
  onEnd() {
    this.repeatCount++;
    if (this.repeatTarget > 0 && this.repeatCount < this.repeatTarget) {
      this.player.play();
    } else {
      this.repeatCount = 0;
      window.dispatchEvent(new CustomEvent('audio-ended'));
    }
  },
};

window.Audio = Audio;
