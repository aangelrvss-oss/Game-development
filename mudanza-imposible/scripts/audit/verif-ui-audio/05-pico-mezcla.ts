// Verificación ui-audio-13: ¿puede saturar la mezcla (una sola ganancia maestra 0,5, sin compresor)?
// Re-implementación numérica de Sfx.tone()/noise() (src/audio/sfx.ts:67-98) con los MISMOS parámetros que play():
// envolventes exponenciales, osciladores (seno/cuadrada/diente de sierra/triángulo ideales, amplitud 1) y el
// filtro paso bajo biquad de WebAudio (Q por defecto = 1 dB). Aproximación: los osciladores reales de WebAudio
// están limitados en banda (la cuadrada tiene algo de sobreimpulso de Gibbs), así que el pico real puede ser algo mayor.
// Uso: npx vite-node scripts/audit/verif-ui-audio/05-pico-mezcla.ts
const SR = 44100, MASTER = 0.5, LEN = Math.ceil(SR * 1.6);
type Buf = Float64Array;
function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const expRamp = (v0: number, v1: number, t0: number, t1: number, t: number) => v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
function tone(out: Buf, freq: number, dur: number, type: string, vol: number, slideTo?: number, delay = 0) {
  let phase = 0;
  for (let i = Math.floor(delay * SR); i < Math.min(LEN, Math.floor((delay + dur + 0.02) * SR)); i++) {
    const t = i / SR - delay;
    const f = slideTo ? expRamp(freq, slideTo, 0, dur, Math.min(t, dur)) : freq;
    phase += f / SR;
    const p = phase % 1;
    const w = type === 'sine' ? Math.sin(2 * Math.PI * p) : type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'sawtooth' ? 2 * p - 1 : 1 - 4 * Math.abs(p - 0.5);
    const g = t < 0.01 ? expRamp(0.0001, vol, 0, 0.01, t) : t <= dur ? expRamp(vol, 0.0001, 0.01, dur, t) : 0.0001;
    out[i] += w * g;
  }
}
function noise(out: Buf, dur: number, vol: number, cutoff: number, r: () => number, delay = 0) {
  const n = Math.floor(SR * dur);
  // Biquad paso bajo (Audio EQ Cookbook, Q de WebAudio en dB)
  const w0 = (2 * Math.PI * cutoff) / SR, alpha = Math.sin(w0) / (2 * Math.pow(10, 1 / 20));
  const b0 = (1 - Math.cos(w0)) / 2, b1 = 1 - Math.cos(w0), b2 = b0, a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const s0 = Math.floor(delay * SR);
  for (let i = 0; i < n + 200 && s0 + i < LEN; i++) {
    const x = i < n ? (r() * 2 - 1) * (1 - i / n) ** 2 : 0;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[s0 + i] += y * vol;
  }
}
// Copias de play() (sfx.ts:40-61) para los sonidos fuertes
const SFX: Record<string, (o: Buf, r: () => number) => void> = {
  impact8: (o, r) => { const v = Math.min(1, 8 / 8); noise(o, 0.18 + v * 0.2, 0.25 + v * 0.5, 500 + v * 900, r); tone(o, 110, 0.25, 'sine', 0.3 + v * 0.4, 50); },
  crash: (o, r) => { noise(o, 0.5, 0.9, 2400, r); tone(o, 160, 0.4, 'square', 0.15, 60); },
  stun: (o) => { tone(o, 300, 0.45, 'sine', 0.25, 900); tone(o, 600, 0.3, 'sine', 0.12, 1400, 0.1); },
  fall: (o) => { tone(o, 820, 0.32, 'sine', 0.16, 180); tone(o, 85, 0.22, 'sine', 0.4, 40, 0.3); },
  honk: (o) => { tone(o, 392, 0.32, 'square', 0.1); tone(o, 494, 0.32, 'square', 0.08); },
  // varias bocinas de coches distintos que empiezan en pasos de simulación consecutivos (1/60 s)
  honk3: (o) => { for (const d of [0, 1 / 60, 2 / 60]) { tone(o, 392, 0.32, 'square', 0.1, undefined, d); tone(o, 494, 0.32, 'square', 0.08, undefined, d); } },
  honk6: (o) => { for (let k = 0; k < 6; k++) { const d = k / 60; tone(o, 392, 0.32, 'square', 0.1, undefined, d); tone(o, 494, 0.32, 'square', 0.08, undefined, d); } },
};
function peak(names: string[], seed: number) {
  const o = new Float64Array(LEN);
  const r = rng(seed);
  for (const n of names) SFX[n](o, r);
  let m = 0; for (const v of o) m = Math.max(m, Math.abs(v * MASTER));
  return m;
}
const combos = [['impact8'], ['crash'], ['crash', 'impact8'], ['crash', 'stun'], ['impact8', 'fall'], ['crash', 'impact8', 'stun'], ['crash', 'impact8', 'fall'], ['crash', 'impact8', 'stun', 'honk'], ['honk3'], ['honk6'], ['crash', 'impact8', 'honk3'], ['crash', 'impact8', 'honk6']];
console.log('Pico de salida (|muestra| tras la ganancia maestra 0,5); >1,0 = recorte en el destino. 20 semillas de ruido.');
for (const c of combos) {
  const ps = Array.from({ length: 20 }, (_, i) => peak(c, i + 1));
  const over = ps.filter((p) => p > 1).length;
  console.log(`  ${c.join(' + ').padEnd(32)} pico mín ${Math.min(...ps).toFixed(2)}  máx ${Math.max(...ps).toFixed(2)}  semillas que recortan: ${over}/20`);
}
