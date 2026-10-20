// Estabilidad de cada objeto (6–130 kg): vibración en reposo (en el suelo, en el camión y apilados), lanzamientos contra
// las paredes del camión, caídas sobre su suelo, objetos aplastados contra la pared por 4 porteadores y una persona
// atrapada entre el piano y la pared. Mide |v| y |w| máximos, la penetración máxima con piezas fijas (profundidad de
// contacto de Rapier) y si algo acaba fuera de donde puede estar (atraviesa una pared o el suelo del camión).
// Uso: npx vite-node scripts/audit/review-c2/fisica/estabilidad.ts
import { ITEMS, PATIO, CENTER_Y, f2, game, init, inp, itemOf, lowest, play, restHeight, rotate, NO_INPUT, type Game, type Item, type ItemId } from './comun';

await init();
const sy = CENTER_Y + 0.05;
const IDS: ItemId[] = ['silla', 'lampara', 'caja', 'mesa', 'sofa', 'nevera', 'piano'];

/** Penetración máxima (m) de los objetos con piezas fijas en este momento. */
function penetration(g: Game, items: Item[]) {
  let pen = 0;
  for (const it of items) for (const c of it.colliders) {
    g.world.contactPairsWith(c, (other) => {
      if (!other.parent()?.isFixed()) return;
      g.world.contactPair(c, other, (m) => {
        for (let i = 0; i < m.numContacts(); i++) pen = Math.max(pen, -m.contactDist(i));
      });
    });
  }
  return pen;
}
/** Mide durante `seconds`: |v|, |w| máximos (tras `settle` s), penetración máxima y punto más bajo. */
function watch(g: Game, items: Item[], seconds: number, settle = 1, input: (g: Game) => ReturnType<typeof NO_INPUT extends infer T ? () => T[] : never> | any = () => g.carriers.map(() => NO_INPUT)) {
  let v = 0, w = 0, pen = 0, n = 0;
  const steps = Math.round(seconds * 60);
  for (let s = 0; s < steps; s++) {
    g.step(1 / 60, input(g));
    pen = Math.max(pen, penetration(g, items));
    if (s / 60 < settle) continue;
    for (const it of items) {
      const a = it.body.linvel(), b = it.body.angvel();
      v = Math.max(v, Math.hypot(a.x, a.y, a.z)); w = Math.max(w, Math.hypot(b.x, b.y, b.z));
    }
    n++;
  }
  return { v, w, pen };
}
const hold = (g: Game) => g.hold;
/** ¿Está el objeto donde puede estar? Dentro de la caja de carga (con 5 cm de margen) o fuera de la huella del camión. */
function where(g: Game, it: Item) {
  const p = it.body.translation(), h = hold(g), low = lowest(it);
  const inFoot = p.x > h.min.x - 0.05 && p.x < h.max.x + 2.6 && p.z > h.min.z - 0.17 && p.z < h.max.z + 0.17;
  const inside = p.x > h.min.x && p.x < h.max.x && p.z > h.min.z && p.z < h.max.z && p.y > h.min.y && p.y < h.max.y;
  const wrong = inFoot && !inside ? 'DENTRO DE LA CARROCERÍA' : inside && low < h.min.y - 0.05 ? 'ATRAVIESA EL SUELO' : '';
  return { p, low, inside, wrong };
}
/** El objeto del patio con ese id (el sofá no está en el patio: se añade). */
const pick = (g: Game, id: ItemId) => itemOf(g, id) ?? g.addItem(ITEMS[id], { x: -3, y: restHeight(ITEMS[id]) + 0.01, z: 6 }, 0, false);
const truckRest = (def: ItemId) => 1.0 + restHeight(ITEMS[def]) + 0.01;

console.log('== Reposo 10 s (sin nadie) ==');
for (const id of IDS) {
  for (const place of ['suelo', 'camion'] as const) {
    const g = game(PATIO, 1, 1);
    g.carriers[0].teleport({ x: -13, y: sy, z: 8 });
    for (const o of g.items) o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true);
    const it = pick(g, id);
    it.body.setTranslation(place === 'suelo' ? { x: 0, y: restHeight(it.def) + 0.01, z: 0 } : { x: 9, y: truckRest(id), z: 0 }, true);
    it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    const r = watch(g, [it], 10);
    const up = rotate(it.body.rotation(), { x: 0, y: 1, z: 0 }).y;
    console.log(`  ${it.def.name} en el ${place}: |v| máx ${r.v.toExponential(1)} m/s, |w| máx ${r.w.toExponential(1)} rad/s (tras 1 s), penetración máx ${f2(r.pen * 100)} cm, de pie ${f2(up)}, integridad ${it.integrity}`);
    g.dispose();
  }
}

console.log('\n== Los 7 objetos dentro del camión a la vez (soltados a 5 cm de su sitio de la ruta; la caja del sur, encima de la mesa) ==');
{
  const g = game(PATIO, 1, 1);
  g.carriers[0].teleport({ x: -13, y: sy, z: 8 });
  for (const it of g.items) {
    const route = g.level.items[it.index].route, last = route[route.length - 1];
    it.body.setTranslation({ x: last.x, y: truckRest(it.def.id) + 0.04, z: last.z }, true);
    it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
  const caja2 = itemOf(g, 'caja', 1), mesa = itemOf(g, 'mesa');
  const mp = mesa.body.translation();
  caja2.body.setTranslation({ x: mp.x, y: mp.y + 0.25 + 0.27, z: mp.z }, true);
  const r = watch(g, g.items, 12, 2);
  console.log(`  |v| máx ${r.v.toExponential(1)} m/s, |w| máx ${r.w.toExponential(1)} rad/s (tras 2 s), penetración máx ${f2(r.pen * 100)} cm; cargados ${g.items.filter((i) => i.state === 'loaded').length}/7; ${g.items.map((i) => `${i.def.id}${where(g, i).wrong ? ' ' + where(g, i).wrong : ''}(${i.integrity})`).join(', ')}`);
  g.dispose();
}

console.log('\n== Lanzados a 11 m/s (el tope de Game.clampLoads) desde dentro del camión contra cada pared, el techo y el suelo ==');
const DIRS: Record<string, { x: number; y: number; z: number }> = {
  cabina: { x: 1, y: 0, z: 0 }, 'pared izq.': { x: 0, y: 0, z: -1 }, 'pared der.': { x: 0, y: 0, z: 1 }, techo: { x: 0, y: 1, z: 0 }, suelo: { x: 0, y: -1, z: 0 },
};
for (const id of IDS) {
  const out: string[] = [];
  for (const [name, d] of Object.entries(DIRS)) {
    const g = game(PATIO, 1, 1);
    g.carriers[0].teleport({ x: -13, y: sy, z: 8 });
    for (const o of g.items) o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true);
    const it = pick(g, id);
    it.body.setTranslation({ x: 8.8, y: 2.0, z: 0 }, true);
    it.body.setLinvel({ x: d.x * 11, y: d.y * 11, z: d.z * 11 }, true);
    it.body.setAngvel({ x: 3, y: 2, z: 4 }, true);
    let worst = '';
    let pen = 0, vmax = 0;
    for (let s = 0; s < 180; s++) {
      g.step(1 / 60, [NO_INPUT]);
      pen = Math.max(pen, penetration(g, [it]));
      const v = it.body.linvel(); vmax = Math.max(vmax, Math.hypot(v.x, v.y, v.z));
      const w = where(g, it);
      if (w.wrong && !worst) worst = `${w.wrong} a los ${f2(s / 60)} s en (${f2(w.p.x)}, ${f2(w.p.y)}, ${f2(w.p.z)})`;
    }
    const w = where(g, it);
    out.push(`${name}: ${w.inside ? 'dentro' : `FUERA en (${f2(w.p.x)}, ${f2(w.p.y)}, ${f2(w.p.z)})`}, pen. máx ${f2(pen * 100)} cm, |v| máx tras el choque ${f2(vmax)}${worst ? `, ${worst}` : ''}, integridad ${it.integrity}`);
    g.dispose();
  }
  console.log(`  ${ITEMS[id].name}: ${out.join(' | ')}`);
}

console.log('\n== Lanzados a 11 m/s desde fuera contra el costado y la trasera de la cabina del camión ==');
for (const id of IDS) {
  const out: string[] = [];
  for (const [name, from, vel] of [['costado', { x: 9, y: 1.2, z: -4.5 }, { x: 0, y: 0, z: 11 }], ['bajos desde atrás (bajo la rampa)', { x: 3.5, y: 0.35, z: 2.6 }, { x: 0, y: 0, z: -11 }]] as const) {
    const g = game(PATIO, 1, 1);
    g.carriers[0].teleport({ x: -13, y: sy, z: 8 });
    for (const o of g.items) o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true);
    const it = pick(g, id);
    it.body.setTranslation(from, true);
    it.body.setLinvel(vel, true);
    let worst = '';
    let pen = 0;
    for (let s = 0; s < 180; s++) {
      g.step(1 / 60, [NO_INPUT]);
      pen = Math.max(pen, penetration(g, [it]));
      const w = where(g, it);
      if ((w.wrong || w.inside) && !worst) worst = `${w.inside ? 'DENTRO DE LA CAJA DE CARGA' : w.wrong} a los ${f2(s / 60)} s`;
    }
    const p = it.body.translation();
    out.push(`${name}: acaba en (${f2(p.x)}, ${f2(p.y)}, ${f2(p.z)}), pen. máx ${f2(pen * 100)} cm${worst ? ', ' + worst : ''}`);
    g.dispose();
  }
  console.log(`  ${ITEMS[id].name}: ${out.join(' | ')}`);
}

console.log('\n== Caída de 3 m sobre el suelo de carga ==');
for (const id of IDS) {
  const g = game(PATIO, 1, 1);
  g.carriers[0].teleport({ x: -13, y: sy, z: 8 });
  for (const o of g.items) o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true);
  const it = pick(g, id);
  // Por encima del techo no se puede: se suelta justo bajo el techo con 7,7 m/s hacia abajo (lo que da una caída de 3 m)
  it.body.setTranslation({ x: 9, y: 2.6, z: 0 }, true);
  it.body.setLinvel({ x: 0, y: -7.7, z: 0 }, true);
  const r = watch(g, [it], 3, 0);
  const w = where(g, it);
  console.log(`  ${it.def.name}: pen. máx ${f2(r.pen * 100)} cm; ${w.wrong || (w.inside ? 'dentro' : 'fuera')}; punto más bajo ${f2(w.low)} (suelo de carga a 1,00); integridad ${it.integrity}, ${it.state}`);
  g.dispose();
}

console.log('\n== 4 porteadores aprietan cada objeto pesado contra la pared de la cabina 6 s ==');
for (const id of ['mesa', 'sofa', 'nevera', 'piano'] as ItemId[]) {
  const def = ITEMS[id], n = Math.min(4, def.handles.length);
  const g = game(PATIO, n, n);
  for (const o of g.items) o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true);
  const it = pick(g, id);
  it.body.setTranslation({ x: 9.6, y: truckRest(id), z: 0 }, true);
  it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  play(g, 0.3);
  // Cada uno frente a un asa (las de −x primero), dentro del camión
  const order = def.handles.map((h, k) => ({ k, s: h.out.x })).sort((a, b) => a.s - b.s).map((e) => e.k);
  for (let i = 0; i < n; i++) {
    const hd = def.handles[order[i]], a = { x: it.body.translation().x + hd.p.x, z: it.body.translation().z + hd.p.z };
    g.carriers[i].teleport({ x: Math.min(11.2, a.x + hd.out.x * 0.75), y: 1.0 + sy, z: Math.max(-1.5, Math.min(1.5, a.z + hd.out.z * 0.75)) });
    g.carriers[i].facing = { x: -hd.out.x, z: -hd.out.z };
  }
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
  const grabbed = g.carriers.filter((c) => c.heldBody === it.body).length;
  const r = watch(g, [it], 6, 0.5, (g: Game) => g.carriers.map(() => inp({ mx: 1 })));
  const w = where(g, it);
  console.log(`  ${def.name} (${grabbed} agarran): |v| máx ${f2(r.v)}, |w| máx ${f2(r.w)}; pen. máx ${f2(r.pen * 100)} cm; ${w.wrong || (w.inside ? 'dentro' : 'fuera')} en x ${f2(w.p.x)} (pared a ${f2(g.hold.max.x)}); integridad ${it.integrity}`);
  g.dispose();
}

console.log('\n== Una persona atrapada entre el piano y la pared de la cabina; 3 empujan el piano 6 s ==');
{
  const g = game(PATIO, 4, 4);
  for (const o of g.items) o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true);
  const it = itemOf(g, 'piano');
  it.body.setTranslation({ x: 9.6, y: truckRest('piano'), z: 0 }, true);
  it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  const victim = g.carriers[3];
  victim.teleport({ x: 11.3, y: 1.0 + sy, z: 0 });
  const order = ITEMS.piano.handles.map((h, k) => ({ k, s: h.out.x })).sort((a, b) => a.s - b.s).map((e) => e.k);
  for (let i = 0; i < 3; i++) {
    const hd = ITEMS.piano.handles[order[i]], a = { x: 9.6 + hd.p.x, z: hd.p.z };
    g.carriers[i].teleport({ x: a.x + hd.out.x * 0.75, y: 1.0 + sy, z: Math.max(-1.5, Math.min(1.5, a.z + hd.out.z * 0.75)) });
    g.carriers[i].facing = { x: -hd.out.x, z: -hd.out.z };
  }
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map((_, i) => inp({ grab: i < 3 })));
  let vv = 0, stuns = 0, falls = 0;
  for (let s = 0; s < 360; s++) {
    g.step(1 / 60, g.carriers.map((_, i) => (i < 3 ? inp({ mx: 1 }) : NO_INPUT)));
    const v = victim.body.linvel(); vv = Math.max(vv, Math.hypot(v.x, v.y, v.z));
    stuns += g.out.filter((e) => e.type === 'stun' && 'carrier' in e && e.carrier === 3).length;
    falls += g.out.filter((e) => e.type === 'fall' && 'carrier' in e && e.carrier === 3).length;
  }
  const p = victim.pos, pp = it.body.translation();
  console.log(`  atrapado: |v| máx ${f2(vv)} m/s, aturdido ${stuns}, caídas ${falls}; acaba en (${f2(p.x)}, ${f2(p.y)}, ${f2(p.z)}) ${p.x > g.hold.max.x + 0.05 ? 'ATRAVIESA LA PARED' : ''}; piano en x ${f2(pp.x)}, integridad ${it.integrity}`);
  g.dispose();
}
