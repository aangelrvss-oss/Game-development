import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { yawQuat } from '../../../src/sim/sofa.ts';
import { CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
function run(rear: number, front: number, lift: boolean, wobblyX = 0) {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const z0 = -19.5;
  g.sofa.setTranslation({ x: 0, y: 0.6, z: z0 }, true);
  g.sofa.setRotation(yawQuat(Math.PI / 2), true);
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.carriers[0].teleport({ x: 0, y: CENTER_Y + 0.05, z: z0 + 1.55 }); g.carriers[0].facing = { x: 0, z: -1 };
  g.carriers[1].teleport({ x: 0, y: CENTER_Y + 0.05, z: z0 - 1.55 }); g.carriers[1].facing = { x: 0, z: 1 };
  for (let i = 0; i < 20; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.step(DT, [{ ...NO_INPUT, grab: true }, { ...NO_INPUT, grab: true }]);
  let top = -1, ev: string[] = [], air = [0, 0];
  for (let i = 0; i < 60 * 15; i++) {
    const t = i * DT;
    const wx = wobblyX ? Math.sin(t * 3) * wobblyX : 0;
    g.step(DT, [{ ...NO_INPUT, mz: -rear, mx: wx, lift }, { ...NO_INPUT, mz: -front, mx: -wx, lift }]);
    g.carriers.forEach((c, k) => { if (!c.grounded) air[k] += DT; });
    for (const e of g.out) if (['wobble','fall','gripBreak'].includes(e.type)) ev.push(`${t.toFixed(1)}:${e.type}${(e as any).carrier}`);
    if (g.sofaPos.y > 2.6 && top < 0) { top = t; break; }
  }
  const r = `rear=${rear} front=${front} lift=${lift} wob=${wobblyX} -> ${top > 0 ? 'ARRIBA en ' + top.toFixed(2) + ' s' : 'NO sube (z=' + g.sofaPos.z.toFixed(2) + ' y=' + g.sofaPos.y.toFixed(2) + ')'} aire(s)=[${air.map(a=>a.toFixed(1))}] holding=${g.carriers.map(c=>c.holding?1:0).join('')} ev=${ev.join(',')}`;
  g.dispose();
  return r;
}
for (const lift of [false, true]) {
  console.log(run(1, 1, lift));
  console.log(run(1, 0, lift));
  console.log(run(0, 1, lift));
  console.log(run(1, 0.5, lift));
  console.log(run(0.5, 1, lift));
  console.log(run(1, 1, lift, 0.5));
}
