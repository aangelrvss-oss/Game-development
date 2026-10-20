// Utilidades comunes del revisor de física cooperativa y sabotaje (ciclo 2). Solo lectura del código del juego.
// Uso desde los demás scripts de esta carpeta (se ejecutan con `npx vite-node <script>` desde mudanza-imposible/).
import RAPIER from '@dimforge/rapier3d-compat';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { Game } from '../../../../src/sim/game';
import { ITEMS, restHeight, type Item, type ItemDef, type ItemId } from '../../../../src/sim/items';
import { localToWorld, rotate } from '../../../../src/sim/sofa';
import { NO_INPUT, type GameEvent, type PlayerInput, type Vec3 } from '../../../../src/sim/types';
import { CALLE } from '../../../../src/levels/calle';
import { PATIO } from '../../../../src/levels/patio';
import type { LevelDef } from '../../../../src/levels/types';

export { RAPIER, Game, ITEMS, CALLE, PATIO, NO_INPUT, CENTER_Y, localToWorld, rotate, restHeight };
export type { Item, ItemDef, ItemId, GameEvent, PlayerInput, Vec3, LevelDef };

export const DT = 1 / 60;
export const standY = CENTER_Y + 0.05;
export const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
export const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : String(n));
export const count = (ev: GameEvent[], t: GameEvent['type']) => ev.filter((e) => e.type === t).length;

export async function init() { await RAPIER.init({}); }

/** Juego en marcha (sin cuenta atrás). */
export function game(level: LevelDef, humans: number, carriers = humans, style: 'atentos' | 'despistados' = 'atentos') {
  const g = new Game(RAPIER, { level, humans, carriers: Math.max(1, carriers), botStyle: style, seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  return g;
}

/** Descampado libre de «La calle» (como `scripts/item-measure.ts`): el sofá del nivel, aparcado lejos. */
export const OPEN = { x: -35, z: 25 };
export function flat(def: ItemDef, n: number, yaw = 0) {
  const g = game(CALLE, n, n);
  g.sofa.setTranslation({ x: OPEN.x - 12, y: 0.25, z: OPEN.z - 8 }, true);
  const it = g.addItem(def, { x: OPEN.x, y: restHeight(def) + 0.01, z: OPEN.z }, yaw);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  return { g, it };
}

export function play(g: Game, seconds: number, input: (g: Game) => PlayerInput[] = () => [], each?: (g: Game) => void) {
  const events: GameEvent[] = [];
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) { g.step(DT, input(g)); events.push(...g.out); each?.(g); }
  return events;
}

/** Punto más bajo de la forma (mundo). */
export function lowest(it: Item) {
  let low = Infinity;
  for (const b of it.def.shape) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    low = Math.min(low, localToWorld(it.body, { x: b.p.x + sx * b.h.x, y: b.p.y + sy * b.h.y, z: b.p.z + sz * b.h.z }).y);
  }
  return low;
}

/** Pone al porteador i frente al asa h, a `d` m hacia fuera, mirándola. */
export function atHandle(g: Game, it: Item, i: number, h: number, d = 0.75) {
  const hd = it.def.handles[h], a = localToWorld(it.body, hd.p), out = rotate(it.body.rotation(), hd.out);
  const ol = Math.hypot(out.x, out.z) || 1, o = { x: a.x + (out.x / ol) * d, z: a.z + (out.z / ol) * d };
  const c = g.carriers[i];
  c.teleport({ x: o.x, y: standY + Math.max(0, it.body.translation().y - restHeight(it.def) - 0.01), z: o.z });
  c.facing = { x: -out.x / ol, z: -out.z / ol };
}

/** Pone al porteador i en un punto cualquiera alrededor del objeto (ángulo `ang` en planta), mirando al centro. */
export function atAngle(g: Game, it: Item, i: number, ang: number, gap = 0.08) {
  // Distancia hasta el borde de la caja envolvente en esa dirección (en planta, girada con el objeto)
  const p = it.body.translation(), q = it.body.rotation();
  const dir = { x: Math.cos(ang), z: Math.sin(ang) };
  const ax = rotate(q, { x: 1, y: 0, z: 0 }), az = rotate(q, { x: 0, y: 0, z: 1 });
  const lx = dir.x * ax.x + dir.z * ax.z, lz = dir.x * az.x + dir.z * az.z;
  const b = it.bounds;
  const hx = Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), hz = Math.max(Math.abs(b.min.z), Math.abs(b.max.z));
  const t = Math.min(Math.abs(lx) > 1e-6 ? hx / Math.abs(lx) : Infinity, Math.abs(lz) > 1e-6 ? hz / Math.abs(lz) : Infinity);
  const r = t + 0.32 + gap;
  const c = g.carriers[i];
  c.teleport({ x: p.x + dir.x * r, y: standY, z: p.z + dir.z * r });
  c.facing = { x: -dir.x, z: -dir.z };
}

/** Máximo de |v| y |w| de los objetos (para detectar explosiones). */
export function speeds(g: Game) {
  let v = 0, w = 0;
  for (const it of g.items) {
    const a = it.body.linvel(), b = it.body.angvel();
    v = Math.max(v, Math.hypot(a.x, a.y, a.z)); w = Math.max(w, Math.hypot(b.x, b.y, b.z));
  }
  return { v, w };
}

/** Resumen de sucesos interesantes. */
export function evSummary(ev: GameEvent[]) {
  return `sueltas ${count(ev, 'gripBreak')}, tambaleos ${count(ev, 'wobble')}, caídas ${count(ev, 'fall')}, aturdidos ${count(ev, 'stun')}, golpes ${count(ev, 'impact')}, roto ${count(ev, 'itemBroken')}`;
}

export const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
export const itemOf = (g: Game, id: ItemId, n = 0) => g.items.filter((it) => it.def.id === id)[n];

/**
 * Equipo guiado por el script que se recupera: quien no agarra va a su asa (a 0,7 m hacia fuera), se pone de cara y
 * agarra; quien agarra pide ir hacia `goal`. Devuelve el mando de cada miembro (índices de porteador → asa).
 */
export function teamInputs(g: Game, it: Item, members: Map<number, number>, goal: { x: number; z: number } | null, tick: number): Map<number, PlayerInput> {
  const out = new Map<number, PlayerInput>();
  const q = it.body.translation();
  for (const [ci, h] of members) {
    const c = g.carriers[ci];
    if (c.heldBody === it.body) {
      if (!goal) { out.set(ci, NO_INPUT); continue; }
      const dx = goal.x - q.x, dz = goal.z - q.z, l = Math.hypot(dx, dz) || 1;
      out.set(ci, inp({ mx: dx / l, mz: dz / l }));
      continue;
    }
    if (c.holding) { out.set(ci, inp({ grab: true })); continue; }
    const hd = it.def.handles[h], a = localToWorld(it.body, hd.p), o = rotate(it.body.rotation(), hd.out);
    const ol = Math.hypot(o.x, o.z) || 1, tx = a.x + (o.x / ol) * 0.7, tz = a.z + (o.z / ol) * 0.7;
    const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { out.set(ci, inp({ mx: dx / d, mz: dz / d })); continue; }
    // De cara al asa (el giro sigue al mando) y agarra cada 4 pasos
    c.facing = { x: -o.x / ol, z: -o.z / ol };
    out.set(ci, inp({ grab: tick % 4 === 0 }));
  }
  return out;
}
