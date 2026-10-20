// Piloto automático: lleva a uno o a varios jugadores humanos por los puntos de paso del nivel.
// Sirve para comprobar automáticamente que el recorrido se puede completar con la física real (con 1 a 4 humanos),
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

/**
 * Lo que comparten los pilotos de un mismo equipo: el punto de paso al que va el sofá, la comprobación de atasco y
 * la maniobra de desatasco, y las asas a las que va cada uno. Con un piloto por jugador y todo propio, quien se
 * soltaba en la puerta se quedaba con un punto de paso anterior y, al volver a agarrar, tiraba del sofá hacia atrás
 * (con 3 humanos, el sofá bajó la escalera entera: 131 s); y dos podían ir a por la misma asa.
 */
export class PilotCrew {
  wp = 0;
  stuck = 0;
  wiggle = 0;
  /** Distancia más corta al punto de paso actual desde que se fijó (para detectar el atasco). */
  lastDist = Infinity;
  /** Maniobras de desatasco seguidas sin llegar al punto de paso. */
  wiggles = 0;
  /** Asa a la que va cada piloto que todavía no agarra (índice del porteador → índice de `SLOTS`). */
  readonly claims = new Map<number, number>();
  /** Movimiento del grupo en este paso (lo calcula el primer piloto que carga y lo reutilizan los demás). */
  private move: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
  private game: Game | null = null;
  private at = -1;

  /** Pasa al punto de paso siguiente y reinicia la comprobación de atasco, que mide respecto al punto actual. */
  private advance() {
    if (this.wp < ROUTE.length - 1) this.wp++;
    this.lastDist = Infinity;
    this.stuck = 0;
  }

  /** Movimiento que piden al sofá los que lo cargan en este paso (el mismo para todo el equipo). */
  carry(g: Game, dt: number): PlayerInput {
    if (this.game === g && this.at === g.clock) return this.move;
    this.game = g; this.at = g.clock;
    this.move = this.route(g, dt);
    return this.move;
  }

  /** Distancia y error de orientación del sofá respecto al punto de paso actual. */
  private aim(g: Game) {
    const target = ROUTE[Math.min(this.wp, ROUTE.length - 1)];
    const p = g.sofaPos;
    const dx = target.x - p.x, dz = target.z - p.z;
    const yawErr = target.yaw === null ? 0 : wrapHalfPi(target.yaw - g.sofaYaw);
    return { target, dx, dz, dist: Math.hypot(dx, dz), yawErr };
  }

  private route(g: Game, dt: number): PlayerInput {
    const inp: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
    let { target, dx, dz, dist, yawErr } = this.aim(g);
    // Esperar al semáforo
    if (target.waitLight && dist < 0.8) {
      const l = g.light;
      if (l.ped === 'green' && l.left > 3.5 && Math.abs(yawErr) < 0.2) { this.advance(); this.wiggles = 0; return inp; }
      if (Math.abs(yawErr) > 0.08) inp.turn = yawErr > 0 ? -1 : 1;
      return inp;
    }
    if (dist < 0.8 && Math.abs(yawErr) < (target.tol ?? 0.3) && this.wp < ROUTE.length - 1) {
      this.advance(); this.wiggles = 0;
      ({ dx, dz, dist, yawErr } = this.aim(g));
    }
    // Atasco: maniobra corta hacia atrás girando. Antes `lastDist` no se reiniciaba al cambiar de punto de paso (y se
    // comparaba con la distancia al punto anterior): frente a un punto nuevo, más lejano, nunca «se acercaba» y a los
    // 2,5 s retrocedía sin motivo (en la escalera dejaba caer el sofá escaleras abajo).
    if (dist < this.lastDist - 0.05) { this.lastDist = dist; this.stuck = 0; } else this.stuck += dt;
    if (this.stuck > 2.5) {
      this.wiggle = 1.0; this.stuck = 0; this.lastDist = Infinity;
      // Si tras tres maniobras no se acerca (el sofá se ha caído fuera del camino, p. ej. por el borde de la
      // rampa), prueba el siguiente punto de paso
      if (++this.wiggles >= 3 && this.wp < ROUTE.length - 1) { this.advance(); this.wiggles = 0; }
    }
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
    // Sin alzar: al agarrar, la mano sube sola a la altura de carga (también en la escalera)
    return inp;
  }
}

export class Autopilot {
  private grabCooldown = 0;
  /** Tiempo intentando llegar a un asa sin conseguirlo, y asas descartadas un rato (tapadas por una pared). */
  private tryTime = 0;
  private skip = new Map<number, number>();
  /**
   * `crew`: estado compartido con los pilotos de los demás jugadores. Un piloto suelto (un humano con ayudantes, la
   * demostración) tiene el suyo; para varios humanos, `Autopilot.team`.
   */
  constructor(readonly carrierIndex = 0, readonly crew = new PilotCrew()) {}

  /** Un piloto por cada jugador humano de la partida, en el orden de sus mandos, con la ruta compartida. */
  static team(g: Game): Autopilot[] {
    const crew = new PilotCrew();
    return g.carriers.filter((c) => c.human !== null).sort((a, b) => a.human! - b.human!).map((c) => new Autopilot(c.id, crew));
  }

  /** Punto de paso al que va el sofá (compartido por el equipo). */
  get wp() { return this.crew.wp; }

  input(g: Game, dt: number): PlayerInput {
    const inp: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
    if (g.phase !== 'playing') return inp;
    const me = g.carriers[this.carrierIndex];
    if (g.sofaUp < 0.4) { inp.right = true; return inp; }
    this.grabCooldown -= dt;
    for (const [k, t] of this.skip) if (t - dt <= 0) this.skip.delete(k); else this.skip.set(k, t - dt);
    if (!me.holding) {
      // Ve al asa libre más cercana y agárrala (si en 3 s no llega a ella, prueba otra). Una asa la ocupa quien ya
      // la agarra o un compañero del equipo que va a por ella.
      let best = Infinity, goal = { x: 0, z: 0 }, face = { x: 0, z: 0 }, pick = -1;
      for (const [i, s] of SLOTS.entries()) {
        if (this.skip.has(i)) continue;
        const a = localToWorld(g.sofa, s.p);
        const out = rotate(g.sofa.rotation(), s.out);
        const gx = a.x + out.x * 0.6, gz = a.z + out.z * 0.6;
        const held = g.carriers.some((c) => c !== me && c.heldBody === g.sofa && c.grabLocal && Math.hypot(c.grabLocal.x - s.p.x, c.grabLocal.z - s.p.z) < 0.4);
        const claimed = [...this.crew.claims].some(([ci, si]) => ci !== this.carrierIndex && si === i);
        const d = Math.hypot(gx - me.pos.x, gz - me.pos.z) + (held || claimed ? 5 : 0);
        if (d < best) { best = d; goal = { x: gx, z: gz }; face = { x: -out.x, z: -out.z }; pick = i; }
      }
      if (pick >= 0) this.crew.claims.set(this.carrierIndex, pick); else this.crew.claims.delete(this.carrierIndex);
      this.tryTime += dt;
      if (this.tryTime > 3 && pick >= 0) { this.skip.set(pick, 5); this.tryTime = 0; }
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
    this.crew.claims.delete(this.carrierIndex);
    this.tryTime = 0;
    return { ...this.crew.carry(g, dt) };
  }
}
