// Catálogo de objetos de la mudanza: solo datos, sin Three.js. Una sola física para todos: la mano blanda
// (`hand.ts`) y las piernas (`CARRIER`) son las mismas con cualquier objeto. Lo que diferencia un piano de una caja
// son estos datos: masa, forma, rozamiento y asas. Ningún objeto lleva código de agarre propio.
//
// Convenciones de la forma (coordenadas locales): x a lo largo, y hacia arriba, z de fondo. El origen local es el
// punto que el alzado automático lleva a `CARRIER.carryCom` sobre los pies (la mano va a esa altura más la altura
// local del punto agarrado): dónde queda la forma respecto al origen decide a qué altura se lleva el objeto. Por
// eso los objetos altos (nevera, lámpara) tienen la forma por encima del origen y la base a menos de 0,6 m de él.
//
// Clases de peso (`minCarriers`): una persona sostiene `HAND.maxV` (600 N). Lo que pesa más necesita más manos, y
// las asas tienen que repartir la carga: con las `minCarriers` primeras asas, ninguna mano pasa de `HAND.maxV`. Las
// masas y las asas están ajustadas con `scripts/item-measure.ts` (mediciones en el commit que las introduce).
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Grabbable } from './carrier';
import { yawQuat } from './sofa';
import type { Vec3 } from './types';

type R = typeof RAPIER;

/** Una pieza de la forma: caja (con o sin borde redondeado) en coordenadas locales. */
export interface ItemBox {
  /** Centro de la caja (local). */
  p: Vec3;
  /** Semiextensiones, con el redondeo incluido. */
  h: Vec3;
  /** Radio del borde redondeado (sin él, cantos vivos). */
  round?: number;
}

/**
 * Asa: punto local en la superficie y dirección hacia fuera (hacia donde se pone quien agarra). Van en orden de
 * preferencia: los ayudantes y las pruebas ocupan primero las primeras.
 */
export interface ItemHandle {
  p: Vec3;
  out: Vec3;
}

/** Fragilidad: golpe mínimo que lo daña y daño por cada m/s por encima (la integridad va de 100 a 0). */
export interface Fragility {
  /** Cambio brusco de velocidad (m/s) a partir del cual el golpe daña. */
  impactDv: number;
  /** Puntos de integridad que pierde por cada m/s por encima de `impactDv`. */
  damage: number;
}

export type ItemId = 'caja' | 'silla' | 'lampara' | 'mesa' | 'sofa' | 'nevera' | 'piano';

export interface ItemDef {
  id: ItemId;
  /** Nombre en español, para la interfaz. */
  name: string;
  /** Masa real del cuerpo (kg): la que da `createItem`. */
  mass: number;
  /** Rozamiento de sus piezas (se promedia con el del suelo). */
  friction: number;
  shape: ItemBox[];
  /** Asas; su número es el máximo de manos que lo agarran a la vez. */
  handles: ItemHandle[];
  /** Cuántas personas hacen falta para llevarlo en el aire. */
  minCarriers: number;
  /** Golpe que lo daña y cuánto, o null si los golpes no lo dañan. */
  fragility: Fragility | null;
  /** Clave de dibujo: la vista elige el modelo con ella. */
  draw: string;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * Volumen de una caja tal como la pesa Rapier: una caja redondeada, solo por su caja interior (sin el borde). Con él
 * se reparte la masa, para que el cuerpo pese lo que dice `ItemDef.mass`.
 */
export function boxVolume(b: ItemBox): number {
  const r = b.round ?? 0;
  return 8 * (b.h.x - r) * (b.h.y - r) * (b.h.z - r);
}

const SOFA_SHAPE: ItemBox[] = [
  { p: v(0, 0, 0), h: v(1.1, 0.2, 0.45), round: 0.05 },
  { p: v(0, 0.42, -0.36), h: v(1.1, 0.24, 0.09) },
  { p: v(0.99, 0.33, 0), h: v(0.11, 0.15, 0.45) },
  { p: v(-0.99, 0.33, 0), h: v(0.11, 0.15, 0.45) },
];

/**
 * Masa real del sofá de siempre: 66,46 kg. `createSofa` reparte `SOFA.mass` (90 kg) en el volumen envolvente de sus
 * cajas, pero Rapier pesa la caja redondeada del asiento solo por su caja interior, así que el cuerpo nunca ha pesado
 * 90 kg. Toda la física del ciclo 1 (`HAND`, las pruebas T-grip) está medida con esta masa, y el sofá del catálogo la
 * conserva: misma densidad que `createSofa`, los mismos colliders.
 */
const SOFA_MASS = (90 * SOFA_SHAPE.reduce((s, b) => s + boxVolume(b), 0)) / SOFA_SHAPE.reduce((s, b) => s + 8 * b.h.x * b.h.y * b.h.z, 0);

/**
 * Sofá: reproduce exactamente `SOFA` y `SLOTS` de `sofa.ts` (forma, masa real, rozamiento y asas). Lo comprueba
 * `tests/items.test.ts`, que además compara los colliders de `createItem` con los de `createSofa`.
 */
const SOFA_DEF: ItemDef = {
  id: 'sofa',
  name: 'Sofá',
  mass: SOFA_MASS,
  friction: 1.0,
  shape: SOFA_SHAPE,
  handles: [
    { p: v(1.1, 0.05, 0), out: v(1, 0, 0) },
    { p: v(-1.1, 0.05, 0), out: v(-1, 0, 0) },
    { p: v(0.55, 0.05, 0.45), out: v(0, 0, 1) },
    { p: v(-0.55, 0.05, -0.45), out: v(0, 0, -1) },
    { p: v(-0.55, 0.05, 0.45), out: v(0, 0, 1) },
    { p: v(0.55, 0.05, -0.45), out: v(0, 0, -1) },
  ],
  minCarriers: 2,
  // El golpe de siempre del sofá (antes `RULES.impactDv` e `impactDamage`)
  fragility: { impactDv: 3.2, damage: 5 },
  draw: 'sofa',
};

/** Caja de cartón con asideros en los extremos. Ligera: una persona sola. Los golpes no la dañan. */
const CAJA: ItemDef = {
  id: 'caja',
  name: 'Caja',
  mass: 12,
  friction: 0.6,
  shape: [{ p: v(0, 0, 0), h: v(0.25, 0.25, 0.24), round: 0.04 }],
  // Asideros arriba de cada extremo. Una mano sola la lleva colgada de un extremo y algo ladeada: con 0,6 m de largo y
  // el asidero a 0,1–0,2 m del centro, la esquina de abajo bajaba a 0,02–0,08 m del suelo al echar a andar; así, 0,15 m
  handles: [
    { p: v(-0.25, 0.22, 0), out: v(-1, 0, 0) },
    { p: v(0.25, 0.22, 0), out: v(1, 0, 0) },
  ],
  minCarriers: 1,
  fragility: null,
  draw: 'caja',
};

/** Silla de madera: asiento, respaldo y cuatro patas. Se agarra por lo alto del respaldo o por el asiento. */
const SILLA: ItemDef = {
  id: 'silla',
  name: 'Silla',
  mass: 6,
  friction: 0.5,
  shape: [
    { p: v(0, 0, 0), h: v(0.23, 0.03, 0.23), round: 0.01 },
    { p: v(0, 0.25, -0.2), h: v(0.23, 0.22, 0.03), round: 0.01 },
    { p: v(0.19, -0.23, 0.19), h: v(0.03, 0.2, 0.03) },
    { p: v(-0.19, -0.23, 0.19), h: v(0.03, 0.2, 0.03) },
    { p: v(0.19, -0.23, -0.19), h: v(0.03, 0.2, 0.03) },
    { p: v(-0.19, -0.23, -0.19), h: v(0.03, 0.2, 0.03) },
  ],
  handles: [
    { p: v(0, 0.47, -0.23), out: v(0, 0, -1) },
    { p: v(0, 0, 0.23), out: v(0, 0, 1) },
  ],
  minCarriers: 1,
  fragility: { impactDv: 4, damage: 6 },
  draw: 'silla',
};

/**
 * Lámpara de pie, frágil: base, pie fino y pantalla. Una sola mano, en el pie. Llevada, la base va a 0,13–0,2 m del
 * suelo. Golpes medidos (`scripts/item-measure.ts`):
 * - soltarla quieto: cae de pie sobre la base, 1,9–2,2 m/s;
 * - que se caiga desde la altura de carga (tumbada, con el centro de masas donde va al llevarla): 2,8 m/s; soltarla
 *   andando a paso de carga: 3,0–3,1 m/s; que la arrolle alguien corriendo: 3,9 m/s.
 * El umbral va entre los dos grupos, y el daño es tan alto que 0,25 m/s por encima la rompe entera. Una lámpara más
 * alta (1,3–1,4 m) caería más fuerte, pero a veces volcaba al soltarla quieto.
 */
const LAMPARA: ItemDef = {
  id: 'lampara',
  name: 'Lámpara de pie',
  mass: 6,
  friction: 0.6,
  shape: [
    { p: v(0, -0.44, 0), h: v(0.18, 0.04, 0.18), round: 0.01 },
    { p: v(0, 0.01, 0), h: v(0.025, 0.41, 0.025) },
    { p: v(0, 0.53, 0), h: v(0.17, 0.11, 0.17), round: 0.02 },
  ],
  handles: [{ p: v(0.025, 0.32, 0), out: v(1, 0, 0) }],
  minCarriers: 1,
  fragility: { impactDv: 2.45, damage: 400 },
  draw: 'lampara',
};

/** Mesa de comedor: tablero y cuatro patas. Pesa más de lo que sostiene una persona: hacen falta dos. */
const MESA: ItemDef = {
  id: 'mesa',
  name: 'Mesa',
  mass: 65,
  friction: 0.6,
  shape: [
    { p: v(0, 0.22, 0), h: v(0.7, 0.03, 0.4), round: 0.015 },
    { p: v(0.62, -0.13, 0.32), h: v(0.04, 0.32, 0.04) },
    { p: v(-0.62, -0.13, 0.32), h: v(0.04, 0.32, 0.04) },
    { p: v(0.62, -0.13, -0.32), h: v(0.04, 0.32, 0.04) },
    { p: v(-0.62, -0.13, -0.32), h: v(0.04, 0.32, 0.04) },
  ],
  handles: [
    { p: v(-0.7, 0.22, 0), out: v(-1, 0, 0) },
    { p: v(0.7, 0.22, 0), out: v(1, 0, 0) },
    { p: v(0, 0.22, 0.4), out: v(0, 0, 1) },
    { p: v(0, 0.22, -0.4), out: v(0, 0, -1) },
  ],
  minCarriers: 2,
  fragility: { impactDv: 3.5, damage: 4 },
  draw: 'mesa',
};

/** Nevera de pie, de metal esmaltado: tan alta como un porteador. Se agarra por los costados, por encima de su centro. */
const NEVERA: ItemDef = {
  id: 'nevera',
  name: 'Nevera',
  mass: 80,
  friction: 0.5,
  shape: [{ p: v(0, 0.22, 0), h: v(0.35, 0.65, 0.33), round: 0.04 }],
  handles: [
    { p: v(-0.35, 0.35, 0), out: v(-1, 0, 0) },
    { p: v(0.35, 0.35, 0), out: v(1, 0, 0) },
    { p: v(0, 0.35, -0.33), out: v(0, 0, -1) },
    { p: v(0, 0.35, 0.33), out: v(0, 0, 1) },
  ],
  minCarriers: 2,
  fragility: { impactDv: 3, damage: 6 },
  draw: 'nevera',
};

/**
 * Piano de pared: caja con el teclado saliente por delante (+z). Hacen falta tres:
 * - dos no pueden con su peso (1275 N, más que 2 · `HAND.maxV`), como mucho lo arrastran;
 * - las tres primeras asas forman un triángulo con el centro de masas en medio, así que cargan lo mismo (425 N cada
 *   una en reposo). Con 150 kg, al echar a andar una mano llegaba a su límite y la base bajaba a 0,06 m; con 135 kg,
 *   a 0,11 m;
 * - la cuarta asa va en medio de la trasera. Con las tres primeras a partes iguales, cualquier cuarta asa que no esté
 *   sobre el centro de masas carga algo más a una de las otras en reposo (con muelles iguales, 0,37–0,40 del peso en
 *   un costado; aquí, 0,37), pero al andar el tirón se reparte entre cuatro: entre cuatro va más lejos (5,3 m frente a
 *   4,8 en 3 s) y más alto (base a 0,23 m como mínimo, frente a 0,17). Con la cuarta en el extremo derecho iba más
 *   lejos (6,3 m), pero más bajo agarrando en las asas (0,13 m).
 */
const PIANO: ItemDef = {
  id: 'piano',
  name: 'Piano',
  mass: 130,
  friction: 0.6,
  shape: [
    { p: v(0, 0.1, 0), h: v(0.75, 0.45, 0.28), round: 0.04 },
    { p: v(0, 0.05, 0.4), h: v(0.7, 0.05, 0.12), round: 0.02 },
  ],
  handles: [
    { p: v(-0.75, 0.2, 0.05), out: v(-1, 0, 0) },
    { p: v(0.375, 0.2, -0.28), out: v(0, 0, -1) },
    { p: v(0.375, 0.3, 0.28), out: v(0, 0, 1) },
    { p: v(0, 0.2, -0.28), out: v(0, 0, -1) },
  ],
  minCarriers: 3,
  fragility: { impactDv: 2.8, damage: 8 },
  draw: 'piano',
};

/** Estado de un objeto en la partida: nadie lo lleva, alguien lo lleva o roto. */
export type ItemState = 'pending' | 'carried' | 'broken';

/** Un objeto en la partida: su cuerpo, su definición, su integridad y su estado. */
export interface Item extends Grabbable {
  /** Posición en `Game.items` (la llevan los sucesos). */
  readonly index: number;
  readonly def: ItemDef;
  /** Obligatorio: si se rompe, se pierde la partida. Uno opcional roto solo cuenta como daño. */
  required: boolean;
  /** Integridad (100 entero, 0 roto). */
  integrity: number;
  state: ItemState;
  /** Velocidad en el paso anterior y espera entre golpes (para medir los golpes). */
  prevVel: Vec3;
  impactCooldown: number;
  /** Último atropello (tiempo de reloj): un atropello toca varias piezas a la vez y cuenta una sola vez por segundo. */
  lastCarHit: number;
}

/** Catálogo completo, por identificador. */
export const ITEMS: Record<ItemId, ItemDef> = {
  caja: CAJA,
  silla: SILLA,
  lampara: LAMPARA,
  mesa: MESA,
  sofa: SOFA_DEF,
  nevera: NEVERA,
  piano: PIANO,
};

/** Altura del origen sobre el suelo con el objeto de pie y apoyado (menos el punto más bajo de su forma). */
export function restHeight(def: ItemDef): number {
  return -Math.min(...def.shape.map((b) => b.p.y - b.h.y));
}

/**
 * Crea el cuerpo de un objeto del catálogo: un cuerpo dinámico con una pieza de choque por caja de la forma, con la
 * densidad que da la masa del objeto (`boxVolume`). Generaliza `createSofa` (mismos parámetros del cuerpo y de las
 * piezas).
 */
export function createItem(R: R, world: RAPIER.World, def: ItemDef, pos: Vec3, yaw: number) {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(yawQuat(yaw))
      .setLinearDamping(0.4)
      .setAngularDamping(1.6)
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(4),
  );
  const density = def.mass / def.shape.reduce((s, b) => s + boxVolume(b), 0);
  const colliders: RAPIER.Collider[] = [];
  for (const b of def.shape) {
    const r = b.round ?? 0;
    const d = r > 0 ? R.ColliderDesc.roundCuboid(b.h.x - r, b.h.y - r, b.h.z - r, r) : R.ColliderDesc.cuboid(b.h.x, b.h.y, b.h.z);
    if (b.p.x !== 0 || b.p.y !== 0 || b.p.z !== 0) d.setTranslation(b.p.x, b.p.y, b.p.z);
    colliders.push(world.createCollider(d.setDensity(density).setFriction(def.friction).setRestitution(0.05), body));
  }
  for (const c of colliders) c.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
  return { body, colliders };
}
