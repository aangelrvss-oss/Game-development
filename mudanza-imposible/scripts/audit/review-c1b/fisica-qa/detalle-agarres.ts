// Revisión c1b, roles B+F. Detalle de los casos raros de barrido-agarres.ts:
// a) uno solo agarra el sofá por el centro del respaldo o por una esquina y tira: ¿vuelca el sofá?, ¿a qué altura
//    agarra?, ¿cuánto se mueve?;
// b) uno solo anda hacia atrás con una caja de 10 kg: ¿por qué la suelta?
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/detalle-agarres.ts   (funciona igual en el árbol anterior)
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CARRIER, CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05, OPEN = { x: -35, z: 25 };
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const h = SOFA.half;

function sofaCase(label: string, lx: number, lz: number, ox: number, oz: number, dirDeg: number, at = OPEN, yaw = 0, secs = 3) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: at.x, y: 0.25, z: at.z }, true);
  g.sofa.setRotation(yawQuat(yaw), true);
  g.carriers.forEach((c, i) => c.teleport({ x: at.x + 5 + i * 1.5, y: standY, z: at.z + 6 }));
  for (let i = 0; i < 30; i++) g.step(DT, []);
  const a = localToWorld(g.sofa, { x: lx, y: 0, z: lz }), o = localToWorld(g.sofa, { x: lx + ox * 0.75, y: 0, z: lz + oz * 0.75 });
  const c = g.carriers[0], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  for (let i = 0; i < 18; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const gl = c.grabLocal ? { ...c.grabLocal } : null;
  const s0 = g.sofaPos;
  const ar = (dirDeg * Math.PI) / 180;
  let minUp = 1, maxY = 0, breaks = 0, falls = 0, maxF = 0, satT = 0;
  const ev: string[] = [];
  for (let i = 0; i < secs * 60; i++) {
    g.step(DT, [inp({ mx: Math.cos(ar), mz: Math.sin(ar) }), NO_INPUT]);
    minUp = Math.min(minUp, g.sofaUp); maxY = Math.max(maxY, g.sofaPos.y);
    maxF = Math.max(maxF, Math.hypot(c.handForce.x, c.handForce.z));
    for (const e of g.out) { if (e.type === 'gripBreak') breaks++; if (e.type === 'fall') falls++; if (!['honk', 'light'].includes(e.type)) ev.push(`${g.time.toFixed(2)}:${e.type}`); }
  }
  const d = Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z);
  console.log(`${label} dir ${dirDeg}°: centro ${d.toFixed(2)} m en ${secs} s; agarre local ${gl ? `(${gl.x.toFixed(2)}, ${gl.y.toFixed(2)}, ${gl.z.toFixed(2)})` : 'ninguno'}; sofaUp mín ${minUp.toFixed(2)}; y máx ${maxY.toFixed(2)}; fuerza mano máx ${maxF.toFixed(0)} N; integridad ${g.integrity}; gripBreak ${breaks}; caídas ${falls}; agarra al final ${c.holding}; yaw ${g.sofaYaw.toFixed(2)}`);
  g.dispose();
}

sofaCase('extremo -x (la prueba)', -h.x, 0, -1, 0, 180);
sofaCase('centro respaldo -z', 0, -h.z, 0, -1, 270);
sofaCase('centro respaldo -z', 0, -h.z, 0, -1, 90);
sofaCase('centro respaldo -z', 0, -h.z, 0, -1, 0);
sofaCase('centro respaldo -z, 6 s', 0, -h.z, 0, -1, 270, OPEN, 0, 6);
sofaCase('centro asiento +z', 0, h.z, 0, 1, 90);
sofaCase('esquina -x+z', -h.x, h.z * 0.8, -0.7071, 0.7071, 0);
sofaCase('esquina -x+z', -h.x, h.z * 0.8, -0.7071, 0.7071, 45);
sofaCase('cuarto costado +z', -h.x / 2, h.z, 0, 1, 255);

function boxCase(dirDeg: number, m = 10, at = OPEN) {
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: at.x - 10, y: 0.25, z: at.z - 10 }, true);
  g.carriers[0].teleport({ x: at.x + 5, y: standY, z: at.z + 6 });
  for (let i = 0; i < 30; i++) g.step(DT, []);
  const hb = 0.25;
  const body = g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, hb + 0.01, at.z).setCcdEnabled(true));
  const col = g.world.createCollider(RAPIER.ColliderDesc.cuboid(hb, hb, hb).setDensity(m / (8 * hb * hb * hb)).setFriction(0.6), body);
  g.addGrabbable(body, [col]);
  const me = g.carriers[0];
  me.teleport({ x: at.x + hb + 0.7, y: standY, z: at.z }); me.facing = { x: -1, z: 0 };
  for (let i = 0; i < 18; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true })]);
  for (let i = 0; i < 30; i++) g.step(DT, []);
  const a = (dirDeg * Math.PI) / 180, mx = -Math.cos(a), mz = -Math.sin(a);
  const ev: string[] = [];
  let firstLost = -1, sepMax = 0;
  for (let i = 0; i < 4 * 60; i++) {
    g.step(DT, [inp({ mx, mz })]);
    sepMax = Math.max(sepMax, me.handSep);
    for (const e of g.out) if (!['honk', 'light'].includes(e.type)) ev.push(`${g.time.toFixed(2)}:${e.type}`);
    if (firstLost < 0 && me.heldBody !== body) firstLost = i * DT;
  }
  const p = me.pos, b = body.translation();
  console.log(`Caja ${m} kg dir ${dirDeg}° (0 = adelante, 180 = andar hacia atrás): suelta a los ${firstLost.toFixed(2)} s; separación máx ${sepMax.toFixed(2)}; porteador en (${p.x.toFixed(1)}, ${p.z.toFixed(1)}), caja en (${b.x.toFixed(1)}, ${b.y.toFixed(2)}, ${b.z.toFixed(1)}); sucesos ${ev.slice(0, 8).join(' ')}`);
  g.dispose();
}
boxCase(180);
boxCase(180, 10, { x: -35, z: 18 });
boxCase(160);
boxCase(0);
