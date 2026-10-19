// Objetos de decoración del nivel. La simulación usa su caja de choque (`hit`) y la vista dibuja el objeto.
// Los que quedan al alcance de los jugadores chocan: si no, se atravesarían igual que antes el sofá.
// Todos quedan fuera del paso del sofá (patio: |x| > 4,5; aceras: lejos del paso de peatones; patio trasero:
// fuera de la zona de entrega y del pie de la rampa).

export type PropType =
  | 'boxes' | 'boxesTall' | 'armchair' | 'floorLamp' | 'rug' | 'handTruck' | 'wheelbarrow' | 'wateringCan'
  | 'rake' | 'hoseReel' | 'mailbox' | 'saleSign' | 'containers' | 'bikeRack' | 'streetSign' | 'planter'
  | 'cafe' | 'scooter' | 'crossingSign' | 'plant' | 'pallet' | 'cone' | 'flagPole';

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

export const PROPS: Prop[] = [
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
  // --- Camión y entrega ---
  { type: 'pallet', x: 25.6, z: -36.0, hit: [1.0, 0.6, 0.65] },
  { type: 'boxes', x: 30.2, z: -35.4, ry: -0.1, hit: [0.7, 0.45, 0.5] },
  { type: 'handTruck', x: 26.6, z: -25.2, ry: 2.6, hit: [0.28, 0.6, 0.25] },
  { type: 'cone', x: 23.1, z: -34.5, hit: [0.2, 0.3, 0.2] },
  { type: 'cone', x: 23.1, z: -26.0, hit: [0.2, 0.3, 0.2] },
  { type: 'cone', x: 27.6, z: -34.5, hit: [0.2, 0.3, 0.2] },
  { type: 'flagPole', x: 23.1, z: -35.4, hit: [0.08, 1.6, 0.08] },
];
