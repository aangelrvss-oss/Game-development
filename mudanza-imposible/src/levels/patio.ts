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
  // Conos a los lados del pie de la rampa, apartados de los carriles por los que se llega a ella, y un mástil con
  // banderines (con los conos a 0,6 m del borde de la rampa, las cajas y la lámpara chocaban con ellos al subir)
  { type: 'cone', x: 1.2, z: -3.9, hit: [0.2, 0.3, 0.2] },
  { type: 'cone', x: 1.2, z: 3.9, hit: [0.2, 0.3, 0.2] },
  { type: 'flagPole', x: 1.2, z: -4.8, hit: [0.08, 1.6, 0.08] },
  { type: 'bench', x: -10, z: -8.8 },
  { type: 'flowerPot', x: -14.8, z: -8.8 },
  { type: 'flowerPot', x: -14.8, z: 8.8 },
];
for (const o of props) if (o.hit) boxes.push({ p: [o.x, (o.y ?? 0) + o.hit[1], o.z], h: o.hit, kind: 'prop', solid: true });

/**
 * Un objeto en (x, z), girado `turn`, que se lleva a su sitio dentro del camión, en el carril `lane` (z) y a `depth` (x):
 * primero a su carril, 3,5 m antes de la rampa (para entrar en ella ya en línea: llegando en diagonal al pie de la
 * rampa, se desviaba y había que volver atrás), después al pie de la rampa y de ahí, en línea recta, a su sitio, donde se
 * suelta. `yaw`: giro al llevarlo (null si da igual).
 */
function place(id: ItemId, x: number, z: number, required: boolean, lane: number, depth: number, yaw: number | null = 0, turn = 0): ItemPlacement {
  return {
    id, pos: { x, z }, yaw: turn, required,
    route: [
      { x: -1.5, z: lane, yaw, label: 'Patio' },
      { x: 1.2, z: lane, yaw, label: 'Rampa del camión' },
      { x: depth, z: lane, yaw, label: 'Camión', release: true },
    ],
  };
}

// Los objetos, separados al menos 1,5 m (se llega a todas sus asas) y repartidos para que el camino recto de cada uno
// hasta su carril no pase por otro. La lámpara mira al oeste: su única asa queda del lado de quien llega del patio.
// Dentro de la caja de carga (x de 6 a 11,7; z de −1,9 a 1,9) hay dos carriles separados 0,7 m (con tres, quien lleva
// una caja a su lado rozaba la mesa del carril central y la volcaba sobre la lámpara): el norte (z < 0), para la mesa y
// la caja del norte del patio; el sur (z > 0), para la lámpara, la silla y la otra caja, que salen del sur. En cada
// carril, primero lo del fondo (el piloto espera a que esté cargado para meter lo de delante), con 1 m libre entre uno y
// otro para quien va delante del objeto que lleva. La mesa, la más lenta de llevar, comparte carril con un solo objeto.
const N = -0.95, S = 0.95;
const items: ItemPlacement[] = [
  place('mesa', -3, 0, true, N, 9.8),
  place('caja', -5.5, -3.5, true, N, 7.9, null),
  place('caja', -3.5, 5.5, true, S, 7.0, null),
  place('lampara', -5.5, 3.5, true, S, 10.3, null, Math.PI),
  place('silla', -5.5, 5.5, true, S, 8.6, null),
  place('nevera', -8.5, -2.5, false, N, 6.45),
  place('piano', -8.5, 2.5, false, 0, 6.9),
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
    bunting: [{ from: { x: 1.2, y: 3.1, z: -4.8 }, to: { x: 6.05, y: 3.2, z: -2.02 }, n: 7 }],
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
