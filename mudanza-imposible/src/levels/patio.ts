// «Patio de pruebas»: escena pequeña y llana para probar los objetos del catálogo con el camión. No es uno de los
// niveles del juego (`test`), y la interfaz lo dice. Se elige con `?nivel=pruebas`.
//
// Un patio empedrado y cerrado por setos, el camión al este con la abertura hacia los objetos y siete objetos del
// catálogo: la mesa (dos personas), dos cajas, la lámpara de pie (frágil) y la silla, obligatorias; la nevera y el piano,
// opcionales. Cada objeto tiene su ruta para el piloto, hasta un sitio distinto dentro de la caja de carga.
import type { ItemId } from '../sim/items';
import { span } from './geometry';
import { cargoCenter } from './truck';
import type { Box, ItemPlacement, LevelDef, Prop, Spawn, TruckPose } from './types';

/** Camión al este del patio: abertura en x = 6 mirando a −x; rampa de x = 2 a 6; caja de carga de x = 6 a 11,7. */
const TRUCK_POSE: TruckPose = { x: 6, z: 0, yaw: 0 };

const boxes: Box[] = [
  span(-40, 40, -1, 0, -30, 30, 'ground'),
  // Patio empedrado (solo dibujo)
  span(-16, 18, 0, 0.012, -10, 10, 'sidewalk', false),
  // Setos alrededor
  span(-16, 18, 0, 1.2, -10.4, -10, 'hedge'),
  span(-16, 18, 0, 1.2, 10, 10.4, 'hedge'),
  span(-16.4, -16, 0, 1.2, -10.4, 10.4, 'hedge'),
  span(18, 18.4, 0, 1.2, -10.4, 10.4, 'hedge'),
];

const props: Prop[] = [
  // Conos a los lados del pie de la rampa y un mástil con banderines
  { type: 'cone', x: 1.4, z: -2.5, hit: [0.2, 0.3, 0.2] },
  { type: 'cone', x: 1.4, z: 2.5, hit: [0.2, 0.3, 0.2] },
  { type: 'flagPole', x: 1.4, z: -3.4, hit: [0.08, 1.6, 0.08] },
  { type: 'bench', x: -10, z: -8.8 },
  { type: 'flowerPot', x: -14.8, z: -8.8 },
  { type: 'flowerPot', x: -14.8, z: 8.8 },
];
for (const o of props) if (o.hit) boxes.push({ p: [o.x, (o.y ?? 0) + o.hit[1], o.z], h: o.hit, kind: 'prop', solid: true });

/**
 * Un objeto en (x, z) que se lleva hasta (sx, sz) dentro del camión: primero al eje del camión antes de la rampa y
 * después a su sitio, donde se suelta. `yaw`: giro al llevarlo (null si da igual).
 */
function place(id: ItemId, x: number, z: number, required: boolean, sx: number, sz: number, yaw: number | null = 0): ItemPlacement {
  return {
    id, pos: { x, z }, yaw: 0, required,
    route: [
      { x: 0, z: z * 0.5, yaw, label: 'Patio' },
      { x: 2.4, z: sz * 0.5, yaw, label: 'Rampa del camión' },
      { x: sx, z: sz, yaw, label: 'Camión', release: true },
    ],
  };
}

// Sitios dentro de la caja de carga (x de 6 a 11,7; z de −1,9 a 1,9): lo grande al fondo, lo pequeño junto a la abertura
const items: ItemPlacement[] = [
  place('mesa', -3, 0, true, 9.3, -1.0),
  place('caja', -6.5, -4.5, true, 9.3, 0.5, null),
  place('caja', -7.5, -4.5, true, 8.5, 0.5, null),
  place('lampara', -6.5, 4.5, true, 7.3, -1.2, null),
  place('silla', -8, 4.5, true, 7.3, 1.2, null),
  place('nevera', -11, -2.5, false, 11.2, -1.4),
  place('piano', -11, 2.5, false, 10.8, 1.25),
];

/** Salidas: en el oeste del patio, mirando a los objetos. */
const spawns: Spawn[] = [
  { x: -13.5, z: -3, facing: { x: 1, z: 0 } },
  { x: -13.5, z: 3, facing: { x: 1, z: 0 } },
  { x: -13.5, z: -1, facing: { x: 1, z: 0 } },
  { x: -13.5, z: 1, facing: { x: 1, z: 0 } },
  { x: -15, z: -2, facing: { x: 1, z: 0 } },
  { x: -15, z: 2, facing: { x: 1, z: 0 } },
];

export const PATIO: LevelDef = {
  id: 'pruebas',
  name: 'Patio de pruebas',
  test: true,
  boxes,
  props,
  scenery: {
    trees: [
      { x: -19, z: -13, s: 1.1, hue: 0 }, { x: -20, z: 6, s: 1, hue: 1 }, { x: 4, z: -14, s: 1.2, hue: 1 },
      { x: 21, z: 4, s: 1, hue: 0 }, { x: 14, z: -13, s: 0.9, hue: 0 },
    ],
    bunting: [{ from: { x: 1.4, y: 3.1, z: -3.4 }, to: { x: 6.05, y: 3.2, z: -2.02 }, n: 6 }],
    labels: [{ text: 'PATIO DE PRUEBAS', x: -4, y: 3.2, z: -9.6 }],
  },
  spawns,
  items,
  // La mesa: la sigue la cámara y por ella van los ayudantes
  main: 0,
  truck: TRUCK_POSE,
  stages: [
    { label: 'Patio de pruebas', when: null, next: cargoCenter(TRUCK_POSE), respawn: { p: { x: -3, y: 0.6, z: 0 }, yaw: 0 } },
  ],
  timeLimit: 240,
  parTime: 120,
  traffic: null,
};
