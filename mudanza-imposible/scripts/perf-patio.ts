// Coste por paso de simulación en el «Patio de pruebas», con sus 7 objetos (ciclo 2, T-perf), frente al nivel de
// referencia («La calle», un solo objeto), con los mismos jugadores llevados por el piloto. Solo se mide `Game.step` (no
// el piloto). Cada caso se repite `RUNS` veces y se da la mediana de los milisegundos por paso. Referencia del ciclo: el
// coste por paso del patio no debe pasar de 2 veces el de «La calle».
// Uso: npm run perf:patio   (o npx vite-node scripts/perf-patio.ts)
import RAPIER from '@dimforge/rapier3d-compat';
import { CALLE } from '../src/levels/calle';
import { PATIO } from '../src/levels/patio';
import type { LevelDef } from '../src/levels/types';
import { Autopilot } from '../src/sim/autopilot';
import { Game } from '../src/sim/game';

await RAPIER.init({});
const DT = 1 / 60, RUNS = 5, SECONDS = 40;

/** Milisegundos por paso de `Game.step` en `SECONDS` s de partida (o hasta que acabe) con `humans` jugadores. */
function cost(level: LevelDef, humans: number) {
  const g = new Game(RAPIER, { level, humans, carriers: humans, botStyle: 'atentos', seed: 1 });
  const aps = Autopilot.team(g);
  let ms = 0, steps = 0;
  for (let i = 0; i < 60 * (SECONDS + 3) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const inputs = aps.map((a) => a.input(g, DT));
    const t0 = performance.now();
    g.step(DT, inputs);
    ms += performance.now() - t0; steps++;
  }
  const r = { ms: ms / steps, steps, items: g.items.length, bodies: g.world.bodies.len(), colliders: g.world.colliders.len() };
  g.dispose();
  return r;
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const humans of [2, 4]) {
  const calle: number[] = [], patio: number[] = [];
  let info = { c: cost(CALLE, humans), p: cost(PATIO, humans) }; // calentamiento (y tamaño de cada mundo)
  for (let k = 0; k < RUNS; k++) {
    const c = cost(CALLE, humans), p = cost(PATIO, humans);
    calle.push(c.ms); patio.push(p.ms);
    info = { c, p };
  }
  const mc = median(calle), mp = median(patio);
  console.log(`${humans} jugadores: «La calle» (${info.c.items} objeto, ${info.c.bodies} cuerpos, ${info.c.colliders} colliders) ${mc.toFixed(3)} ms por paso`
    + ` | «Patio de pruebas» (${info.p.items} objetos, ${info.p.bodies} cuerpos, ${info.p.colliders} colliders) ${mp.toFixed(3)} ms por paso`
    + ` | patio / calle = ${(mp / mc).toFixed(2)} (referencia: ≤ 2) | mediana de ${RUNS}: calle [${calle.map((v) => v.toFixed(3)).join(', ')}], patio [${patio.map((v) => v.toFixed(3)).join(', ')}]`);
}
