// ¿Atraviesa algo el sofá? Pruebas de esfuerzo de choque (cuerpo físico): porteadores a la carrera contra el sofá
// desde 12 direcciones, el sofá dejado caer sobre un porteador de pie y sobre uno tumbado, el sofá llevado a la
// carrera contra la fachada (fuera de la puerta), cuatro apretando el sofá hacia su centro, un porteador emparedado
// entre el sofá y la pared, y el levantarse «igualmente» tras maxWaitRoom con el sofá encima.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/atraviesa.ts
import { init, setup, near, play, inp, f2, f3, count, depth, overlapAny, SOFA, DT, NO_INPUT, OPEN, standY, RAPIER, yawQuat } from './comun';
import { CARRIER, CENTER_Y } from '../../../../src/sim/carrier';
import { DOOR } from '../../../../src/sim/level';
import type { Game } from '../../../../src/sim/game';
await init();
const h = SOFA.half;
const sofaVsCarriers = (g: Game) => depth(g.carriers.map((c) => c.collider), g.sofaColliders);
const sofaVsFixed = (g: Game) => {
  let w = 0;
  for (const s of g.sofaColliders) {
    const r = overlapAny(g, s, (o) => !o.parent()?.isFixed());
    w = Math.max(w, r.worst);
  }
  return w;
};

// 1) A la carrera contra el sofá parado, 12 direcciones, sin agarrar (5,2 m/s)
{
  let worst = 0, worstDir = 0, moved = 0;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const g = setup(1);
    const s0 = { ...g.sofaPos };
    const c = g.carriers[0];
    c.teleport({ x: OPEN.x + Math.cos(a) * 4, y: standY, z: OPEN.z + Math.sin(a) * 4 });
    let d = 0;
    play(g, 2, () => [inp({ mx: -Math.cos(a), mz: -Math.sin(a) })], (g) => { d = Math.max(d, sofaVsCarriers(g)); });
    if (d > worst) { worst = d; worstDir = k * 30; }
    moved = Math.max(moved, Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z));
    g.dispose();
  }
  console.log(`1) Carrera contra el sofá (12 direcciones): solape cápsula-sofá máx ${f3(worst)} m (a ${worstDir}°); el sofá se movió hasta ${f2(moved)} m`);
}

// 2) Sofá dejado caer desde 1,5 m sobre un porteador de pie (centro, extremo) y sobre uno tumbado
for (const where of ['de pie, centro', 'de pie, extremo', 'tumbado']) {
  const g = setup(1);
  const c = g.carriers[0];
  c.teleport({ x: OPEN.x + (where.includes('extremo') ? 0.9 : 0), y: standY, z: OPEN.z + 3 });
  play(g, 0.3);
  if (where === 'tumbado') { c.knockDown({ x: 1, z: 0 }, 3, 'balance'); play(g, 0.6); }
  const p = c.pos;
  const cx = where === 'tumbado' ? p.x + 0.6 : OPEN.x;
  g.sofa.setTranslation({ x: cx, y: (where === 'tumbado' ? 0.65 : 1.38) + 1.5, z: p.z }, true);
  g.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true); g.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
  let d = 0, vmax = 0, cvmax = 0;
  const ev = play(g, 3, () => [NO_INPUT], (g) => {
    d = Math.max(d, sofaVsCarriers(g));
    const v = g.sofa.linvel(); vmax = Math.max(vmax, Math.hypot(v.x, v.y, v.z));
    const cv = c.body.linvel(); cvmax = Math.max(cvmax, Math.hypot(cv.x, cv.y, cv.z));
  });
  console.log(`2) Sofá cae 1,5 m sobre porteador ${where}: solape máx ${f3(d)} m; |v sofá| máx ${f2(vmax)}; |v porteador| máx ${f2(cvmax)}; daño ${100 - g.integrity}; aturdido ${count(ev, 'stun')}`);
  g.dispose();
}

// 3) Dos llevan el sofá a la carrera contra la fachada (lejos de la puerta) y siguen empujando 3 s
{
  const g = setup(2, { x: 4, z: DOOR.z + 3, yaw: Math.PI / 2 });
  near(g, 0, h.x, 0, 1, 0); near(g, 1, -h.x, 0, -1, 0);
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  let dw = 0, dc = 0, cw = 0;
  const ev = play(g, 5, () => [inp({ mz: -1 }), inp({ mz: -1 })], (g) => {
    dw = Math.max(dw, sofaVsFixed(g));
    dc = Math.max(dc, sofaVsCarriers(g));
    for (const c of g.carriers) cw = Math.max(cw, overlapAny(g, c.collider, (o) => !o.parent()?.isFixed()).worst);
  });
  console.log(`3) Contra la fachada a la carrera: sofá en pared ${f3(dw)} m; porteadores en sofá ${f3(dc)} m; porteadores en pared ${f3(cw)} m; sofá en z=${f2(g.sofaPos.z)} (fachada z=${DOOR.z}); impactos ${count(ev, 'impact')}`);
  g.dispose();
}

// 4) Cuatro agarran y andan todos hacia el centro del sofá (lo aprietan)
{
  const g = setup(4);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0); near(g, 2, 0, h.z, 0, 1); near(g, 3, 0, -h.z, 0, -1);
  play(g, 0.3);
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  let d = 0;
  const ev = play(g, 4, (g) => g.carriers.map((c) => { const s = g.sofaPos, dx = s.x - c.pos.x, dz = s.z - c.pos.z, l = Math.hypot(dx, dz) || 1; return inp({ mx: dx / l, mz: dz / l }); }), (g) => { d = Math.max(d, sofaVsCarriers(g)); });
  console.log(`4) Cuatro aprietan el sofá hacia su centro: solape máx ${f3(d)} m; caídas ${count(ev, 'fall')}; sueltan ${count(ev, 'gripBreak')}; sofaUp ${f2(g.sofaUp)}`);
  g.dispose();
}

// 5) Porteador emparedado: de espaldas a la fachada, dos empujan el sofá contra él (sin agarrar) 4 s
{
  const g = setup(3, { x: 4, z: DOOR.z + 0.6 + 2 * CARRIER.radius + h.z, yaw: 0 });
  const c = g.carriers[0];
  c.teleport({ x: 4, y: standY, z: DOOR.z + 0.3 + CARRIER.radius });
  // Los otros dos empujan desde el otro lado del sofá
  g.carriers[1].teleport({ x: 3.4, y: standY, z: g.sofaPos.z + h.z + 0.5 });
  g.carriers[2].teleport({ x: 4.6, y: standY, z: g.sofaPos.z + h.z + 0.5 });
  play(g, 0.2);
  let d = 0, dw = 0;
  const ev = play(g, 4, () => [NO_INPUT, inp({ mz: -1 }), inp({ mz: -1 })], (g) => {
    d = Math.max(d, depth([c.collider], g.sofaColliders));
    dw = Math.max(dw, overlapAny(g, c.collider, (o) => !o.parent()?.isFixed()).worst);
  });
  console.log(`5) Emparedado entre sofá y fachada: solape con el sofá ${f3(d)} m, con la pared ${f3(dw)} m; caídas ${count(ev, 'fall')}; aturdido ${count(ev, 'stun')}`);
  g.dispose();
}

// 6) Tumbado bajo el sofá, sin hueco alrededor (paredes a 0,5 m de la cápsula tumbada): tras maxWaitRoom se levanta
// «igualmente» dentro del sofá
{
  const g = setup(1);
  const c = g.carriers[0];
  const cx = OPEN.x + 8, cz = OPEN.z + 8;
  c.teleport({ x: cx, y: standY, z: cz });
  play(g, 0.3);
  c.knockDown({ x: 1, z: 0 }, CARRIER.fallTime, 'balance');
  play(g, 0.5);
  const tilted = c.tilt;
  // Paredes en una caja 2,2 × 1,1 alrededor de la cápsula tumbada y el sofá apoyado encima
  const mid = { x: cx + Math.sin(c.tilt) * CARRIER.halfHeight, z: cz };
  const w = g.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const [x, z, hx, hz] of [[1.35, 0, 0.1, 0.8], [-1.35, 0, 0.1, 0.8], [0, 0.7, 1.45, 0.1], [0, -0.7, 1.45, 0.1]]) {
    g.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.4, hz).setTranslation(mid.x + x, 0.4, mid.z + z), w);
  }
  g.sofa.setTranslation({ x: mid.x, y: 2 * CARRIER.radius + h.y + 0.05, z: mid.z }, true);
  g.sofa.setRotation(yawQuat(0), true);
  g.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true); g.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
  let d = 0, vmax = 0, wmax = 0, roseAt = -1, t = 0;
  const ev = play(g, 7, () => [NO_INPUT], (g) => {
    t += DT;
    d = Math.max(d, sofaVsCarriers(g));
    const v = g.sofa.linvel(), ww = g.sofa.angvel();
    vmax = Math.max(vmax, Math.hypot(v.x, v.y, v.z)); wmax = Math.max(wmax, Math.hypot(ww.x, ww.y, ww.z));
    if (roseAt < 0 && c.down === 'rising') roseAt = t;
  });
  console.log(`6) Tumbado (tilt ${f2(tilted)}) bajo el sofá y sin hueco: empieza a levantarse a los ${f2(roseAt)} s; solape cápsula-sofá máx ${f3(d)} m; |v sofá| máx ${f2(vmax)} m/s; |ω| máx ${f2(wmax)}; impactos ${count(ev, 'impact')}; daño ${100 - g.integrity}; sofá en y=${f2(g.sofaPos.y)}`);
  g.dispose();
}
void CENTER_Y;
