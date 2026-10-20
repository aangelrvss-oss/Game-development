// Amplitud del temblor en los peores casos de estabilidad.ts: segunda diferencia de la posición (mm) y del giro
// (grados) fotograma a fotograma, y tiempo en el tope de giro de clampLoads (6 rad/s).
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/temblor.ts
import { init, setup, play, inp, f2, box, DT, NO_INPUT, OPEN, standY } from './comun';
import type { PlayerInput } from '../../../../src/sim/types';
await init();

const shapes = { cubo: { x: 0.25, y: 0.25, z: 0.25 }, tablon: { x: 1.2, y: 0.05, z: 0.2 }, armario: { x: 0.45, y: 0.9, z: 0.3 } };
const cases: [keyof typeof shapes, number, number, string][] = [
  ['tablon', 150, 1, 'quietos'], ['cubo', 250, 3, 'andar'], ['cubo', 150, 2, 'andar'], ['armario', 10, 3, 'andar'],
  ['armario', 10, 4, 'zigzag'], ['cubo', 10, 4, 'tirar-opuestos'], ['cubo', 10, 3, 'tirar-opuestos'], ['cubo', 25, 1, 'invertir'],
  ['cubo', 90, 2, 'quietos'], ['armario', 250, 4, 'quietos'],
];
const input = (mode: string, n: number, i: number): PlayerInput[] => Array.from({ length: n }, (_, k) => {
  const t = i * DT;
  if (mode === 'andar') return inp({ mz: -1 });
  if (mode === 'zigzag') return inp({ mz: -1, mx: Math.sin(t * 6) });
  if (mode === 'tirar-opuestos') return inp({ mx: k % 2 ? 1 : -1 });
  if (mode === 'invertir') return inp({ mz: Math.floor(t / 0.8) % 2 ? 1 : -1 });
  return NO_INPUT;
});
for (const [s, m, n, mode] of cases) {
  const half = shapes[s];
  const g = setup(n, { x: OPEN.x - 10, z: OPEN.z - 10 });
  const { body } = box(g, m, half, { x: OPEN.x, z: OPEN.z });
  const spots = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  g.carriers.forEach((c, k) => { const sp = spots[k], off = sp.x ? half.x + 0.7 : half.z + 0.7; c.teleport({ x: OPEN.x + sp.x * off, y: standY, z: OPEN.z + sp.z * off }); c.facing = { x: -sp.x, z: -sp.z }; });
  play(g, 0.4);
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  play(g, 1.0);
  const P: { x: number; y: number; z: number }[] = [], Q: { x: number; y: number; z: number; w: number }[] = [];
  let atCap = 0;
  play(g, 4, (_g, i) => input(mode, n, i), () => {
    P.push({ ...body.translation() }); Q.push({ ...body.rotation() });
    const w = body.angvel(); if (Math.hypot(w.x, w.y, w.z) > 5.9) atCap++;
  });
  let maxD = 0, rms = 0, maxA = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const d = Math.hypot(P[i].x - (P[i - 1].x + P[i + 1].x) / 2, P[i].y - (P[i - 1].y + P[i + 1].y) / 2, P[i].z - (P[i - 1].z + P[i + 1].z) / 2);
    maxD = Math.max(maxD, d); rms += d * d;
    // Ángulo entre la rotación i y la media de i-1 e i+1 (aprox.: ángulo de q_i frente a slerp a mitad)
    const a = Q[i - 1], b = Q[i + 1], c = Q[i];
    const mid = { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z, w: a.w + b.w }, ml = Math.hypot(mid.x, mid.y, mid.z, mid.w) || 1;
    const dot = Math.abs((mid.x * c.x + mid.y * c.y + mid.z * c.z + mid.w * c.w) / ml);
    maxA = Math.max(maxA, 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI);
  }
  rms = Math.sqrt(rms / (P.length - 2));
  console.log(`${s} ${m} kg n=${n} ${mode}: temblor de posición máx ${f2(maxD * 1000)} mm (rms ${f2(rms * 1000)} mm); de giro máx ${f2(maxA)}°; fotogramas en el tope de 6 rad/s: ${atCap}`);
  g.dispose();
}
