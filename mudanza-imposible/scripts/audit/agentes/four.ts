import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES, isCoop } from '../../../src/sim/game.ts';
import { yawQuat } from '../../../src/sim/sofa.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
for (const n of [1, 2, 3, 4]) {
  for (const lift of [false, true]) {
    const g = new Game(RAPIER as any, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
    for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
    // agarran desde la posición de salida (frente a su asa)
    for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
    g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, grab: true })));
    const held = g.carriers.map(c => c.holding ? 1 : 0).join('');
    const s0 = g.sofaPos; const ev: string[] = []; let pen = 0, maxUpDev = 1;
    for (let i = 0; i < 60 * 3; i++) {
      g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, mz: -1, lift })));
      for (const e of g.out) if (['wobble','fall','gripBreak','impact'].includes(e.type)) ev.push(`${(i*DT).toFixed(1)}:${e.type}${(e as any).carrier ?? ''}`);
      for (const c of g.carriers) for (const s of g.sofaColliders) { const k = c.collider.contactCollider(s, 0); if (k && k.distance < 0) pen = Math.max(pen, -k.distance); }
      maxUpDev = Math.min(maxUpDev, g.sofaUp);
    }
    const d = Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z);
    console.log(`n=${n} coop=${isCoop({humans:n,carriers:n,botStyle:'atentos'})} lift=${lift} agarran=${held} -> 3 s: ${d.toFixed(2)} m, y=${g.sofaPos.y.toFixed(2)}, min up=${maxUpDev.toFixed(2)}, penetración máx=${(pen*100).toFixed(1)} cm, sigue agarrando=${g.carriers.map(c=>c.holding?1:0).join('')} integ=${g.integrity} ev=${ev.join(',')}`);
    g.dispose();
  }
}
