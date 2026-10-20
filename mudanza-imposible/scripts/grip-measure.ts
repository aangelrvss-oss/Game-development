// Mediciones de la mano blanda y de la física única (objetivos T-grip, T-coop y estabilidad del ciclo 1).
// Usa los mismos protocolos que las pruebas de `tests/sim.test.ts`, pero imprime los números en vez de comprobarlos.
// Uso: npx tsx scripts/grip-measure.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../src/sim/game';
import { CARRIER, CENTER_Y } from '../src/sim/carrier';
import { CALLE, FLOOR2, STAIRS } from '../src/levels/calle';
import { SOFA, localToWorld, yawQuat } from '../src/sim/sofa';
import { NO_INPUT, type GameEvent, type PlayerInput } from '../src/sim/types';

await RAPIER.init({});
const DT = 1 / 60;
const OPEN = { x: -35, z: 25 };
const standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const f2 = (n: number) => n.toFixed(2);
function play(g: Game, seconds: number, input: (g: Game) => PlayerInput[] = () => []) {
  const events: GameEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) { g.step(DT, input(g)); events.push(...g.out); }
  return events;
}
const count = (ev: GameEvent[], t: GameEvent['type']) => ev.filter((e) => e.type === t).length;

function setup(n: number, x = OPEN.x, z = OPEN.z, yaw = 0) {
  const g = new Game(RAPIER, { level: CALLE, humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x, y: 0.25, z }, true);
  g.sofa.setRotation(yawQuat(yaw), true);
  // Aparcados en el descampado (junto a la escalera, (x + 5, z + 6) caía dentro del edificio)
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  return g;
}
function atEnd(g: Game, i: number, side: 1 | -1) {
  const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 });
  const o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
  const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z });
  c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
}
const endBase = (g: Game, side: 1 | -1) =>
  Math.min(...[-1, 1].map((sz) => localToWorld(g.sofa, { x: side * SOFA.half.x, y: -SOFA.half.y, z: sz * SOFA.half.z }).y));

// T-grip-2 y T-grip-3 en llano: agarran, 0,5 s para que suban las manos y 3 s andando a lo largo del sofá (-x)
function flat(both: boolean) {
  const g = setup(2);
  atEnd(g, 0, -1); atEnd(g, 1, 1);
  if (!both) g.carriers[1].teleport({ x: OPEN.x, y: standY, z: OPEN.z + 7 });
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: both })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  const s0 = g.sofaPos;
  let minBase = Infinity, freeEnd = -Infinity, minUp = 1;
  const ev = play(g, 3, (g) => {
    minBase = Math.min(minBase, endBase(g, 1), endBase(g, -1));
    freeEnd = Math.max(freeEnd, endBase(g, 1));
    minUp = Math.min(minUp, g.sofaUp);
    return [inp({ mx: -1 }), inp({ mx: both ? -1 : 0 })];
  });
  const me = g.carriers[0];
  const r = { d: Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z), minBase, freeEnd, heldEnd: endBase(g, -1), minUp, breaks: count(ev, 'gripBreak'), heavy: g.heavyAlone !== null, strain: me.strain, force: me.handForce };
  g.dispose();
  return r;
}
const solo = flat(false), duo = flat(true);
console.log(`T-grip-2 llano, uno solo: ${f2(solo.d)} m en 3 s; extremo agarrado a ${f2(solo.heldEnd)} m del suelo, el otro a ≤${f2(solo.freeEnd)} m; roturas ${solo.breaks}; aviso «Pesa mucho» ${solo.heavy}; esfuerzo ${f2(solo.strain)}; fuerza de la mano (${f2(solo.force.x)}, ${f2(solo.force.y)}, ${f2(solo.force.z)}) N`);
console.log(`T-grip-3 llano, dos: ${f2(duo.d)} m en 3 s (${f2(duo.d / solo.d)} veces uno solo); base del sofá ≥${f2(duo.minBase)} m andando; sofaUp ≥${f2(duo.minUp)}; roturas ${duo.breaks}; aviso ${duo.heavy}`);

// T-grip-2 según la dirección: uno solo agarra el extremo -x y anda 3 s (0° = alejándose a lo largo del sofá, como
// en la prueba; 90° = de lado, el sofá pivota sobre el otro extremo; 180° = empujándolo)
for (const deg of [0, 30, 60, 90, 120, 150, 180]) {
  const g = setup(2);
  atEnd(g, 0, -1);
  g.carriers[1].teleport({ x: OPEN.x, y: standY, z: OPEN.z + 7 });
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  const s0 = g.sofaPos, e0 = localToWorld(g.sofa, { x: -SOFA.half.x, y: 0, z: 0 });
  const a = (deg * Math.PI) / 180;
  play(g, 3, () => [inp({ mx: -Math.cos(a), mz: -Math.sin(a) }), NO_INPUT]);
  const e1 = localToWorld(g.sofa, { x: -SOFA.half.x, y: 0, z: 0 });
  console.log(`T-grip-2 uno solo a ${deg}°: centro ${f2(Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z))} m en 3 s, extremo agarrado ${f2(Math.hypot(e1.x - e0.x, e1.z - e0.z))} m, giro ${f2(Math.abs(g.sofaYaw))} rad`);
  g.dispose();
}

// Escalera: el sofá a lo largo al pie; agarran uno (delante o detrás) o los dos y andan hacia arriba, sin alzar
function stairs(who: 'dos' | 'delante' | 'detrás', limit: number) {
  const g = setup(2, 0, STAIRS.z0 + 2.2, Math.PI / 2);
  atEnd(g, 0, 1); atEnd(g, 1, -1);
  if (who === 'delante') g.carriers[1].teleport({ x: 0, y: standY, z: -16 });
  if (who === 'detrás') g.carriers[0].teleport({ x: 0, y: standY, z: -16 });
  play(g, 0.3);
  g.step(DT, [inp({ grab: who !== 'detrás' }), inp({ grab: who !== 'delante' })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  let t = 0, up = -1;
  for (let i = 0; i < limit * 60 && up < 0; i++) {
    g.step(DT, [inp({ mz: -1 }), inp({ mz: -1 })]);
    t += DT;
    if (g.sofaPos.z < STAIRS.z1 && g.sofaPos.y > FLOOR2 + 0.15) up = t;
  }
  const r = { up, z: g.sofaPos.z, y: g.sofaPos.y };
  g.dispose();
  return r;
}
for (const [who, limit] of [['dos', 8], ['delante', 20], ['detrás', 20]] as const) {
  const r = stairs(who, limit);
  console.log(`Escalera, ${who === 'dos' ? 'entre dos' : `uno solo ${who}`}: ${r.up < 0 ? `no sube en ${limit} s (centro del sofá en z=${f2(r.z)}, y=${f2(r.y)}; la escalera va de z=${STAIRS.z0} a ${STAIRS.z1})` : `arriba en ${f2(r.up)} s`}`);
}

// T-grip-4 y estabilidad: caja de masa m creada aquí con la API genérica de agarre
function box(m: number, n: 1 | 2) {
  const g = setup(n, OPEN.x - 10, OPEN.z - 10);
  const h = 0.25;
  const body = g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(OPEN.x, h + 0.01, OPEN.z).setCcdEnabled(true));
  const col = g.world.createCollider(RAPIER.ColliderDesc.cuboid(h, h, h).setDensity(m / (8 * h * h * h)).setFriction(0.6), body);
  g.addGrabbable(body, [col]);
  g.carriers[0].teleport({ x: OPEN.x + h + 0.7, y: standY, z: OPEN.z }); g.carriers[0].facing = { x: -1, z: 0 };
  if (n === 2) { g.carriers[1].teleport({ x: OPEN.x - h - 0.7, y: standY, z: OPEN.z }); g.carriers[1].facing = { x: 1, z: 0 }; }
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  play(g, 2.5);
  let mv = 0, mw = 0;
  play(g, 1, () => {
    const v = body.linvel(), w = body.angvel();
    mv = Math.max(mv, Math.hypot(v.x, v.y, v.z)); mw = Math.max(mw, Math.hypot(w.x, w.y, w.z));
    return [];
  });
  const rest = body.translation().y - h;
  let low = Infinity, p0 = body.translation();
  for (let i = 0; i < 4 * 60; i++) {
    if (i === 2 * 60) p0 = body.translation();
    g.step(DT, [inp({ mz: -1 }), inp({ mz: -1 })]);
    low = Math.min(low, body.translation().y - h);
  }
  const p1 = body.translation();
  const speed = Math.hypot(p1.x - p0.x, p1.z - p0.z) / 2;
  const r = { rest, low, speed, mv, mw, nan: !Number.isFinite(p1.x + p1.y + p1.z), holding: g.carriers.slice(0, n).every((c) => c.heldBody === body) };
  g.dispose();
  return r;
}
for (const m of [10, 25, 50, 90, 150, 250]) for (const n of [1, 2] as const) {
  const r = box(m, n);
  console.log(`Caja de ${m} kg, ${n} persona(s): quieta a ${f2(r.rest)} m del suelo (|v| ≤${f2(r.mv)} m/s, |ω| ≤${f2(r.mw)} rad/s); andando, fondo ≥${f2(r.low)} m y ${f2(r.speed)} m/s en los segundos 2–4 (${Math.round((100 * r.speed) / CARRIER.carrySpeed)} % de la velocidad de carga); NaN ${r.nan}; siguen agarrando ${r.holding}`);
}

// T-coop: n humanos desde la salida (0) o desde posiciones variadas (1–7, como en las pruebas)
function coop(n: number, layout: number, mode: 'quietos' | 'largo' | 'lado' | 'girando') {
  const g = new Game(RAPIER, { level: CALLE, humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  play(g, RULES.countdown + 0.2);
  const s0 = g.sofaPos;
  for (const c of g.carriers) { const p = c.pos, f = { ...c.facing }; c.teleport({ x: p.x - s0.x + OPEN.x, y: p.y, z: p.z - s0.z + OPEN.z }); c.facing = f; }
  g.sofa.setTranslation({ x: OPEN.x, y: s0.y, z: OPEN.z }, true);
  if (layout > 0) {
    let a = layout * 7919 + 17;
    const rnd = () => ((a = (a * 16807) % 2147483647), a / 2147483647);
    const used: { x: number; z: number }[] = [];
    for (const c of g.carriers) {
      for (let k = 0; k < 100; k++) {
        const end = rnd() < 0.4, sgn = rnd() < 0.5 ? -1 : 1;
        const along = (rnd() * 2 - 1) * (end ? SOFA.half.z : SOFA.half.x);
        const lp = end ? { x: sgn * (SOFA.half.x + 0.75), z: along } : { x: along, z: sgn * (SOFA.half.z + 0.75) };
        const w = localToWorld(g.sofa, { x: lp.x, y: 0, z: lp.z });
        if (used.some((u) => Math.hypot(u.x - w.x, u.z - w.z) < 0.8)) continue;
        used.push(w);
        const t = localToWorld(g.sofa, { x: end ? sgn * SOFA.half.x : along, y: 0, z: end ? along : sgn * SOFA.half.z });
        const l = Math.hypot(t.x - w.x, t.z - w.z);
        c.teleport({ x: w.x, y: standY, z: w.z });
        c.facing = { x: (t.x - w.x) / l, z: (t.z - w.z) / l };
        break;
      }
    }
    play(g, 0.3);
  } else {
    play(g, 0.4, (g) => g.carriers.map((c) => inp({ mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  }
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  const yaw0 = g.sofaYaw;
  let minUp = 1;
  const m = mode === 'largo' ? inp({ mx: -1 }) : mode === 'lado' ? inp({ mz: -1 }) : mode === 'girando' ? inp({ turn: 1 }) : NO_INPUT;
  const ev = play(g, 4, (g) => { minUp = Math.min(minUp, g.sofaUp); return g.carriers.map(() => (g.time > 0.5 ? m : NO_INPUT)); });
  let turned = g.sofaYaw - yaw0;
  turned = Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned)));
  const r = { minUp, falls: count(ev, 'fall'), lost: count(ev, 'gripBreak') + count(ev, 'release'), integrity: g.integrity, turned };
  g.dispose();
  return r;
}
for (const n of [3, 4]) {
  let worstUp = 1, falls = 0, lost = 0, broken = 0, minTurn = Infinity;
  for (let layout = 0; layout < 8; layout++) for (const mode of ['quietos', 'largo', 'lado', 'girando'] as const) {
    const r = coop(n, layout, mode);
    worstUp = Math.min(worstUp, r.minUp); falls += r.falls; lost += r.lost; if (r.integrity < 100) broken++;
    if (mode === 'girando') minTurn = Math.min(minTurn, r.turned);
  }
  console.log(`T-coop, ${n} humanos (8 posiciones × 4 movimientos): sofaUp ≥${f2(worstUp)}; caídas ${falls}; sueltan ${lost}; con daño ${broken}; giro mínimo girando ${f2(minTurn)} rad`);
}
