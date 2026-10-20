// Piloto automático: lleva a uno o a varios jugadores humanos por los puntos de paso del nivel, con el objeto principal
// (la ruta es la suya en el `LevelDef` de la partida: `Game.mainRoute`), y lo suelta dentro del camión.
// Sirve para comprobar automáticamente que el recorrido se puede completar con la física real (con 1 a 4 humanos),
// y como modo demostración. No es una IA de juego: conoce la ruta de antemano.
import { inRegion } from '../levels/geometry';
import type { Waypoint } from '../levels/types';
import { CARRIER } from './carrier';
import type { Game } from './game';
import { localToWorld, rotate } from './sofa';
import type { PlayerInput } from './types';

/**
 * Último tramo, hacia el punto de entrega dentro del camión: el objeto va en línea con la rampa (del punto anterior al
 * de entrega) y apunta a `lookahead` m por delante sobre esa línea. Si el grupo (el objeto y quienes lo agarran) ya no
 * cabe por la abertura con `margin` m a cada lado antes de llegar a la rampa (a `ramp` m del punto anterior), o si
 * el centro del objeto queda a menos de `center` m de un lado de la abertura, vuelve a ponerse en línea: primero
 * retrocede en paralelo hasta `back` m por detrás del punto anterior (junto a la rampa no se puede cruzar de lado: su
 * borde es un escalón) y después va a ese punto. Se suelta con `release` de su caja envolvente dentro del camión.
 */
const FINAL = { margin: 0.1, lookahead: 1.5, back: 0.8, release: 0.9, ramp: 0.6, center: 0.6 };

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
  /** Asa a la que va cada piloto que todavía no agarra (índice del porteador → índice en las asas del sofá). */
  readonly claims = new Map<number, number>();
  /**
   * Entregado: el objeto ha llegado al último punto de la ruta (dentro del camión) y el equipo lo suelta y se queda
   * quieto. Si el objeto se sale del camión, vuelven a por él.
   */
  done = false;
  /** Desviado del último tramo: vuelve al punto anterior para entrar en línea con la rampa (`FINAL`). */
  realign = false;
  /** Movimiento del grupo en este paso (lo calcula el primer piloto que carga y lo reutilizan los demás). */
  private move: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
  private game: Game | null = null;
  private at = -1;

  /** Pasa al punto de paso siguiente y reinicia la comprobación de atasco, que mide respecto al punto actual. */
  private advance(g: Game) {
    if (this.wp < g.mainRoute.length - 1) this.wp++;
    this.lastDist = Infinity;
    this.stuck = 0;
    this.realign = false;
  }

  /** Movimiento que piden al sofá los que lo cargan en este paso (el mismo para todo el equipo). */
  carry(g: Game, dt: number): PlayerInput {
    if (this.game === g && this.at === g.clock) return this.move;
    this.game = g; this.at = g.clock;
    this.move = this.route(g, dt);
    return this.move;
  }

  /**
   * Punto de paso al que se va (`target`), distancia y error de orientación del sofá respecto a él, y hacia dónde
   * dirigirse (`dx`, `dz`): al propio punto o, en el último tramo, a lo largo de la línea de la rampa (`FINAL`).
   */
  private aim(g: Game) {
    const route = g.mainRoute;
    const i = Math.min(this.wp, route.length - 1);
    let target = route[i];
    const p = g.sofaPos;
    let gx = target.x, gz = target.z, left = Infinity;
    if (target.release && i > 0) {
      const a = route[i - 1], ux = target.x - a.x, uz = target.z - a.z, len = Math.hypot(ux, uz);
      const nx = ux / len, nz = uz / len;
      // Avance a lo largo de la línea y desvío lateral (con signo: hacia (−nz, nx))
      const along = (p.x - a.x) * nx + (p.z - a.z) * nz, side = (p.z - a.z) * nx - (p.x - a.x) * nz;
      // Lo que le falta para llegar al fondo del tramo (medido a lo largo, aunque vaya algo desviado)
      left = len - along;
      if (inRegion(g.hold, p)) return this.aimed(g, target, gx, gz, left);
      const was = this.realign, aYaw = a.yaw === null ? 0 : wrapHalfPi(a.yaw - g.sofaYaw);
      // ¿Cabe el grupo por la abertura? Lo que ocupa a lo ancho (respecto a la línea) frente al ancho de la caja de carga
      const lat = (q: { x: number; z: number }) => (q.z - a.z) * nx - (q.x - a.x) * nz;
      const hold = g.hold, holdLat = [hold.min.x, hold.max.x].flatMap((x) => [hold.min.z, hold.max.z].map((z) => lat({ x, z })));
      const it = g.sofaItem, { min, max } = it.bounds;
      const used = [min.x, max.x].flatMap((x) => [min.z, max.z].map((z) => lat(localToWorld(it.body, { x, y: 0, z }))));
      for (const c of g.carriers) if (c.heldBody === it.body) used.push(lat(c.pos) - CARRIER.radius, lat(c.pos) + CARRIER.radius);
      const lo = Math.min(...holdLat), hi = Math.max(...holdLat);
      // Antes de la rampa, si el grupo no cabe; ya en ella, solo si el propio objeto no entra (las paredes de la
      // abertura guían a los demás, como la puerta: retroceder desde la rampa costaba mucho más)
      const misfit = Math.min(...used) < lo + FINAL.margin || Math.max(...used) > hi - FINAL.margin;
      const wide = side < lo + FINAL.center || side > hi - FINAL.center;
      if ((misfit && along < FINAL.ramp) || wide) this.realign = true;
      if (this.realign && Math.hypot(a.x - p.x, a.z - p.z) < 0.5 && Math.abs(aYaw) < 0.3) this.realign = false;
      // Cambia el punto al que se va: la comprobación de atasco vuelve a medir desde cero
      if (this.realign !== was) { this.lastDist = Infinity; this.stuck = 0; }
      if (this.realign) {
        // Retrocede en paralelo a la línea hasta pasar el punto anterior; después, a ese punto
        const back = along > -FINAL.back + 0.2;
        gx = back ? a.x - nx * FINAL.back - nz * side : a.x;
        gz = back ? a.z - nz * FINAL.back + nx * side : a.z;
        return this.aimed(g, a, gx, gz, left, true);
      }
      const k = Math.min(len, Math.max(0, along) + FINAL.lookahead);
      gx = a.x + nx * k; gz = a.z + nz * k;
    }
    return this.aimed(g, target, gx, gz, left);
  }

  /** Resultado de `aim`. `toAim`: la distancia es al punto al que se dirige (al realinearse), no al de paso. */
  private aimed(g: Game, target: Waypoint, gx: number, gz: number, left: number, toAim = false) {
    const p = g.sofaPos;
    const yawErr = target.yaw === null ? 0 : wrapHalfPi(target.yaw - g.sofaYaw);
    const dist = toAim ? Math.hypot(gx - p.x, gz - p.z) : Math.hypot(target.x - p.x, target.z - p.z);
    return { target, dx: gx - p.x, dz: gz - p.z, dist, yawErr, left };
  }

  private route(g: Game, dt: number): PlayerInput {
    const inp: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
    const last = g.mainRoute.length - 1;
    let { target, dx, dz, dist, yawErr, left } = this.aim(g);
    // Esperar al semáforo
    if (target.waitLight && dist < 0.8) {
      const l = g.light;
      if (l.ped === 'green' && l.left > 3.5 && Math.abs(yawErr) < 0.2) { this.advance(g); this.wiggles = 0; return inp; }
      if (Math.abs(yawErr) > 0.08) inp.turn = yawErr > 0 ? -1 : 1;
      return inp;
    }
    if (!target.release && dist < 0.8 && Math.abs(yawErr) < (target.tol ?? 0.3) && this.wp < last) {
      this.advance(g); this.wiggles = 0;
      ({ target, dx, dz, dist, yawErr, left } = this.aim(g));
    }
    // Último punto, dentro del camión: al llegar al fondo del tramo (o al punto), con el objeto bien dentro de la caja
    // de carga y casi parado, se suelta (lo hace `Autopilot.input`). Empujar hasta el punto exacto, si ha entrado algo
    // desviado, lo llevaba contra la pared del fondo
    const v = g.sofa.linvel();
    if (target.release && this.wp >= last && (dist < 0.5 || left < 0.5) && g.holdFraction(g.sofaItem) >= FINAL.release && Math.hypot(v.x, v.z) < 0.6) {
      this.done = true;
      return inp;
    }
    // Atasco: maniobra corta hacia atrás girando. Antes `lastDist` no se reiniciaba al cambiar de punto de paso (y se
    // comparaba con la distancia al punto anterior): frente a un punto nuevo, más lejano, nunca «se acercaba» y a los
    // 2,5 s retrocedía sin motivo (en la escalera dejaba caer el sofá escaleras abajo).
    if (dist < this.lastDist - 0.05) { this.lastDist = dist; this.stuck = 0; } else this.stuck += dt;
    if (this.stuck > 2.5) {
      this.wiggle = 1.0; this.stuck = 0; this.lastDist = Infinity;
      // Si tras tres maniobras no se acerca (el sofá se ha caído fuera del camino, p. ej. por el borde de la
      // rampa), prueba el siguiente punto de paso
      if (++this.wiggles >= 3 && this.wp < last) { this.advance(g); this.wiggles = 0; }
    }
    const dl = Math.max(Math.hypot(dx, dz), 1e-3);
    if (this.wiggle > 0) {
      this.wiggle -= dt;
      inp.mx = -dx / dl * 0.6; inp.mz = -dz / dl * 0.6;
      inp.turn = yawErr >= 0 ? -1 : 1;
      return inp;
    }
    const turning = Math.abs(yawErr) > 0.3;
    const s = Math.min(1, dist / 1.2) * (turning ? 0.35 : 1);
    if (dl > 0.05) { inp.mx = (dx / dl) * s; inp.mz = (dz / dl) * s; }
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
    if (this.crew.done) {
      // Entregado: espera parado a que los ayudantes lo dejen, suelta y espera. Si el objeto se sale del camión (o no
      // llega a quedarse dentro), vuelve a por él
      if (!g.sofaItem.inHold && g.sofaItem.state !== 'carried') this.crew.done = false;
      else {
        const helpers = g.carriers.some((c) => c.human === null && c.heldBody === g.sofa);
        if (me.holding && !helpers && this.grabCooldown <= 0) { inp.grab = true; this.grabCooldown = 0.3; }
        return inp;
      }
    }
    for (const [k, t] of this.skip) if (t - dt <= 0) this.skip.delete(k); else this.skip.set(k, t - dt);
    if (!me.holding) {
      // Ve al asa libre más cercana y agárrala (si en 3 s no llega a ella, prueba otra). Una asa la ocupa quien ya
      // la agarra o un compañero del equipo que va a por ella.
      let best = Infinity, goal = { x: 0, z: 0 }, face = { x: 0, z: 0 }, pick = -1;
      for (const [i, s] of g.sofaItem.def.handles.entries()) {
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
