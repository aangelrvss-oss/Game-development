// Mano blanda: el agarre de cualquier cuerpo dinámico como un resorte-amortiguador con fuerza limitada.
//
// No es una articulación de Rapier: las articulaciones y motores de Rapier JS no limitan la fuerza, y una rótula
// sin límite convertía el agarre en una mordaza (uno solo alzaba y llevaba en el aire el sofá de 90 kg, y con
// cuatro el sofá volcaba solo). En cada paso, antes de `world.step`, se calcula el impulso que acerca el punto
// agarrado a la mano como lo haría un muelle de rigidez `k` con amortiguador `c`, se limita a lo que puede hacer
// una persona (fuerza horizontal y vertical máximas) y se aplica en el punto del objeto, con el opuesto en el
// porteador. El choque cuerpo-objeto sigue activo: lo resuelve Rapier como cualquier contacto.
//
// El muelle se integra de forma implícita (restricción blanda con la masa efectiva del punto, como el «mouse
// joint» de Box2D): es estable con cualquier masa, de una caja de 10 kg a un piano de 250 kg, y con varias manos
// sobre el mismo objeto se reparte en unas pocas iteraciones con el impulso acumulado limitado.
//
// La fuerza horizontal baja con la velocidad a la que el objeto ya avanza en el sentido del tirón (ley de Hill,
// como un músculo): una caja ligera se lleva casi a la velocidad de carga, y algo que roza mucho a rastras (el
// sofá con un solo porteador) avanza despacio. También depende de la dirección respecto a hacia dónde mira quien
// agarra (`HAND.lateral`): de lado, con los brazos, se tira con menos fuerza que hacia atrás o empujando de frente.
// Sin eso, uno solo tirando de lado hacía pivotar el sofá sobre el extremo apoyado y lo movía más deprisa que a lo
// largo (el centro, 1,63–1,76 m en 3 s a 90–120°; ver `scripts/grip-measure.ts`). El porteador no se aleja de su
// mano (`Carrier.control`).
import type RAPIER from '@dimforge/rapier3d-compat';
import { localToWorld } from './sofa';
import type { Vec3 } from './types';

export const HAND = {
  /** Rigidez del brazo (N/m): con media carga del sofá (unos 440 N) la mano cede unos 7 cm. */
  k: 6000,
  /** Amortiguación del brazo (N·s/m). */
  c: 900,
  /**
   * Fuerza horizontal máxima por persona (N): tirar o empujar con el objeto parado (o frenándolo). Algo más que
   * el roce del sofá a rastras con un extremo en alto, y bastante menos que el del sofá entero en el suelo.
   */
  maxH: 300,
  /** Fuerza vertical máxima por persona (N): sostener o alzar. Media carga del sofá sí; el sofá entero, no. */
  maxV: 600,
  /** Curvatura de la ley de Hill (a/F0): cuanto menor, antes cae la fuerza al ganar velocidad. */
  hillK: 0.25,
  /** Velocidad del objeto en el sentido del tirón a la que la mano ya no puede acelerarlo (m/s). */
  hillSpeed: 3.6,
  /** Fracción de `hillSpeed` a partir de la cual la curva de Hill sigue en línea recta hasta cero. */
  hillKnee: 0.3,
  /** Iteraciones del reparto entre varias manos sobre el mismo objeto. */
  iterations: 4,
  /**
   * Fuerza horizontal de lado, como fracción de `maxH`: tirar hacia atrás (echando el peso del cuerpo) o empujar de
   * frente rinde más que tirar de lado con los brazos. Lo que puede la mano forma una elipse alrededor de hacia
   * dónde mira el porteador: `maxH` de frente y de espaldas, `lateral`·`maxH` de lado.
   */
  lateral: 0.45,
};

type M3 = number[]; // 3×3 por filas

/**
 * Ley de Hill: fracción de la fuerza máxima que se puede hacer cuando lo empujado ya avanza a `x` veces
 * `hillSpeed` en el sentido del empuje (1 parado o frenando, 0 a `hillSpeed`). Por encima de `hillKnee` baja en
 * línea recta: a paso de carga aún se puede mantener la marcha de lo que va en el aire.
 */
export function hill(x: number) {
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  const k = HAND.hillK, h = (u: number) => ((1 - u) * k) / (k + u);
  return x <= HAND.hillKnee ? h(x) : (h(HAND.hillKnee) * (1 - x)) / (1 - HAND.hillKnee);
}

/** Lo que una mano necesita saber del porteador que la mueve. */
export interface HandOwner {
  readonly body: RAPIER.RigidBody;
  /** Cuerpo agarrado y punto agarrado en coordenadas locales de ese cuerpo. */
  heldBody: RAPIER.RigidBody | null;
  grabLocal: Vec3 | null;
  /** Mano (objetivo del muelle) en el mundo. */
  handWorld(): Vec3;
  /** Hacia dónde mira, en horizontal (unitario): agarrando, hacia lo que agarra. */
  readonly facing: { x: number; z: number };
}

/** Resultado de la mano en un paso, para el porteador (aviso, esfuerzo, soltar). */
export interface HandResult {
  /** Fuerza media aplicada al objeto en este paso (N, mundo). Al porteador le llega la opuesta. */
  force: Vec3;
  /** La exigencia ha superado el límite horizontal o vertical (el impulso se ha recortado). */
  satH: boolean;
  satV: boolean;
  /** Distancia entre la mano y el punto agarrado al empezar el paso (m). */
  separation: number;
  /** Punto agarrado (mundo) al empezar el paso. */
  grab: Vec3;
}

const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Inversa del tensor de inercia en el mundo (simétrica), como matriz por filas. */
function invInertia(b: RAPIER.RigidBody): M3 {
  const m = b.effectiveWorldInvInertia();
  return [m.m11, m.m12, m.m13, m.m12, m.m22, m.m23, m.m13, m.m23, m.m33];
}

const mulV = (m: M3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});

/** Aporta a K (masa efectiva inversa del punto) la de un cuerpo: (1/m)·I + [r]×ᵀ·I⁻¹·[r]×. */
function addPointMass(K: M3, b: RAPIER.RigidBody, r: Vec3) {
  const im = b.invMass(), Ii = invInertia(b);
  const basis: Vec3[] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
  for (let j = 0; j < 3; j++) {
    // Un impulso e_j en el punto cambia su velocidad en (1/m)·e_j + (I⁻¹·(r × e_j)) × r
    const col = cross(mulV(Ii, cross(r, basis[j])), r);
    K[0 + j] += col.x; K[3 + j] += col.y; K[6 + j] += col.z;
    K[j * 4] += im;
  }
}

function inverse(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const k = Math.abs(det) > 1e-12 ? 1 / det : 0;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

/** Una mano agarrando durante un paso: la fila de la restricción blanda. */
class HandRow {
  private body: RAPIER.RigidBody;
  private grab: Vec3;
  private hand: Vec3;
  private mass: M3;
  private bias: Vec3;
  private gamma: number;
  private acc: Vec3 = { x: 0, y: 0, z: 0 };
  /** Velocidad horizontal del punto agarrado al empezar el paso (para la ley de Hill). */
  private vGrab: { x: number; z: number };
  satH = false;
  satV = false;
  readonly separation: number;

  constructor(readonly owner: HandOwner, private dt: number) {
    const body = owner.heldBody!;
    this.body = body;
    this.grab = localToWorld(body, owner.grabLocal!);
    this.hand = owner.handWorld();
    const C = { x: this.grab.x - this.hand.x, y: this.grab.y - this.hand.y, z: this.grab.z - this.hand.z };
    this.separation = Math.hypot(C.x, C.y, C.z);
    const com = body.worldCom(), oc = owner.body.worldCom();
    const K: M3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    addPointMass(K, body, { x: this.grab.x - com.x, y: this.grab.y - com.y, z: this.grab.z - com.z });
    addPointMass(K, owner.body, { x: this.hand.x - oc.x, y: this.hand.y - oc.y, z: this.hand.z - oc.z });
    // Muelle-amortiguador implícito: γ ablanda la restricción y β/dt corrige la posición
    const h = dt, kc = HAND.c + h * HAND.k;
    this.gamma = 1 / (h * kc);
    const beta = HAND.k / kc;
    K[0] += this.gamma; K[4] += this.gamma; K[8] += this.gamma;
    this.mass = inverse(K);
    this.bias = { x: C.x * beta, y: C.y * beta, z: C.z * beta };
    const vg = body.velocityAtPoint(this.grab);
    this.vGrab = { x: vg.x, z: vg.z };
  }

  solve() {
    const b = this.body, o = this.owner.body;
    const vb = b.velocityAtPoint(this.grab), vo = o.linvel();
    const g = this.gamma, a = this.acc;
    const rhs = {
      x: -(vb.x - vo.x + this.bias.x + g * a.x),
      y: -(vb.y - vo.y + this.bias.y + g * a.y),
      z: -(vb.z - vo.z + this.bias.z + g * a.z),
    };
    const d = mulV(this.mass, rhs);
    // Impulso acumulado limitado a lo que puede una persona en este paso; en horizontal, según lo deprisa que el
    // objeto ya avanza en el sentido del empuje (ley de Hill)
    let nx = a.x + d.x, ny = a.y + d.y, nz = a.z + d.z;
    const hz = Math.hypot(nx, nz);
    const along = hz > 1e-9 ? (this.vGrab.x * nx + this.vGrab.z * nz) / hz : 0;
    // Elipse de fuerza: de frente o de espaldas, `maxH`; de lado, `lateral`·`maxH`
    const f = this.owner.facing, fwd = hz > 1e-9 ? (f.x * nx + f.z * nz) / hz : 1, side = Math.sqrt(Math.max(0, 1 - fwd * fwd));
    const reach = 1 / Math.hypot(fwd, side / HAND.lateral);
    const maxH = HAND.maxH * reach * hill(along / HAND.hillSpeed) * this.dt, maxV = HAND.maxV * this.dt;
    this.satH = hz > maxH;
    if (this.satH) { nx *= maxH / hz; nz *= maxH / hz; }
    this.satV = Math.abs(ny) > maxV;
    if (this.satV) ny = Math.sign(ny) * maxV;
    const j = { x: nx - a.x, y: ny - a.y, z: nz - a.z };
    this.acc = { x: nx, y: ny, z: nz };
    if (j.x === 0 && j.y === 0 && j.z === 0) return;
    b.applyImpulseAtPoint(j, this.grab, true);
    o.applyImpulseAtPoint({ x: -j.x, y: -j.y, z: -j.z }, this.hand, true);
  }

  result(): HandResult {
    const k = 1 / this.dt;
    return { force: { x: this.acc.x * k, y: this.acc.y * k, z: this.acc.z * k }, satH: this.satH, satV: this.satV, separation: this.separation, grab: this.grab };
  }
}

/**
 * Resuelve todas las manos que agarran algo en este paso (antes de `world.step`). Devuelve el resultado de cada
 * mano en el mismo orden que `owners` (null si no agarra).
 */
export function solveHands(owners: HandOwner[], dt: number): (HandResult | null)[] {
  const rows = owners.map((o) => (o.heldBody && o.grabLocal ? new HandRow(o, dt) : null));
  const live = rows.filter((r): r is HandRow => r !== null);
  for (let it = 0; it < HAND.iterations; it++) for (const r of live) r.solve();
  return rows.map((r) => (r ? r.result() : null));
}
