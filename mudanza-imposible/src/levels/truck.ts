// Camión de mudanzas: una caja de carga abierta por detrás y una rampa de carga. Ya no es un bloque macizo: el suelo,
// las dos paredes, la pared de la cabina, el techo y la rampa son piezas de choque separadas, y se puede entrar con un
// objeto, dejarlo dentro y apilar. La simulación crea sus colliders y la vista lo dibuja con las mismas cajas
// (`truckBoxes`): lo dibujado es lo que choca. Solo datos, sin Three.js.
//
// Coordenadas locales del camión: origen a ras de suelo en el centro de la abertura trasera, x hacia la cabina, y
// arriba, z a lo ancho. `TruckPose` las coloca en el mundo (en cuartos de vuelta).
import type { Vec3 } from '../sim/types';
import { slope, span } from './geometry';
import type { Box, Kind, TruckPose } from './types';

/**
 * Medidas del camión (m). Es un camión de juguete, más ancho y más bajo que uno real:
 * - ancho interior de 3,8 m: el sofá a lo largo (0,9 m de fondo) con un porteador a cada costado ocupa unos 2,7 m
 *   (0,9 + 2 · (0,6 + 0,32)), y la rampa es tan ancha como la abertura para que nadie se caiga por un lado al subir;
 * - suelo de carga a 1 m: la rampa de 4 m sube unos 14°, menos que la escalera del edificio (20°), que dos personas
 *   suben con el sofá;
 * - 2,1 m de alto por dentro: cabe de pie un porteador (1,38 m) con el objeto en alto;
 * - 5,7 m de largo por dentro: caben el sofá y quien lo lleva por delante, y varios objetos a la vez.
 */
export const TRUCK = {
  /** Largo interior de la caja de carga, de la abertura de atrás a la pared de la cabina. */
  length: 5.7,
  /** Ancho interior. */
  width: 3.8,
  /** Alto interior, del suelo de carga al techo. */
  height: 2.1,
  /** Altura del suelo de carga. */
  floor: 1.0,
  /** Grosor del suelo, las paredes y el techo. */
  wall: 0.12,
  /** Largo en planta de la rampa de carga, de la abertura al suelo. */
  ramp: 4.0,
  /** Medio grosor de la rampa. */
  rampHalf: 0.2,
  /** Cabina: largo, alto y cuánto más estrecha que la caja de carga por cada lado. */
  cab: { length: 2.4, height: 2.5, inset: 0.15 },
};

/** Ejes del camión en el mundo: el x local va a (c, s) y el z local, a (−s, c). Solo cuartos de vuelta. */
function axes(pose: TruckPose) {
  const c = Math.round(Math.cos(pose.yaw)), s = Math.round(Math.sin(pose.yaw));
  if (Math.abs(Math.cos(pose.yaw) - c) > 1e-6 || Math.abs(Math.sin(pose.yaw) - s) > 1e-6) {
    throw new Error(`El camión solo gira en cuartos de vuelta (yaw = ${pose.yaw})`);
  }
  return { c, s };
}

/** Punto local del camión en el mundo. */
export function truckToWorld(pose: TruckPose, l: Vec3): Vec3 {
  const { c, s } = axes(pose);
  return { x: pose.x + l.x * c - l.z * s, y: l.y, z: pose.z + l.x * s + l.z * c };
}

/** Dirección local (horizontal) del camión en el mundo. */
export function truckDir(pose: TruckPose, l: { x: number; z: number }) {
  const { c, s } = axes(pose);
  return { x: l.x * c - l.z * s, z: l.x * s + l.z * c };
}

/** Caja del mundo a partir de sus límites locales. */
function localBox(pose: TruckPose, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, kind: Kind, fade = false): Box {
  const a = truckToWorld(pose, { x: x0, y: y0, z: z0 }), b = truckToWorld(pose, { x: x1, y: y1, z: z1 });
  return span(a.x, b.x, a.y, b.y, a.z, b.z, kind, true, fade);
}

/**
 * Piezas de choque del camión, en este orden: suelo de carga, pared izquierda (z local −), pared derecha (z +), pared de
 * la cabina, techo, bajos, cabina y rampa. Paredes y techo se recortan u ocultan si tapan a alguien (`fade`).
 */
export function truckBoxes(pose: TruckPose): Box[] {
  const { length: L, width: W, height: H, floor: F, wall: t, ramp: R, rampHalf, cab } = TRUCK;
  const w = W / 2;
  const boxes = [
    localBox(pose, 0, L, F - t, F, -w - t, w + t, 'truckFloor'),
    localBox(pose, 0, L, F, F + H, -w - t, -w, 'truckWall', true),
    localBox(pose, 0, L, F, F + H, w, w + t, 'truckWall', true),
    localBox(pose, L, L + t, F - t, F + H + t, -w - t, w + t, 'truckWall', true),
    localBox(pose, 0, L, F + H, F + H + t, -w - t, w + t, 'truckRoof', true),
    // Bajos: macizos hasta el suelo de carga, para que nada se cuele debajo del camión
    localBox(pose, 0, L + t, 0, F - t, -w - t, w + t, 'truckBase'),
    localBox(pose, L + t, L + t + cab.length, 0, cab.height, -w - t + cab.inset, w + t - cab.inset, 'truckCab'),
  ];
  // Rampa de carga: del suelo, a `R` m por detrás, al borde del suelo de carga; tan ancha como la abertura
  const foot = truckToWorld(pose, { x: -R, y: 0, z: 0 }), top = truckToWorld(pose, { x: 0, y: F, z: 0 });
  const alongX = Math.abs(top.x - foot.x) > Math.abs(top.z - foot.z);
  boxes.push(alongX
    ? slope('x', foot.x, top.x, 0, F, pose.z - w, pose.z + w, 'truckRamp', rampHalf)
    : slope('z', foot.z, top.z, 0, F, pose.x - w, pose.x + w, 'truckRamp', rampHalf));
  return boxes;
}

/** Caja de carga por dentro, en el mundo: de la abertura a la pared de la cabina, del suelo de carga al techo. */
export function cargoHold(pose: TruckPose): { min: Vec3; max: Vec3 } {
  const { length: L, width: W, height: H, floor: F } = TRUCK;
  const a = truckToWorld(pose, { x: 0, y: F, z: -W / 2 }), b = truckToWorld(pose, { x: L, y: F + H, z: W / 2 });
  return {
    min: { x: Math.min(a.x, b.x), y: F, z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: F + H, z: Math.max(a.z, b.z) },
  };
}

/** Centro del suelo de carga (a ras del suelo de carga): el objetivo final del aro amarillo. */
export function cargoCenter(pose: TruckPose): Vec3 {
  return truckToWorld(pose, { x: TRUCK.length / 2, y: TRUCK.floor, z: 0 });
}
