// Utilidades comunes de la revisión independiente (rol B, física) del ciclo 1. Solo lectura del juego.
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type GameEvent, type PlayerInput } from '../../../../src/sim/types';

export const DT = 1 / 60;
export const OPEN = { x: -35, z: 25 };
export const standY = CENTER_Y + 0.05;
export const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
export const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : String(n));
export const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : String(n));
export { RAPIER, Game, NO_INPUT, SOFA, localToWorld, yawQuat };

let inited = false;
export async function init() { if (!inited) { await RAPIER.init({}); inited = true; } }

export function play(g: Game, seconds: number, input: (g: Game, i: number) => PlayerInput[] = () => [], each?: (g: Game, i: number) => void) {
  const events: GameEvent[] = [];
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) { g.step(DT, input(g, i)); events.push(...g.out); each?.(g, i); }
  return events;
}
export const count = (ev: GameEvent[], t: GameEvent['type']) => ev.filter((e) => e.type === t).length;

/** Partida en juego, sin cuenta atrás ni ayudantes con cerebro, sofá en (x, z) y porteadores aparcados. */
export function setup(n: number, opts: { x?: number; z?: number; yaw?: number; humans?: number } = {}) {
  const x = opts.x ?? OPEN.x, z = opts.z ?? OPEN.z, yaw = opts.yaw ?? 0;
  const g = new Game(RAPIER, { humans: opts.humans ?? n, carriers: n, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x, y: 0.25, z }, true);
  g.sofa.setRotation(yawQuat(yaw), true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  return g;
}

/** Pone al porteador i a `gap` m de un punto local (lx, lz) del sofá, en la dirección local (ox, oz), mirándolo. */
export function near(g: Game, i: number, lx: number, lz: number, ox: number, oz: number, gap = 0.75) {
  const a = localToWorld(g.sofa, { x: lx, y: 0, z: lz });
  const o = localToWorld(g.sofa, { x: lx + ox * gap, y: 0, z: lz + oz * gap });
  const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z });
  c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
}

/** Esquinas de la caja envolvente del sofá (locales) para la altura mínima sobre el suelo. */
export const sofaCorners = (() => {
  const h = SOFA.half, out: { x: number; y: number; z: number }[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ x: sx * h.x, y: -h.y, z: sz * h.z });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ x: sx * h.x, y: 0.66, z: sz * h.z });
  return out;
})();
export const sofaLowest = (g: Game) => Math.min(...sofaCorners.map((p) => localToWorld(g.sofa, p).y));

/** Mayor solape (m) entre dos conjuntos de colliders (distancia de contacto negativa). */
export function depth(a: RAPIER.Collider[], b: RAPIER.Collider[]) {
  let worst = 0;
  for (const x of a) for (const y of b) {
    const k = x.contactCollider(y, 0);
    if (k && k.distance < 0) worst = Math.max(worst, -k.distance);
  }
  return worst;
}

/** Mayor solape del collider con cualquier otro del mundo (excepto los que diga `skip`). */
export function overlapAny(g: Game, c: RAPIER.Collider, skip?: (o: RAPIER.Collider) => boolean) {
  let worst = 0, who: RAPIER.Collider | null = null;
  g.world.intersectionsWithShape(c.translation(), c.rotation(), c.shape, (o) => {
    if (skip?.(o)) return true;
    const k = c.contactCollider(o, 0);
    if (k && k.distance < 0 && -k.distance > worst) { worst = -k.distance; who = o; }
    return true;
  }, undefined, undefined, c);
  return { worst, who: who as RAPIER.Collider | null };
}

/** Caja dinámica registrada con la API genérica de agarre. */
export function box(g: Game, m: number, half: { x: number; y: number; z: number }, at: { x: number; y?: number; z: number }) {
  const body = g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y ?? half.y + 0.01, at.z).setCcdEnabled(true));
  const col = g.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setDensity(m / (8 * half.x * half.y * half.z)).setFriction(0.6), body);
  g.addGrabbable(body, [col]);
  return { body, col };
}
