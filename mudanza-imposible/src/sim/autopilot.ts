// Piloto automático: lleva a uno o a varios jugadores humanos con los objetos de la mudanza por sus rutas (cada objeto
// tiene la suya en el `LevelDef` de la partida) y los suelta dentro del camión.
// - Un equipo (`PilotCrew`) lleva un objeto por su ruta: sus pilotos comparten el punto de paso, la comprobación de
//   atasco y el reparto de las asas.
// - Con varios humanos (`Autopilot.team`), un reparto (`PilotPlan`) forma los equipos: a cada objeto obligatorio que
//   falta, tantas personas como hacen falta para llevarlo en el aire (`ItemDef.minCarriers`), las más cercanas; al
//   acabar, cada una pasa al objeto siguiente. Con un solo objeto («La calle»), todos van al sofá, como antes.
// Sirve para comprobar automáticamente que los niveles se pueden completar con la física real (con 1 a 4 humanos), y
// como modo demostración. No es una IA de juego: conoce las rutas de antemano. Lo mismo para cualquier objeto: lo que
// cambia de uno a otro sale de sus datos (asas, forma, `minCarriers`) y de su ruta.
import { inRegion } from '../levels/geometry';
import { TRUCK, truckToWorld, worldToTruck } from '../levels/truck';
import type { Waypoint } from '../levels/types';
import { CARRIER, type Carrier } from './carrier';
import type { Game } from './game';
import type { Item } from './items';
import { localToWorld, rotate, sofaUp, sofaYaw } from './sofa';
import type { PlayerInput } from './types';

/**
 * Último tramo, hacia el punto de entrega dentro del camión: el objeto va en línea con la rampa (del punto anterior al
 * de entrega) y apunta a `lookahead` m por delante sobre esa línea. Si el grupo (el objeto y quienes lo agarran) ya no
 * cabe por la abertura con `margin` m a cada lado antes de llegar a la rampa (a `ramp` m del punto anterior), o si
 * el centro del objeto queda a menos de su medio ancho más `center` m de un lado de la abertura (con el sofá, 0,6 m; un
 * margen fijo de 0,6 m echaba atrás sin motivo a una caja que entraba por un lado), vuelve a ponerse en línea: primero
 * retrocede en paralelo hasta `back` m por detrás del punto anterior (junto a la rampa no se puede cruzar de lado: su
 * borde es un escalón) y después va a ese punto. Se suelta con `release` de su caja envolvente dentro del camión y el
 * objeto ya quieto y derecho (más despacio que `still` m/s y con su «arriba» a más de `upright`, o pasados `settle` s
 * parados). `wait`: distancia (m) a la entrada de su carril a la que espera a que esté libre (`PilotPlan.mayEnter`).
 * `lying`: tiempo agarrando su objeto tumbado tras el que lo suelta para enderezarlo; `grabStill`: velocidad (m/s) por
 * debajo de la cual se agarra un objeto; `grabSide`: desvío lateral máximo (m) respecto al frente del asa para agarrar;
 * `rightWait`: espera para agarrarlo tras enderezarlo (s).
 */
const FINAL = {
  margin: 0.1, lookahead: 1.5, back: 0.8, release: 0.9, ramp: 0.6, center: 0.15, wait: 2.5, still: 0.12, upright: 0.97,
  settle: 1.5, lying: 0.5, grabStill: 0.5, grabSide: 0.15, rightWait: 1,
};

/**
 * Andar sin carga (a por un asa, fuera del camión o a esperar):
 * - `clear`: holgura alrededor de la planta de un objeto (además del radio del porteador). Si el camino recto cruza un
 *   objeto (también el suyo, si es ligero y el asa está al otro lado: con `ownClear` de holgura y sin contar los últimos
 *   `near` m), va antes a la esquina de esa planta ensanchada que da el camino más corto: así no tumba la lámpara al
 *   pasar. Pegado a un objeto (a menos de `clear`, al soltarlo), solo lo rodea si el camino lo atraviesa (su planta con
 *   el radio del porteador menos `touch`), y dentro del camión, sin salirse de él. Rodeando, va a `around` de su
 *   velocidad. Una esquina a menos de `at` m no sirve, y una desde la que aún hay que rodearlo cuenta `again` m más;
 * - `personal`: distancia a la que rodea y frena ante quien no es de su equipo (como los ayudantes);
 * - `exit`: al salir del camión, baja por la rampa en línea recta hasta `exit` m por detrás de su pie (por los lados
 *   de la rampa hay un escalón de hasta 1 m) y, si no tiene adónde ir, espera a un lado, a `aside` m del costado;
 * - `spare`: en un equipo del reparto, lo que se alarga (m) el camino a un asa que no es de las primeras (las que
 *   ocupa un equipo de su tamaño);
 * - `tryNear`: a menos de esto (m) de un asa empieza a contar el tiempo para darla por inalcanzable.
 */
const WALK = {
  clear: 0.25, ownClear: 0.15, near: 0.3, touch: 0.02, around: 0.5, at: 0.25, again: 2, personal: 1.0, exit: 0.6, aside: 1.6,
  spare: 3, tryNear: 2.5,
};

const wrapHalfPi = (a: number) => {
  // Diferencia de orientación módulo π (el sofá sirve igual del derecho que del revés para pasar).
  let d = a % Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
};

/**
 * Lo que comparten los pilotos de un mismo equipo: el objeto que llevan, el punto de paso al que va, la comprobación
 * de atasco y la maniobra de desatasco, y las asas a las que va cada uno. Con un piloto por jugador y todo propio,
 * quien se soltaba en la puerta se quedaba con un punto de paso anterior y, al volver a agarrar, tiraba del sofá hacia
 * atrás (con 3 humanos, el sofá bajó la escalera entera: 131 s); y dos podían ir a por la misma asa.
 */
export class PilotCrew {
  wp = 0;
  stuck = 0;
  wiggle = 0;
  /** Distancia más corta al punto de paso actual desde que se fijó (para detectar el atasco). */
  lastDist = Infinity;
  /** Maniobras de desatasco seguidas sin llegar al punto de paso. */
  wiggles = 0;
  /** Asa a la que va cada piloto que todavía no agarra (índice del porteador → índice en las asas del objeto). */
  readonly claims = new Map<number, number>();
  /** Pilotos del equipo (índices de sus porteadores). */
  readonly members = new Set<number>();
  /**
   * Entregado: el objeto ha llegado al último punto de la ruta (dentro del camión) y el equipo lo suelta y se queda
   * quieto. Si el objeto se sale del camión, vuelven a por él.
   */
  done = false;
  /** Desviado del último tramo: vuelve al punto anterior para entrar en línea con la rampa (`FINAL`). */
  realign = false;
  /** Tiempo desde que se dio por entregado (esperando a que el objeto se pare para soltarlo). */
  doneTime = 0;
  /**
   * ¿Puede entrar en el último tramo de su ruta (rampa y camión)? Lo pone el reparto (`PilotPlan.mayEnter`); sin él,
   * siempre.
   */
  gate: ((g: Game) => Gate) | null = null;
  /** Movimiento del grupo en este paso (lo calcula el primer piloto que carga y lo reutilizan los demás). */
  private move: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
  private game: Game | null = null;
  private at = -1;

  /** `item`: el objeto que lleva el equipo (índice en `Game.items`); sin él, el principal del nivel. */
  constructor(readonly item: number | null = null) {}

  /** Objeto que lleva el equipo. */
  target(g: Game): Item { return g.items[this.item ?? g.level.main]; }

  /** Ruta del objeto: la de su colocación en el nivel. */
  route(g: Game): Waypoint[] { return g.level.items[this.item ?? g.level.main].route; }

  /** Pasa al punto de paso siguiente y reinicia la comprobación de atasco, que mide respecto al punto actual. */
  private advance(g: Game) {
    if (this.wp < this.route(g).length - 1) this.wp++;
    this.lastDist = Infinity;
    this.stuck = 0;
    this.realign = false;
  }

  /** Movimiento que piden al objeto los que lo cargan en este paso (el mismo para todo el equipo). */
  carry(g: Game, dt: number): PlayerInput {
    if (this.game === g && this.at === g.clock) return this.move;
    this.game = g; this.at = g.clock;
    this.move = this.steer(g, dt);
    return this.move;
  }

  /**
   * Punto de paso al que se va (`target`), distancia y error de orientación del objeto respecto a él, y hacia dónde
   * dirigirse (`dx`, `dz`): al propio punto o, en el último tramo, a lo largo de la línea de la rampa (`FINAL`).
   */
  private aim(g: Game) {
    const route = this.route(g), it = this.target(g);
    const i = Math.min(this.wp, route.length - 1);
    const target = route[i];
    const p = it.body.translation();
    let gx = target.x, gz = target.z, left = Infinity;
    if (target.release && i > 0) {
      const a = route[i - 1], ux = target.x - a.x, uz = target.z - a.z, len = Math.hypot(ux, uz);
      const nx = ux / len, nz = uz / len;
      // Avance a lo largo de la línea y desvío lateral (con signo: hacia (−nz, nx))
      const along = (p.x - a.x) * nx + (p.z - a.z) * nz, side = (p.z - a.z) * nx - (p.x - a.x) * nz;
      // Lo que le falta para llegar al fondo del tramo (medido a lo largo, aunque vaya algo desviado)
      left = len - along;
      if (inRegion(g.hold, p)) return this.aimed(g, target, gx, gz, left);
      const was = this.realign, aYaw = a.yaw === null ? 0 : wrapHalfPi(a.yaw - sofaYaw(it.body));
      // ¿Cabe el grupo por la abertura? Lo que ocupa a lo ancho (respecto a la línea) frente al ancho de la caja de carga
      const lat = (q: { x: number; z: number }) => (q.z - a.z) * nx - (q.x - a.x) * nz;
      const hold = g.hold, holdLat = [hold.min.x, hold.max.x].flatMap((x) => [hold.min.z, hold.max.z].map((z) => lat({ x, z })));
      const { min, max } = it.bounds;
      const used = [min.x, max.x].flatMap((x) => [min.z, max.z].map((z) => lat(localToWorld(it.body, { x, y: 0, z }))));
      // Quienes lo agarran; en un equipo del reparto, sin los ayudantes de la máquina que se suman por un costado (en un
      // carril estrecho el grupo no cabría nunca y volvería atrás sin fin: el ayudante que topa con la pared suelta solo)
      for (const c of g.carriers) {
        if (c.heldBody !== it.body || (this.members.size && c.human === null)) continue;
        used.push(lat(c.pos) - CARRIER.radius, lat(c.pos) + CARRIER.radius);
      }
      const lo = Math.min(...holdLat), hi = Math.max(...holdLat);
      // Antes de la rampa, si el grupo no cabe; ya en ella, solo si el propio objeto no entra (las paredes de la
      // abertura guían a los demás, como la puerta: retroceder desde la rampa costaba mucho más)
      const misfit = Math.min(...used) < lo + FINAL.margin || Math.max(...used) > hi - FINAL.margin;
      // El centro, a su medio ancho (el menor) más `center` de cada lado (con el sofá, 0,6 m)
      const center = Math.min(max.x - min.x, max.z - min.z) / 2 + FINAL.center;
      const wide = side < lo + center || side > hi - center;
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
    const body = this.target(g).body, p = body.translation();
    const yawErr = target.yaw === null ? 0 : wrapHalfPi(target.yaw - sofaYaw(body));
    const dist = toAim ? Math.hypot(gx - p.x, gz - p.z) : Math.hypot(target.x - p.x, target.z - p.z);
    return { target, dx: gx - p.x, dz: gz - p.z, dist, yawErr, left };
  }

  private steer(g: Game, dt: number): PlayerInput {
    const inp: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
    const it = this.target(g), last = this.route(g).length - 1;
    let { target, dx, dz, dist, yawErr, left } = this.aim(g);
    // Esperar al semáforo
    if (target.waitLight && dist < 0.8) {
      const l = g.light;
      if (l.ped === 'green' && l.left > 3.5 && Math.abs(yawErr) < 0.2) { this.advance(g); this.wiggles = 0; return inp; }
      if (Math.abs(yawErr) > 0.08) inp.turn = yawErr > 0 ? -1 : 1;
      return inp;
    }
    // Antes del último tramo (rampa y camión), espera a que su carril esté libre (`gate`, del reparto): si tiene que
    // entrar antes otro objeto que va más al fondo, o si hay alguien de otro equipo en él, espera a `FINAL.wait` m de la
    // entrada del carril (en ella, le cerraba el paso al que tenía que entrar antes)
    const gate = this.wp + 1 === last - 1 && this.gate ? this.gate(g) : 'free';
    if (gate !== 'free' && dist < FINAL.wait) {
      this.stuck = 0; this.lastDist = dist;
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
    const v = it.body.linvel();
    if (target.release && this.wp >= last && (dist < 0.5 || left < 0.5) && g.holdFraction(it) >= FINAL.release && Math.hypot(v.x, v.z) < 0.6) {
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

/**
 * Reparto del trabajo entre los pilotos de varios humanos: un equipo por objeto obligatorio que falta.
 * - Los objetos van de más a menos personas necesarias (`minCarriers`); a igualdad, antes los que pueden entrar ya en
 *   su carril del camión (`mayEnter`) y, después, del más cercano al camión al más lejano (así se despeja el camino de
 *   los de detrás). A cada uno van los `minCarriers` pilotos libres más cercanos;
 *   uno que necesita más manos de las que hay libres espera a que se libere alguien, y los libres van a otro.
 * - Si sobran pilotos cuando ya todo tiene equipo, se suman a los equipos que se acaban de formar para un objeto de
 *   varias personas (más manos lo llevan mejor), hasta llenar sus asas: con un solo objeto, todos van a él.
 * - Un equipo acaba cuando su objeto queda cargado o se rompe, y sus pilotos quedan libres. Si un objeto cargado se
 *   sale del camión, vuelve a la lista.
 * Los ayudantes de la máquina van por su cuenta al objeto que necesita manos (`Game.chooseItems`): cuentan como manos
 * para que un objeto pesado no espere a que haya bastantes jugadores libres.
 */
export class PilotPlan {
  /** Equipo de cada piloto (índice del porteador → equipo); sin equipo, espera. */
  readonly crewOf = new Map<number, PilotCrew>();
  private crews: PilotCrew[] = [];
  private game: Game | null = null;
  private at = -1;

  constructor(readonly pilots: number[]) {}

  /** Rehace el reparto (una vez por paso, lo pida quien lo pida). */
  update(g: Game) {
    if (this.game === g && this.at === g.clock) return;
    this.game = g; this.at = g.clock;
    // Equipos que han acabado: su objeto ya cuenta como cargado (lo han soltado dentro y esperan quietos a que se quede
    // quieto, sin rozarlo al salir) o se ha roto
    for (const c of [...this.crews]) {
      const it = c.target(g);
      if (it.state === 'loaded' || it.state === 'broken') this.dissolve(c);
    }
    // Objetos que faltan: obligatorios, sin cargar ni romper, sin equipo y que no esperan quietos dentro del camión
    const busy = new Set(this.crews.map((c) => c.target(g)));
    const opening = g.level.truck;
    const toTruck = (it: Item) => { const p = it.body.translation(); return Math.hypot(p.x - opening.x, p.z - opening.z); };
    // Primero lo que necesita más manos; después, lo que no tendrá que esperar en la rampa a que se cargue algo que va
    // más al fondo de su carril (`blocked`); y después, lo más cercano al camión
    const blocked = (it: Item) => this.behind(g, it, lane(it, g.level.items[it.index].route)) ? 1 : 0;
    const pending = g.items
      .filter((it) => it.required && it.state !== 'loaded' && it.state !== 'broken' && !busy.has(it) && !(it.inHold && it.state === 'pending'))
      .sort((a, b) => b.def.minCarriers - a.def.minCarriers || blocked(a) - blocked(b) || toTruck(a) - toTruck(b));
    let free = this.pilots.filter((i) => !this.crewOf.has(i));
    const formed: PilotCrew[] = [];
    for (const it of pending) {
      // Los ayudantes van al objeto que lleva un jugador y necesita manos: con ellos, basta con menos jugadores
      const need = Math.max(1, it.def.minCarriers - g.bots.size);
      if (free.length < need) continue;
      const p = it.body.translation(), far = (i: number) => Math.hypot(g.carriers[i].pos.x - p.x, g.carriers[i].pos.z - p.z);
      const pick = [...free].sort((a, b) => far(a) - far(b)).slice(0, need);
      const crew = new PilotCrew(it.index);
      crew.gate = (gg) => this.mayEnter(gg, crew);
      for (const i of pick) this.join(crew, i);
      this.crews.push(crew);
      formed.push(crew);
      free = free.filter((i) => !pick.includes(i));
    }
    // Los que sobran, a los objetos de varias personas que acaban de recibir equipo (en el orden del reparto)
    for (const crew of formed) {
      const it = crew.target(g);
      if (it.def.minCarriers < 2) continue;
      while (free.length && crew.members.size < it.def.handles.length) this.join(crew, free.shift()!);
    }
  }

  /**
   * ¿Puede el equipo entrar en el último tramo de su ruta (de la rampa a su sitio en el camión)? Ese tramo es su carril:
   * - si el sitio de su objeto queda en el carril de otro objeto obligatorio que va más al fondo y aún no está cargado,
   *   espera a que lo esté (si no, se lo taparía): `order`;
   * - si hay alguien de otro equipo en su carril (llevando otra cosa o saliendo del camión), espera a que salga: `people`.
   * Con un solo objeto («La calle»), nunca espera: no hay más carriles que el suyo ni nadie de otro equipo.
   */
  mayEnter(g: Game, crew: PilotCrew): Gate {
    const it = crew.target(g), mine = lane(it, crew.route(g));
    if (!mine) return 'free';
    if (this.behind(g, it, mine)) return 'order';
    const around = grow(mine.rect, LANE.people);
    for (const c of g.carriers) {
      if (crew.members.has(c.id) || c.heldBody === it.body) continue;
      if (inside(around, c.pos)) return 'people';
    }
    return 'free';
  }

  /** ¿Va el sitio de `it` en el carril de otro objeto obligatorio que va más al fondo y aún no está cargado? */
  private behind(g: Game, it: Item, mine: ReturnType<typeof lane>): boolean {
    if (!mine) return false;
    const opening = g.level.truck, deep = (q: { x: number; z: number }) => Math.hypot(q.x - opening.x, q.z - opening.z);
    for (const o of g.items) {
      if (o === it || !o.required || o.state === 'loaded' || o.state === 'broken') continue;
      const other = lane(o, g.level.items[o.index].route);
      if (other && deep(other.slot) > deep(mine.slot) && overlaps(other.rect, mine.foot)) return true;
    }
    return false;
  }

  private join(crew: PilotCrew, i: number) {
    crew.members.add(i);
    this.crewOf.set(i, crew);
  }

  private dissolve(crew: PilotCrew) {
    for (const i of crew.members) this.crewOf.delete(i);
    this.crews = this.crews.filter((c) => c !== crew);
  }
}

/**
 * Carriles del último tramo (`PilotPlan.mayEnter`): el rectángulo que barre un objeto de la rampa a su sitio, con
 * `margin` m de holgura a los lados y, a lo largo, su largo y el de quien lo lleva (`ends`); y `people`, lo que se
 * ensancha para ver si alguien de otro equipo está en él.
 */
const LANE = { margin: 0.1, ends: 2 * CARRIER.radius + 0.2, people: 0.3 };

interface Rect { x0: number; x1: number; z0: number; z1: number }
/** Paso al último tramo: libre, cerrado hasta que se cargue algo que va más al fondo, o con alguien de otro equipo dentro. */
type Gate = 'free' | 'order' | 'people';
const inside = (r: Rect, p: { x: number; z: number }) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const grow = (r: Rect, d: number): Rect => ({ x0: r.x0 - d, x1: r.x1 + d, z0: r.z0 - d, z1: r.z1 + d });

/**
 * Último tramo de la ruta de un objeto: su sitio en el camión (`slot`), lo que ocupa allí (`foot`) y el rectángulo que
 * barre desde el punto anterior (`rect`, alineado con los ejes: la rampa y la caja de carga lo están). Su ancho sale de
 * la forma del objeto: con giro fijo, su medida de través; sin él, la mayor.
 */
function lane(it: Item, route: Waypoint[]) {
  const n = route.length;
  if (n < 2 || !route[n - 1].release) return null;
  const a = route[n - 2], s = route[n - 1];
  const { min, max } = it.bounds, hx = (max.x - min.x) / 2, hz = (max.z - min.z) / 2;
  const along = Math.abs(s.x - a.x) >= Math.abs(s.z - a.z);
  // Medio ancho de través y medio largo a lo largo de la marcha (con giro fijo, girado: en cuartos de vuelta)
  let across = Math.max(hx, hz), length = across;
  if (s.yaw !== null) {
    const turned = Math.abs(Math.sin(s.yaw)) > 0.5;
    const lx = turned ? hz : hx, lz = turned ? hx : hz;
    across = along ? lz : lx; length = along ? lx : lz;
  }
  const w = across + LANE.margin, e = length + LANE.ends;
  const rect = along
    ? { x0: Math.min(a.x, s.x) - e, x1: Math.max(a.x, s.x) + e, z0: Math.min(a.z, s.z) - w, z1: Math.max(a.z, s.z) + w }
    : { x0: Math.min(a.x, s.x) - w, x1: Math.max(a.x, s.x) + w, z0: Math.min(a.z, s.z) - e, z1: Math.max(a.z, s.z) + e };
  const foot = along
    ? { x0: s.x - length, x1: s.x + length, z0: s.z - across, z1: s.z + across }
    : { x0: s.x - across, x1: s.x + across, z0: s.z - length, z1: s.z + length };
  return { slot: { x: s.x, z: s.z }, rect, foot };
}

interface Footprint {
  /** ¿Está el punto (x, z) dentro de la planta ensanchada? */
  inside(x: number, z: number): boolean;
  /** Esquinas de la planta ensanchada, con 15 cm más de margen (por donde se la rodea). */
  corners: { x: number; z: number }[];
  /**
   * Junto a una cara (el punto está más allá de ella que de las otras): los dos puntos, a lo largo de esa cara, que
   * quedan fuera de la planta ensanchada por los lados (para salir de detrás de un objeto sin atravesarlo).
   */
  slides(x: number, z: number): { x: number; z: number }[];
}

/** Planta de un objeto (su caja envolvente, girada con él, en horizontal), ensanchada `grow` m por cada lado. */
function footprint(it: Item, grow: number): Footprint {
  const body = it.body, q = body.rotation(), { min, max } = it.bounds;
  // Ejes de la planta (su x y su z locales, en horizontal)
  const ax = rotate(q, { x: 1, y: 0, z: 0 }), az = rotate(q, { x: 0, y: 0, z: 1 });
  const al = Math.hypot(ax.x, ax.z) || 1, zl = Math.hypot(az.x, az.z) || 1;
  const ex = { x: ax.x / al, z: ax.z / al }, ez = { x: az.x / zl, z: az.z / zl };
  const o = localToWorld(body, { x: (min.x + max.x) / 2, y: 0, z: (min.z + max.z) / 2 });
  const hx = (max.x - min.x) / 2 + grow, hz = (max.z - min.z) / 2 + grow, m = 0.15;
  const at = (u: number, v: number) => ({ x: o.x + ex.x * u + ez.x * v, z: o.z + ex.z * u + ez.z * v });
  const local = (x: number, z: number) => ({ u: (x - o.x) * ex.x + (z - o.z) * ex.z, v: (x - o.x) * ez.x + (z - o.z) * ez.z });
  return {
    inside(x, z) {
      const { u, v } = local(x, z);
      return Math.abs(u) < hx && Math.abs(v) < hz;
    },
    corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => at(su * (hx + m), sv * (hz + m))),
    slides(x, z) {
      const { u, v } = local(x, z);
      return Math.abs(u) / hx >= Math.abs(v) / hz ? [at(u, hz + m), at(u, -hz - m)] : [at(hx + m, v), at(-hx - m, v)];
    },
  };
}

export class Autopilot {
  private grabCooldown = 0;
  /** Tiempo intentando llegar a un asa sin conseguirlo, y asas descartadas un rato (tapadas por una pared). */
  private tryTime = 0;
  private skip = new Map<number, number>();
  /** Lado del camión al que se aparta a esperar (sin equipo), elegido al salir. */
  private aside = 0;
  /** Tiempo que lleva agarrando su objeto tumbado. */
  private lying = 0;
  /**
   * `crew`: el equipo con el que va (estado compartido con los pilotos de los demás jugadores). Un piloto suelto (un
   * humano con ayudantes, la demostración) tiene el suyo, con el objeto principal; con varios humanos, `Autopilot.team`
   * los reparte en equipos (`plan`) y el equipo cambia al acabar cada objeto.
   */
  constructor(readonly carrierIndex = 0, public crew = new PilotCrew(), private readonly plan: PilotPlan | null = null) {}

  /** Un piloto por cada jugador humano de la partida, en el orden de sus mandos, con el reparto en equipos. */
  static team(g: Game): Autopilot[] {
    const humans = g.carriers.filter((c) => c.human !== null).sort((a, b) => a.human! - b.human!);
    const plan = new PilotPlan(humans.map((c) => c.id));
    plan.update(g);
    return humans.map((c) => new Autopilot(c.id, plan.crewOf.get(c.id) ?? new PilotCrew(), plan));
  }

  /** Punto de paso al que va el objeto de su equipo. */
  get wp() { return this.crew.wp; }

  input(g: Game, dt: number): PlayerInput {
    const inp: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
    if (g.phase !== 'playing') return inp;
    const me = g.carriers[this.carrierIndex];
    // Equipo de este paso (con el reparto, puede cambiar al acabar un objeto)
    let crew: PilotCrew | null = this.crew;
    if (this.plan) {
      this.plan.update(g);
      crew = this.plan.crewOf.get(this.carrierIndex) ?? null;
      if (crew && crew !== this.crew) { this.crew = crew; this.skip.clear(); this.tryTime = 0; }
    }
    if (!crew) { this.grabCooldown -= dt; return this.idle(g, me, inp); }
    const it = crew.target(g), body = it.body;
    // Volcado y sin nadie de su equipo que lo lleve: se endereza (no si ya lo han dejado en el camión: tumbado también
    // puede contar como cargado). Llevándolo el equipo, las muñecas lo enderezan solas (una caja colgada de un asa va
    // ladeada); si sigue tumbado `FINAL.lying` s, se suelta para enderezarlo (arrastrar la lámpara tumbada no lleva a
    // ningún sitio). Los ayudantes no cuentan: si lo agarran tumbado, se endereza igual (como siempre)
    const up = sofaUp(body);
    const ours = g.carriers.some((c) => c.heldBody === body && (c === me || crew.members.has(c.id)));
    if (up < 0.4 && !crew.done && !ours) {
      // Tras enderezarlo, espera a que caiga del salto para agarrarlo (en el aire se agarraría de cualquier punto)
      inp.right = true; this.grabCooldown = Math.max(this.grabCooldown, FINAL.rightWait);
      return inp;
    }
    this.lying = up < 0.4 && me.heldBody === body && !crew.done ? this.lying + dt : 0;
    this.grabCooldown -= dt;
    if (this.lying > FINAL.lying && this.grabCooldown <= 0) { this.lying = 0; inp.grab = true; this.grabCooldown = 0.3; return inp; }
    // Lleva algo que no es lo suyo (lo agarró de camino): lo suelta
    if (me.heldBody && me.heldBody !== body) {
      if (this.grabCooldown <= 0) { inp.grab = true; this.grabCooldown = 0.3; }
      return inp;
    }
    if (crew.done) {
      // Entregado: espera parado a que los ayudantes lo dejen, suelta y espera. Si el objeto se sale del camión (o no
      // llega a quedarse dentro), vuelve a por él
      if (!it.inHold && it.state !== 'carried') { crew.done = false; crew.doneTime = 0; }
      else {
        // Se suelta con el objeto ya quieto y derecho (o pasado `settle` s): soltar mientras frena le quita de golpe a
        // quien va delante la fuerza con la que lo frenaba, se tambalea hacia él y lo empuja hacia la abertura (con la
        // mesa, 2,5 m); y la lámpara, soltada aún inclinada por la frenada, se caía
        crew.doneTime += dt;
        const v = body.linvel(), settled = (Math.hypot(v.x, v.z) < FINAL.still && up > FINAL.upright) || crew.doneTime > FINAL.settle;
        const helpers = g.carriers.some((c) => c.human === null && c.heldBody === body);
        if (me.holding && !helpers && settled && this.grabCooldown <= 0) { inp.grab = true; this.grabCooldown = 0.3; }
        return inp;
      }
    }
    for (const [k, t] of this.skip) if (t - dt <= 0) this.skip.delete(k); else this.skip.set(k, t - dt);
    if (!me.holding) {
      // Ve al asa libre más cercana y agárrala (si en 3 s no llega a ella, prueba otra). Una asa la ocupa quien ya
      // la agarra o un compañero del equipo que va a por ella. En un equipo del reparto, las asas van en orden de
      // preferencia (`ItemDef.handles`): con dos, los extremos, a lo largo de la marcha, antes que los costados, de los
      // que se tira mal (`HAND.lateral`). Y nada de asas cuyo sitio para agarrar ocupa otro objeto.
      let best = Infinity, goal = { x: 0, z: 0 }, face = { x: 0, z: 0 }, pick = -1;
      const others = g.items.filter((o) => o !== it).map((o) => footprint(o, CARRIER.radius));
      for (const [i, s] of it.def.handles.entries()) {
        if (this.skip.has(i)) continue;
        const a = localToWorld(body, s.p);
        const out = rotate(body.rotation(), s.out);
        const gx = a.x + out.x * 0.6, gz = a.z + out.z * 0.6;
        if (others.some((f) => f.inside(gx, gz))) continue;
        const held = g.carriers.some((c) => c !== me && c.heldBody === body && c.grabLocal && Math.hypot(c.grabLocal.x - s.p.x, c.grabLocal.z - s.p.z) < 0.4);
        const claimed = [...crew.claims].some(([ci, si]) => ci !== this.carrierIndex && si === i);
        const spare = crew.members.size && i >= crew.members.size ? WALK.spare : 0;
        const d = Math.hypot(gx - me.pos.x, gz - me.pos.z) + (held || claimed ? 5 : 0) + spare;
        if (d < best) { best = d; goal = { x: gx, z: gz }; face = { x: -out.x, z: -out.z }; pick = i; }
      }
      if (pick >= 0) crew.claims.set(this.carrierIndex, pick); else crew.claims.delete(this.carrierIndex);
      const d = Math.hypot(goal.x - me.pos.x, goal.z - me.pos.z);
      // Solo cuenta el tiempo junto al asa: de lejos (al volver del camión) tarda más de 3 s en llegar a cualquiera
      if (pick < 0) return inp;
      if (d < WALK.tryNear) this.tryTime += dt;
      if (this.tryTime > 3) { this.skip.set(pick, 5); this.tryTime = 0; }
      // Suelto, se agarra con el objeto quieto (no rodando ni cayendo: se agarraría de cualquier punto) y de frente a su
      // asa (llegando de lado, la mano agarraba la esquina más cercana: con la mesa, los dos por el mismo costado, iba
      // torcida y no había manera de enderezarla). Si ya lo llevan otros, en marcha y como venga, como siempre
      const v = body.linvel(), loose = !g.carriers.some((c) => c.heldBody === body);
      const lateral = Math.abs((me.pos.x - goal.x) * face.z - (me.pos.z - goal.z) * face.x);
      const ready = !loose || (Math.hypot(v.x, v.y, v.z) < FINAL.grabStill && lateral < FINAL.grabSide);
      if (d < 0.4 && this.grabCooldown <= 0 && ready) {
        me.facing = face;
        inp.grab = true;
        this.grabCooldown = 0.3;
      } else if (d > 0.05) {
        this.walk(g, me, crew, it, goal, inp);
      }
      return inp;
    }
    crew.claims.delete(this.carrierIndex);
    this.tryTime = 0;
    return { ...crew.carry(g, dt) };
  }

  /**
   * Sin equipo (no queda nada que pueda llevar ahora): suelta lo que lleve, sale del camión si está dentro y espera
   * a un lado de la rampa, sin estorbar a los que llegan.
   */
  private idle(g: Game, me: Carrier, inp: PlayerInput): PlayerInput {
    if (me.holding) {
      if (this.grabCooldown <= 0) { inp.grab = true; this.grabCooldown = 0.3; }
      return inp;
    }
    const pose = g.level.truck, l = worldToTruck(pose, me.pos), w = TRUCK.width / 2;
    if (!this.aside) this.aside = l.z >= 0 ? 1 : -1;
    const spot = truckToWorld(pose, { x: -TRUCK.ramp - WALK.exit, y: 0, z: this.aside * (w + TRUCK.wall + WALK.aside) });
    if (Math.hypot(spot.x - me.pos.x, spot.z - me.pos.z) > 0.3) this.walk(g, me, null, null, spot, inp);
    return inp;
  }

  /**
   * Andar sin carga hacia `goal` a paso de aproximación (frena al llegar), sin cruzar objetos ni el borde de la rampa y
   * rodeando a quien no es de su equipo (`WALK`). `target`: el objeto al que va (si es ligero, también se rodea cuando
   * el asa está al otro lado). Con un solo objeto y todo el equipo yendo a él («La calle»), el camino es el recto de
   * siempre.
   */
  private walk(g: Game, me: Carrier, crew: PilotCrew | null, target: Item | null, goal: { x: number; z: number }, inp: PlayerInput) {
    const p = me.pos;
    let gx = goal.x, gz = goal.z;
    // Dentro del camión o en su rampa, y la meta fuera: primero baja por la rampa en línea recta (y al revés)
    const pose = g.level.truck, lp = worldToTruck(pose, p), lg = worldToTruck(pose, goal), w = TRUCK.width / 2;
    const onTruck = (l: { x: number; z: number }) => l.x > -TRUCK.ramp && l.x < TRUCK.length && Math.abs(l.z) < w;
    const m = w - CARRIER.radius - 0.1;
    if (onTruck(lp) && !onTruck(lg)) {
      const out = truckToWorld(pose, { x: -TRUCK.ramp - WALK.exit, y: 0, z: Math.max(-m, Math.min(m, lp.z)) });
      gx = out.x; gz = out.z;
    } else if (onTruck(lg) && !onTruck(lp) && lp.x > -TRUCK.ramp - WALK.exit / 2) {
      // Y al revés: si la meta está en la rampa o en el camión y él al lado, sube por el pie de la rampa (de lado, el
      // borde de la rampa es un escalón que no se puede subir)
      const foot = truckToWorld(pose, { x: -TRUCK.ramp - WALK.exit, y: 0, z: Math.max(-m, Math.min(m, lg.z)) });
      gx = foot.x; gz = foot.z;
    }
    // Objetos en el camino recto (también dentro del camión, al salir): rodea el primero por la esquina de su planta
    // (ensanchada) que da el camino más corto
    const corner = this.detour(g, p, { x: gx, z: gz }, target);
    if (corner) { gx = corner.x; gz = corner.z; }
    const dx = gx - p.x, dz = gz - p.z, d = Math.max(Math.hypot(dx, dz), 1e-3);
    // Rodeando un objeto, más despacio: a la carrera se pasaba de la esquina y lo golpeaba
    let s = Math.min(1, Math.hypot(goal.x - p.x, goal.z - p.z) / 0.8) * (corner ? WALK.around : 1);
    let ux = dx / d, uz = dz / d;
    // Espacio personal con los que no son de su equipo ni llevan su objeto (con el reparto en equipos; un piloto suelto
    // va con los ayudantes, que ya lo rodean a él): rodea a quien tiene delante y frena si está muy cerca
    for (const o of this.plan ? g.carriers : []) {
      if (o === me || (crew && crew.members.has(o.id)) || (target && o.heldBody === target.body)) continue;
      const ox = o.pos.x - p.x, oz = o.pos.z - p.z, od = Math.hypot(ox, oz);
      if (od < 1e-3 || od > WALK.personal || od > d + 0.3) continue;
      const ahead = (ox * ux + oz * uz) / od;
      if (ahead < 0.2) continue;
      const px = -uz, pz = ux, side = ox * px + oz * pz > 0 ? -1 : 1, k = 1.5 * ahead * (1 - od / WALK.personal);
      ux += px * side * k; uz += pz * side * k;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      s *= Math.max(0.35, od / WALK.personal);
    }
    inp.mx = ux * s; inp.mz = uz * s;
  }

  /**
   * Primer objeto que cruza el camino recto de `p` a `goal` (su planta, ensanchada con el radio del porteador y
   * `WALK.clear`) y la esquina por la que rodearlo, o nada si el camino está libre. El objeto al que va (`target`) se
   * rodea igual, salvo cuando ya está junto a la meta.
   */
  private detour(g: Game, p: { x: number; z: number }, goal: { x: number; z: number }, target: Item | null) {
    const dx = goal.x - p.x, dz = goal.z - p.z, len = Math.hypot(dx, dz);
    if (len < 0.9) return null;
    const y = g.carriers[this.carrierIndex].pos.y, h = g.hold;
    const inHold = p.x > h.min.x && p.x < h.max.x && p.z > h.min.z && p.z < h.max.z;
    const roomy = (k: { x: number; z: number }) => !inHold
      || (k.x > h.min.x + CARRIER.radius && k.x < h.max.x - CARRIER.radius && k.z > h.min.z + CARRIER.radius && k.z < h.max.z - CARRIER.radius);
    /** ¿Cruza el tramo recto de `a` a `b` la planta `f`? (cada 10 cm, sin contar los últimos `skip` m). */
    const crosses = (f: Footprint, a: { x: number; z: number }, b: { x: number; z: number }, skip = 0) => {
      const l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(l / 0.1), end = l > skip ? 1 - skip / l : 0;
      for (let k = 1; k < n && k / n < end; k++) if (f.inside(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n)) return k / n;
      return -1;
    };
    let first: { t: number; wide: Footprint; body: Footprint } | null = null;
    for (const it of g.items) {
      if (Math.abs(it.body.translation().y - y) > 1.6) continue;
      // El suyo, solo si es ligero (lo lleva una persona: un golpe al pasar lo tumba o lo aparta; uno pesado, como el
      // sofá, apenas se mueve y se llega a sus asas en línea recta, como siempre), con su planta ensanchada solo con
      // `ownClear` (su asa está cerca) y sin contar los últimos `WALK.near` m
      const own = it === target;
      if (own && it.def.minCarriers > 1) continue;
      const body = footprint(it, CARRIER.radius - WALK.touch), wide = footprint(it, CARRIER.radius + (own ? WALK.ownClear : WALK.clear));
      if (body.inside(p.x, p.z)) continue;
      // Pegado a él (al soltarlo, junto a su asa), solo cuenta si el camino lo atraviesa; si no, si pasa cerca
      const t = crosses(wide.inside(p.x, p.z) ? body : wide, p, goal, own ? WALK.near : 0);
      if (t >= 0 && (!first || t < first.t)) first = { t, wide, body };
    }
    if (!first) return null;
    // Por una esquina de la planta ensanchada, o deslizándose a lo largo de la cara junto a la que está, la que dé el
    // camino más corto sin atravesar el objeto y, dentro del camión, sin salirse de él
    // (una esquina en la que ya está no sirve; y si desde la esquina el camino aún lo atraviesa, cuenta como más largo:
    // hará falta otra)
    let best: { x: number; z: number } | null = null, bl = Infinity;
    for (const k of [...first.wide.corners, ...first.wide.slides(p.x, p.z)]) {
      const near = Math.hypot(k.x - p.x, k.z - p.z);
      if (near < WALK.at || !roomy(k) || crosses(first.body, p, k) >= 0) continue;
      const l = near + Math.hypot(goal.x - k.x, goal.z - k.z) + (crosses(first.body, k, goal, target === null ? 0 : WALK.near) >= 0 ? WALK.again : 0);
      if (l < bl) { bl = l; best = k; }
    }
    return best;
  }
}
