// Escenario controlado: sofá alineado en el pasillo, ambos agarran y empujan a tope hacia la escalera.
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { yawQuat } from '../../../src/sim/sofa.ts';
import { CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
const humans = Number(process.argv[2] ?? 2);
const liftMode = process.argv[3] ?? 'none'; // none | always | front | rear | contact
const speed = Number(process.argv[4] ?? 1);
const verbose = process.argv[5] === 'v';
const g = new Game(RAPIER as any, { humans, carriers: humans, botStyle: 'atentos', seed: 1 });
for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
// sofá en el pasillo, eje largo en z
const z0 = Number(process.env.Z0 ?? -17);
g.sofa.setTranslation({ x: 0, y: 0.6, z: z0 }, true);
g.sofa.setRotation(yawQuat(Math.PI / 2), true);
for (let i = 0; i < 30; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
// porteadores: extremos (+ lados si hay más)
const spots = [{ x: 0, z: z0 + 1.55 }, { x: 0, z: z0 - 1.55 }, { x: 0.8, z: z0 + 0.5 }, { x: -0.8, z: z0 - 0.5 }];
g.carriers.forEach((c, i) => { c.teleport({ x: spots[i].x, y: CENTER_Y + 0.05, z: spots[i].z }); c.facing = { x: -Math.sign(spots[i].x) || 0, z: i === 0 ? -1 : i === 1 ? 1 : 0 }; if (i >= 2) c.facing = { x: -Math.sign(spots[i].x), z: 0 }; });
for (let i = 0; i < 20; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, grab: true })));
console.log('holding', g.carriers.map(c => c.holding ? 1 : 0).join(''));
let t = 0, topAt = -1, maxZ = 0, airborne = 0;
const ev: string[] = [];
let wasOnStairs = false;
for (let i = 0; i < 60 * 25; i++) {
  t += DT;
  const sofaOnStep = (() => { let hit = false; for (const s of g.sofaColliders) g.world.contactPairsWith(s, (o: any) => { if (o.parent()?.isFixed()) g.world.contactPair(s, o, (m: any) => { if (m.numContacts() > 0 && Math.abs(m.normal().y) < 0.99) hit = true; }); }); return hit; })();
  const inputs = g.carriers.map((c, k) => {
    let lift = false;
    if (liftMode === 'always') lift = true;
    if (liftMode === 'front') lift = k === 1;
    if (liftMode === 'rear') lift = k === 0;
    if (liftMode === 'contact') lift = sofaOnStep || g.sofaPos.y > 0.5;
    return { ...NO_INPUT, mz: -speed, lift };
  });
  g.step(DT, inputs);
  for (const e of g.out) if (['wobble','fall','gripBreak','impact'].includes(e.type)) ev.push(`${t.toFixed(2)} ${e.type} ${'carrier' in e ? e.carrier : ''} ${'damage' in e ? 'dmg=' + e.damage + ' dv=' + (e as any).strength.toFixed(1) : ''}`);
  for (const c of g.carriers) if (!c.grounded) airborne += DT;
  const s = g.sofaPos;
  if (s.y > 2.6 && topAt < 0) topAt = t;
  if (verbose && i % 15 === 0) console.log(`t=${t.toFixed(2)} sofa=(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) up=${g.sofaUp.toFixed(2)} ` + g.carriers.map(c => `[y=${c.pos.y.toFixed(2)} z=${c.pos.z.toFixed(2)} gr=${c.grounded?1:0} h=${c.holding?1:0} L=${c.handLift.toFixed(1)}]`).join(''));
  if (topAt > 0 && t > topAt + 1) break;
}
console.log(`humans=${humans} lift=${liftMode} speed=${speed} -> top at ${topAt.toFixed(2)} s, final sofa z=${g.sofaPos.z.toFixed(2)} y=${g.sofaPos.y.toFixed(2)}, carrier-seconds airborne=${airborne.toFixed(2)}, holding=${g.carriers.map(c=>c.holding?1:0).join('')}, integrity=${g.integrity}`);
console.log(ev.join('\n'));
