// Mediciones de los niveles como datos (ciclo 2, paso 2): tiempos del recorrido de «La calle» con el piloto (humanos
// y ayudantes), hasta que el sofá queda cargado dentro del camión, y coste por paso de simulación en los dos niveles.
// Uso: npx vite-node scripts/level-measure.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { CALLE } from '../src/levels/calle';
import { PATIO } from '../src/levels/patio';
import type { LevelDef } from '../src/levels/types';
import { Autopilot } from '../src/sim/autopilot';
import { Game } from '../src/sim/game';

await RAPIER.init({});
const DT = 1 / 60;

/** Partida con el piloto (un piloto por humano, con la ruta compartida) hasta ganar, perder o `max` s. */
function run(level: LevelDef, humans: number, carriers: number, style: 'atentos' | 'despistados', seed: number, max = 200) {
  const g = new Game(RAPIER, { level, humans, carriers, botStyle: style, seed });
  const aps = humans === 1 ? [new Autopilot(0)] : Autopilot.team(g);
  let falls = 0, steps = 0, ms = 0;
  const marks: string[] = [];
  for (let i = 0; i < 60 * max && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const inputs = aps.map((a) => a.input(g, DT));
    const t0 = performance.now();
    g.step(DT, inputs);
    ms += performance.now() - t0; steps++;
    for (const e of g.out) {
      if (e.type === 'fall') falls++;
      if (e.type === 'stage' || e.type === 'itemLoaded') marks.push(`${e.type === 'stage' ? e.label : 'cargado'}@${g.time.toFixed(1)}`);
    }
  }
  const r = { phase: g.phase, time: g.time, integrity: g.integrity, falls, marks, msPerStep: ms / steps, steps };
  g.dispose();
  return r;
}

console.log('— «La calle»: recorrido con el piloto hasta dentro del camión —');
for (const n of [2, 3, 4]) {
  const r = run(CALLE, n, n, 'atentos', 1);
  console.log(`${n} humanos: ${r.phase} ${r.time.toFixed(2)} s, integridad ${r.integrity}, caídas ${r.falls} | ${r.marks.join(' ')}`);
}
for (const [n, style, seed] of [[2, 'atentos', 1], [4, 'atentos', 3], [4, 'despistados', 2]] as const) {
  const r = run(CALLE, 1, n, style, seed);
  console.log(`1 humano y ${n - 1} ayudantes ${style} (semilla ${seed}): ${r.phase} ${r.time.toFixed(2)} s, integridad ${r.integrity}, caídas ${r.falls}`);
}

console.log('— Coste por paso de simulación —');
for (const n of [2, 4]) {
  const c = run(CALLE, n, n, 'atentos', 1), p = run(PATIO, n, n, 'atentos', 1, 60);
  console.log(`${n} humanos: «La calle» ${c.msPerStep.toFixed(3)} ms (${c.steps} pasos); «Patio de pruebas», 7 objetos, ${p.msPerStep.toFixed(3)} ms (${p.steps} pasos)`);
}
