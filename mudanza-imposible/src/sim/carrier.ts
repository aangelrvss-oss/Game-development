import type RAPIER from '@dimforge/rapier3d-compat';
import { HAND, hill, type HandOwner, type HandResult } from './hand';
import { worldToLocal, localToWorld, rotate } from './sofa';
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
  /** Altura de la mano libre (sobre el centro del porteador): también la de la sonda que busca qué agarrar. */
  handY: 0.22,
  /**
   * Alzado automático: al agarrar, cada mano sube sola hasta dejar el centro del objeto a esta altura sobre los
   * pies, con el objeto nivelado (la mano va a `carryCom` más la altura local del punto agarrado). Así todas las
   * manos piden lo mismo: no se pelean ni hacen rodar el objeto, agarren por un extremo, por un costado o arriba.
   */
  carryCom: 0.7,
  /** Límites de la mano agarrando (sobre el centro del porteador): de las caderas a los hombros. */
  handMin: -0.1,
  handMax: 0.7,
  grabReach: 1.05,
  /** Velocidad a la que la mano lleva el punto agarrado a su sitio y a la altura de carga (m/s). */
  handSpeed: 1.4,
  /**
   * Si la mano no da abasto (la exigencia supera su fuerza máxima) y el punto agarrado se separa de ella más que
   * esto durante `gripHold`, se suelta («¡Se escapa!»).
   */
  gripBreak: 0.55,
  gripHold: 0.3,
  stunTime: 1.8,
  /** Cambio brusco de velocidad que tumba a un porteador (atropello, golpe fuerte). */
  stunDv: 9,
  /**
   * Agarrando, no se aleja de su mano más que esto (m): las piernas siguen al punto agarrado y es la mano
   * (fuerza limitada, `HAND`) la que mueve el objeto. Así nadie arrastra algo pesado más deprisa de lo que puede.
   */
  leash: 0.15,
  /** Rapidez con la que recupera la distancia de la correa (1/s). */
  leashRate: 5,
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

/** Un cuerpo dinámico que se puede agarrar (el sofá o cualquier otro objeto) y sus piezas de choque. */
export interface Grabbable {
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
}

export class Carrier implements HandOwner {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  /** Cuerpo agarrado (cualquier cuerpo dinámico), o null. */
  heldBody: RAPIER.RigidBody | null = null;
  /** Punto agarrado, en coordenadas locales del cuerpo agarrado. */
  grabLocal: Vec3 | null = null;
  /** Dirección horizontal mano→agarre. Gira con el objeto agarrado (`followHeld`). */
  handDir = { x: 0, z: -1 };
  /** `handDir` en el momento de agarrar y el giro del objeto entonces (eje largo en horizontal, rad). */
  private grabDir = { x: 0, z: -1 };
  private grabYaw = 0;
  /** Mano actual (local al porteador). Se acerca poco a poco a su sitio y a la altura de carga (`handAnchor`). */
  anchorCur: Vec3 = { x: 0, y: CARRIER.handY, z: 0 };
  /** Fuerza que la mano hace sobre el objeto (N, mundo; al porteador le llega la opuesta). */
  handForce: Vec3 = { x: 0, y: 0, z: 0 };
  /** Esfuerzo de la mano (0..1, suavizado): fuerza horizontal respecto a la máxima, o separación si no da abasto. */
  strain = 0;
  /** Distancia entre la mano y el punto agarrado en el último paso (m). */
  handSep = 0;
  /** Tiempo que la mano lleva sin dar abasto y separada más de `gripBreak`. */
  private gripStrain = 0;
  /** Tiempo colgado del objeto (sin suelo y tirando de él hacia abajo con toda la fuerza de la mano). */
  private hangTime = 0;
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
  get holding(): boolean { return this.heldBody !== null; }

  /** Sitio de la mano agarrando, en el espacio local del porteador (sin rotación: la tiene bloqueada). */
  handAnchor(): Vec3 {
    const ly = this.grabLocal ? this.grabLocal.y : 0;
    const y = Math.max(CARRIER.handMin, Math.min(CARRIER.handMax, CARRIER.carryCom - CENTER_Y + ly));
    return { x: this.handDir.x * CARRIER.handForward, y, z: this.handDir.z * CARRIER.handForward };
  }

  /** Mano en el mundo: donde está agarrando (objetivo del muelle de la mano) o donde la lleva sin agarrar. */
  handWorld(): Vec3 {
    const p = this.pos;
    const a = this.holding ? this.anchorCur : { x: this.handDir.x * CARRIER.handForward, y: CARRIER.handY, z: this.handDir.z * CARRIER.handForward };
    return { x: p.x + a.x, y: p.y + a.y, z: p.z + a.z };
  }

  /** Punto agarrado en el mundo (se mueve con el objeto). */
  grabWorld(): Vec3 | null {
    return this.heldBody && this.grabLocal ? localToWorld(this.heldBody, this.grabLocal) : null;
  }

  /**
   * Punto agarrable más cercano a la mano entre varios objetos (o el punto preferido de uno: las asas de los
   * ayudantes). Devuelve null si nada queda al alcance.
   */
  findGrab(targets: Grabbable[], preferLocal?: Vec3): { body: RAPIER.RigidBody; point: Vec3 } | null {
    if (this.holding || this.stunned > 0) return null;
    const p = this.pos;
    let best = Infinity, found: { body: RAPIER.RigidBody; point: Vec3 } | null = null;
    const probe = { x: p.x + this.facing.x * 0.35, y: p.y + CARRIER.handY, z: p.z + this.facing.z * 0.35 };
    for (const t of targets) {
      if (preferLocal) {
        const w = localToWorld(t.body, preferLocal);
        const d = Math.hypot(w.x - probe.x, w.y - probe.y, w.z - probe.z);
        if (d < best) { best = d; found = { body: t.body, point: w }; }
        continue;
      }
      for (const c of t.colliders) {
        const proj = c.projectPoint(probe, true);
        if (!proj) continue;
        const d = Math.hypot(proj.point.x - probe.x, proj.point.y - probe.y, proj.point.z - probe.z);
        if (d < best) { best = d; found = { body: t.body, point: { x: proj.point.x, y: proj.point.y, z: proj.point.z } }; }
      }
    }
    if (!found) return null;
    const dist = Math.hypot(found.point.x - p.x, found.point.z - p.z);
    if (dist > CARRIER.grabReach + CARRIER.radius || Math.abs(found.point.y - p.y) > 1.3) return null;
    return found;
  }

  /** Agarra el punto `target` (mundo) del cuerpo `body`. La mano empieza ahí mismo: sin tirones. */
  grab(body: RAPIER.RigidBody, target: Vec3) {
    const p = this.pos;
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    this.heldBody = body;
    this.handDir = dist > 1e-3 ? { x: dx / dist, z: dz / dist } : { ...this.facing };
    this.grabDir = { ...this.handDir };
    this.grabYaw = flatYaw(body) ?? 0;
    this.grabLocal = worldToLocal(body, target);
    this.anchorCur = { x: dx, y: target.y - p.y, z: dz };
    this.handForce = { x: 0, y: 0, z: 0 };
    this.gripStrain = 0;
  }

  /** Busca el punto más cercano a la mano de un objeto (o su punto preferido) y, si está al alcance, lo agarra. */
  tryGrab(body: RAPIER.RigidBody, colliders: RAPIER.Collider[], preferLocal?: Vec3): boolean {
    return this.tryGrabAny([{ body, colliders }], preferLocal);
  }

  /** Igual que `tryGrab`, pero entre varios objetos agarrables: agarra el más cercano. */
  tryGrabAny(targets: Grabbable[], preferLocal?: Vec3): boolean {
    const f = this.findGrab(targets, preferLocal);
    if (!f) return false;
    this.grab(f.body, f.point);
    return true;
  }

  /**
   * La mano sigue al objeto cuando este gira: quien lo agarra se queda frente a su punto de agarre, como haría
   * una persona, en vez de dejar que el mueble gire alrededor de la mano y se le meta en el cuerpo.
   */
  private followHeld(body: RAPIER.RigidBody) {
    const yaw = flatYaw(body);
    if (yaw === null) return; // de pie o volcado: el eje no marca un giro horizontal fiable
    const d = yaw - this.grabYaw, c = Math.cos(d), s = Math.sin(d), g = this.grabDir;
    this.handDir = { x: g.x * c - g.z * s, z: g.x * s + g.z * c };
  }

  /**
   * Suelta. `calm`: sin el tirón de la tensión que sostenía (cuando el juego recoloca el objeto, al enderezarlo
   * o al reaparecer, nadie está tirando de verdad).
   */
  release(calm = false) {
    this.heldBody = null;
    this.grabLocal = null;
    this.handForce = { x: 0, y: 0, z: 0 };
    this.gripStrain = 0;
    this.hangTime = 0;
    this.handSep = 0;
    if (calm) this.heldTension = null;
  }

  /** ¿Toca el cuerpo `b` (contacto activo, no solo cerca)? */
  private touchingBody(b: RAPIER.RigidBody) {
    let touch = false;
    this.world.contactPairsWith(this.collider, (other) => {
      if (touch || other.parent()?.handle !== b.handle) return;
      this.world.contactPair(this.collider, other, (m) => { if (m.numContacts() > 0) touch = true; });
    });
    return touch;
  }

  /**
   * ¿Está tocando (contacto activo, no solo cerca) algún objeto movible, es decir, empujándolo con el cuerpo?
   * Lo que agarra y puede sostener solo (una caja) no cuenta: llevarlo abrazado contra el cuerpo no es empujarlo.
   */
  private touchingLoad(isLoad: (b: RAPIER.RigidBody) => boolean) {
    let touch = false;
    const held = this.heldBody, light = held !== null && held.mass() * 9.81 <= HAND.maxV;
    this.world.contactPairsWith(this.collider, (other) => {
      const b = other.parent();
      if (touch || !b || !isLoad(b) || (light && b.handle === held.handle)) return;
      this.world.contactPair(this.collider, other, (m) => { if (m.numContacts() > 0) touch = true; });
    });
    return touch;
  }

  /**
   * Aplica el control de movimiento y lleva la mano hacia su sitio. `isLoad` dice qué cuerpos son objetos
   * movibles (empujarlos con el cuerpo cuenta como cargar). La mano se resuelve después, con `solveHands`.
   */
  control(input: PlayerInput, dt: number, isLoad: (b: RAPIER.RigidBody) => boolean) {
    const v = this.body.linvel();
    let mx = input.mx, mz = input.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    if (this.stunned > 0) { mx = 0; mz = 0; }
    const speed = this.holding ? CARRIER.carrySpeed : CARRIER.walkSpeed;
    let tx = mx * speed, tz = mz * speed;
    // Suelo debajo
    const ray = new this.R.Ray(this.pos, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, CENTER_Y + 0.12, true, undefined, undefined, undefined, this.body);
    this.grounded = hit !== null;
    const mass = this.body.mass();
    let maxF = (this.grounded ? CARRIER.accel : CARRIER.airAccel) * mass * (this.stunned > 0 ? 0.15 : 1);
    if (this.grounded && this.stunned <= 0 && this.touchingLoad(isLoad)) {
      // Empujando un objeto con el cuerpo: la fuerza es la de una persona, como la de la mano (ley de Hill)
      const ts = Math.hypot(tx, tz);
      const along = ts > 0.05 ? (v.x * tx + v.z * tz) / ts : 0;
      maxF = HAND.maxH * hill(along / HAND.hillSpeed);
      // En pendiente sostiene sin resbalar su peso y lo que alza (el calzado agarra; la cápsula no tiene roce)
      const n = hit!.normal, nh = Math.hypot(n.x, n.z);
      if (nh > 0.05) {
        const push = ((mass * 9.81 + Math.max(0, this.handForce.y)) * nh) / Math.max(0.3, Math.abs(n.y));
        this.body.applyImpulse({ x: (-n.x / nh) * push * dt, y: 0, z: (-n.z / nh) * push * dt }, true);
      }
    }
    if (this.wobbling && this.stunned <= 0) {
      // Pasos apresurados hacia donde se cae: los pies intentan volver a ponerse debajo del cuerpo
      const d = this.lean, l = len2(d);
      if (l > 1e-4) {
        const sp = 1.2 + 3 * l;
        tx = tx * 0.3 + (d.x / l) * sp;
        tz = tz * 0.3 + (d.z / l) * sp;
        if (!this.holding) maxF = CARRIER.accel * 0.6 * mass;
      }
    }
    this.wantVel = { x: tx, z: tz };
    if (this.heldBody && this.grabLocal && this.stunned <= 0) {
      // Correa: no se aleja (ni se echa encima) de lo que agarra más deprisa que el propio punto agarrado, salvo
      // lo que da el brazo (`leash`). Si el objeto no avanza, el porteador tampoco: tira con todo desde ahí.
      const g = localToWorld(this.heldBody, this.grabLocal), h = this.handWorld();
      const sx = g.x - h.x, sz = g.z - h.z, d = Math.hypot(sx, sz);
      if (d > 1e-3) {
        const ux = sx / d, uz = sz / d;
        const vg = this.heldBody.velocityAtPoint(g);
        const min = vg.x * ux + vg.z * uz - CARRIER.leashRate * (CARRIER.leash - d);
        const cur = tx * ux + tz * uz;
        if (cur < min) { tx += (min - cur) * ux; tz += (min - cur) * uz; }
      }
    }
    let fx = ((tx - v.x) / dt) * mass, fz = ((tz - v.z) / dt) * mass;
    const f = Math.hypot(fx, fz);
    if (f > maxF) { fx *= maxF / f; fz *= maxF / f; }
    this.lastJ = { x: fx * dt, z: fz * dt };
    this.body.applyImpulse({ x: this.lastJ.x, y: 0, z: this.lastJ.z }, true);
    if (m > 0.15 && !this.holding && !this.wobbling) this.facing = { x: mx / Math.max(m, 1e-6), z: mz / Math.max(m, 1e-6) };
    if (this.heldBody) {
      // La mano sigue el giro del objeto y va sola a su sitio y a la altura de carga
      this.followHeld(this.heldBody);
      const t = this.handAnchor(), c = this.anchorCur;
      const g = this.grabWorld()!, p = this.pos, ox = g.x - p.x, oz = g.z - p.z, od = Math.hypot(ox, oz);
      if (od > CARRIER.handForward && this.touchingBody(this.heldBody)) {
        // Ya está pegado al objeto y no puede acercarse más: el brazo se estira hasta donde agarra, en vez de
        // tirar de él hacia el pecho sin fin (pasaba al agarrar por debajo o con el sofá inclinado)
        const l = Math.min(od, CARRIER.grabReach + CARRIER.radius);
        t.x = (ox / od) * l; t.z = (oz / od) * l;
      }
      const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
      const d = Math.hypot(dx, dy, dz), stepMax = CARRIER.handSpeed * dt;
      if (d > 1e-4) {
        const k = Math.min(1, stepMax / d);
        this.anchorCur = { x: c.x + dx * k, y: c.y + dy * k, z: c.z + dz * k };
      }
      this.facing = { ...this.handDir };
    }
  }

  /**
   * Resultado de la mano en este paso (de `solveHands`). Guarda la fuerza y el esfuerzo y decide si se suelta:
   * si la exigencia supera su fuerza máxima y el punto agarrado se le separa más que `gripBreak` durante
   * `gripHold`, o de golpe más del doble. Devuelve true si se ha soltado.
   */
  handResult(r: HandResult, dt: number): boolean {
    this.handForce = r.force;
    this.handSep = r.separation;
    const p = this.pos;
    // Si no puede con el peso, la mano no sigue subiendo sola: se queda con el objeto, tirando con todo
    const vmax = HAND.maxV / HAND.k, gy = r.grab.y - p.y;
    if (r.satV && r.force.y > 0) this.anchorCur.y = Math.min(this.anchorCur.y, gy + vmax);
    if (r.satV && r.force.y < 0) this.anchorCur.y = Math.max(this.anchorCur.y, gy - vmax);
    const pull = Math.hypot(r.force.x, r.force.z) / HAND.maxH;
    const goal = Math.min(1, Math.max(pull, (r.satH || r.satV) ? r.separation / CARRIER.gripBreak : 0));
    this.strain += (goal - this.strain) * Math.min(1, dt / 0.15);
    const over = (r.satH || r.satV) && r.separation > CARRIER.gripBreak;
    this.gripStrain = over ? this.gripStrain + dt : Math.max(0, this.gripStrain - dt);
    // Colgado (se ha caído por un borde agarrado): la mano no aguanta su propio peso
    const hanging = !this.grounded && r.satV && r.force.y < 0;
    this.hangTime = hanging ? this.hangTime + dt : 0;
    if (this.gripStrain > CARRIER.gripHold || this.hangTime > CARRIER.gripHold || r.separation > CARRIER.gripBreak * 2) {
      this.release();
      return true;
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
    if (this.holding && !this.heldTension) this.grabGrace = 0.5;
    this.grabGrace = Math.max(0, this.grabGrace - dt);
    const ka = this.grabGrace > 0 ? 1 : Math.min(1, dt / CARRIER.adapt);
    this.forceExp.x += (this.force.x - this.forceExp.x) * ka;
    this.forceExp.z += (this.force.z - this.forceExp.z) * ka;
    let sx = this.force.x - this.forceExp.x, sz = this.force.z - this.forceExp.z;
    const g = 9.81, h = CARRIER.comHeight, D = this.lean, W = this.leanVel;
    if (this.heldTension && !this.holding) {
      // Acaba de soltar: la tensión con la que tiraba (o le tiraban) desaparece de golpe
      const k = CARRIER.releaseKick / (mass * h);
      W.x -= this.heldTension.x * k; W.z -= this.heldTension.z * k;
    }
    this.heldTension = this.holding ? { ...this.forceExp } : null;
    let gain = CARRIER.shoveGain;
    if (this.holding) {
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

/** Giro horizontal de un cuerpo (rad): el de su eje x local, o el del z si el x está casi vertical. */
function flatYaw(body: RAPIER.RigidBody): number | null {
  const q = body.rotation();
  const ax = rotate(q, { x: 1, y: 0, z: 0 });
  if (Math.hypot(ax.x, ax.z) >= 0.3) return Math.atan2(ax.z, ax.x);
  const az = rotate(q, { x: 0, y: 0, z: 1 });
  // El eje z local va 90° por detrás del x en este giro: se corrige para que el ángulo sea continuo
  return Math.hypot(az.x, az.z) >= 0.3 ? Math.atan2(az.z, az.x) - Math.PI / 2 : null;
}


