// Piloto automático para el jugador 1: recorre los puntos de paso del nivel.
// Sirve para comprobar automáticamente que el recorrido se puede completar con la física real,
// y como modo demostración. No es una IA de juego: conoce la ruta de antemano.
import type { Game } from './game';
import { ROUTE } from './level';
import { SLOTS, localToWorld, rotate } from './sofa';
import type { PlayerInput } from './types';

const wrapHalfPi = (a: number) => {
  // Diferencia de orientación módulo π (el sofá sirve igual del derecho que del revés para pasar).
  let d = a % Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
};

export class Autopilot {
  wp = 0;
  stuck = 0;
  wiggle = 0;
  lastProgress = 0;
  lastDist = Infinity;
  private grabCooldown = 0;
  constructor(readonly carrierIndex = 0) {}

  input(g: Game, dt: number): PlayerInput {
    const inp: PlayerInput = { mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false };
    if (g.phase !== 'playing') return inp;
    const me = g.carriers[this.carrierIndex];
    if (g.sofaUp < 0.4) { inp.right = true; return inp; }
    this.grabCooldown -= dt;
    if (!me.holding) {
      // Ve al asa libre más cercana y agárrala
      let best = Infinity, goal = { x: 0, z: 0 }, face = { x: 0, z: 0 };
      for (const s of SLOTS) {
        const a = localToWorld(g.sofa, s.p);
        const out = rotate(g.sofa.rotation(), s.out);
        const gx = a.x + out.x * 0.6, gz = a.z + out.z * 0.6;
        const occupied = g.carriers.some((c) => c !== me && c.holding && c.grabLocal && Math.hypot(c.grabLocal.x - s.p.x, c.grabLocal.z - s.p.z) < 0.4);
        const d = Math.hypot(gx - me.pos.x, gz - me.pos.z) + (occupied ? 5 : 0);
        if (d < best) { best = d; goal = { x: gx, z: gz }; face = { x: -out.x, z: -out.z }; }
      }
      const dx = goal.x - me.pos.x, dz = goal.z - me.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4 && this.grabCooldown <= 0) {
        me.facing = face;
        inp.grab = true;
        this.grabCooldown = 0.3;
      } else if (d > 0.05) {
        const s = Math.min(1, d / 0.8);
        inp.mx = (dx / d) * s; inp.mz = (dz / d) * s;
      }
      return inp;
    }
    const target = ROUTE[Math.min(this.wp, ROUTE.length - 1)];
    const p = g.sofaPos;
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const yawErr = target.yaw === null ? 0 : wrapHalfPi(target.yaw - g.sofaYaw);
    // Esperar al semáforo
    if (target.waitLight && dist < 0.8) {
      const l = g.light;
      if (l.ped === 'green' && l.left > 3.5 && Math.abs(yawErr) < 0.2) { this.wp++; return inp; }
      if (Math.abs(yawErr) > 0.08) inp.turn = yawErr > 0 ? -1 : 1;
      return inp;
    }
    if (dist < 0.8 && Math.abs(yawErr) < (target.tol ?? 0.3) && this.wp < ROUTE.length - 1) this.wp++;
    // Atasco: maniobra corta hacia atrás girando
    if (dist < this.lastDist - 0.05) { this.lastDist = dist; this.stuck = 0; } else this.stuck += dt;
    if (this.stuck > 2.5) { this.wiggle = 1.0; this.stuck = 0; this.lastDist = Infinity; }
    if (this.wiggle > 0) {
      this.wiggle -= dt;
      inp.mx = -dx / Math.max(dist, 1e-3) * 0.6; inp.mz = -dz / Math.max(dist, 1e-3) * 0.6;
      inp.turn = yawErr >= 0 ? -1 : 1;
      return inp;
    }
    const turning = Math.abs(yawErr) > 0.3;
    const s = Math.min(1, dist / 1.2) * (turning ? 0.35 : 1);
    if (dist > 0.05) { inp.mx = (dx / dist) * s; inp.mz = (dz / dist) * s; }
    // Pedir giro: el juego hace que el propio jugador también lo acompañe.
    if (Math.abs(yawErr) > 0.08) inp.turn = yawErr > 0 ? -1 : 1;
    inp.lift = target.label === 'Escalera';
    return inp;
  }
}
