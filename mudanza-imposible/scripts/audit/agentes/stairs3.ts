import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { yawQuat, worldToLocal } from '../../../src/sim/sofa.ts';
import { CENTER_Y, CARRIER } from '../../../src/sim/carrier.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
const lift = process.argv[2] === 'lift';
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
const contacts = (c: any) => { const out: string[] = []; g.world.contactPairsWith(c.collider, (o: any) => { g.world.contactPair(c.collider, o, (m: any) => { if (m.numContacts() > 0) { const n = m.normal(); out.push(`${o.parent().isFixed() ? 'F' : o.parent().handle === g.sofa.handle ? 'SOFA' : 'D'}(${n.y.toFixed(2)},${n.z.toFixed(2)})`); } }); }); return out.join(' '); };
for (let i = 0; i < 60 * 4; i++) {
  g.step(DT, [{ ...NO_INPUT, mz: -1, lift }, { ...NO_INPUT, mz: -1, lift }]);
  if (i % 6 === 0) {
    const s = g.sofaPos, w = g.sofa.angvel();
    // pitch del eje largo
    const up = g.sofaUp;
    console.log(`t=${(i*DT).toFixed(2)} sofa y=${s.y.toFixed(2)} z=${s.z.toFixed(2)} up=${up.toFixed(3)} ` + g.carriers.map((c, k) => { const p = c.pos, v = c.body.linvel(); return `C${k}[y=${p.y.toFixed(2)} z=${p.z.toFixed(2)} vy=${v.y.toFixed(2)} vz=${v.z.toFixed(2)} gr=${c.grounded?1:0} anc=(${c.anchorCur.y.toFixed(2)},${c.anchorCur.z.toFixed(2)}) ${contacts(c)}]`; }).join(' '));
  }
}
