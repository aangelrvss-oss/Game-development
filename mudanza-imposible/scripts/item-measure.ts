// Mediciones de los objetos del catálogo (objetivos T-item-2 y T-item-3 del ciclo 2).
// Usa los mismos protocolos que `tests/items.test.ts`, pero imprime los números en vez de comprobarlos.
// Uso: npx vite-node scripts/item-measure.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { CARRIER, CENTER_Y } from '../src/sim/carrier';
import { CALLE } from '../src/levels/calle';
import { Game } from '../src/sim/game';
import { HAND } from '../src/sim/hand';
import { ITEMS, restHeight, type Item, type ItemDef } from '../src/sim/items';
import { localToWorld, rotate } from '../src/sim/sofa';
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

/** Partida en juego con n humanos, el sofá del nivel aparcado a un lado y el objeto `def` en el descampado. */
function setup(def: ItemDef, n: number) {
  const g = new Game(RAPIER, { level: CALLE, humans: n, carriers: Math.max(1, n), botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x - 12, y: 0.25, z: OPEN.z - 8 }, true);
  const it = g.addItem(def, { x: OPEN.x, y: restHeight(def) + 0.01, z: OPEN.z }, 0);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  return { g, it };
}

/** Punto más bajo de la forma del objeto (m, mundo): la esquina más baja de sus cajas. */
function lowest(it: Item) {
  let low = Infinity;
  for (const b of it.def.shape) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    low = Math.min(low, localToWorld(it.body, { x: b.p.x + sx * b.h.x, y: b.p.y + sy * b.h.y, z: b.p.z + sz * b.h.z }).y);
  }
  return low;
}

/** Pone al porteador i frente al asa h del objeto, a 0,75 m hacia fuera, mirándola. */
function atHandle(g: Game, it: Item, i: number, h: number) {
  const hd = it.def.handles[h], a = localToWorld(it.body, hd.p), out = rotate(it.body.rotation(), hd.out);
  const ol = Math.hypot(out.x, out.z) || 1, o = { x: a.x + (out.x / ol) * 0.75, z: a.z + (out.z / ol) * 0.75 };
  const c = g.carriers[i];
  c.teleport({ x: o.x, y: standY, z: o.z });
  c.facing = { x: -out.x / ol, z: -out.z / ol };
}

/**
 * T-item-2: n porteadores, guiados por la prueba, se ponen frente a las n primeras asas y agarran: con el botón, como
 * un jugador (el punto más cercano a la mano, `mode` 'boton'), o justo en el asa, como un ayudante ('asa'). 0,5 s
 * para que suban las manos y 3 s andando todos hacia fuera de la primera asa (quien la agarra tira hacia atrás).
 * Mide la base y lo recorrido.
 */
export function carry(def: ItemDef, n: number, mode: 'boton' | 'asa' = 'boton') {
  const { g, it } = setup(def, n);
  for (let i = 0; i < n; i++) atHandle(g, it, i, i);
  play(g, 0.3);
  if (mode === 'boton') g.step(DT, g.carriers.map((_, i) => inp({ grab: i < n })));
  else for (let i = 0; i < n; i++) g.carriers[i].tryGrab(it.body, it.colliders, def.handles[i].p);
  const grabbed = g.carriers.slice(0, n).every((c) => c.heldBody === it.body);
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  const out = rotate(it.body.rotation(), def.handles[0].out), ol = Math.hypot(out.x, out.z) || 1;
  const dir = { x: out.x / ol, z: out.z / ol };
  const p0 = it.body.translation();
  let minLow = Infinity, maxLow = -Infinity, sumLow = 0, steps = 0, maxSat = 0;
  const ev = play(g, 3, (g) => {
    const l = lowest(it);
    minLow = Math.min(minLow, l); maxLow = Math.max(maxLow, l); sumLow += l; steps++;
    for (const c of g.carriers) if (c.heldBody === it.body) maxSat = Math.max(maxSat, c.handForce.y);
    return g.carriers.map((_, i) => (i < n ? inp({ mx: dir.x, mz: dir.z }) : NO_INPUT));
  });
  const p1 = it.body.translation();
  const r = {
    grabbed, d: Math.hypot(p1.x - p0.x, p1.z - p0.z), minLow, maxLow, meanLow: sumLow / steps, maxHandY: maxSat,
    breaks: count(ev, 'gripBreak'), falls: count(ev, 'fall'), holding: g.carriers.slice(0, n).every((c) => c.heldBody === it.body),
    integrity: it.integrity,
  };
  g.dispose();
  return r;
}

/** Golpe más fuerte que «nota» el objeto (el mismo cálculo que `Game.checkImpact`) mientras corre `f`. */
function watchDv(g: Game, it: Item, seconds: number, input: (g: Game) => PlayerInput[] = () => []) {
  let prev = it.body.linvel(), max = 0;
  const ev: GameEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    g.step(DT, input(g)); ev.push(...g.out);
    const v = it.body.linvel();
    max = Math.max(max, Math.hypot(v.x - prev.x, v.y - prev.y + 9.81 * DT, v.z - prev.z));
    prev = v;
  }
  return { max, ev };
}

console.log(`HAND.maxV = ${HAND.maxV} N por persona`);
for (const def of Object.values(ITEMS)) {
  const ns = [def.minCarriers - 1, def.minCarriers, ...(def.id === 'piano' ? [4] : [])].filter((n) => n >= 1);
  const w = def.mass * 9.81;
  console.log(`\n${def.name} (${def.id}): ${def.mass.toFixed(1)} kg (peso ${w.toFixed(0)} N, ${(w / HAND.maxV).toFixed(2)} manos), ${def.handles.length} asas, minCarriers ${def.minCarriers}`);
  for (const n of ns) for (const mode of ['boton', 'asa'] as const) {
    const r = carry(def, n, mode);
    console.log(`  ${n} porteador(es), ${mode === 'boton' ? 'con el botón' : 'en el asa  '}: agarran ${r.grabbed}, recorre ${f2(r.d)} m en 3 s, base min ${f2(r.minLow)} / media ${f2(r.meanLow)} / max ${f2(r.maxLow)} m, fuerza vertical máx de una mano ${r.maxHandY.toFixed(0)} N, sueltas ${r.breaks}, caídas ${r.falls}, sigue agarrado ${r.holding}, integridad ${r.integrity}`);
  }
}

// T-item-3: la lámpara frágil (agarrada con el botón, como en la prueba, o justo en su asa, como un ayudante)
const lamp = ITEMS.lampara;
/** La lámpara en manos de un porteador, ya a la altura de carga, y hacia dónde anda (fuera de su asa). */
function carriedLamp(mode: 'boton' | 'asa') {
  const { g, it } = setup(lamp, 1);
  atHandle(g, it, 0, 0);
  play(g, 0.3);
  if (mode === 'boton') g.step(DT, [inp({ grab: true })]);
  else g.carriers[0].tryGrab(it.body, it.colliders, lamp.handles[0].p);
  const grab = watchDv(g, it, 0.5);
  const out = rotate(it.body.rotation(), lamp.handles[0].out);
  return { g, it, grab, dir: { x: out.x, z: out.z } };
}
for (const mode of ['boton', 'asa'] as const) {
  // Llevarla andando 2 s, pararse 1 s y soltarla con cuidado (quieto); 3 s más en el suelo
  const { g, it, grab, dir } = carriedLamp(mode);
  const b = watchDv(g, it, 2, () => [inp({ mx: dir.x, mz: dir.z })]);
  const c = watchDv(g, it, 1, () => [NO_INPUT]);
  const d = watchDv(g, it, 3, (g) => [inp({ grab: g.carriers[0].holding })]);
  console.log(`${mode === 'boton' ? '\n' : ''}Lámpara (${mode === 'boton' ? 'con el botón' : 'en el asa'}), llevada y dejada con cuidado: golpe máx al agarrar ${f2(grab.max)}, andando ${f2(b.max)}, parando ${f2(c.max)}, al soltarla ${f2(d.max)} m/s (umbral ${lamp.fragility!.impactDv}); de pie ${f2(rotate(it.body.rotation(), { x: 0, y: 1, z: 0 }).y)}, integridad ${it.integrity}, estado ${it.state}`);
  g.dispose();
}
for (const mode of ['boton', 'asa'] as const) {
  // Soltarla andando a paso de carga: se va al suelo desde la altura de carga
  const { g, it, dir } = carriedLamp(mode);
  play(g, 1.5, () => [inp({ mx: dir.x, mz: dir.z })]);
  const r = watchDv(g, it, 3, (g) => [inp({ mx: dir.x, mz: dir.z, grab: g.carriers[0].holding })]);
  console.log(`Lámpara (${mode === 'boton' ? 'con el botón' : 'en el asa'}) soltada andando: golpe máx ${f2(r.max)} m/s, integridad ${it.integrity}, estado ${it.state}, itemBroken ${count(r.ev, 'itemBroken')}`);
  g.dispose();
}
{
  // Cae desde la altura de carga: tumbada, con el centro de masas a la altura a la que va cuando se lleva (el origen
  // a `carryCom` sobre los pies, más la altura local del centro de masas)
  const { g, it } = setup(lamp, 1);
  it.body.setTranslation({ x: OPEN.x, y: CARRIER.carryCom + it.body.localCom().y, z: OPEN.z }, true);
  it.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
  const r = watchDv(g, it, 2);
  console.log(`Lámpara que cae tumbada desde la altura de carga: golpe máx ${f2(r.max)} m/s, integridad ${it.integrity}, estado ${it.state}`);
  g.dispose();
}
{
  // Un porteador la arrolla corriendo
  const { g, it } = setup(lamp, 1);
  g.carriers[0].teleport({ x: OPEN.x + 4, y: standY, z: OPEN.z });
  const r = watchDv(g, it, 2, () => [inp({ mx: -1 })]);
  console.log(`Lámpara arrollada por un porteador a la carrera: golpe máx ${f2(r.max)} m/s, integridad ${it.integrity}, estado ${it.state}`);
  g.dispose();
}
{
  // De pie en el suelo, sin que nadie la toque, 5 s: no se cae sola
  const { g, it } = setup(lamp, 1);
  const r = watchDv(g, it, 5);
  console.log(`Lámpara sola de pie 5 s: golpe máx ${f2(r.max)} m/s, de pie ${f2(rotate(it.body.rotation(), { x: 0, y: 1, z: 0 }).y)}, integridad ${it.integrity}`);
  g.dispose();
}
