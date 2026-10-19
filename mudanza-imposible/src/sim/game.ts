// Estado de la partida y paso de simulación. No depende de Three.js ni del DOM:
// se puede ejecutar en Node para las pruebas.
import type RAPIER from '@dimforge/rapier3d-compat';
import { BotBrain, BOT, type BotStyle } from './bots';
import { CAST, CARRIER, CENTER_Y, Carrier } from './carrier';
import { LEVEL, SOFA_START, STAGES, STAIRS, ZONE, FLOOR2, RAMP } from './level';
import { SLOTS, createSofa, localToWorld, rotate, sofaUp, sofaYaw, yawQuat } from './sofa';
import { Car, CAR_COLORS, lightAt, stepTraffic } from './traffic';
import { NO_INPUT, type GameEvent, type PlayerInput, type Vec3 } from './types';

type R = typeof RAPIER;

export const RULES = {
  timeLimit: 180,
  parTime: 90,
  countdown: 3,
  /** Golpe mínimo (cambio brusco de velocidad del sofá, m/s) que daña el mueble. */
  impactDv: 3.2,
  impactDamage: 5,
  carDamage: 12,
  rightCost: 3,
  respawnCost: 15,
  winHold: 1.0,
  /** Par estabilizador por mano (N·m por unidad de inclinación) y amortiguación del balanceo. */
  wristK: 22,
  wristDamp: 5,
};

export interface GameOptions {
  humans: number;
  carriers: number;
  botStyle: BotStyle;
  seed?: number;
}

/**
 * Física cooperativa: cuando todos los porteadores son humanos (sin ayudantes de la máquina), cada uno tira
 * con fuerza limitada, el sofá pesa más y roza más a rastras (uno solo apenas lo mueve) y los porteadores
 * pierden el equilibrio. Con ayudantes se mantiene la física original: los ayudantes y el piloto automático
 * están ajustados a ella.
 */
export const isCoop = (o: GameOptions) => o.humans >= 2 && o.carriers <= o.humans;

export type Phase = 'countdown' | 'playing' | 'won' | 'lost';

/** Puntos de reaparición del sofá según la etapa alcanzada. */
const CHECKPOINTS: { p: Vec3; yaw: number }[] = [
  { p: { x: 0, y: 0.6, z: 9 }, yaw: 0 },
  { p: { x: 0, y: 0.6, z: 2.6 }, yaw: Math.PI / 2 },
  { p: { x: 0, y: 0.6, z: -16 }, yaw: Math.PI / 2 },
  { p: { x: 0, y: 0.6, z: -20.5 }, yaw: Math.PI / 2 },
  { p: { x: 4, y: FLOOR2 + 0.6, z: -30.6 }, yaw: 0 },
  { p: { x: RAMP.x0 - 1, y: FLOOR2 + 0.6, z: -30.6 }, yaw: 0 },
  { p: { x: 25.5, y: 0.6, z: -30.3 }, yaw: 0 },
];

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  world!: RAPIER.World;
  events!: RAPIER.EventQueue;
  sofa!: RAPIER.RigidBody;
  sofaColliders!: RAPIER.Collider[];
  carriers: Carrier[] = [];
  bots = new Map<number, BotBrain>();
  cars: Car[] = [];
  phase: Phase = 'countdown';
  time = 0; // tiempo de partida (tras la cuenta atrás)
  clock = 0; // tiempo total simulado (semáforo)
  countdown = RULES.countdown;
  integrity = 100;
  stage = 0;
  inZone = 0;
  stuckTime = 0;
  /** Física cooperativa (todos humanos): ver `isCoop`. */
  readonly coop: boolean;
  /** Tiempo que lleva uno solo intentando mover el sofá sin conseguirlo (para el aviso). */
  soloDrag = 0;
  loseReason: 'broken' | 'time' | null = null;
  out: GameEvent[] = [];
  private prevSofaVel: Vec3 = { x: 0, y: 0, z: 0 };
  private impactCooldown = 0;
  private lastCarHit = -10;
  private lastPed: 'green' | 'red' = 'red';
  private rng: () => number;
  private handleOwner = new Map<number, { kind: 'sofa' } | { kind: 'carrier'; i: number } | { kind: 'car'; i: number }>();
  /** Velocidad media pedida por los humanos que cargan (la usan los ayudantes). */
  lead = { x: 0, z: 0, w: 0, active: false, lift: false };

  constructor(private R: R, readonly opts: GameOptions) {
    this.rng = mulberry32(opts.seed ?? 12345);
    this.coop = isCoop(opts);
    this.build();
  }

  private build() {
    const R = this.R;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.numSolverIterations = 8;
    this.events = new R.EventQueue(true);
    for (const b of LEVEL) {
      if (!b.solid) continue;
      const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...b.p).setRotation(eulerQuat(b.rx ?? 0, b.rz ?? 0)));
      // La rampa es de chapa: resbala. Si se suelta el sofá encima, baja deslizándose.
      const cd = R.ColliderDesc.cuboid(...b.h).setFriction(b.kind === 'ramp' ? 0.15 : b.kind === 'stairs' ? 0.9 : 0.6);
      if (b.kind === 'ramp') cd.setFrictionCombineRule(R.CoefficientCombineRule.Min);
      this.world.createCollider(cd, body);
    }
    const coop = this.coop;
    const s = createSofa(R, this.world, { x: SOFA_START.x, y: SOFA_START.y, z: SOFA_START.z }, SOFA_START.yaw, coop);
    this.sofa = s.body;
    this.sofaColliders = s.colliders;
    for (const c of s.colliders) this.handleOwner.set(c.handle, { kind: 'sofa' });
    const n = Math.max(1, Math.min(6, this.opts.carriers));
    const humans = Math.max(0, Math.min(n, this.opts.humans));
    // Posiciones de salida: alrededor del sofá, frente a sus asas
    for (let i = 0; i < n; i++) {
      const slot = SLOTS[i % SLOTS.length];
      const a = localToWorld(this.sofa, slot.p);
      const out = rotate(this.sofa.rotation(), slot.out);
      const p = { x: a.x + out.x * 1.3, y: CENTER_Y + 0.05, z: a.z + out.z * 1.3 };
      const c = new Carrier(R, this.world, i, CAST[i], i < humans ? i : null, p, coop);
      c.facing = { x: -out.x, z: -out.z };
      this.carriers.push(c);
      this.handleOwner.set(c.collider.handle, { kind: 'carrier', i });
      if (c.human === null) this.bots.set(i, new BotBrain(i % SLOTS.length, this.opts.botStyle, this.rng));
    }
    let id = 0;
    for (let lane = 0; lane < 2; lane++) {
      for (let k = 0; k < 3; k++) {
        const x = -40 + k * 30 + lane * 13;
        const car = new Car(R, this.world, id, lane, x, CAR_COLORS[id % CAR_COLORS.length]);
        this.cars.push(car);
        this.handleOwner.set(car.collider.handle, { kind: 'car', i: id });
        id++;
      }
    }
  }

  get light() { return lightAt(this.clock); }
  get sofaPos(): Vec3 { return this.sofa.translation(); }
  get sofaYaw() { return sofaYaw(this.sofa); }
  get sofaUp() { return sofaUp(this.sofa); }
  get stageLabel() { return STAGES[this.stage].label; }

  /**
   * Al pie de la escalera (o ya en ella) con el sofá sin alzar. Con la física cooperativa no se puede arrastrar
   * escaleras arriba: hay que alzarlo (Mayús). La interfaz lo avisa; si no, la pareja se quedaba atascada abajo.
   */
  get needsLiftAtStairs() {
    if (!this.coop || this.phase !== 'playing') return false;
    const s = this.sofaPos;
    const atStairs = Math.abs(s.x) < 1.8 && s.z < STAIRS.z0 + 2.5 && s.z > STAIRS.z1 && s.y < STAIRS.top - 0.3;
    const holders = this.carriers.filter((c) => c.human !== null && c.holding);
    return atStairs && holders.length > 0 && holders.some((c) => c.handLift < 0.5);
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
    const sofa = this.sofa;

    // Mando de los humanos y lo que deben imitar los ayudantes
    let lx = 0, lz = 0, lw = 0, nl = 0, lift = false;
    const humanInputs = new Map<number, PlayerInput>();
    for (const c of this.carriers) {
      if (c.human === null) continue;
      const inp = playing ? inputs[c.human] ?? NO_INPUT : NO_INPUT;
      humanInputs.set(c.id, inp);
      if (inp.turn !== 0) lw += inp.turn * BOT.turnRate;
      if (inp.lift) lift = true;
      if (c.holding) { lx += inp.mx * CARRIER.carrySpeed; lz += inp.mz * CARRIER.carrySpeed; nl++; }
      if (inp.right) this.tryRight();
    }
    this.lead = { x: nl ? lx / nl : 0, z: nl ? lz / nl : 0, w: lw, active: nl > 0, lift };

    const taken = new Set<number>();
    for (const [i, b] of this.bots) if (this.carriers[i].holding) taken.add(b.slot);

    for (const c of this.carriers) {
      let inp: PlayerInput;
      const brain = this.bots.get(c.id);
      if (brain) {
        const wasHolding = c.holding;
        inp = playing ? brain.think(c, sofa, this.lead, taken, dt) : NO_INPUT;
        if (inp.grab && wasHolding) {
          c.release();
          this.emit({ type: 'release', carrier: c.id, pos: c.handWorld() });
        } else if (inp.grab) {
          if (c.tryGrab(sofa, this.sofaColliders, SLOTS[brain.slot].p)) {
            taken.add(brain.slot);
            this.emit({ type: 'grab', carrier: c.id, pos: c.handWorld() });
          }
        }
        inp = { ...inp, lift: this.lead.lift };
      } else {
        inp = humanInputs.get(c.id) ?? NO_INPUT;
        if (c.holding && inp.turn !== 0) {
          // Quien pide el giro también lo acompaña: se mueve alrededor del centro del sofá.
          const w = inp.turn * BOT.turnRate, sp = this.sofaPos, p = c.pos;
          inp = { ...inp, mx: inp.mx + (w * (p.z - sp.z)) / CARRIER.carrySpeed, mz: inp.mz - (w * (p.x - sp.x)) / CARRIER.carrySpeed };
        }
        if (inp.grab) {
          if (c.holding) { c.release(); this.emit({ type: 'release', carrier: c.id, pos: c.handWorld() }); }
          else if (c.tryGrab(sofa, this.sofaColliders)) this.emit({ type: 'grab', carrier: c.id, pos: c.handWorld() });
        }
      }
      if (c.stunned > 0) c.stunned = Math.max(0, c.stunned - dt);
      if (c.control(inp, dt, sofa)) this.emit({ type: 'gripBreak', carrier: c.id, pos: c.handWorld() });
    }

    this.wristAssist(dt);

    // Tráfico
    const obstacles = [this.sofaPos, ...this.carriers.map((c) => c.pos)];
    for (const car of stepTraffic(this.cars, this.clock, dt, obstacles)) {
      this.emit({ type: 'honk', car: car.id, pos: car.body.translation() });
    }
    const ped = this.light.ped;
    if (ped !== this.lastPed) { this.lastPed = ped; this.emit({ type: 'light', ped }); }

    this.world.step(this.events);
    this.clampSofa();

    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.handleOwner.get(h1), b = this.handleOwner.get(h2);
      if (!a || !b) return;
      const car = a.kind === 'car' ? a : b.kind === 'car' ? b : null;
      const other = car === a ? b : a;
      if (!car || other.kind === 'car') return;
      if (other.kind === 'sofa') {
        // Un atropello toca varias piezas del sofá a la vez: cuenta una sola vez por segundo.
        if (this.clock - this.lastCarHit < 1) return;
        this.lastCarHit = this.clock;
        const pos = this.sofaPos;
        this.damage(RULES.carDamage);
        this.emit({ type: 'carHit', pos, target: 'sofa' });
      } else if (other.kind === 'carrier') {
        const c = this.carriers[other.i];
        this.stun(c);
        this.emit({ type: 'carHit', pos: c.pos, target: 'carrier', carrier: c.id });
      }
    });

    this.afterStep(dt);
  }

  /**
   * Las manos de quien carga no son rótulas perfectas: con las muñecas evitan que el sofá gire sin control.
   * Par que tiende a ponerlo derecho y amortigua el balanceo, proporcional al número de manos.
   * Permite inclinarlo (alzar a destiempo sigue inclinándolo), pero no voltearlo con facilidad.
   */
  private wristAssist(dt: number) {
    const holders = this.carriers.filter((c) => c.holding).length;
    if (!holders) return;
    const up = rotate(this.sofa.rotation(), { x: 0, y: 1, z: 0 });
    const w = this.sofa.angvel();
    const k = RULES.wristK * holders, c = RULES.wristDamp * holders;
    // up × Y = (-up.z, 0, up.x)
    const tx = -up.z * k - w.x * c, tz = up.x * k - w.z * c;
    this.sofa.applyTorqueImpulse({ x: tx * dt, y: 0, z: tz * dt }, true);
  }

  /** Evita que un conflicto entre articulaciones y contactos lance el sofá a velocidades absurdas. */
  private clampSofa() {
    const v = this.sofa.linvel(), w = this.sofa.angvel();
    const sv = Math.hypot(v.x, v.y, v.z), sw = Math.hypot(w.x, w.y, w.z);
    if (sv > 11) this.sofa.setLinvel({ x: (v.x * 11) / sv, y: (v.y * 11) / sv, z: (v.z * 11) / sv }, true);
    if (sw > 6) this.sofa.setAngvel({ x: (w.x * 6) / sw, y: (w.y * 6) / sw, z: (w.z * 6) / sw }, true);
  }

  private stun(c: Carrier) {
    if (c.stunned > 0) return;
    c.stunned = CARRIER.stunTime;
    c.knock = 'car';
    // Sale despedido hacia donde le lleva el golpe (o de espaldas si apenas se mueve)
    const v = c.body.linvel(), sp = Math.hypot(v.x, v.z);
    c.fallDir = sp > 1 ? { x: v.x / sp, z: v.z / sp } : { x: -c.facing.x, z: -c.facing.z };
    c.resetBalance();
    if (c.holding) c.release();
    this.emit({ type: 'stun', carrier: c.id, pos: c.pos });
  }

  private damage(d: number) {
    if (this.phase !== 'playing') return;
    this.integrity = Math.max(0, this.integrity - d);
  }

  private afterStep(dt: number) {
    const sofa = this.sofa;
    const v = sofa.linvel();
    // Golpes del sofá: cambio brusco de velocidad que no se explica por la gravedad
    const dv = Math.hypot(v.x - this.prevSofaVel.x, v.y - this.prevSofaVel.y + 9.81 * dt, v.z - this.prevSofaVel.z);
    this.prevSofaVel = { x: v.x, y: v.y, z: v.z };
    this.impactCooldown -= dt;
    if (dv > RULES.impactDv && this.impactCooldown <= 0) {
      const dmg = Math.round((dv - RULES.impactDv) * RULES.impactDamage);
      this.impactCooldown = 0.25;
      if (dmg > 0) this.damage(dmg);
      this.emit({ type: 'impact', pos: this.sofaPos, strength: dv, damage: dmg });
    }
    // Porteadores: golpe fuerte → tumbado; caída al vacío → reaparece junto al sofá
    const sp = this.sofaPos;
    for (const c of this.carriers) {
      const cv = c.body.linvel();
      const cdv = Math.hypot(cv.x - c.prevVel.x, cv.y - c.prevVel.y + 9.81 * dt, cv.z - c.prevVel.z);
      if (cdv > CARRIER.stunDv) this.stun(c);
      else if (c.coop) {
        const b = c.balance(dt, c.prevVel, this.touchesWall(c));
        if (b === 'wobble') this.emit({ type: 'wobble', carrier: c.id, pos: c.pos });
        else if (b === 'fall') this.emit({ type: 'fall', carrier: c.id, pos: c.pos });
      }
      c.prevVel = { x: cv.x, y: cv.y, z: cv.z };
      const p = c.pos;
      const far = Math.hypot(p.x - sp.x, p.z - sp.z) > 22 || Math.abs(p.y - sp.y) > 6;
      if (p.y < -3 || far) {
        c.teleport({ x: sp.x + (this.rng() - 0.5) * 2, y: Math.max(sp.y, 0) + 1.2, z: sp.z + 1.5 });
      }
    }
    // Sofá fuera del mapa
    if (sp.y < -3) this.respawnSofa();
    // Etapas
    while (this.stage + 1 < STAGES.length && STAGES[this.stage + 1].reached(sp.x, sp.y, sp.z)) {
      this.stage++;
      this.emit({ type: 'stage', index: this.stage, label: STAGES[this.stage].label });
    }
    // Atasco: los humanos empujan y el sofá no avanza
    const speed = Math.hypot(v.x, v.z);
    const pushing = this.lead.active && Math.hypot(this.lead.x, this.lead.z) > 1;
    this.stuckTime = pushing && speed < 0.25 ? this.stuckTime + dt : Math.max(0, this.stuckTime - dt * 2);
    const holders = this.carriers.filter((c) => c.holding);
    const soloPush = holders.length === 1 && Math.hypot(holders[0].wantVel.x, holders[0].wantVel.z) > 1 && speed < 1.2;
    this.soloDrag = soloPush ? this.soloDrag + dt : Math.max(0, this.soloDrag - dt * 2);
    if (this.phase !== 'playing') return;
    // Entrega
    const inZone = sp.x > ZONE.x0 && sp.x < ZONE.x1 && sp.z > ZONE.z0 && sp.z < ZONE.z1 && sp.y < 1.6;
    this.inZone = inZone && speed < 1.5 ? this.inZone + dt : 0;
    if (this.inZone >= RULES.winHold) { this.phase = 'won'; this.emit({ type: 'win' }); return; }
    if (this.integrity <= 0) { this.phase = 'lost'; this.loseReason = 'broken'; this.emit({ type: 'lose', reason: 'broken' }); return; }
    if (this.time >= RULES.timeLimit) { this.phase = 'lost'; this.loseReason = 'time'; this.emit({ type: 'lose', reason: 'time' }); }
  }

  /** ¿Choca con una pared u otro objeto fijo (contacto de lado, no el suelo)? */
  private touchesWall(c: Carrier) {
    let wall = false;
    this.world.contactPairsWith(c.collider, (other) => {
      if (wall || !other.parent()?.isFixed()) return;
      this.world.contactPair(c.collider, other, (m) => {
        if (m.numContacts() > 0 && Math.abs(m.normal().y) < 0.6) wall = true;
      });
    });
    return wall;
  }

  /** Enderezar el sofá cuando está volcado. Suelta a todos y lo deja de pie con un pequeño salto. */
  tryRight(): boolean {
    if (this.sofaUp > 0.55 || this.phase !== 'playing') return false;
    for (const c of this.carriers) c.release();
    const p = this.sofaPos;
    this.sofa.setTranslation({ x: p.x, y: p.y + 0.6, z: p.z }, true);
    this.sofa.setRotation(yawQuat(this.sofaYaw), true);
    this.sofa.setLinvel({ x: 0, y: 2, z: 0 }, true);
    this.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevSofaVel = { x: 0, y: 2, z: 0 };
    this.damage(RULES.rightCost);
    this.emit({ type: 'righted', pos: this.sofaPos });
    return true;
  }

  private respawnSofa() {
    const cp = CHECKPOINTS[Math.min(this.stage, CHECKPOINTS.length - 1)];
    for (const c of this.carriers) c.release();
    this.sofa.setTranslation(cp.p, true);
    this.sofa.setRotation(yawQuat(cp.yaw), true);
    this.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevSofaVel = { x: 0, y: 0, z: 0 };
    this.damage(RULES.respawnCost);
    this.time += 5;
    this.emit({ type: 'respawnSofa', pos: cp.p });
  }

  dispose() { this.world.free(); this.events.free(); }
}

export function eulerQuat(rx: number, rz: number) {
  // Solo se usa una de las dos rotaciones a la vez.
  if (rx) return { x: Math.sin(rx / 2), y: 0, z: 0, w: Math.cos(rx / 2) };
  if (rz) return { x: 0, y: 0, z: Math.sin(rz / 2), w: Math.cos(rz / 2) };
  return { x: 0, y: 0, z: 0, w: 1 };
}
