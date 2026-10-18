// Sonidos sintetizados con WebAudio: sin archivos ni licencias de terceros.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Debe llamarse tras un gesto del usuario (los navegadores lo exigen). */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch { this.ctx = null; }
    }
    void this.ctx?.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slideTo?: number, delay = 0) {
    const c = this.ctx, m = this.master;
    if (!c || !m) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(m);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, cutoff = 1200, delay = 0) {
    const c = this.ctx, m = this.master;
    if (!c || !m) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(m);
    s.start(t);
  }

  grab() { this.tone(520, 0.09, 'triangle', 0.25, 820); }
  release() { this.tone(700, 0.09, 'triangle', 0.2, 400); }
  slip() { this.tone(900, 0.25, 'sawtooth', 0.12, 250); }
  impact(strength: number) {
    const v = Math.min(1, strength / 8);
    this.noise(0.18 + v * 0.2, 0.25 + v * 0.5, 500 + v * 900);
    this.tone(110, 0.25, 'sine', 0.3 + v * 0.4, 50);
  }
  crash() { this.noise(0.5, 0.9, 2400); this.tone(160, 0.4, 'square', 0.15, 60); }
  honk() { this.tone(392, 0.32, 'square', 0.1); this.tone(494, 0.32, 'square', 0.08); }
  stun() { this.tone(300, 0.45, 'sine', 0.25, 900); this.tone(600, 0.3, 'sine', 0.12, 1400, 0.1); }
  beep(high = false) { this.tone(high ? 880 : 520, high ? 0.35 : 0.16, 'square', 0.12); }
  pedTick() { this.tone(1200, 0.04, 'square', 0.05); }
  checkpoint() { [660, 880].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.2, undefined, i * 0.09)); }
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.25, undefined, i * 0.12)); }
  lose() { [392, 349, 311, 233].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.12, undefined, i * 0.22)); }
  hop() { this.tone(260, 0.2, 'sine', 0.25, 620); }
}
