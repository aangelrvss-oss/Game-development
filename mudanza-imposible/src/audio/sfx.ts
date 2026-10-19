// Sonidos sintetizados con WebAudio: sin archivos ni licencias de terceros.
// Funciona con un AudioContext normal (juego) o con un OfflineAudioContext (pista de audio de las grabaciones).
export type SfxName = 'grab' | 'release' | 'slip' | 'impact' | 'crash' | 'honk' | 'stun' | 'beep' | 'pedTick' | 'checkpoint' | 'win' | 'lose' | 'hop' | 'step' | 'thud' | 'wobble' | 'fall';

export class Sfx {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  /** Instante absoluto (s) en el que suena lo siguiente; null = ahora. Solo para render sin conexión. */
  at: number | null = null;
  /** Se llama con cada sonido pedido (para reconstruir la pista de audio de una grabación). */
  onPlay: ((name: SfxName, args: number[]) => void) | null = null;

  /** Debe llamarse tras un gesto del usuario (los navegadores lo exigen). */
  unlock() {
    if (!this.ctx) {
      try {
        this.useContext(new AudioContext());
      } catch { this.ctx = null; }
    }
    if (this.ctx instanceof AudioContext) void this.ctx.resume();
  }

  useContext(ctx: BaseAudioContext, volume = 0.5) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  play(name: SfxName, ...args: number[]) {
    this.onPlay?.(name, args);
    switch (name) {
      case 'grab': return this.tone(520, 0.09, 'triangle', 0.25, 820);
      case 'release': return this.tone(700, 0.09, 'triangle', 0.2, 400);
      case 'slip': return this.tone(900, 0.25, 'sawtooth', 0.12, 250);
      case 'impact': {
        const v = Math.min(1, (args[0] ?? 4) / 8);
        this.noise(0.18 + v * 0.2, 0.25 + v * 0.5, 500 + v * 900);
        return this.tone(110, 0.25, 'sine', 0.3 + v * 0.4, 50);
      }
      case 'thud': return this.tone(90, 0.18, 'sine', 0.35, 45);
      case 'crash': this.noise(0.5, 0.9, 2400); return this.tone(160, 0.4, 'square', 0.15, 60);
      case 'honk': this.tone(392, 0.32, 'square', 0.1); return this.tone(494, 0.32, 'square', 0.08);
      case 'stun': this.tone(300, 0.45, 'sine', 0.25, 900); return this.tone(600, 0.3, 'sine', 0.12, 1400, 0.1);
      case 'beep': return this.tone(args[0] ? 880 : 520, args[0] ? 0.35 : 0.16, 'square', 0.12);
      case 'pedTick': return this.tone(1200, 0.04, 'square', 0.05);
      case 'step': return this.noise(0.05, 0.06, 700);
      case 'checkpoint': [660, 880].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.2, undefined, i * 0.09)); return;
      case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.25, undefined, i * 0.12)); return;
      case 'lose': [392, 349, 311, 233].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.12, undefined, i * 0.22)); return;
      case 'hop': return this.tone(260, 0.2, 'sine', 0.25, 620);
      // Tambaleo: «uy-uy-uy» que sube y baja; caída: silbido hacia abajo y golpe sordo
      case 'wobble': [0, 0.11, 0.22].forEach((d, i) => this.tone(i % 2 ? 420 : 560, 0.1, 'sine', 0.16, i % 2 ? 560 : 420, d)); return;
      case 'fall': this.tone(820, 0.32, 'sine', 0.16, 180); return this.tone(85, 0.22, 'sine', 0.4, 40, 0.3);
    }
  }

  private now() { return this.at ?? this.ctx?.currentTime ?? 0; }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slideTo?: number, delay = 0) {
    const c = this.ctx, m = this.master;
    if (!c || !m) return;
    const t = this.now() + delay;
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
    const t = this.now() + delay;
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
}

/** Pista WAV (PCM 16 bits, mono) a partir de una lista de sonidos con su instante. */
export async function renderTrack(events: { t: number; name: SfxName; args: number[] }[], duration: number, sampleRate = 44100): Promise<string> {
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);
  const s = new Sfx();
  s.useContext(ctx, 0.55);
  for (const e of events) {
    if (e.t < 0 || e.t >= duration) continue;
    s.at = e.t;
    s.play(e.name, ...e.args);
  }
  const buf = await ctx.startRendering();
  const data = buf.getChannelData(0);
  const bytes = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o: number, str: string) => { for (let i = 0; i < str.length; i++) bytes.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); bytes.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
  bytes.setUint32(24, sampleRate, true); bytes.setUint32(28, sampleRate * 2, true);
  bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); w(36, 'data'); bytes.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  let bin = '';
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
