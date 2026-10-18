// Ayudantes controlados por la máquina. Son deliberadamente simples:
// van a un asa libre, la agarran e imitan el movimiento de los jugadores humanos que cargan,
// añadiendo la componente de giro que pidan (Q/E). No esquivan obstáculos ni deciden la ruta.
import type RAPIER from '@dimforge/rapier3d-compat';
import { CARRIER, type Carrier } from './carrier';
import { SLOTS, localToWorld, rotate } from './sofa';
import type { PlayerInput } from './types';

export type BotStyle = 'atentos' | 'despistados';

export const BOT = {
  /** Retraso de reacción en pasos de 1/60 s. */
  delay: { atentos: 10, despistados: 28 },
  turnRate: 0.9,
};

export class BotBrain {
  slot: number;
  history: { x: number; z: number; w: number }[] = [];
  tryTime = 0;
  wander = { x: 0, z: 0, t: 0 };
  /** Tiempo empujando sin avanzar mientras carga. */
  blocked = 0;
  /** Espera antes de volver a agarrar tras soltar por bloqueo. */
  regrab = 0;
  constructor(slot: number, readonly style: BotStyle, private rng: () => number) { this.slot = slot; }

  /** Calcula el mando del ayudante para este paso. */
  think(me: Carrier, sofa: RAPIER.RigidBody, lead: { x: number; z: number; w: number; active: boolean }, taken: Set<number>, dt: number): PlayerInput {
    const input: PlayerInput = { mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false };
    if (me.stunned > 0) return input;
    const p = me.pos;
    if (!me.holding) {
      if (this.regrab > 0) {
        // Se aparta un poco y deja pasar al sofá; después vuelve a por un asa.
        this.regrab -= dt;
        input.mx = lead.x / CARRIER.carrySpeed * 0.8; input.mz = lead.z / CARRIER.carrySpeed * 0.8;
        return input;
      }
      const slot = SLOTS[this.slot];
      const anchor = localToWorld(sofa, slot.p);
      const out = rotate(sofa.rotation(), slot.out);
      const ol = Math.hypot(out.x, out.z) || 1;
      const goal = { x: anchor.x + (out.x / ol) * 0.6, z: anchor.z + (out.z / ol) * 0.6 };
      const dx = goal.x - p.x, dz = goal.z - p.z;
      const d = Math.hypot(dx, dz);
      this.tryTime += dt;
      if (d < 0.45 && Math.abs(anchor.y - p.y) < 1.2) {
        input.grab = true;
      } else {
        const s = Math.min(1, d / 0.8);
        input.mx = (dx / d) * s; input.mz = (dz / d) * s;
      }
      // Si no llega en un rato (bloqueado), prueba otra asa libre.
      if (this.tryTime > 5) {
        this.tryTime = 0;
        const free = SLOTS.map((_, i) => i).filter((i) => !taken.has(i) && i !== this.slot);
        if (free.length) this.slot = free[Math.floor(this.rng() * free.length)];
      }
      return input;
    }
    this.tryTime = 0;
    // Imita a los humanos con retraso de reacción.
    this.history.push({ x: lead.x, z: lead.z, w: lead.w });
    const delay = BOT.delay[this.style];
    while (this.history.length > delay) this.history.shift();
    const h = this.history[0];
    if (!lead.active && h.x === 0 && h.z === 0 && h.w === 0) return input;
    const c = sofa.translation();
    const rx = p.x - c.x, rz = p.z - c.z;
    // v = v_líder + ω × r (ω sobre +y)
    let vx = h.x + h.w * rz;
    let vz = h.z - h.w * rx;
    if (this.style === 'despistados') {
      this.wander.t -= dt;
      if (this.wander.t <= 0) {
        this.wander = { x: (this.rng() - 0.5) * 1.6, z: (this.rng() - 0.5) * 1.6, t: 0.6 + this.rng() * 1.4 };
      }
      vx += this.wander.x; vz += this.wander.z;
    }
    input.mx = vx / CARRIER.carrySpeed;
    input.mz = vz / CARRIER.carrySpeed;
    // ¿Atascado contra algo? Si empuja y no avanza, suelta para no bloquear al grupo (pasa en puertas).
    const want = Math.hypot(vx, vz);
    const v = me.body.linvel();
    const along = want > 1e-3 ? (v.x * vx + v.z * vz) / want : 0;
    this.blocked = want > 0.9 && along < 0.3 * want ? this.blocked + dt : 0;
    if (this.blocked > 0.7) {
      this.blocked = 0;
      this.regrab = 2.2;
      input.grab = true; // en un ayudante que carga, «agarrar» significa soltar
      const free = SLOTS.map((_, i) => i).filter((i) => !taken.has(i) && i !== this.slot);
      if (free.length) this.slot = free[Math.floor(this.rng() * free.length)];
    }
    return input;
  }
}
