import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
const K0 = RULES.wristK, D0 = RULES.wristDamp;
const variants: [string, (g: Game) => void][] = [
  ['tal cual', () => {}],
  ['sin choque cuerpo-sofá en el agarre', (g) => g.carriers.forEach((c) => c.joint?.setContactsEnabled(false))],
  ['sin muñecas (wristK=0)', () => { (RULES as any).wristK = 0; (RULES as any).wristDamp = 0; }],
  ['solo agarran los extremos', (g) => g.carriers.forEach((c, i) => { if (i >= 2) c.release(); })],
  ['solo agarran los lados', (g) => g.carriers.forEach((c, i) => { if (i < 2) c.release(); })],
];
for (const [name, patch] of variants) {
  (RULES as any).wristK = K0; (RULES as any).wristDamp = D0;
  const g = new Game(RAPIER as any, { humans: 4, carriers: 4, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, grab: true })));
  patch(g);
  const ev: string[] = []; let minUp = 1, maxW = 0;
  for (let i = 0; i < 180; i++) {
    g.step(DT, g.carriers.map(() => NO_INPUT));
    for (const e of g.out) if (['wobble','fall','gripBreak','impact'].includes(e.type)) ev.push(`${(i*DT).toFixed(1)}:${e.type}${(e as any).carrier ?? ''}`);
    minUp = Math.min(minUp, g.sofaUp); const w = g.sofa.angvel(); maxW = Math.max(maxW, Math.hypot(w.x, w.y, w.z));
  }
  console.log(`4 jugadores quietos, ${name}: minUp=${minUp.toFixed(2)} maxω=${maxW.toFixed(1)} agarran=${g.carriers.map(c=>c.holding?1:0).join('')} integ=${g.integrity} ev=${ev.slice(0,8).join(',')}`);
  g.dispose();
}
