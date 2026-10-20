import type RAPIER from '@dimforge/rapier3d-compat';
import { HAND, hill, type HandOwner, type HandResult } from './hand';
import { worldToLocal, localToWorld, rotate } from './sofa';
import type { PlayerInput, Vec3 } from './types';

type R = typeof RAPIER;

/**
 * Medidas del muñeco de los jugadores tal como está modelado (`view/doll/dollRig.ts`), medidas sobre sus mallas: radio
 * del tronco (el peto; la cabeza es de 0,332 y la gorra de 0,336–0,348) y altura de los pies al botón de la gorra.
 * `tests/coherence.test.ts` comprueba que siguen siendo ciertas.
 */
export const DOLL_MODEL = { trunkRadius: 0.359, height: 1.55 };

/**
 * Cuerpo físico del porteador: una cápsula con el volumen del muñeco que lo dibuja. Antes la cápsula era de
 * 0,32 × 1,30 m, el muñeco de 0,359 × 1,55 m, y la vista desplazaba el muñeco para esconder lo que se metía en el sofá.
 * Ahora coinciden:
 * - Ancho: se ajusta el muñeco a la cápsula, que conserva sus 0,32 m de radio. El muñeco se dibuja entero a escala
 *   `DOLL_SCALE` (0,89), con las mismas proporciones. Ensanchar la cápsula al muñeco empeoraba el juego, medido con
 *   el piloto y los ayudantes: con 0,36 m, uno a cada lado del sofá (0,9 m) ya no pasa con él por la puerta de 1,6 m
 *   (2 · 0,36 + 0,9 = 1,62) y con 6 ayudantes despistados se entregaban 3–4 partidas de 8 (antes 7); con 0,34 m, con
 *   4 ayudantes atentos había hasta 9 caídas por partida y recorridos de 84 s (con 0,32 m, como mucho 2 y 38–47 s).
 * - Alto: la cápsula mide lo que el muñeco escalado (1,38 m; la dirección artística pide unos 1,3 m), también tumbada:
 *   con 1,30 m, la gorra quedaría fuera de pie y la cabeza, tumbado. Efecto medido: el recorrido a dos con el piloto
 *   tarda 43,8 s (39,4 con 1,30 m), todo en la rampa; con 4 ayudantes atentos, 41,4 s de media en 24 semillas (39,9
 *   antes de este cambio) y las mismas caídas; con 6 despistados, apelotonados en la puerta, más caídas: 6,1 por
 *   partida (3,5 con 1,30 m y la misma caída física; 2,9 antes de este cambio).
 * Lo que sobresale del tronco y la cabeza (nariz, tirantes, visera) queda dentro del margen de 3 cm de las pruebas.
 * Brazos y manos no cuentan: tocar algo con ellas es agarrarlo.
 */
const RADIUS = 0.32;
/** Escala a la que se dibuja el muñeco: su tronco, con el radio de la cápsula. */
export const DOLL_SCALE = RADIUS / DOLL_MODEL.trunkRadius;
/** Altura del muñeco dibujado, de los pies a lo alto de la gorra (m): la de la cápsula. */
export const DOLL_HEIGHT = DOLL_MODEL.height * DOLL_SCALE;
const HALF_HEIGHT = DOLL_HEIGHT / 2 - RADIUS;
/** Altura del centro de la cápsula sobre los pies. */
export const CENTER_Y = HALF_HEIGHT + RADIUS;

export const CARRIER = {
  radius: RADIUS,
  halfHeight: HALF_HEIGHT,
  mass: 70,
  walkSpeed: 5.2,
  carrySpeed: 3.4,
  accel: 32,
  airAccel: 6,
  /** Distancia del centro a la mano que agarra: 10 cm por delante del cuerpo. */
  handForward: RADIUS + 0.1,
  /**
   * Altura de la mano libre (sobre el centro del porteador): también la de la sonda que busca qué agarrar. Las alturas
   * de la mano se dan desde los pies (0,87 m; agarrando, de 0,55 a 1,35 m) para que no dependan de la cápsula.
   */
  handY: 0.87 - CENTER_Y,
  /**
   * Alzado automático: al agarrar, cada mano sube sola hasta dejar el centro del objeto a esta altura sobre los
   * pies, con el objeto nivelado (la mano va a `carryCom` más la altura local del punto agarrado). Así todas las
   * manos piden lo mismo: no se pelean ni hacen rodar el objeto, agarren por un extremo, por un costado o arriba.
   */
  carryCom: 0.7,
  /** Límites de la mano agarrando (sobre el centro del porteador): de las caderas a los hombros. */
  handMin: 0.55 - CENTER_Y,
  handMax: 1.35 - CENTER_Y,
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
   * Salvo en un tira y afloja que pierde (`Carrier.control`): ahí las piernas aguantan y la mano se le escapa.
   */
  leash: 0.15,
  /** Rapidez con la que recupera la distancia de la correa (1/s). */
  leashRate: 5,
  /**
   * Tira y afloja: la correa cede si el punto agarrado se aleja de la mano a más de `tugAway` m/s y el jugador pide
   * alejarse de él (componente de su mando hacia fuera mayor que `tugBack`). Medido con el piloto y ayudantes
   * despistados (semillas 1–8): con 0,05 m/s y 0,3, con 4 se perdía una partida (22 caídas); con 0,25 m/s y 0,7,
   * con 6 había partidas de 143 s. Con 0,4 m/s y 0,7 se entregan todas al 100 % (con 6, 34–52 s; en el paso 4,
   * 33–39 s): el piloto, cuando cinco ayudantes se llevan el sofá a otro lado, ahora lo suelta en vez de dejarse llevar.
   */
  tugAway: 0.4,
  tugBack: 0.7,
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
  // Caída física: el collider se tumba de verdad (`Carrier.stepDown`)
  /** Tiempo que tarda en quedar tumbado (s). */
  fallSwing: 0.35,
  /** Lo que dura levantarse, al final del tiempo en el suelo (s). */
  riseTime: 0.6,
  /**
   * Solape tolerado al comprobar si una pose cabe (m): el mismo margen que la prueba de penetración. Tumbado en
   * llano, la cápsula toca el suelo; en la escalera (20°), se mete en ella 2,2 cm.
   */
  fitTol: 0.03,
  /** Si al levantarse no hay sitio, se aparta a rastras a esta velocidad (m/s) hacia un hueco cercano. */
  crawlSpeed: 0.8,
  /** Tras esperar esto sin sitio ni hueco al que apartarse (s), se levanta igualmente (lo empuja la física). */
  maxWaitRoom: 4,
};

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
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/**
 * Pose del collider (local al cuerpo) inclinado `a` rad hacia la dirección horizontal `d`. Gira alrededor del centro
 * de la esfera de abajo de la cápsula (a un radio sobre los pies), que no se mueve ni se hunde en el suelo.
 */
export function tiltPose(d: V2, a: number) {
  const h = Math.sin(a / 2), hh = CARRIER.halfHeight, s = Math.sin(a) * hh;
  return {
    // Giro alrededor del eje horizontal perpendicular a `d` (Y × d): el eje de la cápsula se va hacia `d`
    rot: { x: d.z * h, y: 0, z: -d.x * h, w: Math.cos(a / 2) },
    off: { x: d.x * s, y: (Math.cos(a) - 1) * hh, z: d.z * s },
  };
}

/** Direcciones de caída que se prueban, por orden de preferencia (giro respecto a la pedida, rad). */
const FALL_TRY = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.6, -2.6, Math.PI];

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
  /** En el último paso la mano no dio abasto en horizontal (la exigencia superó su fuerza). */
  private handSatH = false;
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
  /**
   * Dirección de la caída: la pedida (hacia donde perdió el equilibrio o le lanzó el golpe) y, al empezar a caer, la
   * elegida con consultas de forma (`planFall`), que es hacia donde se tumba de verdad el collider.
   */
  fallDir: V2 = { x: 0, z: 1 };
  /**
   * Caída física. `down` es la fase (null: de pie) y `tilt`, el ángulo del eje de la cápsula con la vertical (0 de pie,
   * unos π/2 tumbado), hacia `fallDir`. El collider se gira de verdad (`tiltPose`) y la vista dibuja el cuerpo con su
   * pose: lo que se ve tumbado es lo que choca.
   */
  down: 'falling' | 'lying' | 'rising' | null = null;
  tilt = 0;
  private tiltGoal = 0;
  private riseFrom = 0;
  private downTime = 0;
  /** Tiempo esperando sitio para levantarse, y hacia dónde se aparta a rastras mientras tanto (o null). */
  private waitRoom = 0;
  private crawl: V2 | null = null;
  /** Forma con la que se comprueba si una pose cabe: la cápsula, menos el solape tolerado (`fitTol`). */
  private probe: RAPIER.Capsule;
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
    this.probe = new R.Capsule(CARRIER.halfHeight, CARRIER.radius - CARRIER.fitTol);
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
    this.handSatH = false;
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
    // En el suelo sin sitio para levantarse: se aparta a rastras hacia un hueco (`stepDown`)
    if (this.crawl) { tx = this.crawl.x * CARRIER.crawlSpeed; tz = this.crawl.z * CARRIER.crawlSpeed; }
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
        const away = vg.x * ux + vg.z * uz;
        // Tira y afloja perdido: otros se llevan el objeto (el punto agarrado se aleja de la mano), él tira claramente
        // hacia el otro lado y la mano no da abasto. La correa no le hace andar hacia el objeto contra lo que pide: las
        // piernas aguantan, la mano se separa y, pasado `gripBreak` durante `gripHold`, se le escapa (`handResult`).
        // Sin esto le arrastraban pegado al objeto (5,6 m en 6 s, tres contra uno) y nunca se soltaba.
        const resist = this.handSatH && away > CARRIER.tugAway && mx * ux + mz * uz < -CARRIER.tugBack;
        const min = away - CARRIER.leashRate * (CARRIER.leash - d);
        const cur = tx * ux + tz * uz;
        if (!resist && cur < min) { tx += (min - cur) * ux; tz += (min - cur) * uz; }
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
    this.handSatH = r.satH;
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

  /**
   * Se cae (pierde el equilibrio o le derriban) hacia `dir` y pasa `time` s en el suelo: suelta lo que agarra y, en el
   * paso siguiente, `stepDown` tumba el collider hacia `dir` o, si no cabe, hacia el sitio libre más parecido.
   */
  knockDown(dir: V2, time: number, knock: 'car' | 'balance') {
    this.fallDir = { x: dir.x, z: dir.z };
    this.knock = knock;
    this.stunned = time;
    this.release();
    this.resetBalance();
  }

  /**
   * Caída física, antes de `world.step`: cuenta el tiempo en el suelo y mueve el collider. Al empezar elige hacia
   * dónde tumbarse (`planFall`) y se tumba en `fallSwing` s; al final se levanta en `riseTime` s, pero solo si cabe
   * de pie y en todo el giro. Si no cabe, sigue en el suelo y se aparta a rastras hacia el hueco más cercano.
   */
  stepDown(dt: number) {
    if (this.stunned <= 0 && !this.down) return;
    if (!this.down) this.planFall();
    if (this.down === 'falling') {
      this.downTime += dt;
      const u = Math.min(1, this.downTime / CARRIER.fallSwing);
      this.tilt = this.tiltGoal * u * u; // cae acelerando
      if (u >= 1) this.down = 'lying';
    }
    if (this.down !== 'rising') {
      // El tiempo en el suelo no baja de lo que dura levantarse hasta que empieza a levantarse
      this.stunned = Math.max(CARRIER.riseTime, this.stunned - dt);
      if (this.down === 'lying' && this.stunned <= CARRIER.riseTime) {
        if (this.roomToRise() || this.waitRoom > CARRIER.maxWaitRoom) {
          this.down = 'rising';
          this.riseFrom = this.tilt;
          this.crawl = null;
        } else {
          this.waitRoom += dt;
          this.crawl = this.findRoom();
        }
      }
    }
    if (this.down === 'rising') {
      this.stunned = Math.max(0, this.stunned - dt);
      this.tilt = this.riseFrom * smooth(this.stunned / CARRIER.riseTime);
      if (this.stunned <= 0) { this.down = null; this.tilt = 0; }
    }
    this.applyTilt();
  }

  /** Pone el collider en la pose de `tilt` hacia `fallDir` (con `tilt` 0, la cápsula de pie de siempre). */
  private applyTilt() {
    const { rot, off } = tiltPose(this.fallDir, this.tilt);
    this.collider.setRotationWrtParent(rot);
    this.collider.setTranslationWrtParent(off);
  }

  /**
   * Elige hacia dónde se tumba, con consultas de forma contra todo (sofá, paredes, otros porteadores, coches): la
   * dirección pedida si la cápsula cabe tumbada en ella y en todo el giro; si no, la libre más parecida. Si no cabe
   * tumbada en ninguna (acorralado), la que más deja inclinarse: queda recostado contra lo que tiene al lado.
   */
  private planFall() {
    const d0 = this.fallDir;
    let best: { d: V2; a: number; score: number } | null = null;
    for (const t of FALL_TRY) {
      const c = Math.cos(t), s = Math.sin(t);
      const d = { x: d0.x * c - d0.z * s, z: d0.x * s + d0.z * c };
      const goal = this.lieAngle(d);
      const a = this.freeTilt(d, goal ?? Math.PI / 2);
      if (goal !== null && a >= goal - 1e-6) { best = { d, a, score: Infinity }; break; }
      // Sin sitio para tumbarse del todo, o sobre un borde (quedaría colgando): vale menos
      const score = a - (goal === null ? 1 : 0);
      if (!best || score > best.score + 0.05) best = { d, a, score };
    }
    this.fallDir = best!.d;
    this.tiltGoal = best!.a;
    this.down = 'falling';
    this.downTime = 0;
    this.waitRoom = 0;
    this.crawl = null;
  }

  /** ¿Cabe la cápsula inclinada `a` rad hacia `d`, con el cuerpo en `at`, sin solaparse más de `fitTol` con nada? */
  private fits(d: V2, a: number, at: Vec3 = this.pos): boolean {
    const { rot, off } = tiltPose(d, a);
    let hit = false;
    const c = { x: at.x + off.x, y: at.y + off.y, z: at.z + off.z };
    this.world.intersectionsWithShape(c, rot, this.probe, () => { hit = true; return false; }, undefined, undefined, this.collider);
    return !hit;
  }

  /** Mayor inclinación hacia `d` (hasta `goal`) a la que llega sin chocar con nada en todo el giro (rad). */
  private freeTilt(d: V2, goal: number): number {
    const n = Math.max(2, Math.ceil(goal / 0.2));
    let free = 0;
    for (let i = 1; i <= n; i++) {
      const a = (goal * i) / n;
      if (!this.fits(d, a)) break;
      free = a;
    }
    return free;
  }

  /**
   * Inclinación con la que queda tumbado hacia `d`, apoyado en el suelo (en pendiente, con la cabeza más alta o más
   * baja que los pies), o null si ahí no hay suelo a su altura (un borde, un escalón hacia abajo).
   */
  private lieAngle(d: V2): number | null {
    const p = this.pos, hh = CARRIER.halfHeight, feet = p.y - CENTER_Y;
    // Suelo fijo bajo los pies y bajo la cabeza (puede caer en el aire: cuenta dónde quedará apoyado)
    const ground = (x: number, z: number) => {
      const hit = this.world.castRay(new this.R.Ray({ x, y: feet + 1, z }, { x: 0, y: -1, z: 0 }), 2.5, true, this.R.QueryFilterFlags.ONLY_FIXED);
      return hit ? feet + 1 - hit.timeOfImpact : null;
    };
    const g0 = ground(p.x, p.z), g1 = ground(p.x + d.x * 2 * hh, p.z + d.z * 2 * hh);
    if (g0 === null || g1 === null || g1 < g0 - 0.45) return null;
    // Las dos esferas de la cápsula, a un radio de su suelo
    const cos = (g1 - g0) / (2 * hh);
    return Math.acos(Math.max(-0.45, Math.min(0.6, cos)));
  }

  /** ¿Cabe de pie donde está, y en todo el giro desde el suelo? */
  private roomToRise() {
    for (const k of [0.7, 0.35, 0]) if (!this.fits(this.fallDir, this.tilt * k)) return false;
    return true;
  }

  /** Hueco más cercano (hasta 1,2 m) donde cabe de pie y hay suelo: hacia dónde apartarse a rastras, o null. */
  private findRoom(): V2 | null {
    const p = this.pos;
    const down = new this.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    for (const r of [0.4, 0.8, 1.2]) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, d = { x: Math.cos(a), z: Math.sin(a) };
      const at = { x: p.x + d.x * r, y: p.y, z: p.z + d.z * r };
      if (!this.fits(d, 0, at)) continue;
      down.origin = at;
      if (this.world.castRay(down, CENTER_Y + 0.3, true, this.R.QueryFilterFlags.ONLY_FIXED)) return d;
    }
    return null;
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
        this.knockDown({ x: D.x / l, z: D.z / l }, CARRIER.fallTime, 'balance');
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


