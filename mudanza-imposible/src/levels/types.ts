// Niveles descritos como datos (`LevelDef`). La simulación (`Game`), la vista y el piloto automático reciben un
// `LevelDef` y no conocen ningún recorrido concreto: lo que distingue un nivel de otro está en estos datos.
// Solo datos y tipos, sin Three.js ni Rapier (se usan en Node para las pruebas).
//
// Ejes: x hacia la derecha (este), y arriba, z hacia la cámara (sur). Unidades en metros.
import type { ItemId } from '../sim/items';
import type { Lane } from '../sim/traffic';
import type { Vec3 } from '../sim/types';

/** Tipo de una caja del escenario: decide cómo se dibuja y, si choca, su rozamiento. */
export type Kind =
  | 'ground' | 'grass' | 'sidewalk' | 'road' | 'stripe' | 'crosswalk'
  | 'wall' | 'facade' | 'block' | 'roof' | 'floor' | 'stairs' | 'ramp' | 'fence' | 'hedge'
  | 'house' | 'invisible'
  /** Choque de un objeto de decoración (lo dibuja `decor.ts` a partir de `LevelDef.props`). */
  | 'prop'
  /**
   * Camión de mudanzas (`truckBoxes` en `truck.ts`, a partir de `LevelDef.truck`): suelo, paredes y techo de la caja
   * de carga, rampa de carga, bajos y cabina. Cada uno es una pieza de choque aparte.
   */
  | 'truckFloor' | 'truckWall' | 'truckRoof' | 'truckRamp' | 'truckBase' | 'truckCab';

export interface Box {
  /** Centro. */
  p: [number, number, number];
  /** Semiextensiones. */
  h: [number, number, number];
  /** Rotación sobre el eje x en radianes (escaleras y rampas que suben/bajan en z). */
  rx?: number;
  /** Rotación sobre el eje z en radianes (rampas que bajan en x). */
  rz?: number;
  kind: Kind;
  /** Tiene colisión. */
  solid: boolean;
  /** Se recorta o se oculta si tapa la acción (corte de maqueta). */
  fade?: boolean;
}

/** Región del espacio: caja alineada con los ejes. Un límite que falta no limita; los límites son estrictos. */
export interface Region {
  min?: Partial<Vec3>;
  max?: Partial<Vec3>;
}

/** Punto de paso del piloto automático (centro del objeto que lleva) y orientación deseada de su eje largo. */
export interface Waypoint {
  x: number;
  z: number;
  y?: number;
  yaw: number | null;
  label: string;
  /** Espera aquí al verde de peatones. */
  waitLight?: boolean;
  /** Tolerancia del giro para dar el punto por alcanzado (rad). */
  tol?: number;
  /** Último punto: al llegar, el equipo suelta el objeto (queda dentro del camión). */
  release?: boolean;
}

/** Etapa del recorrido: la ve la interfaz y marca dónde reaparece el objeto principal si se cae del mapa. */
export interface StageDef {
  label: string;
  /** Se alcanza cuando el centro del objeto principal entra en esta región (null: la de salida, desde el principio). */
  when: Region | null;
  /** Siguiente objetivo mientras esta es la etapa actual (aro amarillo en el suelo), o nada. */
  next?: Vec3;
  /** Punto de reaparición del objeto principal si se cae fuera del mapa estando en esta etapa. */
  respawn: { p: Vec3; yaw: number };
}

/** Un objeto del catálogo colocado en el nivel. */
export interface ItemPlacement {
  id: ItemId;
  /** Posición del origen del objeto; sin `y`, apoyado en el suelo (`restHeight`). */
  pos: { x: number; y?: number; z: number };
  yaw: number;
  /** Obligatorio: hay que cargarlo para ganar y, si se rompe, se pierde. */
  required: boolean;
  /** Ruta del piloto automático para este objeto (centro del objeto), hasta dentro del camión. */
  route: Waypoint[];
}

/** Salida de un porteador: posición en el suelo y hacia dónde mira. */
export interface Spawn {
  x: number;
  z: number;
  facing: { x: number; z: number };
}

/**
 * Pose del camión: `x`, `z` es el centro de la abertura trasera de la caja de carga, a ras de suelo; `yaw`, hacia
 * dónde va el camión desde la abertura (atan2(z, x) de esa dirección), en cuartos de vuelta.
 */
export interface TruckPose {
  x: number;
  z: number;
  yaw: number;
}

/** Tráfico y semáforo de peatones. */
export interface TrafficDef {
  lanes: Lane[];
  /** Coches al empezar: carril (índice en `lanes`) y posición. */
  cars: { lane: number; x: number }[];
  /** Semáforos de peatones dibujados: posición y hacia dónde mira su cara (±z). */
  lights: { x: number; z: number; face: 1 | -1 }[];
  /** Mientras el objeto principal está en esta región, importa el semáforo: se ve en la interfaz y suena. */
  near: Region;
}

export type PropType =
  // Con choque (o sin él), al alcance de los jugadores
  | 'boxes' | 'boxesTall' | 'armchair' | 'floorLamp' | 'rug' | 'handTruck' | 'wheelbarrow' | 'wateringCan'
  | 'rake' | 'hoseReel' | 'mailbox' | 'saleSign' | 'containers' | 'bikeRack' | 'streetSign' | 'planter'
  | 'cafe' | 'scooter' | 'crossingSign' | 'plant' | 'pallet' | 'cone' | 'flagPole'
  // Mobiliario urbano y detalles sin choque
  | 'gnome' | 'flowerPot' | 'streetLamp' | 'bench' | 'bin' | 'hydrant' | 'elecBox'
  // Tejados
  | 'acUnit' | 'chimney' | 'waterTank';

/** Objeto de decoración. La vista lo dibuja; si tiene `hit`, la simulación usa esa caja de choque. */
export interface Prop {
  type: PropType;
  x: number;
  z: number;
  /** Altura de la base (por defecto, el suelo). */
  y?: number;
  /** Giro sobre el eje vertical (rad). */
  ry?: number;
  /** Semiextensiones de la caja de choque (alineada con los ejes), o nada si no choca. */
  hit?: [number, number, number];
}

/**
 * Decoración del nivel que no choca, por piezas: cada sección la dibuja una función de la vista en el sitio que dicen
 * estos datos. Un nivel sin una sección no la tiene.
 */
export interface Scenery {
  /** Fachada con una puerta estrecha: marco, jambas, felpudo, escaparates con toldo, cornisa, número y apliques. */
  facade?: {
    door: { x0: number; x1: number; top: number; z: number };
    /** Extremos y alto de la fachada (la cornisa va de punta a punta, por encima). */
    x0: number;
    x1: number;
    top: number;
    /** Escaparates con toldo, de `x0` a `x1` cada `step`, salvo junto a la puerta. */
    windows: { x0: number; x1: number; step: number };
    /** Número del portal y dónde va. */
    number: string;
    numberX: number;
  };
  /** Portal y pasillo de la planta baja: suelo de baldosas, buzones y apliques en sus paredes (en `z`). */
  portal?: { x0: number; x1: number; tiles: { x: number; z: number; w: number; d: number }; mailboxes: { x: number; z: number }; sconces: number[] };
  /** Escalera: la física es una rampa (`Box` de tipo `stairs`); se dibujan peldaños, alfombra y pasamanos. */
  stairs?: { x0: number; x1: number; z0: number; z1: number; top: number; steps: number };
  /** Pasillo de la planta de arriba: cuadros y apliques en la pared del fondo. */
  upstairs?: { y: number; wallZ: number; art: number[]; sconces: number[] };
  /** Casa de salida: puerta, cartel, aplique, felpudo, jardineras de ventana y camino de losas. */
  house?: { x: number; front: number; windowBoxes: number[]; pathTo: number };
  /** Calle: bordillos, tapas de alcantarilla y rejillas. */
  street?: { curbs: { x: number; z: number; w: number }[]; manholes: [number, number][]; drains: [number, number][] };
  /** Edificios de fondo, sin choque. */
  buildings?: { x0: number; x1: number; z0: number; z1: number; h: number; style: number }[];
  /** Árboles (escala y tono); `fade`: junto al recorrido, su copa se oculta si tapa a alguien. */
  trees?: { x: number; z: number; s: number; hue: number; fade?: boolean }[];
  /** Arriates con flores (centro y largo en z). */
  flowerBeds?: { x: number; z: number; len: number }[];
  /** Carteles pintados en una pared, con dos postes. */
  signs?: { text: string; x: number; y: number; z: number; w: number; posts: number[] }[];
  /** Banderines de colores entre dos puntos. */
  bunting?: { from: Vec3; to: Vec3; n: number }[];
  /** Rótulo flotante con el nombre del sitio (p. ej. «PATIO DE PRUEBAS»). */
  labels?: { text: string; x: number; y: number; z: number }[];
}

export interface LevelDef {
  id: string;
  /** Nombre en español, para la interfaz. */
  name: string;
  /** Escena de prueba: no es uno de los niveles del juego, y la interfaz lo dice. */
  test?: boolean;
  /** Cajas del escenario: con choque (`solid`) o solo dibujadas. El camión no va aquí: sale de `truck`. */
  boxes: Box[];
  /** Objetos de decoración (los que tienen `hit` chocan). */
  props: Prop[];
  scenery: Scenery;
  /** Salidas de los porteadores (el porteador i usa la i-ésima, módulo su número). */
  spawns: Spawn[];
  /** Objetos de la mudanza. */
  items: ItemPlacement[];
  /**
   * Objeto principal (índice en `items`): por él van los ayudantes, lo sigue la cámara, lo lleva el piloto y marca
   * las etapas.
   */
  main: number;
  truck: TruckPose;
  stages: StageDef[];
  /** Límite de tiempo y tiempo para la estrella (s). */
  timeLimit: number;
  parTime: number;
  /** Tráfico y semáforo, o nada. */
  traffic: TrafficDef | null;
}
