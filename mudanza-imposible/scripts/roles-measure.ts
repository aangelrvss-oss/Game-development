// Papeles del 3.º y el 4.º jugador (ciclo 2, T-roles): el «Patio de pruebas» con el piloto repartiendo a 2, 3 y 4
// humanos en equipos por objeto, desde las tres salidas de la prueba (`tests/roles-starts.ts`). Tiempo hasta cargar
// todos los obligatorios, cuándo se carga cada objeto, caídas, daño y coste por paso. Uso:
// npx vite-node scripts/roles-measure.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { PATIO } from '../src/levels/patio';
import type { LevelDef } from '../src/levels/types';
import { Autopilot } from '../src/sim/autopilot';
import { Game } from '../src/sim/game';
import { ROLE_STARTS } from '../tests/roles-starts';

await RAPIER.init({});
const DT = 1 / 60;

function run(level: LevelDef, humans: number, max = 240) {
  const g = new Game(RAPIER, { level, humans, carriers: humans, botStyle: 'atentos', seed: 1 });
  const aps = Autopilot.team(g);
  let falls = 0, ms = 0, steps = 0;
  const marks: string[] = [];
  for (let i = 0; i < 60 * max && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const inputs = aps.map((a) => a.input(g, DT));
    const t0 = performance.now();
    g.step(DT, inputs);
    ms += performance.now() - t0; steps++;
    for (const e of g.out) {
      if (e.type === 'fall') falls++;
      if (e.type === 'itemLoaded') marks.push(`${e.id}@${g.time.toFixed(1)}`);
      if (e.type === 'itemUnloaded') marks.push(`-${e.id}@${g.time.toFixed(1)}`);
      if (e.type === 'itemBroken') marks.push(`ROTO:${e.id}@${g.time.toFixed(1)}`);
    }
  }
  const hurt = g.items.filter((it) => it.integrity < 100).map((it) => `${it.def.id} ${it.integrity}`);
  const r = { phase: g.phase, time: g.time, integrity: g.integrity, falls, marks: [...marks, ...(hurt.length ? [`daño: ${hurt.join(', ')}`] : [])], ms: ms / steps };
  g.dispose();
  return r;
}

const all: Record<number, number[]> = { 2: [], 3: [], 4: [] };
for (const [name, spawns] of Object.entries(ROLE_STARTS)) {
  for (const n of [2, 3, 4]) {
    const r = run({ ...PATIO, spawns }, n);
    all[n].push(r.time);
    console.log(`${name}, ${n} humanos: ${r.phase} ${r.time.toFixed(2)} s, integridad ${r.integrity}, caídas ${r.falls}, ${r.ms.toFixed(3)} ms/paso | ${r.marks.join(' ')}`);
  }
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const n of [2, 3, 4]) console.log(`mediana con ${n}: ${med(all[n]).toFixed(2)} s`);
console.log(`4 frente a 2: ${((1 - med(all[4]) / med(all[2])) * 100).toFixed(1)} % antes; 3 frente a 2: ${((1 - med(all[3]) / med(all[2])) * 100).toFixed(1)} % antes`);
