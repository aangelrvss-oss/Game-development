// Ayudas para describir niveles: cajas a partir de sus límites, rampas y regiones. Solo datos, sin Three.js.
import type { Vec3 } from '../sim/types';
import type { Box, Kind, Region } from './types';

/** Caja a partir de sus límites (en cualquier orden). */
export function span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, kind: Kind, solid = true, fade = false): Box {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)];
  [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
  [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
  return { p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], kind, solid, fade };
}

/**
 * Rampa (caja girada) cuya cara de arriba va de (`from`, `yFrom`) a (`to`, `yTo`) a lo largo del eje `axis`, con el
 * ancho de `w0` a `w1` en el otro eje horizontal. `t`: medio grosor.
 */
export function slope(axis: 'x' | 'z', from: number, to: number, yFrom: number, yTo: number, w0: number, w1: number, kind: Kind, t = 0.2): Box {
  // Dirección de la superficie con avance positivo en el eje.
  let run = to - from;
  let rise = yTo - yFrom;
  if (run < 0) { run = -run; rise = -rise; }
  const len = Math.hypot(run, rise);
  const mid = (from + to) / 2;
  const midY = (yFrom + yTo) / 2;
  if (axis === 'z') {
    // Rotación θ sobre x: el eje z local pasa a (0, -sinθ, cosθ); la normal es (0, cosθ, sinθ).
    const rx = Math.atan2(-rise, run);
    const ny = Math.cos(rx), nz = Math.sin(rx);
    return { p: [(w0 + w1) / 2, midY - ny * t, mid - nz * t], h: [(w1 - w0) / 2, t, len / 2], rx, kind, solid: true };
  }
  // Rotación φ sobre z: el eje x local pasa a (cosφ, sinφ, 0); la normal es (-sinφ, cosφ, 0).
  const rz = Math.atan2(rise, run);
  const nx = -Math.sin(rz), ny = Math.cos(rz);
  return { p: [mid - nx * t, midY - ny * t, (w0 + w1) / 2], h: [len / 2, t, (w1 - w0) / 2], rz, kind, solid: true };
}

/** ¿Está el punto dentro de la región (límites estrictos; un límite que falta no limita)? */
export function inRegion(r: Region, p: Vec3): boolean {
  const { min = {}, max = {} } = r;
  return !(
    (min.x !== undefined && !(p.x > min.x)) || (max.x !== undefined && !(p.x < max.x)) ||
    (min.y !== undefined && !(p.y > min.y)) || (max.y !== undefined && !(p.y < max.y)) ||
    (min.z !== undefined && !(p.z > min.z)) || (max.z !== undefined && !(p.z < max.z))
  );
}
