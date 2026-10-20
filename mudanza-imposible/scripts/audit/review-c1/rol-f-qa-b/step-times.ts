// Revisión independiente C1, rol F. Distribución del tiempo por paso de simulación (no solo la media que da
// scripts/perf.ts): p50, p99, p99,9 y máximo, y cuántos pasos pasan de 4 ms y de 16,7 ms (un fotograma entero).
// Casos: el recorrido con ayudantes (1 humano + n), el recorrido con 2-4 humanos (Autopilot.team) y caídas en grupo.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa-b/step-times.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
await RAPIER.init({});
const DT = 1 / 60;

function stats(name: string, t: number[]) {
  const s = [...t].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  console.log(`${name.padEnd(34)} pasos ${String(s.length).padStart(5)} media ${mean.toFixed(3)} p50 ${q(0.5).toFixed(3)} p99 ${q(0.99).toFixed(3)} p99.9 ${q(0.999).toFixed(3)} max ${s[s.length - 1].toFixed(2)} ms; >4 ms: ${s.filter((x) => x > 4).length}, >16,7 ms: ${s.filter((x) => x > 16.7).length}`);
}

// Calentamiento del JIT
{ const g = new Game(RAPIER, { humans: 1, carriers: 4, botStyle: 'atentos', seed: 9 }); const ap = new Autopilot(0); for (let i = 0; i < 1200; i++) g.step(DT, [ap.input(g, DT)]); g.dispose(); }

for (const [n, style] of [[2, 'atentos'], [4, 'atentos'], [6, 'atentos'], [6, 'despistados']] as const) {
  const t: number[] = [];
  for (const seed of [1, 2, 3]) {
    const g = new Game(RAPIER, { humans: 1, carriers: n, botStyle: style, seed });
    const ap = new Autopilot(0);
    for (let i = 0; i < 60 * 120 && (g.phase === 'countdown' || g.phase === 'playing'); i++) { const a = ap.input(g, DT); const t0 = performance.now(); g.step(DT, [a]); t.push(performance.now() - t0); }
    g.dispose();
  }
  stats(`1 humano + ${n - 1} ${style}`, t);
}
for (const n of [2, 3, 4]) {
  const t: number[] = [];
  const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  const aps = Autopilot.team(g);
  for (let i = 0; i < 60 * 120 && (g.phase === 'countdown' || g.phase === 'playing'); i++) { const a = aps.map((p) => p.input(g, DT)); const t0 = performance.now(); g.step(DT, a); t.push(performance.now() - t0); }
  g.dispose();
  stats(`${n} humanos (Autopilot.team)`, t);
}
// Caídas en grupo: 4 porteadores derribados a la vez junto al sofá (consultas de forma de planFall/roomToRise)
{
  const t: number[] = [];
  for (let rep = 0; rep < 20; rep++) {
    const g = new Game(RAPIER, { humans: 4, carriers: 4, botStyle: 'atentos', seed: 1 });
    g.phase = 'playing'; g.countdown = 0;
    for (let i = 0; i < 20; i++) g.step(DT, []);
    g.carriers.forEach((c, k) => c.knockDown({ x: Math.cos(k + rep), z: Math.sin(k + rep) }, 1.3, 'balance'));
    for (let i = 0; i < 150; i++) { const t0 = performance.now(); g.step(DT, []); t.push(performance.now() - t0); }
    g.dispose();
  }
  stats('4 caídas a la vez junto al sofá', t);
}
