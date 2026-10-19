// Verificación independiente ui-audio-13: ¿puede la mezcla pasar de ±1 (saturar) sin limitador?
// Node no tiene WebAudio: se reproduce numéricamente el grafo de src/audio/sfx.ts (tone() y noise() con sus
// rampas exponenciales, filtro paso bajo BiquadFilter según la especificación WebAudio con Q=1 dB, ganancia
// maestra 0,5 de useContext/toggleMute). Las ondas son ideales (no limitadas en banda): es una estimación.
// Uso: npx vite-node scripts/audit/verif-ui-audio/indep-05-pico-mezcla.ts
const FS = 48000;
const LEN = Math.ceil(FS * 1.2);
type Buf = Float64Array;

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function tone(out: Buf, freq: number, dur: number, type: string, vol: number, slideTo?: number, delay = 0) {
  const t0 = delay, i0 = Math.floor(t0 * FS), i1 = Math.min(LEN, Math.ceil((t0 + dur + 0.02) * FS));
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const t = i / FS - t0;
    const f = slideTo && t <= dur ? freq * Math.pow(slideTo / freq, t / dur) : slideTo ? slideTo : freq;
    ph += f / FS;
    const p = ph - Math.floor(ph);
    const w = type === 'sine' ? Math.sin(2 * Math.PI * p) : type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'sawtooth' ? 2 * p - 1 : 1 - 4 * Math.abs(p - 0.5);
    let g: number;
    if (t < 0.01) g = 0.0001 * Math.pow(vol / 0.0001, t / 0.01);
    else if (t < dur) g = vol * Math.pow(0.0001 / vol, (t - 0.01) / (dur - 0.01));
    else g = 0.0001;
    out[i] += w * g;
  }
}
function noise(out: Buf, dur: number, vol: number, cutoff: number, r: () => number, delay = 0) {
  const len = Math.floor(FS * dur), i0 = Math.floor(delay * FS);
  const w0 = (2 * Math.PI * cutoff) / FS, aq = Math.sin(w0) / (2 * Math.pow(10, 1 / 20)), c = Math.cos(w0);
  const a0 = 1 + aq, b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0, a1 = (-2 * c) / a0, a2 = (1 - aq) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let k = 0; k < len + FS * 0.05 && i0 + k < LEN; k++) {
    const x = k < len ? (r() * 2 - 1) * (1 - k / len) ** 2 : 0;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i0 + k] += y * vol;
  }
}
// Copia de Sfx.play (sfx.ts:37-62) para los sonidos que intervienen
function play(out: Buf, name: string, r: () => number, arg?: number) {
  switch (name) {
    case 'impact': { const v = Math.min(1, (arg ?? 4) / 8); noise(out, 0.18 + v * 0.2, 0.25 + v * 0.5, 500 + v * 900, r); tone(out, 110, 0.25, 'sine', 0.3 + v * 0.4, 50); return; }
    case 'crash': noise(out, 0.5, 0.9, 2400, r); tone(out, 160, 0.4, 'square', 0.15, 60); return;
    case 'stun': tone(out, 300, 0.45, 'sine', 0.25, 900); tone(out, 600, 0.3, 'sine', 0.12, 1400, 0.1); return;
    case 'fall': tone(out, 820, 0.32, 'sine', 0.16, 180); tone(out, 85, 0.22, 'sine', 0.4, 40, 0.3); return;
    case 'wobble': [0, 0.11, 0.22].forEach((d, i) => tone(out, i % 2 ? 420 : 560, 0.1, 'sine', 0.16, i % 2 ? 560 : 420, d)); return;
    case 'honk': tone(out, 392, 0.32, 'square', 0.1); tone(out, 494, 0.32, 'square', 0.08); return;
  }
}
const scenarios: [string, [string, number?][]][] = [
  ['impact(8) solo', [['impact', 8]]],
  ['crash solo', [['crash']]],
  ['carHit al sofá: crash + impact(8)', [['crash'], ['impact', 8]]],
  ['carHit a porteador: crash + stun', [['crash'], ['stun']]],
  ['crash + impact(8) + stun', [['crash'], ['impact', 8], ['stun']]],
  ['crash + impact(8) + stun + fall + honk', [['crash'], ['impact', 8], ['stun'], ['fall'], ['honk']]],
  ['2 atropellos a porteadores + impact(8): 2×crash + 2×stun + impact', [['crash'], ['crash'], ['stun'], ['stun'], ['impact', 8]]],
  ['3×crash + 3×stun + impact(8) + 2×fall', [['crash'], ['crash'], ['crash'], ['stun'], ['stun'], ['stun'], ['impact', 8], ['fall'], ['fall']]],
];
const MASTER = 0.5;
console.log('Pico |muestra| a la salida (master 0,5), 200 realizaciones del ruido por escenario:');
for (const [label, evs] of scenarios) {
  const peaks: number[] = [];
  for (let s = 0; s < 200; s++) {
    const r = rng(s * 101 + 7);
    const out = new Float64Array(LEN);
    for (const [n, a] of evs) play(out, n, r, a);
    let pk = 0; for (let i = 0; i < LEN; i++) pk = Math.max(pk, Math.abs(out[i] * MASTER));
    peaks.push(pk);
  }
  peaks.sort((a, b) => a - b);
  const over = peaks.filter((p) => p > 1).length;
  console.log(`  ${label.padEnd(42)} mediana ${peaks[100].toFixed(2)}  máx ${peaks[199].toFixed(2)}  >1,0 en ${over}/200`);
}
