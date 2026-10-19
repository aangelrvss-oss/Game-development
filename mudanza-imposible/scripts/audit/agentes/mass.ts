import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { SOFA } from '../../../src/sim/sofa.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
for (const m of [90, 300, 1000]) for (const both of [true, false]) {
  (SOFA as any).coopMass = m;
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.step(DT, [{ ...NO_INPUT, grab: true }, { ...NO_INPUT, grab: both }]);
  for (let i = 0; i < 60; i++) g.step(DT, [{ ...NO_INPUT, lift: true }, { ...NO_INPUT, lift: both }]);
  const y = g.sofaPos.y; const s0 = g.sofaPos; const ev: string[] = [];
  for (let i = 0; i < 180; i++) { g.step(DT, [{ ...NO_INPUT, mz: -1, lift: true }, { ...NO_INPUT, mz: both ? -1 : 0, lift: both }]); for (const e of g.out) if (['wobble','fall','gripBreak'].includes(e.type)) ev.push(e.type); }
  const end0 = g.carriers[0].grabWorld(g.sofa);
  console.log(`masa=${m} kg ${both ? 'dos' : 'uno'} alzando: centro y=${y.toFixed(2)} (en reposo 0,20), extremo agarrado y=${end0 ? end0.y.toFixed(2) : '-'}; 3 s empujando: ${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} m; ev=${ev.join(',')}`);
  g.dispose();
}
