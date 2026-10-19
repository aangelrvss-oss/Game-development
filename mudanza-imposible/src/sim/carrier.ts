import type RAPIER from '@dimforge/rapier3d-compat';
import { worldToLocal, localToWorld } from './sofa';
import type { PlayerInput, Vec3 } from './types';

type R = typeof RAPIER;

export const CARRIER = {
  radius: 0.32,
  halfHeight: 0.33,
  mass: 70,
  walkSpeed: 5.2,
  carrySpeed: 3.4,
  accel: 32,
  airAccel: 6,
  handForward: 0.42,
  handY: 0.22,
  liftY: 0.78,
  grabReach: 1.05,
  /** Velocidad a la que la mano lleva el punto agarrado a su altura (m/s). */
  handSpeed: 1.4,
  /** Si el punto de agarre se separa más que esto de la mano, se suelta. */
  gripBreak: 0.55,
  stunTime: 1.8,
  /** Cambio brusco de velocidad que tumba a un porteador (atropello, golpe fuerte). */
  stunDv: 9,
  /**
   * Fuerza horizontal con la que cada uno mueve el mueble (N), además de moverse a sí mismo.
   * El sofá a rastras roza más que eso: uno solo apenas lo arrastra y entre dos se lleva bien.
   */
  pullForce: 200,
  // Equilibrio (modelo del laboratorio de personaje: péndulo invertido empujado por fuerzas medidas)
  comHeight: 0.9,
  ankleMax: 6,
  stepMax: 10,
  kp: 30,
  kd: 8,
  /** Tiempo con el que se acostumbra a una fuerza (s): los cambios más rápidos le pillan desprevenido. */
  adapt: 0.35,
  /** Cuánto desequilibra un tirón del sofá mientras lo sujeta. */
  holdGain: 1.6,
  /**
   * Al perder el agarre (suelta tirando, el asa se escapa), la tensión que sostenía desaparece de golpe:
   * se convierte en un giro del tronco hacia atrás (rad/s por cada m/s² de tensión por masa).
   */
  releaseKick: 1.0,
  /** Cambios de fuerza por debajo de esto (N) no sorprenden: agarrar, alzar y llevar el sofá con normalidad. */
  deadZone: 100,
  /** Cuánto desequilibra un empujón (el compañero, el sofá que le golpea). */
  shoveGain: 0.5,
  loseAt: 0.26,
  fallAt: 0.78,
  regainBelow: 0.1,
  stumbleMin: 0.4,
  stumbleMaxTime: 1.4,
  /** Tiempo en el suelo tras perder el equilibrio (s). */
  fallTime: 1.3,
};

export const CENTER_Y = CARRIER.halfHeight + CARRIER.radius;

export type Cast = 'mono' | 'rulos' | 'gordo' | 'alien' | 'enano' | 'perro';
export const CAST: { cast: Cast; name: string; color: string }[] = [
  { cast: 'mono', name: 'Abuela Moño', color: '#8b5cf6' },
  { cast: 'gordo', name: 'Gordo', color: '#3b82f6' },
  { cast: 'rulos', name: 'Abuela Rulos', color: '#ec4899' },
  { cast: 'alien', name: 'Alien', color: '#22c55e' },
  { cast: 'enano', name: 'Enano', color: '#f97316' },
  { cast: 'perro', name: 'Salchicha', color: '#a16207' },
];

type V2 = { x: number; z: number };
const len2 = (v: V2) => Math.hypot(v.x, v.z);

/** Resultado del equilibrio en un paso, para los sucesos de la partida. */
export type BalanceEvent = 'wobble' | 'fall' | 'steady' | null;

export class Carrier {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  joint: RAPIER.ImpulseJoint | null = null;
  /** Punto agarrado, en coordenadas locales del sofá. */
  grabLocal: Vec3 | null = null;
  /** Dirección horizontal mano→agarre. En la partida a dos gira con el sofá (`followSofa`). */
  handDir = { x: 0, z: -1 };
  /** `handDir` en el momento de agarrar y el giro del sofá entonces (eje largo en horizontal, rad). */
  private grabDir = { x: 0, z: -1 };
  private grabYaw = 0;
  handLift = 0; // 0..1 suavizado
  /** Ancla actual de la mano (local al porteador). Se acerca poco a poco a la posición objetivo. */
  anchorCur: Vec3 = { x: 0, y: CARRIER.handY, z: 0 };
  stunned = 0;
  facing = { x: 0, z: -1 };
  prevVel: Vec3 = { x: 0, y: 0, z: 0 };
  grounded = true;
  /** Velocidad pedida en este paso (para que los ayudantes la imiten). */
  wantVel = { x: 0, z: 0 };
  /** Desequilibrio: desviación del tronco (rad, hacia dónde se va) y su velocidad. */
  lean: V2 = { x: 0, z: 0 };
  leanVel: V2 = { x: 0, z: 0 };
  /** Trastabilla: da pasos apresurados hacia donde se cae. */
  wobbling = false;
  /** Veces que ha trastabillado y que se ha caído por equilibrio en la partida. */
  wobbles = 0;
  falls = 0;
  /** Cómo cayó la última vez: atropello o equilibrio (la vista anima distinto cada caso). */
  knock: 'car' | 'balance' = 'car';
  /** Dirección de la caída por equilibrio. */
  fallDir: V2 = { x: 0, z: 1 };
  /** Fuerza horizontal medida sobre el cuerpo (N, suavizada) y la que espera (con retraso). */
  private force: V2 = { x: 0, z: 0 };
  private forceExp: V2 = { x: 0, z: 0 };
  private lastJ: V2 = { x: 0, z: 0 };
  private wobbleTime = 0;
  private calmTime = 0;
  /** Tensión que sostenía en el paso anterior (si agarraba). */
  private heldTension: V2 | null = null;
  /** Tras agarrar, un momento para hacerse con el peso: el tirón del propio agarre no sorprende. */
  private grabGrace = 0;
  /** Índice de jugador humano, o null si es un ayudante. */
  constructor(
    private R: R,
    private world: RAPIER.World,
    readonly id: number,
    readonly cast: (typeof CAST)[number],
    public human: number | null,
    pos: Vec3,
    /** Física cooperativa: fuerza de tiro limitada y equilibrio (ver `CARRIER.pullForce` y `balance`). */
    readonly coop = false,
  ) {
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).lockRotations().setCcdEnabled(true),
    );
    const vol = Math.PI * CARRIER.radius ** 2 * (2 * CARRIER.halfHeight + (4 / 3) * CARRIER.radius);
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(CARRIER.halfHeight, CARRIER.radius)
        .setDensity(CARRIER.mass / vol)
        .setFriction(0)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
  }

  get pos(): Vec3 { return this.body.translation(); }
  get holding(): boolean { return this.joint !== null; }

  /** Mano en el espacio local del porteador (sin rotación: el cuerpo tiene la rotación bloqueada). */
  handAnchor(): Vec3 {
    const y = CARRIER.handY + (CARRIER.liftY - CARRIER.handY) * this.handLift;
    return { x: this.handDir.x * CARRIER.handForward, y, z: this.handDir.z * CARRIER.handForward };
  }

  handWorld(): Vec3 {
    const p = this.pos, a = this.joint ? this.anchorCur : this.handAnchor();
    return { x: p.x + a.x, y: p.y + a.y, z: p.z + a.z };
  }

  grabWorld(sofa: RAPIER.RigidBody): Vec3 | null {
    return this.grabLocal ? localToWorld(sofa, this.grabLocal) : null;
  }

  /** Busca el punto del sofá más cercano a la mano; si está al alcance, lo agarra. */
  tryGrab(sofa: RAPIER.RigidBody, colliders: RAPIER.Collider[], preferLocal?: Vec3): boolean {
    if (this.joint || this.stunned > 0) return false;
    const p = this.pos;
    let target: Vec3 | null = null;
    if (preferLocal) {
      target = localToWorld(sofa, preferLocal);
    } else {
      const probe = { x: p.x + this.facing.x * 0.35, y: p.y + CARRIER.handY, z: p.z + this.facing.z * 0.35 };
      let best = Infinity;
      for (const c of colliders) {
        const proj = c.projectPoint(probe, true);
        if (!proj) continue;
        const d = Math.hypot(proj.point.x - probe.x, proj.point.y - probe.y, proj.point.z - probe.z);
        if (d < best) { best = d; target = { x: proj.point.x, y: proj.point.y, z: proj.point.z }; }
      }
    }
    if (!target) return false;
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > CARRIER.grabReach + CARRIER.radius || Math.abs(target.y - p.y) > 1.3) return false;
    this.handDir = dist > 1e-3 ? { x: dx / dist, z: dz / dist } : { ...this.facing };
    this.grabDir = { ...this.handDir };
    this.grabYaw = flatYaw(sofa) ?? 0;
    this.grabLocal = worldToLocal(sofa, target);
    // La mano empieza justo en el punto agarrado y después sube a su altura: sin tirones.
    this.anchorCur = { x: target.x - p.x, y: target.y - p.y, z: target.z - p.z };
    const data = this.R.JointData.spherical(this.anchorCur, this.grabLocal);
    this.joint = this.world.createImpulseJoint(data, this.body, sofa, true);
    // Partida a dos: el cuerpo choca con el sofá también mientras lo agarra (antes se desactivaba siempre y, al
    // girarlo, el sofá se le metía en el cuerpo hasta 0,6 m), y la mano sigue el giro del sofá (`followSofa`).
    // Con ayudantes sigue como antes: su fuerza no tiene límite y, con el choque activo, empujaban y lanzaban el
    // sofá (golpes que lo rompían en la mitad de las partidas de prueba).
    this.joint.setContactsEnabled(this.coop);
    return true;
  }

  /**
   * La mano sigue al sofá cuando este gira: quien lo agarra se queda frente a su punto de agarre, como haría
   * una persona, en vez de dejar que el mueble gire alrededor de la mano y se le meta en el cuerpo.
   */
  private followSofa(sofa: RAPIER.RigidBody) {
    const yaw = flatYaw(sofa);
    if (yaw === null) return; // de pie o volcado: el eje largo no marca un giro horizontal fiable
    const d = yaw - this.grabYaw, c = Math.cos(d), s = Math.sin(d), g = this.grabDir;
    this.handDir = { x: g.x * c - g.z * s, z: g.x * s + g.z * c };
  }

  release() {
    if (this.joint) this.world.removeImpulseJoint(this.joint, true);
    this.joint = null;
    this.grabLocal = null;
  }

  /** ¿Está tocando el cuerpo indicado (contacto activo, no solo cerca)? */
  private touching(body: RAPIER.RigidBody) {
    let touch = false;
    this.world.contactPairsWith(this.collider, (other) => {
      if (touch || other.parent()?.handle !== body.handle) return;
      this.world.contactPair(this.collider, other, (m) => { if (m.numContacts() > 0) touch = true; });
    });
    return touch;
  }

  /** Aplica el control de movimiento. Devuelve true si la mano se ha soltado por tirón. */
  control(input: PlayerInput, dt: number, sofa: RAPIER.RigidBody): boolean {
    const v = this.body.linvel();
    let mx = input.mx, mz = input.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    if (this.stunned > 0) { mx = 0; mz = 0; }
    const speed = this.joint ? CARRIER.carrySpeed : CARRIER.walkSpeed;
    let tx = mx * speed, tz = mz * speed;
    // Suelo debajo
    const ray = new this.R.Ray(this.pos, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, CENTER_Y + 0.12, true, undefined, undefined, undefined, this.body);
    this.grounded = hit !== null;
    const mass = this.body.mass();
    let maxA = (this.grounded ? CARRIER.accel : CARRIER.airAccel) * (this.stunned > 0 ? 0.15 : 1);
    if (this.coop && this.grounded && this.stunned <= 0 && (this.joint || this.touching(sofa))) {
      // Cargando o empujando el sofá con el cuerpo: la fuerza para el mueble es limitada (si no, uno solo lo
      // empujaba más rápido de lo que lo llevan dos). En pendiente, además, sostiene su propio peso.
      const n = hit!.normal;
      maxA = CARRIER.pullForce / mass + 9.81 * Math.abs(n.y) * Math.hypot(n.x, n.z) * 1.3;
    }
    if (this.wobbling && this.stunned <= 0) {
      // Pasos apresurados hacia donde se cae: los pies intentan volver a ponerse debajo del cuerpo
      const d = this.lean, l = len2(d);
      if (l > 1e-4) {
        const sp = 1.2 + 3 * l;
        tx = tx * 0.3 + (d.x / l) * sp;
        tz = tz * 0.3 + (d.z / l) * sp;
        if (!this.joint) maxA = CARRIER.accel * 0.6;
      }
    }
    this.wantVel = { x: tx, z: tz };
    let ax = (tx - v.x) / dt, az = (tz - v.z) / dt;
    const a = Math.hypot(ax, az);
    if (a > maxA) { ax *= maxA / a; az *= maxA / a; }
    this.lastJ = { x: ax * mass * dt, z: az * mass * dt };
    this.body.applyImpulse({ x: this.lastJ.x, y: 0, z: this.lastJ.z }, true);
    if (m > 0.15 && !this.joint && !this.wobbling) this.facing = { x: mx / Math.max(m, 1e-6), z: mz / Math.max(m, 1e-6) };
    // Alzar: sube la mano poco a poco
    const goal = input.lift && this.joint ? 1 : 0;
    this.handLift += Math.sign(goal - this.handLift) * Math.min(Math.abs(goal - this.handLift), dt * 3);
    if (this.joint && this.coop) this.followSofa(sofa);
    if (this.joint) {
      const t = this.handAnchor(), c = this.anchorCur;
      const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
      const d = Math.hypot(dx, dy, dz), stepMax = CARRIER.handSpeed * dt;
      if (d > 1e-4) {
        const k = Math.min(1, stepMax / d);
        this.anchorCur = { x: c.x + dx * k, y: c.y + dy * k, z: c.z + dz * k };
        (this.joint as RAPIER.SphericalImpulseJoint).setAnchor1(this.anchorCur);
      }
      const g = this.grabWorld(sofa)!;
      this.facing = { ...this.handDir };
      const h = this.handWorld();
      if (Math.hypot(g.x - h.x, g.y - h.y, g.z - h.z) > CARRIER.gripBreak) { this.release(); return true; }
    }
    return false;
  }

  teleport(p: Vec3) {
    this.release();
    this.body.setTranslation(p, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel = { x: 0, y: 0, z: 0 };
    this.resetBalance();
  }

  resetBalance() {
    this.lean = { x: 0, z: 0 }; this.leanVel = { x: 0, z: 0 };
    this.force = { x: 0, z: 0 }; this.forceExp = { x: 0, z: 0 }; this.lastJ = { x: 0, z: 0 };
    this.wobbling = false; this.wobbleTime = 0; this.calmTime = 0; this.heldTension = null;
  }

  /**
   * Equilibrio, después del paso de física (modelo del laboratorio de personaje, simplificado).
   * Mide la fuerza horizontal externa (aceleración real menos el empuje de su propio control): el agarre,
   * el compañero o el sofá que le empujan. Lo que desequilibra es lo que cambia más deprisa de lo que
   * espera. Las paredes no cuentan (`wall`): chocar con una pared frena, no tumba.
   * `v0`: velocidad antes del paso. Devuelve si empieza a trastabillar, si se cae o si se recupera.
   */
  balance(dt: number, v0: Vec3, wall: boolean): BalanceEvent {
    if (this.stunned > 0) { this.resetBalance(); return null; }
    const v = this.body.linvel(), mass = this.body.mass();
    const fx = (mass * (v.x - v0.x) - this.lastJ.x) / dt, fz = (mass * (v.z - v0.z) - this.lastJ.z) / dt;
    if (!wall) {
      // El empuje medido tiene ruido de contacto paso a paso: se suaviza (0,18 s)
      const kf = Math.min(1, dt / 0.18);
      this.force.x += (fx - this.force.x) * kf;
      this.force.z += (fz - this.force.z) * kf;
    }
    if (this.joint && !this.heldTension) this.grabGrace = 0.5;
    this.grabGrace = Math.max(0, this.grabGrace - dt);
    const ka = this.grabGrace > 0 ? 1 : Math.min(1, dt / CARRIER.adapt);
    this.forceExp.x += (this.force.x - this.forceExp.x) * ka;
    this.forceExp.z += (this.force.z - this.forceExp.z) * ka;
    let sx = this.force.x - this.forceExp.x, sz = this.force.z - this.forceExp.z;
    const g = 9.81, h = CARRIER.comHeight, D = this.lean, W = this.leanVel;
    if (this.heldTension && !this.joint) {
      // Acaba de soltar: la tensión con la que tiraba (o le tiraban) desaparece de golpe
      const k = CARRIER.releaseKick / (mass * h);
      W.x -= this.heldTension.x * k; W.z -= this.heldTension.z * k;
    }
    this.heldTension = this.joint ? { ...this.forceExp } : null;
    let gain = CARRIER.shoveGain;
    if (this.joint) {
      gain = CARRIER.holdGain;
      // Tirando, la tensión que crece la genera él mismo: solo le sorprende que caiga de golpe
      // (el otro suelta, el sofá cede) y eso le echa hacia atrás.
      const fe = len2(this.forceExp);
      if (len2(this.wantVel) > 0.3 && fe > 1) {
        const ux = this.forceExp.x / fe, uz = this.forceExp.z / fe;
        const drop = Math.max(0, fe - (this.force.x * ux + this.force.z * uz));
        sx = -ux * drop; sz = -uz * drop;
      }
    }
    const sl = Math.hypot(sx, sz), keep = sl > CARRIER.deadZone ? (sl - CARRIER.deadZone) / sl : 0;
    sx *= keep; sz *= keep;
    // Péndulo invertido: la gravedad agranda la desviación; el control (tobillos o pasos) es limitado
    const umax = this.wobbling ? CARRIER.stepMax : CARRIER.ankleMax;
    let ux = -CARRIER.kp * D.x - CARRIER.kd * W.x, uz = -CARRIER.kp * D.z - CARRIER.kd * W.z;
    const u = Math.hypot(ux, uz);
    if (u > umax) { ux *= umax / u; uz *= umax / u; }
    const dist = (n: number) => Math.max(-25, Math.min(25, n));
    W.x += ((g / h) * D.x + dist((gain * sx) / (mass * h)) + ux) * dt;
    W.z += ((g / h) * D.z + dist((gain * sz) / (mass * h)) + uz) * dt;
    D.x += W.x * dt; D.z += W.z * dt;
    const l = len2(D);
    if (this.wobbling) {
      this.wobbleTime += dt;
      this.calmTime = l < CARRIER.regainBelow ? this.calmTime + dt : 0;
      if ((l > CARRIER.fallAt && this.wobbleTime > CARRIER.stumbleMin) || l > 1.1 || (this.wobbleTime > CARRIER.stumbleMaxTime && l > CARRIER.loseAt)) {
        this.fallDir = { x: D.x / l, z: D.z / l };
        this.knock = 'balance';
        this.stunned = CARRIER.fallTime;
        this.release();
        this.resetBalance();
        this.falls++;
        return 'fall';
      }
      if (this.calmTime > 0.25) { this.wobbling = false; return 'steady'; }
      return null;
    }
    if (l > CARRIER.loseAt) { this.wobbling = true; this.wobbleTime = 0; this.calmTime = 0; this.wobbles++; return 'wobble'; }
    return null;
  }
}

/** Giro horizontal del eje largo del sofá (rad), o null si está casi vertical. */
function flatYaw(sofa: RAPIER.RigidBody): number | null {
  const o = localToWorld(sofa, { x: 0, y: 0, z: 0 }), a = localToWorld(sofa, { x: 1, y: 0, z: 0 });
  const x = a.x - o.x, z = a.z - o.z;
  return Math.hypot(x, z) < 0.3 ? null : Math.atan2(z, x);
}
