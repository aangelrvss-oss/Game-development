import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const cases: [string, any][] = [['quietos', { mx: 0, mz: 0 }], ['quietos alzando', { mx: 0, mz: 0, lift: true }], ['a lo largo', { mx: -1, mz: 0 }], ['a lo largo alzando', { mx: -1, mz: 0, lift: true }], ['de lado', { mx: 0, mz: -0.5 }]];
for (const n of [3, 4]) for (const seed of [1, 7]) for (const [name, m] of cases) {
  const g = new Game(RAPIER as any, { humans: n, carriers: n, botStyle: 'atentos', seed });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, grab: true })));
  let minUp = 1, falls = 0;
  for (let i = 0; i < 180; i++) { g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, ...m }))); minUp = Math.min(minUp, g.sofaUp); for (const e of g.out) if (e.type === 'fall') falls++; }
  console.log(`n=${n} seed=${seed} ${name}: minUp=${minUp.toFixed(2)} integ=${g.integrity} caidas=${falls}`);
  g.dispose();
}
