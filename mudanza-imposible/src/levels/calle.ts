// «La calle»: el recorrido del vertical slice como nivel de datos y nivel de referencia. Un solo objeto, el sofá
// (obligatorio), que hay que llevar desde la casa, cruzando la calle con el semáforo, por una puerta estrecha, escalera
// arriba, por la terraza y la rampa sin barandilla, hasta dentro del camión (subiendo su rampa de carga).
//
// Las cajas son las del recorrido de siempre, en el mismo orden. Cambia el final: el camión ya no es un bloque macizo
// con una zona de entrega en el suelo, sino una caja de carga abierta con rampa (`truck.ts`), y el sofá se entrega
// dentro. Ejes: x hacia la derecha (este), y arriba, z hacia la cámara (sur); el recorrido avanza hacia −z y termina
// hacia +x.
import { ITEMS } from '../sim/items';
import { rotate, yawQuat } from '../sim/sofa';
import { slope, span } from './geometry';
import { cargoCenter, cargoHold, TRUCK, truckToWorld } from './truck';
import type { Box, LevelDef, Prop, Spawn, StageDef, TruckPose, Waypoint } from './types';

/** Altura de la planta de arriba. */
export const FLOOR2 = 2.6;
/** Puerta estrecha de la fachada (hueco de 1,6 m). */
export const DOOR = { x0: -0.8, x1: 0.8, top: 2.4, z: -13.5 };
/** Escalera del pasillo: sube hacia −z. */
export const STAIRS = { z0: -22, z1: -29, top: FLOOR2 };
/** Terraza y rampa exterior de chapa, sin barandilla. */
export const TERRACE = { x0: 12, x1: 14 };
export const RAMP = { x0: 14, x1: 22.5, z0: -31.9, z1: -29.3 };
/** Salida del sofá. */
export const SOFA_START = { x: 0, y: 0.6, z: 10, yaw: 0 };
/** Camión: la abertura de la caja de carga mira a la rampa de la terraza (−x); la cabina, hacia +x. */
const TRUCK_POSE: TruckPose = { x: 28, z: -30.25, yaw: 0 };

const boxes: Box[] = [];
const add = (b: Box) => boxes.push(b);

// --- Suelo y calle ---
add(span(-60, 60, -1, 0, -60, 40, 'ground'));
add(span(-8, 8, 0, 0.01, 4, 17, 'grass', false));
add(span(-18, 18, 0, 0.012, 1, 4, 'sidewalk', false));
add(span(-45, 45, 0, 0.01, -9, 1, 'road', false));
add(span(-18, 18, 0, 0.012, -13.3, -9, 'sidewalk', false));
for (let x = -44; x < 44; x += 4) add(span(x, x + 2, 0.011, 0.015, -4.1, -3.9, 'stripe', false));
for (let i = 0; i < 6; i++) { const z0 = -8.6 + i * 1.6; add(span(-2.5, 2.5, 0.012, 0.018, z0, z0 + 0.8, 'crosswalk', false)); }

// --- Patio de salida ---
add(span(-8.2, -7.8, 0, 1, 4, 17, 'fence'));
add(span(7.8, 8.2, 0, 1, 4, 17, 'fence'));
add(span(-9, 9, 0, 4, 17, 21, 'house'));
add(span(-18, -8.2, 0, 1.1, 3.6, 4.4, 'hedge'));
add(span(8.2, 18, 0, 1.1, 3.6, 4.4, 'hedge'));
// Límites laterales de la calle (no se ven; los coches los atraviesan porque son cinemáticos)
add(span(-18.4, -18, 0, 3, -13.5, 4.4, 'invisible'));
add(span(18, 18.4, 0, 3, -13.5, 4.4, 'invisible'));

// --- Edificio: fachada con puerta estrecha ---
add(span(-18, DOOR.x0, 0, 3.2, -13.7, -13.3, 'facade', true, true));
add(span(DOOR.x1, 18, 0, 3.2, -13.7, -13.3, 'facade', true, true));
add(span(DOOR.x0, DOOR.x1, DOOR.top, 3.2, -13.7, -13.3, 'facade', true, true));

// Pasillo (x de -1,4 a 1,4), escalera que sube hacia -z y rellano
add(span(-1.4, 1.4, 0, 0.02, -13.7, -22, 'floor', false));
add(span(-1.8, -1.4, 0, 4.2, -32.8, -13.7, 'wall'));
add(span(1.4, 1.8, 0, 4.2, -28.8, -13.7, 'wall'));
add(slope('z', STAIRS.z0, STAIRS.z1, 0, STAIRS.top, -1.4, 1.4, 'stairs'));
// Rellano y pasillo superior hacia +x
add(span(-1.4, 1.4, 0, FLOOR2, -32.4, -29, 'floor'));
add(span(1.4, 12, 0, FLOOR2, -32.4, -28.8, 'floor'));
add(span(-1.8, 12, FLOOR2, FLOOR2 + 1.6, -32.8, -32.4, 'wall'));
add(span(1.8, 12, FLOOR2, FLOOR2 + 1.6, -28.8, -28.4, 'wall', true, true));
// Bloques del resto del edificio (no se puede entrar; dan forma al edificio)
add(span(-14, -1.8, 0, 3.2, -32.8, -13.7, 'block'));
add(span(1.8, 12, 0, 3.2, -28.4, -13.7, 'block'));
// Terraza y rampa exterior sin barandilla
add(span(TERRACE.x0, TERRACE.x1, 0, FLOOR2, -32.4, -28.8, 'floor'));
add(span(12, 14.2, FLOOR2, FLOOR2 + 1.1, -33, -32.4, 'wall'));
add(slope('x', RAMP.x0, RAMP.x1, FLOOR2, 0, RAMP.z0, RAMP.z1, 'ramp'));

// --- Patio trasero y camión ---
add(span(12, 34, 0, 1.4, -24.4, -24, 'hedge'));
// El seto del fondo deja hueco a la cabina del camión (antes la atravesaba)
add(span(34, 34.4, 0, 1.4, -42, -32.4, 'hedge'));
add(span(34, 34.4, 0, 1.4, -28.1, -24, 'hedge'));
add(span(10, 34, 0, 1.4, -42.4, -42, 'hedge'));
add(span(12, 12.4, 0, 1.4, -42, -32.4, 'hedge'));
add(span(12, 12.4, 0, 1.4, -28.4, -24.4, 'hedge'));

// --- Objetos de decoración ---
// La simulación usa su caja de choque (`hit`) y la vista dibuja el objeto. Los que quedan al alcance de los jugadores
// chocan: si no, se atravesarían igual que antes el sofá. Todos quedan fuera del paso del sofá (patio: |x| > 4,5;
// aceras: lejos del paso de peatones; patio trasero: fuera de la rampa del camión y del pie de la rampa de la terraza).
const PROPS: Prop[] = [
  // --- Casa y jardín: la mudanza a medio hacer junto a la puerta ---
  { type: 'boxesTall', x: -5.1, z: 16.1, hit: [0.75, 0.65, 0.5] },
  { type: 'boxes', x: 5.0, z: 16.15, ry: 0.15, hit: [0.7, 0.45, 0.5] },
  { type: 'handTruck', x: -3.9, z: 16.3, ry: -0.3, hit: [0.28, 0.6, 0.25] },
  { type: 'floorLamp', x: 3.7, z: 16.2, hit: [0.18, 0.8, 0.18] },
  { type: 'armchair', x: 5.4, z: 14.3, ry: -0.5, hit: [0.5, 0.45, 0.5] },
  { type: 'rug', x: -4.9, z: 7.4, hit: [0.2, 0.2, 0.95] },
  { type: 'wheelbarrow', x: -6.3, z: 5.3, ry: 0.4, hit: [0.4, 0.35, 0.65] },
  { type: 'wateringCan', x: 2.7, z: 16.4, ry: 0.8, hit: [0.2, 0.18, 0.15] },
  { type: 'rake', x: 7.55, z: 15.9 },
  { type: 'hoseReel', x: -7.1, z: 16.3, hit: [0.3, 0.3, 0.22] },
  { type: 'mailbox', x: 5.0, z: 4.6, hit: [0.18, 0.6, 0.18] },
  { type: 'saleSign', x: -5.0, z: 4.7, ry: 0.2, hit: [0.4, 0.5, 0.08] },
  // --- Calle ---
  { type: 'containers', x: 13.1, z: 2.6, hit: [1.75, 0.65, 0.45] },
  { type: 'bikeRack', x: -11.6, z: 3.0, hit: [0.85, 0.45, 0.3] },
  { type: 'streetSign', x: -6.3, z: 1.4, hit: [0.08, 1.2, 0.08] },
  { type: 'planter', x: -3.7, z: -12.85, hit: [0.5, 0.3, 0.27] },
  { type: 'planter', x: 3.7, z: -12.85, hit: [0.5, 0.3, 0.27] },
  { type: 'cafe', x: 6.8, z: -12.0, hit: [0.95, 0.4, 0.75] },
  { type: 'scooter', x: -4.9, z: -9.7, ry: 0.15, hit: [0.65, 0.45, 0.22] },
  { type: 'crossingSign', x: -3.3, z: -9.45, hit: [0.07, 1.2, 0.07] },
  // --- Edificio: planta de arriba ---
  { type: 'plant', x: 10.9, z: -32.0, y: 2.6, hit: [0.28, 0.4, 0.28] },
  // --- Camión ---
  { type: 'pallet', x: 25.6, z: -36.0, hit: [1.0, 0.6, 0.65] },
  { type: 'boxes', x: 30.2, z: -35.4, ry: -0.1, hit: [0.7, 0.45, 0.5] },
  { type: 'handTruck', x: 26.6, z: -25.2, ry: 2.6, hit: [0.28, 0.6, 0.25] },
  { type: 'cone', x: 23.1, z: -34.5, hit: [0.2, 0.3, 0.2] },
  { type: 'cone', x: 23.1, z: -26.0, hit: [0.2, 0.3, 0.2] },
  { type: 'cone', x: 27.6, z: -34.5, hit: [0.2, 0.3, 0.2] },
  { type: 'flagPole', x: 23.1, z: -35.4, hit: [0.08, 1.6, 0.08] },
  // --- Sin choque, fuera del alcance o del paso: jardín, mobiliario urbano y tejados ---
  { type: 'flowerPot', x: -3.5, z: 15.6 },
  { type: 'flowerPot', x: 3.5, z: 15.6 },
  { type: 'gnome', x: -5.6, z: 12.5, ry: 0.5 },
  // Farolas: en la acera cercana solo las de los extremos, para no cruzar la acción (ry = π: el brazo mira a −z)
  { type: 'streetLamp', x: -12, z: 1.3, ry: Math.PI },
  { type: 'streetLamp', x: -12, z: -9.4 },
  { type: 'streetLamp', x: -6, z: -9.4 },
  { type: 'streetLamp', x: 6, z: -9.4 },
  { type: 'streetLamp', x: 12, z: 1.3, ry: Math.PI },
  { type: 'streetLamp', x: 12, z: -9.4 },
  { type: 'bench', x: -9, z: 2.9 },
  { type: 'bench', x: 9, z: 2.9 },
  { type: 'bench', x: -9.2, z: -11.2, ry: Math.PI },
  { type: 'bench', x: 12.4, z: -11.2, ry: Math.PI },
  { type: 'bin', x: -4.6, z: 1.6 },
  { type: 'bin', x: 4.8, z: -9.8 },
  { type: 'bin', x: -15, z: 2.2 },
  { type: 'hydrant', x: 7.4, z: 1.7 },
  { type: 'elecBox', x: -6.8, z: -10.2 },
  // Tejados del edificio (base sobre el tejado): aparatos de aire, chimeneas y un depósito, lejos del pasillo
  { type: 'acUnit', x: -10, z: -19, y: 3.45 },
  { type: 'acUnit', x: -7, z: -27, y: 3.45 },
  { type: 'acUnit', x: -12, z: -30, y: 3.45 },
  { type: 'acUnit', x: 7, z: -16, y: 3.45 },
  { type: 'acUnit', x: 10, z: -19.5, y: 3.45 },
  { type: 'chimney', x: -5, z: -15, y: 3.4 },
  { type: 'chimney', x: 5, z: -15, y: 3.4 },
  { type: 'waterTank', x: -12, z: -23, y: 3.45 },
];
for (const o of PROPS) if (o.hit) add({ p: [o.x, (o.y ?? 0) + o.hit[1], o.z], h: o.hit, kind: 'prop', solid: true });

/** Salidas: alrededor del sofá, frente a cada asa, a 1,3 m hacia fuera y mirándola (como siempre). */
const spawns: Spawn[] = ITEMS.sofa.handles.map((h) => {
  const q = yawQuat(SOFA_START.yaw), a = rotate(q, h.p), out = rotate(q, h.out);
  const ax = SOFA_START.x + a.x, az = SOFA_START.z + a.z;
  return { x: ax + out.x * 1.3, z: az + out.z * 1.3, facing: { x: -out.x, z: -out.z } };
});

const ALONG_Z = Math.PI / 2;
/** Ruta del sofá para el piloto automático (centro del sofá) y orientación deseada. */
const ROUTE: Waypoint[] = [
  { x: 0, z: 6.5, yaw: ALONG_Z, label: 'Patio' },
  { x: 0, z: 3, yaw: ALONG_Z, label: 'Acera', waitLight: true },
  { x: 0, z: -11.2, yaw: ALONG_Z, label: 'Calle', tol: 0.1 },
  { x: 0, z: -17, yaw: ALONG_Z, label: 'Portal' },
  { x: 0, z: -21, yaw: ALONG_Z, label: 'Pasillo' },
  { x: 0, z: -30.3, yaw: ALONG_Z, label: 'Escalera', tol: 0.35 },
  { x: 1.2, z: -30.6, yaw: 0, label: 'Rellano' },
  { x: 7, z: -30.6, yaw: 0, label: 'Pasillo de arriba' },
  { x: 13, z: -30.6, yaw: 0, label: 'Terraza' },
  { x: 20, z: -30.6, yaw: 0, label: 'Rampa' },
  // En el llano entre las dos rampas, alineado con la del camión; después, dentro de la caja de carga, y se suelta
  { x: 23.4, z: TRUCK_POSE.z, yaw: 0, label: 'Rampa del camión' },
  { x: 30.8, z: TRUCK_POSE.z, yaw: 0, label: 'Camión', release: true },
];

const hold = cargoHold(TRUCK_POSE);
/** Etapas visibles en la interfaz, cuándo llega el sofá a cada una, el siguiente objetivo y dónde reaparece. */
const stages: StageDef[] = [
  { label: 'Patio', when: null, next: { x: 0, y: 0, z: 2 }, respawn: { p: { x: 0, y: 0.6, z: 9 }, yaw: 0 } },
  { label: 'Calle', when: { max: { z: 1 } }, next: { x: 0, y: 0, z: DOOR.z - 0.5 }, respawn: { p: { x: 0, y: 0.6, z: 2.6 }, yaw: Math.PI / 2 } },
  { label: 'Portal', when: { max: { z: -13.5 } }, next: { x: 0, y: 0, z: STAIRS.z0 }, respawn: { p: { x: 0, y: 0.6, z: -16 }, yaw: Math.PI / 2 } },
  { label: 'Escalera', when: { min: { y: 0.6 }, max: { z: -22 } }, next: { x: 0, y: FLOOR2, z: -30.6 }, respawn: { p: { x: 0, y: 0.6, z: -20.5 }, yaw: Math.PI / 2 } },
  { label: 'Arriba', when: { min: { x: 1, y: FLOOR2 - 0.2 } }, next: { x: RAMP.x0, y: FLOOR2, z: (RAMP.z0 + RAMP.z1) / 2 }, respawn: { p: { x: 4, y: FLOOR2 + 0.6, z: -30.6 }, yaw: 0 } },
  { label: 'Rampa', when: { min: { x: RAMP.x0 } }, next: cargoCenter(TRUCK_POSE), respawn: { p: { x: RAMP.x0 - 1, y: FLOOR2 + 0.6, z: -30.6 }, yaw: 0 } },
  // Dentro de la caja de carga. Si se cayera del mapa, reaparece en el suelo entre las dos rampas
  { label: 'Camión', when: hold, respawn: { p: { x: 23.2, y: 0.6, z: -30.3 }, yaw: 0 } },
];

/** Esquina trasera izquierda de lo alto del camión: ahí se atan los banderines del mástil. */
const truckCorner = truckToWorld(TRUCK_POSE, { x: 0.05, y: TRUCK.floor + TRUCK.height, z: -(TRUCK.width / 2 + TRUCK.wall) });

export const CALLE: LevelDef = {
  id: 'calle',
  name: 'La calle',
  boxes,
  props: PROPS,
  scenery: {
    facade: { door: DOOR, x0: -18, x1: 18, top: 3.2, windows: { x0: -16, x1: 16, step: 3.2 }, number: 'Nº 13', numberX: 2.2 },
    portal: { x0: -1.4, x1: 1.4, tiles: { x: 0, z: -17.8, w: 2.78, d: 8.2 }, mailboxes: { x: -1.38, z: -15.2 }, sconces: [-16.6, -20.2] },
    stairs: { x0: -1.4, x1: 1.4, z0: STAIRS.z0, z1: STAIRS.z1, top: STAIRS.top, steps: 14 },
    upstairs: { y: FLOOR2, wallZ: -32.4, art: [2.6, 5.6, 8.4], sconces: [4.1, 7.0] },
    house: { x: 0, front: 17, windowBoxes: [-6.5, -2.6, 2.6, 6.5], pathTo: 4.5 },
    street: {
      curbs: [{ x: 0, z: 1, w: 36 }, { x: 0, z: -9, w: 36 }],
      manholes: [[-7, -2.2], [9, -6.3], [-13, -6.1]],
      drains: [[-10.5, 0.75], [7.5, 0.75], [-8.5, -8.75], [11, -8.75]],
    },
    buildings: [
      // Junto al patio de salida
      { x0: -17.5, x1: -10, z0: 7, z1: 16, h: 4.5, style: 0 },
      { x0: 10, x1: 17.5, z0: 7, z1: 16, h: 4.5, style: 1 },
      // Al otro lado de la calle, siguiendo la fachada
      { x0: -34, x1: -18.4, z0: -24, z1: -13.6, h: 6.2, style: 2 },
      { x0: 18.4, x1: 32, z0: -22, z1: -13.6, h: 4.2, style: 3 },
      // Fondo, detrás del patio trasero
      { x0: 8, x1: 22, z0: -56, z1: -44, h: 7, style: 4 },
      { x0: 23, x1: 40, z0: -56, z1: -44, h: 9, style: 2 },
      { x0: -20, x1: -6, z0: -48, z1: -34, h: 6.5, style: 1 },
      // Al final de la calle
      { x0: -44, x1: -36, z0: -13, z1: 0, h: 5, style: 3 },
      { x0: 36, x1: 44, z0: -13, z1: 0, h: 5, style: 0 },
    ],
    // Árboles junto al recorrido (patio, aceras y camión): su copa se oculta si tapa a un jugador o al sofá
    trees: [
      { x: -6, z: 7, s: 1.1, hue: 0, fade: true }, { x: 6, z: 13, s: 1, hue: 1, fade: true }, { x: -6, z: 14.5, s: 0.9, hue: 0, fade: true },
      { x: 6.2, z: 6, s: 0.8, hue: 1, fade: true }, { x: -14, z: 5.5, s: 1.2, hue: 0 }, { x: 14, z: 5.6, s: 1.1, hue: 1 },
      { x: -15, z: -11, s: 1, hue: 0 }, { x: 15, z: -11.5, s: 1, hue: 1 }, { x: 18, z: -38, s: 1.2, hue: 0 },
      { x: 30, z: -26, s: 1, hue: 1, fade: true }, { x: 16, z: -40, s: 0.9, hue: 0 }, { x: -22, z: 2.5, s: 1.1, hue: 1 },
      { x: 22, z: 2.5, s: 1.2, hue: 0 }, { x: -9, z: -11.6, s: 0.8, hue: 1, fade: true }, { x: 9, z: -11.8, s: 0.8, hue: 0, fade: true },
    ],
    flowerBeds: [{ x: -7.1, z: 10.5, len: 9 }, { x: 7.1, z: 10.5, len: 9 }],
    // Cartel pintado de la terraza (sobre su muro, sin tapar la rampa)
    signs: [{ text: '¡SIN BARANDILLA!', x: 13.1, y: FLOOR2 + 1.45, z: -32.38, w: 2.1, posts: [12.25, 13.95] }],
    bunting: [{ from: { x: 23.1, y: 3.1, z: -35.4 }, to: truckCorner, n: 9 }],
  },
  spawns,
  items: [{ id: 'sofa', pos: { x: SOFA_START.x, y: SOFA_START.y, z: SOFA_START.z }, yaw: SOFA_START.yaw, required: true, route: ROUTE }],
  main: 0,
  truck: TRUCK_POSE,
  stages,
  timeLimit: 180,
  parTime: 90,
  traffic: {
    lanes: [
      { z: -1.6, dir: 1, stopX: -4.2 },
      { z: -6.4, dir: -1, stopX: 4.2 },
    ],
    // Tres coches por carril, separados 30 m
    cars: [0, 1].flatMap((lane) => [0, 1, 2].map((k) => ({ lane, x: -40 + k * 30 + lane * 13 }))),
    lights: [{ x: 3.4, z: 1.6, face: 1 }, { x: -3.4, z: -9.6, face: -1 }],
    // El semáforo importa con el sofá cerca de la calle (aceras y calzada) y a ras de suelo
    near: { min: { z: -12 }, max: { z: 7, y: 1.5 } },
  },
};
