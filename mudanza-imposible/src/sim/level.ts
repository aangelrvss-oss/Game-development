// Recorrido del vertical slice. Datos compartidos por la simulación (colisiones) y la vista (mallas).
// Ejes: x hacia la derecha (este), y arriba, z hacia la cámara (sur). El recorrido avanza hacia -z
// y termina hacia +x. Unidades en metros.

export type Kind =
  | 'ground' | 'grass' | 'sidewalk' | 'road' | 'stripe' | 'crosswalk'
  | 'wall' | 'facade' | 'block' | 'roof' | 'floor' | 'stairs' | 'ramp' | 'fence' | 'hedge'
  | 'house' | 'truck' | 'zone' | 'invisible';

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
  /** Se puede volver translúcida si tapa la acción. */
  fade?: boolean;
}

export const FLOOR2 = 2.6; // altura de la planta de arriba

const boxes: Box[] = [];
const add = (b: Box) => boxes.push(b);
/** Caja a partir de sus límites. */
function span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, kind: Kind, solid = true, fade = false) {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)];
  [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
  [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
  add({ p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], kind, solid, fade });
}

/** Rampa con superficie superior que va de (a) a (b); grosor 0,4 m. Sube o baja en z (axis 'z') o en x (axis 'x'). */
function slope(axis: 'x' | 'z', from: number, to: number, yFrom: number, yTo: number, w0: number, w1: number, kind: Kind) {
  // Dirección de la superficie con avance positivo en el eje.
  let run = to - from;
  let rise = yTo - yFrom;
  if (run < 0) { run = -run; rise = -rise; }
  const len = Math.hypot(run, rise);
  const t = 0.2;
  const mid = (from + to) / 2;
  const midY = (yFrom + yTo) / 2;
  if (axis === 'z') {
    // Rotación θ sobre x: el eje z local pasa a (0, -sinθ, cosθ); la normal es (0, cosθ, sinθ).
    const rx = Math.atan2(-rise, run);
    const ny = Math.cos(rx), nz = Math.sin(rx);
    add({ p: [(w0 + w1) / 2, midY - ny * t, mid - nz * t], h: [(w1 - w0) / 2, t, len / 2], rx, kind, solid: true });
  } else {
    // Rotación φ sobre z: el eje x local pasa a (cosφ, sinφ, 0); la normal es (-sinφ, cosφ, 0).
    const rz = Math.atan2(rise, run);
    const nx = -Math.sin(rz), ny = Math.cos(rz);
    add({ p: [mid - nx * t, midY - ny * t, (w0 + w1) / 2], h: [len / 2, t, (w1 - w0) / 2], rz, kind, solid: true });
  }
}

// --- Suelo y calle ---
span(-60, 60, -1, 0, -60, 40, 'ground');
span(-8, 8, 0, 0.01, 4, 17, 'grass', false);
span(-18, 18, 0, 0.012, 1, 4, 'sidewalk', false);
span(-45, 45, 0, 0.01, -9, 1, 'road', false);
span(-18, 18, 0, 0.012, -13.3, -9, 'sidewalk', false);
for (let x = -44; x < 44; x += 4) span(x, x + 2, 0.011, 0.015, -4.1, -3.9, 'stripe', false);
for (let i = 0; i < 6; i++) { const z0 = -8.6 + i * 1.6; span(-2.5, 2.5, 0.012, 0.018, z0, z0 + 0.8, 'crosswalk', false); }

// --- Patio de salida ---
span(-8.2, -7.8, 0, 1, 4, 17, 'fence');
span(7.8, 8.2, 0, 1, 4, 17, 'fence');
span(-9, 9, 0, 4, 17, 21, 'house');
span(-18, -8.2, 0, 1.1, 3.6, 4.4, 'hedge');
span(8.2, 18, 0, 1.1, 3.6, 4.4, 'hedge');
// Límites laterales de la calle (no se ven; los coches los atraviesan porque son cinemáticos)
span(-18.4, -18, 0, 3, -13.5, 4.4, 'invisible');
span(18, 18.4, 0, 3, -13.5, 4.4, 'invisible');

// --- Edificio: fachada con puerta estrecha ---
export const DOOR = { x0: -0.8, x1: 0.8, top: 2.4, z: -13.5 };
span(-18, DOOR.x0, 0, 3.2, -13.7, -13.3, 'facade', true, true);
span(DOOR.x1, 18, 0, 3.2, -13.7, -13.3, 'facade', true, true);
span(DOOR.x0, DOOR.x1, DOOR.top, 3.2, -13.7, -13.3, 'facade', true, true);

// Pasillo (x de -1,4 a 1,4), escalera que sube hacia -z y rellano
export const STAIRS = { z0: -22, z1: -29, top: FLOOR2 };
span(-1.4, 1.4, 0, 0.02, -13.7, -22, 'floor', false);
span(-1.8, -1.4, 0, 4.2, -32.8, -13.7, 'wall');
span(1.4, 1.8, 0, 4.2, -28.8, -13.7, 'wall');
slope('z', STAIRS.z0, STAIRS.z1, 0, STAIRS.top, -1.4, 1.4, 'stairs');
// Rellano y pasillo superior hacia +x
span(-1.4, 1.4, 0, FLOOR2, -32.4, -29, 'floor');
span(1.4, 12, 0, FLOOR2, -32.4, -28.8, 'floor');
span(-1.8, 12, FLOOR2, FLOOR2 + 1.6, -32.8, -32.4, 'wall');
span(1.8, 12, FLOOR2, FLOOR2 + 1.6, -28.8, -28.4, 'wall', true, true);
// Bloques del resto del edificio (no se puede entrar; dan forma al edificio)
span(-14, -1.8, 0, 3.2, -32.8, -13.7, 'block');
span(1.8, 12, 0, 3.2, -28.4, -13.7, 'block');
// Terraza y rampa exterior sin barandilla
export const TERRACE = { x0: 12, x1: 14 };
span(12, 14, 0, FLOOR2, -32.4, -28.8, 'floor');
span(12, 14.2, FLOOR2, FLOOR2 + 1.1, -33, -32.4, 'wall');
export const RAMP = { x0: 14, x1: 22.5, z0: -31.9, z1: -29.3 };
slope('x', RAMP.x0, RAMP.x1, FLOOR2, 0, RAMP.z0, RAMP.z1, 'ramp');

// --- Patio trasero, camión y zona de entrega ---
span(12, 34, 0, 1.4, -24.4, -24, 'hedge');
span(34, 34.4, 0, 1.4, -42, -24, 'hedge');
span(10, 34, 0, 1.4, -42.4, -42, 'hedge');
span(12, 12.4, 0, 1.4, -42, -32.4, 'hedge');
span(12, 12.4, 0, 1.4, -28.4, -24.4, 'hedge');
export const ZONE = { x0: 23.5, x1: 28, z0: -34, z1: -26.5 };
span(ZONE.x0, ZONE.x1, 0, 0.02, ZONE.z0, ZONE.z1, 'zone', false);
span(28, 34, 0, 3.4, -33.5, -27, 'truck');

export const LEVEL: Box[] = boxes;

/** Puntos de paso del recorrido para el piloto automático (centro del sofá) y orientación deseada. */
export interface Waypoint { x: number; z: number; y?: number; yaw: number | null; label: string; waitLight?: boolean; tol?: number }
const ALONG_Z = Math.PI / 2;
export const ROUTE: Waypoint[] = [
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
  { x: 25.6, z: -30.3, yaw: 0, label: 'Entrega' },
];

/** Etapas visibles en la interfaz y cómo se detecta que el sofá ha llegado a cada una. */
export const STAGES: { label: string; reached: (x: number, y: number, z: number) => boolean }[] = [
  { label: 'Patio', reached: () => true },
  { label: 'Calle', reached: (_x, _y, z) => z < 1 },
  { label: 'Portal', reached: (_x, _y, z) => z < -13.5 },
  { label: 'Escalera', reached: (_x, y, z) => z < -22 && y > 0.6 },
  { label: 'Arriba', reached: (x, y) => y > FLOOR2 - 0.2 && x > 1 },
  { label: 'Rampa', reached: (x) => x > RAMP.x0 },
  { label: 'Camión', reached: (x, _y, z) => x > ZONE.x0 && x < ZONE.x1 && z > ZONE.z0 && z < ZONE.z1 },
];

export const SOFA_START = { x: 0, y: 0.6, z: 10, yaw: 0 };
export const PED_LIGHT = { x: 3.4, z: 1.6 };
