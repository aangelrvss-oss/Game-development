// Estado de la partida y paso de simulación. No depende de Three.js ni del DOM:
// se puede ejecutar en Node para las pruebas.
import type RAPIER from '@dimforge/rapier3d-compat';
import { inRegion } from '../levels/geometry';
import { TRUCK, cargoHold, truckBoxes, truckToWorld, worldToTruck } from '../levels/truck';
import type { Kind, LevelDef, Waypoint } from '../levels/types';
import { BotBrain, BOT, type BotStyle } from './bots';
import { CAST, CARRIER, CENTER_Y, Carrier, type Grabbable } from './carrier';
import { HAND, solveHands } from './hand';
import { ITEMS, createItem, restHeight, shapeBounds, type Item, type ItemDef } from './items';
import { localToWorld, rotate, sofaUp, sofaYaw, yawQuat } from './sofa';
import { Car, CAR_COLORS, lightAt, stepTraffic } from './traffic';
import { NO_INPUT, type GameEvent, type PlayerInput, type Vec3 } from './types';

type R = typeof RAPIER;

/** Reglas comunes a todos los niveles (el límite de tiempo es de cada nivel: `LevelDef.timeLimit`). */
export const RULES = {
  countdown: 3,
  /**
   * Golpe mínimo (cambio brusco de velocidad, m/s) que se nota (suceso `impact`: sonido y polvo) en un objeto que los
   * golpes no dañan. Los frágiles tienen su propio umbral y su daño (`ItemDef.fragility`).
   */
  impactDv: 3.2,
  /** Daño de un atropello a un objeto que se puede dañar. */
  carDamage: 12,
  rightCost: 3,
  /** Tiempo tras enderezar un objeto en el que su caída no cuenta como golpe (s): el salto dura unos 0,6 s. */
  rightLand: 0.8,
  respawnCost: 15,
  /** Tiempo que un objeto pasa dentro del camión, suelto y quieto, hasta quedar cargado (s). */
  winHold: 1.0,
  /**
   * Entrega: un objeto cuenta como cargado cuando su centro y al menos esta fracción de su caja envolvente están dentro
   * de la caja de carga, nadie lo agarra y lleva `winHold` s quieto (más despacio que `loadedSpeed` m/s y que
   * `loadedSpin` rad/s).
   */
  loadFraction: 0.8,
  loadedSpeed: 0.25,
  loadedSpin: 0.6,
  /** Par estabilizador por mano (N·m por unidad de inclinación) y amortiguación del balanceo. */
  wristK: 22,
  wristDamp: 5,
  /**
   * Amortiguación del giro horizontal por mano (N·m·s): quien agarra no deja que el objeto gire solo porque los
   * tirones estén descompensados (dos de un lado y uno del otro), aunque sí deja girarlo cuando el grupo lo gira.
   */
  wristYawDamp: 30,
  /**
   * Aviso «Pesa mucho»: sale tras `heavyHintAfter` s de uno solo arrastrando algo pesado. Lo acumulado no pasa de
   * `heavyHintMax` s: al dejar de arrastrar se va en (máx − después)/2 = 0,2 s, y al llegar ayuda, en el acto. Sin
   * tope, tras 20 s arrastrando solo seguía 9,7 s en pantalla con los dos agarrando.
   */
  heavyHintAfter: 0.6,
  heavyHintMax: 1.0,
};

export interface GameOptions {
  /** Nivel que se juega: escenario, objetos, salidas, camión, etapas, tráfico y límite de tiempo. */
  level: LevelDef;
  humans: number;
  carriers: number;
  botStyle: BotStyle;
  seed?: number;
}

export type Phase = 'countdown' | 'playing' | 'won' | 'lost';

/** Lo que imitan los ayudantes de un objeto: velocidad media pedida por los humanos que lo llevan y giro pedido. */
export interface Lead { x: number; z: number; w: number; active: boolean }

/**
 * Rozamiento de las cajas fijas según su tipo (las demás, 0,6). La rampa de la terraza es de chapa: resbala, y si se
 * suelta el sofá encima, baja deslizándose. La rampa de carga del camión tiene tacos: agarra como la escalera.
 */
const FRICTION: Partial<Record<Kind, number>> = { ramp: 0.15, stairs: 0.9, truckRamp: 0.9 };

/** Puntos por eje con los que se mide qué parte de la caja envolvente de un objeto está dentro del camión (5³). */
const HOLD_SAMPLES = 5;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  /** Nivel que se juega (lo da `GameOptions.level`). */
  readonly level: LevelDef;
  /** Caja de carga del camión por dentro, en el mundo. */
  readonly hold: { min: Vec3; max: Vec3 };
  world!: RAPIER.World;
  events!: RAPIER.EventQueue;
  /**
   * Objetos de la mudanza, cada uno con su definición, su integridad y su estado. `sofaItem`, `sofa` y `sofaColliders`
   * son atajos al objeto principal del nivel (`LevelDef.main`), a su cuerpo y a sus piezas: en «La calle», el sofá.
   */
  items: Item[] = [];
  sofaItem!: Item;
  sofa!: RAPIER.RigidBody;
  sofaColliders!: RAPIER.Collider[];
  carriers: Carrier[] = [];
  bots = new Map<number, BotBrain>();
  cars: Car[] = [];
  phase: Phase = 'countdown';
  time = 0; // tiempo de partida (tras la cuenta atrás)
  clock = 0; // tiempo total simulado (semáforo)
  countdown = RULES.countdown;
  stage = 0;
  stuckTime = 0;
  /**
   * Objetos que se pueden agarrar: los de `items` y los que se añadan con `addGrabbable`. Una sola física para todos
   * (humanos y ayudantes): la mano blanda de `hand.ts` y la fuerza de las piernas de `CARRIER`.
   */
  grabbables: Grabbable[] = [];
  /**
   * Tiempo que lleva uno solo arrastrando un objeto que pesa más de lo que una persona sostiene (para el aviso
   * «Pesa mucho: falta alguien en el otro extremo»), y quién es.
   */
  soloDrag = 0;
  soloDragCarrier: number | null = null;
  loseReason: 'broken' | 'time' | null = null;
  out: GameEvent[] = [];
  private lastPed: 'green' | 'red' = 'red';
  private rng: () => number;
  private handleOwner = new Map<number, { kind: 'item'; i: number } | { kind: 'carrier'; i: number } | { kind: 'car'; i: number }>();
  /**
   * Velocidad media pedida por los humanos que cargan el objeto principal (la imitan sus ayudantes; cada objeto tiene
   * la suya, `leads`).
   */
  lead: Lead = { x: 0, z: 0, w: 0, active: false };
  /** Lo que imitan los ayudantes de cada objeto (índice en `items`), recalculado en cada paso. */
  private leads: Lead[] = [];
  /**
   * Tiempo que llevan parados los humanos que cargan cada objeto (índice en `items`), para que los ayudantes lo dejen en
   * el camión.
   */
  private leadStill: number[] = [];
  private loads = new Set<number>();

  constructor(private R: R, readonly opts: GameOptions) {
    this.level = opts.level;
    this.hold = cargoHold(opts.level.truck);
    this.rng = mulberry32(opts.seed ?? 12345);
    this.build();
  }

  /** Registra un cuerpo dinámico como objeto agarrable (misma mano y misma física que el sofá). */
  addGrabbable(body: RAPIER.RigidBody, colliders: RAPIER.Collider[]): Grabbable {
    const g = { body, colliders };
    this.grabbables.push(g);
    this.loads.add(body.handle);
    return g;
  }

  /**
   * Añade a la partida un objeto del catálogo en `pos` con giro `yaw`: se crea con `createItem` y se agarra como
   * cualquier otro (`addGrabbable`), con tantas manos como asas tiene. `required`: si se rompe, se pierde.
   */
  addItem(def: ItemDef, pos: Vec3, yaw: number, required = false): Item {
    const { body, colliders } = createItem(this.R, this.world, def, pos, yaw);
    const item: Item = {
      body, colliders, maxHands: def.handles.length, index: this.items.length, def, required,
      integrity: 100, state: 'pending', prevVel: { x: 0, y: 0, z: 0 }, impactCooldown: 0, lastCarHit: -10,
      start: { pos: { ...pos }, yaw }, bounds: shapeBounds(def), inHold: false, loadTime: 0,
    };
    this.items.push(item);
    this.grabbables.push(item);
    this.loads.add(body.handle);
    for (const c of colliders) this.handleOwner.set(c.handle, { kind: 'item', i: item.index });
    return item;
  }

  /** Manos que agarran ahora el cuerpo `body`. */
  holdersOf(body: RAPIER.RigidBody) {
    return this.carriers.filter((c) => c.heldBody === body);
  }

  /** ¿Le queda alguna mano libre (asas sin ocupar) a este objeto? */
  private freeHand = (g: Grabbable) => g.maxHands === undefined || this.holdersOf(g.body).length < g.maxHands;

  /** Objeto de la mudanza al que pertenece un cuerpo (o nada: otro agarrable, o ningún cuerpo). */
  itemOf(body: RAPIER.RigidBody | null): Item | null {
    if (!body) return null;
    for (const it of this.items) if (it.body === body) return it;
    return null;
  }

  /**
   * Objeto al que va cada ayudante que no agarra nada: el que necesita manos. Por orden:
   * 1. uno que lleva un jugador y al que le faltan manos para ir en el aire (`minCarriers`);
   * 2. uno de varias personas que lleva un jugador y tiene asas libres (más manos lo llevan mejor; uno ligero lo lleva
   *    mejor quien lo lleva solo: un ayudante, con su retraso, solo le tira de un lado);
   * 3. uno obligatorio de varias personas que nadie lleva y al que le faltan manos (lo esperan agarrado).
   * Entre iguales, el más cercano (el que ya tenía, con medio metro de ventaja, para no dudar). Los que van de camino
   * cuentan como manos. Si no hay ninguno, sigue con el que tenía. Ni los cargados, ni los rotos, ni los que se dejan en
   * el camión (`stow`). Sin código por objeto: todo sale de `minCarriers`, de las asas y de quién lo agarra. Con un solo
   * objeto («La calle»), todos van a él, como antes.
   */
  private chooseItems(stow: boolean[]) {
    const holders = this.items.map((it) => this.holdersOf(it.body).length);
    const humanHeld = this.items.map((it) => this.carriers.some((c) => c.human !== null && c.heldBody === it.body));
    const heading = this.items.map(() => 0);
    for (const [i, b] of this.bots) {
      const c = this.carriers[i];
      if (c.heldBody) continue;
      let best: Item | null = null, bt = Infinity, bd = Infinity;
      for (const it of this.items) {
        if (it.state === 'broken' || it.state === 'loaded' || stow[it.index]) continue;
        const hands = holders[it.index] + heading[it.index];
        if (hands >= it.def.handles.length) continue;
        const short = hands < it.def.minCarriers;
        const heavy = it.def.minCarriers >= 2;
        const tier = humanHeld[it.index] ? (short ? 0 : heavy ? 1 : -1) : it.required && heavy && short ? 2 : -1;
        if (tier < 0) continue;
        const p = it.body.translation(), d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z) - (it.index === b.item ? 0.5 : 0);
        if (tier < bt || (tier === bt && d < bd)) { best = it; bt = tier; bd = d; }
      }
      if (best && best.index !== b.item) {
        // Objeto nuevo: va al asa libre más cercana
        const taken = new Set<number>();
        for (const o of this.bots.values()) if (o !== b && o.item === best.index) taken.add(o.slot);
        let slot = 0, sd = Infinity;
        best.def.handles.forEach((h, k) => {
          const a = localToWorld(best!.body, h.p), d = Math.hypot(a.x - c.pos.x, a.z - c.pos.z) + (taken.has(k) ? 10 : 0);
          if (d < sd) { sd = d; slot = k; }
        });
        b.item = best.index;
        b.slot = slot;
      }
      heading[b.item]++;
    }
  }

  /**
   * Sitio al que va un ayudante sin nada que llevar (su objeto ya está cargado y ninguno necesita manos): fuera del
   * camión, a un lado del pie de la rampa, para no quedarse en el carril de los que llegan. Desde el camión o la rampa,
   * primero baja por la rampa (en línea recta hacia el lado se caería por su borde o chocaría con la pared).
   */
  private parkSpot(c: Carrier) {
    const pose = this.level.truck, l = worldToTruck(pose, c.pos), side = l.z < 0 ? -1 : 1;
    const foot = -TRUCK.ramp - BOT.park.foot;
    const goal = l.x > foot + 0.3
      ? { x: foot - 0.5, y: 0, z: Math.max(-BOT.park.down, Math.min(BOT.park.down, l.z)) }
      : { x: foot, y: 0, z: side * (TRUCK.width / 2 + TRUCK.wall + BOT.park.aside) };
    return truckToWorld(pose, goal);
  }

  /** Daño total de la partida: la suma de lo que ha perdido cada objeto. */
  get damageTotal() {
    return this.items.reduce((s, it) => s + (100 - it.integrity), 0);
  }

  /** Integridad de la mudanza (100 menos el daño total; con un solo objeto, la suya). */
  get integrity() {
    return Math.max(0, 100 - this.damageTotal);
  }

  /** Objetos obligatorios: cuántos hay y cuántos están cargados (se gana al cargarlos todos). */
  get requiredCount() { return this.items.filter((it) => it.required).length; }
  get loadedRequired() { return this.items.filter((it) => it.required && it.state === 'loaded').length; }

  /** Ruta del objeto principal para el piloto automático. */
  get mainRoute(): Waypoint[] { return this.level.items[this.level.main].route; }

  /** ¿Es un objeto movible (agarrable)? Empujarlo con el cuerpo cuenta como cargar. */
  private isLoad = (b: RAPIER.RigidBody) => this.loads.has(b.handle);

  private build() {
    const R = this.R;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.numSolverIterations = 8;
    this.events = new R.EventQueue(true);
    // Escenario y camión (caja de carga abierta, rampa, bajos y cabina: cada pieza, un collider)
    for (const b of [...this.level.boxes, ...truckBoxes(this.level.truck)]) {
      if (!b.solid) continue;
      const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...b.p).setRotation(eulerQuat(b.rx ?? 0, b.rz ?? 0)));
      const cd = R.ColliderDesc.cuboid(...b.h).setFriction(FRICTION[b.kind] ?? 0.6);
      if (b.kind === 'ramp') cd.setFrictionCombineRule(R.CoefficientCombineRule.Min);
      this.world.createCollider(cd, body);
    }
    // Objetos de la mudanza, del catálogo: sin `y`, apoyados en el suelo
    for (const pl of this.level.items) {
      const def = ITEMS[pl.id];
      this.addItem(def, { x: pl.pos.x, y: pl.pos.y ?? restHeight(def) + 0.01, z: pl.pos.z }, pl.yaw, pl.required);
    }
    this.sofaItem = this.items[this.level.main];
    this.sofa = this.sofaItem.body;
    this.sofaColliders = this.sofaItem.colliders;
    const handles = this.sofaItem.def.handles;
    const n = Math.max(1, Math.min(6, this.opts.carriers));
    const humans = Math.max(0, Math.min(n, this.opts.humans));
    // Salidas de los porteadores, las del nivel
    const spawns = this.level.spawns;
    for (let i = 0; i < n; i++) {
      const s = spawns[i % spawns.length];
      const c = new Carrier(R, this.world, i, CAST[i], i < humans ? i : null, { x: s.x, y: CENTER_Y + 0.05, z: s.z });
      c.facing = { x: s.facing.x, z: s.facing.z };
      this.carriers.push(c);
      this.handleOwner.set(c.collider.handle, { kind: 'carrier', i });
      if (c.human === null) {
        // Empieza yendo al asa libre más cercana del objeto principal (en «La calle», cada uno sale frente a la suya)
        const p = c.pos, mine = new Set([...this.bots.values()].map((b) => b.slot));
        let slot = 0, best = Infinity;
        handles.forEach((h, k) => {
          const a = localToWorld(this.sofa, h.p), d = Math.hypot(a.x + h.out.x * 0.6 - p.x, a.z + h.out.z * 0.6 - p.z) + (mine.has(k) ? 100 : 0);
          if (d < best) { best = d; slot = k; }
        });
        const brain = new BotBrain(slot, this.opts.botStyle, this.rng);
        brain.item = this.sofaItem.index;
        this.bots.set(i, brain);
      }
    }
    // Tráfico del nivel (si tiene calle)
    const tr = this.level.traffic;
    tr?.cars.forEach((cd, id) => {
      const car = new Car(R, this.world, id, tr.lanes[cd.lane], cd.x, CAR_COLORS[id % CAR_COLORS.length]);
      this.cars.push(car);
      this.handleOwner.set(car.collider.handle, { kind: 'car', i: id });
    });
  }

  get light() { return lightAt(this.clock); }
  get sofaPos(): Vec3 { return this.sofa.translation(); }
  get sofaYaw() { return sofaYaw(this.sofa); }
  get sofaUp() { return sofaUp(this.sofa); }
  get stageLabel() { return this.level.stages[this.stage]?.label ?? ''; }

  /** Uno solo lleva un rato arrastrando algo que pesa demasiado para una persona: hay que avisar. */
  get heavyAlone(): Carrier | null {
    return this.soloDrag > RULES.heavyHintAfter && this.soloDragCarrier !== null ? this.carriers[this.soloDragCarrier] : null;
  }

  private emit(e: GameEvent) { this.out.push(e); }

  /** Avanza un paso fijo. `inputs[i]` es el mando del jugador humano i. */
  step(dt: number, inputs: PlayerInput[]) {
    this.out = [];
    this.clock += dt;
    const playing = this.phase === 'playing';
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.phase = 'playing'; this.countdown = 0; }
    } else if (playing) {
      this.time += dt;
    }
    // Mando de los humanos y lo que deben imitar los ayudantes de cada objeto: la velocidad media que piden los humanos
    // que lo llevan y el giro que piden ellos y los que no llevan ningún objeto (pedir giro sin llevar nada se lo pide a
    // todos los ayudantes). Los ayudantes de un objeto no imitan a quien lleva otro objeto de la mudanza
    const n = this.items.length;
    const lx = new Array<number>(n).fill(0), lz = new Array<number>(n).fill(0), lw = new Array<number>(n).fill(0), nl = new Array<number>(n).fill(0);
    let freeTurn = 0, ex = 0, ez = 0, ne = 0;
    const humanInputs = new Map<number, PlayerInput>();
    for (const c of this.carriers) {
      if (c.human === null) continue;
      const inp = playing ? inputs[c.human] ?? NO_INPUT : NO_INPUT;
      humanInputs.set(c.id, inp);
      const held = this.itemOf(c.heldBody);
      if (inp.turn !== 0) { if (held) lw[held.index] += inp.turn * BOT.turnRate; else freeTurn += inp.turn * BOT.turnRate; }
      if (held) { lx[held.index] += inp.mx * CARRIER.carrySpeed; lz[held.index] += inp.mz * CARRIER.carrySpeed; nl[held.index]++; }
      // Lo que lleva y no es un objeto de la mudanza (un agarrable más): lo imitan los ayudantes de un objeto que no lleva
      // ningún humano, como antes (con un solo objeto, los ayudantes imitaban a cualquier humano que llevase algo)
      else if (c.heldBody) { ex += inp.mx * CARRIER.carrySpeed; ez += inp.mz * CARRIER.carrySpeed; ne++; }
      if (inp.right) this.tryRight(c);
    }
    this.leads = this.items.map((_it, i) => nl[i]
      ? { x: lx[i] / nl[i], z: lz[i] / nl[i], w: lw[i] + freeTurn, active: true }
      : { x: ne ? ex / ne : 0, z: ne ? ez / ne : 0, w: lw[i] + freeTurn, active: ne > 0 });
    this.lead = this.leads[this.sofaItem.index];
    // Dentro del camión, los ayudantes dejan el objeto cuando ningún jugador lo lleva o cuando los que lo llevan llevan
    // un momento parados (`stowAfter`), y no lo vuelven a agarrar (`stow`). Que suelten antes que los jugadores evita
    // que uno se quede solo con todo el peso, se tambalee al soltar y empuje el objeto hacia la abertura
    const stow = this.items.map((it, i) => {
      const l = this.leads[i], still = l.active && Math.hypot(l.x, l.z) < 0.05 && l.w === 0;
      this.leadStill[i] = still ? (this.leadStill[i] ?? 0) + dt : 0;
      const humanHolds = this.carriers.some((c) => c.human !== null && c.heldBody === it.body);
      return it.inHold && (!humanHolds || this.leadStill[i] > BOT.stowAfter);
    });
    // Cada ayudante va al objeto que necesita manos
    this.chooseItems(stow);

    // Asas ocupadas de cada objeto, antes de que nadie agarre en este paso: las de los ayudantes que lo cargan y las que
    // tienen al lado los humanos que lo agarran
    const takenOf = this.items.map((target) => {
      const t = new Set<number>();
      for (const [i, b] of this.bots) if (this.carriers[i].heldBody === target.body) t.add(b.slot);
      for (const c of this.carriers) {
        if (c.human === null || c.heldBody !== target.body || !c.grabLocal) continue;
        const gl = c.grabLocal;
        target.def.handles.forEach((s, i) => { if (Math.hypot(s.p.x - gl.x, s.p.z - gl.z) < 0.6) t.add(i); });
      }
      return t;
    });
    const taken = (target: Item) => takenOf[target.index];

    for (const c of this.carriers) {
      let inp: PlayerInput;
      const brain = this.bots.get(c.id);
      if (brain) {
        const wasHolding = c.holding;
        const others = this.carriers.filter((o) => o !== c).map((o) => o.pos);
        const target = this.items[brain.item], i = target.index;
        const idle = !c.heldBody && (target.state === 'loaded' || target.state === 'broken');
        inp = !playing ? NO_INPUT
          : idle ? brain.park(c, this.parkSpot(c), others)
          : brain.think(c, target, this.leads[i], taken(target), dt, others, stow[i]);
        if (inp.grab && wasHolding) {
          c.release();
          this.emit({ type: 'release', carrier: c.id, pos: c.handWorld() });
        } else if (inp.grab && this.freeHand(target)) {
          if (c.tryGrab(target.body, target.colliders, target.def.handles[brain.slot].p)) {
            taken(target).add(brain.slot);
            this.emit({ type: 'grab', carrier: c.id, pos: c.handWorld() });
          }
        }
      } else {
        inp = humanInputs.get(c.id) ?? NO_INPUT;
        if (c.heldBody && inp.turn !== 0) {
          // Quien pide el giro también lo acompaña: se mueve alrededor del centro de lo que lleva.
          const w = inp.turn * BOT.turnRate, sp = c.heldBody.translation(), p = c.pos;
          inp = { ...inp, mx: inp.mx + (w * (p.z - sp.z)) / CARRIER.carrySpeed, mz: inp.mz - (w * (p.x - sp.x)) / CARRIER.carrySpeed };
        }
        if (inp.grab) {
          if (c.holding) { c.release(); this.emit({ type: 'release', carrier: c.id, pos: c.handWorld() }); }
          else if (c.tryGrabAny(this.grabbables.filter(this.freeHand))) this.emit({ type: 'grab', carrier: c.id, pos: c.handWorld() });
        }
      }
      // En el suelo: el collider se tumba de verdad y se levanta cuando hay sitio
      c.stepDown(dt);
      c.control(inp, dt, this.isLoad);
    }

    // Manos blandas: cada una tira de su punto con fuerza limitada; si no da abasto y se le escapa, suelta
    const hands = solveHands(this.carriers, dt);
    this.carriers.forEach((c, i) => {
      const r = hands[i];
      if (r && c.handResult(r, dt)) this.emit({ type: 'gripBreak', carrier: c.id, pos: c.handWorld() });
    });

    this.wristAssist(dt);

    // Tráfico
    const obstacles = [...this.items.map((it) => it.body.translation()), ...this.carriers.map((c) => c.pos)];
    for (const car of stepTraffic(this.cars, this.clock, dt, obstacles)) {
      this.emit({ type: 'honk', car: car.id, pos: car.body.translation() });
    }
    const ped = this.light.ped;
    if (this.level.traffic && ped !== this.lastPed) { this.lastPed = ped; this.emit({ type: 'light', ped }); }

    this.world.step(this.events);
    this.clampLoads();

    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.handleOwner.get(h1), b = this.handleOwner.get(h2);
      if (!a || !b) return;
      const car = a.kind === 'car' ? a : b.kind === 'car' ? b : null;
      const other = car === a ? b : a;
      if (!car || other.kind === 'car') return;
      if (other.kind === 'item') {
        // Un atropello toca varias piezas del objeto a la vez: cuenta una sola vez por segundo.
        const it = this.items[other.i];
        if (this.clock - it.lastCarHit < 1) return;
        it.lastCarHit = this.clock;
        const pos = it.body.translation();
        if (it.def.fragility) this.damage(it, RULES.carDamage);
        this.emit({ type: 'carHit', pos, target: 'item', item: it.index });
      } else if (other.kind === 'carrier') {
        const c = this.carriers[other.i];
        this.stun(c);
        this.emit({ type: 'carHit', pos: c.pos, target: 'carrier', carrier: c.id });
      }
    });

    this.afterStep(dt);
  }

  /**
   * Las manos de quien carga no son puntos perfectos: con las muñecas evitan que el objeto gire sin control.
   * Par que tiende a ponerlo derecho y amortigua el balanceo, proporcional al número de manos que lo agarran.
   * Permite inclinarlo, pero no voltearlo con facilidad.
   */
  private wristAssist(dt: number) {
    for (const it of this.grabbables) {
      const holders = this.carriers.filter((c) => c.heldBody === it.body).length;
      if (!holders) continue;
      const b = it.body;
      const up = rotate(b.rotation(), { x: 0, y: 1, z: 0 });
      const w = b.angvel();
      // El par se aplica de forma explícita: con objetos ligeros (poca inercia) se limita para que sea estable
      const pi = b.principalInertia(), im = Math.min(pi.x, pi.y, pi.z);
      const k = Math.min(RULES.wristK * holders, (0.25 * im) / (dt * dt));
      const c = Math.min(RULES.wristDamp * holders, (0.5 * im) / dt), cy = Math.min(RULES.wristYawDamp * holders, (0.5 * im) / dt);
      // up × Y = (-up.z, 0, up.x)
      const tx = -up.z * k - w.x * c, tz = up.x * k - w.z * c, ty = -w.y * cy;
      b.applyTorqueImpulse({ x: tx * dt, y: ty * dt, z: tz * dt }, true);
    }
  }

  /** Evita que un conflicto entre manos y contactos lance un objeto a velocidades absurdas. */
  private clampLoads() {
    for (const { body } of this.grabbables) {
      const v = body.linvel(), w = body.angvel();
      const sv = Math.hypot(v.x, v.y, v.z), sw = Math.hypot(w.x, w.y, w.z);
      if (sv > 11) body.setLinvel({ x: (v.x * 11) / sv, y: (v.y * 11) / sv, z: (v.z * 11) / sv }, true);
      if (sw > 6) body.setAngvel({ x: (w.x * 6) / sw, y: (w.y * 6) / sw, z: (w.z * 6) / sw }, true);
    }
  }

  private stun(c: Carrier) {
    if (c.stunned > 0) return;
    // Sale despedido hacia donde le lleva el golpe (o de espaldas si apenas se mueve)
    const v = c.body.linvel(), sp = Math.hypot(v.x, v.z);
    c.knockDown(sp > 1 ? { x: v.x / sp, z: v.z / sp } : { x: -c.facing.x, z: -c.facing.z }, CARRIER.stunTime, 'car');
    this.emit({ type: 'stun', carrier: c.id, pos: c.pos });
  }

  /** Daña un objeto (solo en juego). Al llegar a 0 se rompe: estado `broken` y suceso `itemBroken`, una sola vez. */
  private damage(it: Item, d: number) {
    if (this.phase !== 'playing' || it.state === 'broken') return;
    it.integrity = Math.max(0, it.integrity - d);
    if (it.integrity > 0) return;
    it.state = 'broken';
    this.emit({ type: 'itemBroken', item: it.index, id: it.def.id, pos: it.body.translation() });
  }

  /**
   * Golpes de un objeto: cambio brusco de velocidad que no se explica por la gravedad. Por encima del umbral de su
   * fragilidad, lo daña según cuánto lo supera; si los golpes no lo dañan, solo se nota (`RULES.impactDv`).
   */
  private checkImpact(it: Item, dt: number) {
    const v = it.body.linvel(), p = it.prevVel, f = it.def.fragility;
    const dv = Math.hypot(v.x - p.x, v.y - p.y + 9.81 * dt, v.z - p.z);
    it.prevVel = { x: v.x, y: v.y, z: v.z };
    it.impactCooldown -= dt;
    const threshold = f ? f.impactDv : RULES.impactDv;
    if (dv <= threshold || it.impactCooldown > 0) return;
    const dmg = f ? Math.round((dv - f.impactDv) * f.damage) : 0;
    it.impactCooldown = 0.25;
    if (dmg > 0) this.damage(it, dmg);
    this.emit({ type: 'impact', pos: it.body.translation(), strength: dv, damage: dmg, item: it.index });
  }

  /** De las posiciones `at` (una por objeto), la más cercana en horizontal a un punto. */
  private static nearest(at: Vec3[], p: Vec3): Vec3 {
    let best = at[0], bd = Infinity;
    for (const q of at) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  private afterStep(dt: number) {
    const v = this.sofa.linvel();
    for (const it of this.items) this.checkImpact(it, dt);
    // Porteadores: golpe fuerte → tumbado; caída al vacío o muy lejos de todo objeto → reaparece junto al más cercano
    const sp = this.sofaPos, at = this.items.map((it) => it.body.translation());
    for (const c of this.carriers) {
      const cv = c.body.linvel();
      const cdv = Math.hypot(cv.x - c.prevVel.x, cv.y - c.prevVel.y + 9.81 * dt, cv.z - c.prevVel.z);
      if (cdv > CARRIER.stunDv) this.stun(c);
      else {
        const b = c.balance(dt, c.prevVel, this.touchesWall(c));
        if (b === 'wobble') this.emit({ type: 'wobble', carrier: c.id, pos: c.pos });
        else if (b === 'fall') this.emit({ type: 'fall', carrier: c.id, pos: c.pos });
      }
      c.prevVel = { x: cv.x, y: cv.y, z: cv.z };
      const p = c.pos, ip = Game.nearest(at, p);
      const far = Math.hypot(p.x - ip.x, p.z - ip.z) > 22 || Math.abs(p.y - ip.y) > 6;
      if (p.y < -3 || far) {
        c.teleport({ x: ip.x + (this.rng() - 0.5) * 2, y: Math.max(ip.y, 0) + 1.2, z: ip.z + 1.5 });
      }
    }
    // Estado de cada objeto: pendiente, en camino, cargado o roto (con los sucesos de carga)
    for (const it of this.items) this.updateLoad(it, dt);
    // Objetos fuera del mapa
    for (const it of this.items) if (it.body.translation().y < -3) this.respawnItem(it);
    // Etapas (del objeto principal)
    const stages = this.level.stages;
    while (this.stage + 1 < stages.length) {
      const when = stages[this.stage + 1].when;
      if (when && !inRegion(when, sp)) break;
      this.stage++;
      this.emit({ type: 'stage', index: this.stage, label: stages[this.stage].label });
    }
    // Atasco: los humanos empujan y el sofá no avanza
    const speed = Math.hypot(v.x, v.z);
    const pushing = this.lead.active && Math.hypot(this.lead.x, this.lead.z) > 1;
    this.stuckTime = pushing && speed < 0.25 ? this.stuckTime + dt : Math.max(0, this.stuckTime - dt * 2);
    // Uno solo arrastra (o intenta mover) algo que pesa más de lo que una persona sostiene
    let solo: Carrier | null = null, helped = false;
    for (const it of this.grabbables) {
      const hs = this.carriers.filter((c) => c.heldBody === it.body);
      const heavy = it.body.mass() * 9.81 > HAND.maxV;
      if (hs.length === 1 && heavy && Math.hypot(hs[0].wantVel.x, hs[0].wantVel.z) > 0.3) solo = hs[0];
      // Ya no está solo: alguien más agarra lo que arrastraba
      if (hs.length > 1 && hs.some((c) => c.id === this.soloDragCarrier)) helped = true;
    }
    if (helped && !solo) { this.soloDrag = 0; this.soloDragCarrier = null; }
    this.soloDrag = solo ? Math.min(RULES.heavyHintMax, this.soloDrag + dt) : Math.max(0, this.soloDrag - dt * 2);
    if (solo) this.soloDragCarrier = solo.id;
    else if (this.soloDrag === 0) this.soloDragCarrier = null;
    if (this.phase !== 'playing') return;
    // Entrega: se gana al tener cargados todos los obligatorios
    const required = this.items.filter((it) => it.required);
    if (required.length && required.every((it) => it.state === 'loaded')) { this.phase = 'won'; this.emit({ type: 'win' }); return; }
    // Un objeto obligatorio roto hace perder; uno opcional roto solo cuenta como daño
    if (this.items.some((it) => it.required && it.state === 'broken')) { this.phase = 'lost'; this.loseReason = 'broken'; this.emit({ type: 'lose', reason: 'broken' }); return; }
    if (this.time >= this.level.timeLimit) { this.phase = 'lost'; this.loseReason = 'time'; this.emit({ type: 'lose', reason: 'time' }); }
  }

  /**
   * Parte de la caja envolvente de un objeto que está dentro de la caja de carga (0 a 1; 0 si su centro está fuera).
   * Se mide con una rejilla de puntos repartidos por la caja envolvente (en coordenadas locales, girada con el objeto).
   */
  holdFraction(it: Item): number {
    const { min, max } = it.bounds, h = this.hold;
    const q = it.body.rotation(), t = it.body.translation();
    const inside = (l: Vec3) => {
      const r = rotate(q, l), x = t.x + r.x, y = t.y + r.y, z = t.z + r.z;
      return x > h.min.x && x < h.max.x && y > h.min.y && y < h.max.y && z > h.min.z && z < h.max.z;
    };
    if (!inside({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 })) return 0;
    const N = HOLD_SAMPLES, at = (a: number, b: number, i: number) => a + ((b - a) * (i + 0.5)) / N;
    let n = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      if (inside({ x: at(min.x, max.x, i), y: at(min.y, max.y, j), z: at(min.z, max.z, k) })) n++;
    }
    return n / (N * N * N);
  }

  /**
   * Estado de un objeto tras el paso: roto; cargado (dentro del camión, nadie lo agarra y lleva `winHold` s quieto);
   * en camino (alguien lo lleva) o pendiente. Uno cargado deja de contar si sale del camión o alguien lo agarra.
   */
  private updateLoad(it: Item, dt: number) {
    if (it.state === 'broken') { it.inHold = false; it.loadTime = 0; return; }
    const held = this.carriers.some((c) => c.heldBody === it.body);
    it.inHold = this.holdFraction(it) >= RULES.loadFraction;
    if (it.state === 'loaded') {
      if (it.inHold && !held) return;
      it.state = held ? 'carried' : 'pending';
      it.loadTime = 0;
      this.emit({ type: 'itemUnloaded', item: it.index, id: it.def.id, pos: it.body.translation() });
      return;
    }
    it.state = held ? 'carried' : 'pending';
    const v = it.body.linvel(), w = it.body.angvel();
    const still = Math.hypot(v.x, v.y, v.z) < RULES.loadedSpeed && Math.hypot(w.x, w.y, w.z) < RULES.loadedSpin;
    it.loadTime = this.phase === 'playing' && it.inHold && !held && still ? it.loadTime + dt : 0;
    if (it.loadTime >= RULES.winHold) {
      it.state = 'loaded';
      this.emit({ type: 'itemLoaded', item: it.index, id: it.def.id, pos: it.body.translation() });
    }
  }

  /** ¿Choca con una pared u otro objeto fijo (contacto de lado, no el suelo)? También lo usa `scripts/duo-e2e.cjs`. */
  touchesWall(c: Carrier) {
    let wall = false;
    this.world.contactPairsWith(c.collider, (other) => {
      if (wall || !other.parent()?.isFixed()) return;
      this.world.contactPair(c.collider, other, (m) => {
        if (m.numContacts() > 0 && Math.abs(m.normal().y) < 0.6) wall = true;
      });
    });
    return wall;
  }

  /**
   * Enderezar un objeto volcado: el más cercano a quien lo pide (`by`; sin nadie, el principal). Suelta a todos los que
   * lo agarran y lo deja de pie con un pequeño salto. Con un solo objeto («La calle»), el sofá, como antes.
   */
  tryRight(by?: Carrier): boolean {
    if (this.phase !== 'playing') return false;
    let it: Item | null = null, best = Infinity;
    for (const o of by ? this.items : [this.sofaItem]) {
      if (sofaUp(o.body) > 0.55) continue;
      const p = o.body.translation(), d = by ? Math.hypot(p.x - by.pos.x, p.z - by.pos.z) : 0;
      if (d < best) { best = d; it = o; }
    }
    if (!it) return false;
    const body = it.body;
    for (const c of this.carriers) if (c.heldBody === body) c.release(true);
    const p = body.translation();
    body.setTranslation({ x: p.x, y: p.y + 0.6, z: p.z }, true);
    body.setRotation(yawQuat(sofaYaw(body)), true);
    body.setLinvel({ x: 0, y: 2, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    it.prevVel = { x: 0, y: 2, z: 0 };
    // El salto no cuenta como golpe al caer (ya cuesta `rightCost`): desde 0,8 m, la lámpara se rompería al enderezarla
    it.impactCooldown = RULES.rightLand;
    this.damage(it, RULES.rightCost);
    this.emit({ type: 'righted', item: it.index, pos: body.translation() });
    return true;
  }

  /**
   * Un objeto se ha caído del mapa: reaparece (con `respawnCost` de daño y 5 s más). El principal, en el punto de su
   * etapa; los demás, donde empezaron.
   */
  private respawnItem(it: Item) {
    const stages = this.level.stages;
    const cp = it === this.sofaItem ? stages[Math.min(this.stage, stages.length - 1)].respawn : { p: it.start.pos, yaw: it.start.yaw };
    for (const c of this.carriers) if (c.heldBody === it.body) c.release(true);
    it.body.setTranslation(cp.p, true);
    it.body.setRotation(yawQuat(cp.yaw), true);
    it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    it.prevVel = { x: 0, y: 0, z: 0 };
    this.damage(it, RULES.respawnCost);
    this.time += 5;
    this.emit({ type: 'respawnItem', item: it.index, pos: cp.p });
  }

  dispose() { this.world.free(); this.events.free(); }
}

export function eulerQuat(rx: number, rz: number) {
  // Solo se usa una de las dos rotaciones a la vez.
  if (rx) return { x: Math.sin(rx / 2), y: 0, z: 0, w: Math.cos(rx / 2) };
  if (rz) return { x: 0, y: 0, z: Math.sin(rz / 2), w: Math.cos(rz / 2) };
  return { x: 0, y: 0, z: 0, w: 1 };
}
