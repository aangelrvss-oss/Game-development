// Revisión c1b (segunda ronda del ciclo 1), roles B+F.
// 1) T-grip-2 más allá de la prueba: uno solo agarra el sofá por distintos puntos (extremos, esquinas, costados) y tira
//    3 s en 24 direcciones del mundo. Mide el desplazamiento del centro y del punto agarrado, y si se suelta.
// 2) T-grip-4 en todas las direcciones: caja de 10 kg llevada por uno solo hacia delante, de lado y hacia atrás.
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/barrido-agarres.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CARRIER, CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05, OPEN = { x: -35, z: 25 };
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
function play(g: Game, s: number, f: (g: Game) => PlayerInput[] = () => []) {
  const ev: string[] = [];
  for (let i = 0; i < Math.round(s * 60); i++) { g.step(DT, f(g)); for (const e of g.out) ev.push(e.type); }
  return ev;
}
const h = SOFA.half;
// Punto local del sofá y dirección local hacia fuera (donde se pone el porteador)
const POINTS: [string, number, number, number, number][] = [
  ['extremo -x', -h.x, 0, -1, 0],
  ['esquina -x+z', -h.x, h.z * 0.8, -0.7071, 0.7071],
  ['cuarto costado +z', -h.x / 2, h.z, 0, 1],
  ['centro costado +z', 0, h.z, 0, 1],
  ['centro respaldo -z', 0, -h.z, 0, -1],
];

function solo(lx: number, lz: number, ox: number, oz: number, dirDeg: number, yaw: number) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.sofa.setRotation(yawQuat(yaw), true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  const a = localToWorld(g.sofa, { x: lx, y: 0, z: lz }), o = localToWorld(g.sofa, { x: lx + ox * 0.75, y: 0, z: lz + oz * 0.75 });
  const c = g.carriers[0], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  if (!c.holding) { g.dispose(); return null; }
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  const s0 = g.sofaPos, gp0 = c.grabWorld()!;
  const ar = (dirDeg * Math.PI) / 180;
  const ev = play(g, 3, () => [inp({ mx: Math.cos(ar), mz: Math.sin(ar) }), NO_INPUT]);
  const gp1 = c.grabWorld() ?? gp0;
  const r = {
    d: Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z), grab: Math.hypot(gp1.x - gp0.x, gp1.z - gp0.z),
    holding: c.holding, breaks: ev.filter((e) => e === 'gripBreak').length, falls: ev.filter((e) => e === 'fall').length,
  };
  g.dispose();
  return r;
}

let worst = { d: 0, at: '' }, worstGrab = { d: 0, at: '' }, out = 0, total = 0, lost = 0;
for (const yaw of [0, 0.6]) for (const [name, lx, lz, ox, oz] of POINTS) {
  const row: string[] = [];
  let maxD = 0, minD = Infinity;
  for (let deg = 0; deg < 360; deg += 15) {
    const r = solo(lx, lz, ox, oz, deg, yaw);
    if (!r) { row.push(`${deg}:noagarra`); continue; }
    total++;
    if (r.d > 1.5 || r.d < 0.3) out++;
    if (!r.holding) lost++;
    maxD = Math.max(maxD, r.d); minD = Math.min(minD, r.d);
    if (r.d > worst.d) worst = { d: r.d, at: `${name} yaw ${yaw} dir ${deg}°` };
    if (r.grab > worstGrab.d) worstGrab = { d: r.grab, at: `${name} yaw ${yaw} dir ${deg}°` };
    row.push(`${deg}:${r.d.toFixed(2)}${r.d > 1.5 ? '!' : ''}${r.holding ? '' : 'S'}${r.breaks ? 'b' + r.breaks : ''}${r.falls ? 'c' : ''}`);
  }
  console.log(`[yaw ${yaw}] ${name}: centro ${minD.toFixed(2)}–${maxD.toFixed(2)} m | ${row.join(' ')}`);
}
console.log(`T-grip-2 barrido: ${out}/${total} fuera de 0,3–1,5 m; peor centro ${worst.d.toFixed(2)} m (${worst.at}); peor punto agarrado ${worstGrab.d.toFixed(2)} m (${worstGrab.at}); se suelta en ${lost}`);
console.log('(! = más de 1,5 m; S = ya no agarra al final; b = gripBreak; c = caída)');

// 2) Caja de 10 kg en todas las direcciones respecto a hacia dónde mira al agarrar
function boxRun(dirDeg: number, m = 10) {
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x - 10, y: 0.25, z: OPEN.z - 10 }, true);
  g.carriers[0].teleport({ x: OPEN.x + 5, y: standY, z: OPEN.z + 6 });
  play(g, 0.5);
  const hb = 0.25;
  const body = g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(OPEN.x, hb + 0.01, OPEN.z).setCcdEnabled(true));
  const col = g.world.createCollider(RAPIER.ColliderDesc.cuboid(hb, hb, hb).setDensity(m / (8 * hb * hb * hb)).setFriction(0.6), body);
  g.addGrabbable(body, [col]);
  const me = g.carriers[0];
  me.teleport({ x: OPEN.x + hb + 0.7, y: standY, z: OPEN.z }); me.facing = { x: -1, z: 0 };
  play(g, 0.3);
  g.step(DT, [inp({ grab: true })]);
  if (me.heldBody !== body) { g.dispose(); return null; }
  play(g, 0.5);
  // dirección respecto a donde mira (-x): 0° = adelante (-x), 90° = de lado, 180° = hacia atrás
  const a = (dirDeg * Math.PI) / 180, mx = -Math.cos(a), mz = -Math.sin(a);
  let low = Infinity, p0 = body.translation();
  for (let i = 0; i < 4 * 60; i++) {
    if (i === 2 * 60) p0 = body.translation();
    g.step(DT, [inp({ mx, mz })]);
    low = Math.min(low, body.translation().y - hb);
  }
  const p1 = body.translation();
  const r = { speed: Math.hypot(p1.x - p0.x, p1.z - p0.z) / 2 / CARRIER.carrySpeed, low, held: me.heldBody === body };
  g.dispose();
  return r;
}
for (const m of [10, 25]) {
  const row: string[] = [];
  for (const deg of [0, 45, 90, 135, 180]) {
    const r = boxRun(deg, m);
    row.push(r ? `${deg}°: ${(r.speed * 100).toFixed(0)}% alto ${r.low.toFixed(2)}${r.held ? '' : ' SUELTA'}` : `${deg}°: no agarra`);
  }
  console.log(`Caja ${m} kg, uno solo (velocidad / carrySpeed; altura mínima de la base): ${row.join(' | ')}`);
}
