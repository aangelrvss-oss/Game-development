import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
const cases: [string, (t: number) => { mx: number; mz: number; lift: boolean }][] = [
  ['quietos', () => ({ mx: 0, mz: 0, lift: false })],
  ['quietos alzando', () => ({ mx: 0, mz: 0, lift: true })],
  ['eje largo (mx=-1)', () => ({ mx: -1, mz: 0, lift: false })],
  ['eje largo alzando', () => ({ mx: -1, mz: 0, lift: true })],
  ['de lado (mz=-1) a media velocidad', () => ({ mx: 0, mz: -0.5, lift: false })],
];
for (const n of [3, 4]) for (const [name, f] of cases) {
  const g = new Game(RAPIER as any, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, grab: true })));
  const ev: string[] = []; let minUp = 1; const s0 = g.sofaPos; let maxW = 0;
  for (let i = 0; i < 180; i++) {
    const t = i * DT; const m = f(t);
    g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, ...m })));
    for (const e of g.out) if (['wobble','fall','gripBreak','impact'].includes(e.type)) ev.push(`${t.toFixed(1)}:${e.type}${(e as any).carrier ?? ''}${'damage' in e ? '(-' + (e as any).damage + ')' : ''}`);
    minUp = Math.min(minUp, g.sofaUp);
    const w = g.sofa.angvel(); maxW = Math.max(maxW, Math.hypot(w.x, w.y, w.z));
  }
  console.log(`n=${n} ${name}: dist=${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} minUp=${minUp.toFixed(2)} maxω=${maxW.toFixed(1)} agarran=${g.carriers.map(c=>c.holding?1:0).join('')} integ=${g.integrity} ev=${ev.join(',')}`);
  g.dispose();
}
