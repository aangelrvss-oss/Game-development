// Tipos básicos de las reglas v3 (B1–B17). Este módulo no depende del render ni de la UI.

export type Dir = 'N' | 'S' | 'E' | 'O';
/** Carta jugada. `null` es NADA: no puso carta antes de la señal (B6). */
export type Card = Dir | 'A' | null;
export type PartId = 'E1' | 'C' | 'E2';
export type PartStatus = 'ALZADA' | 'PLANA' | 'INCLINADA';
export type TokenContent = 'BULTO' | 'NADA';

export interface Vec {
  x: number;
  y: number;
}

export const DIRS: Dir[] = ['N', 'S', 'E', 'O'];
export const PARTS: PartId[] = ['E1', 'C', 'E2'];

/** y crece hacia el sur, x hacia el este (como en los tableros impresos). */
export const DV: Record<Dir, Vec> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  O: { x: -1, y: 0 },
};

export const OPP: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'O', O: 'E' };

export const DIR_NAME: Record<Dir, string> = { N: 'norte', S: 'sur', E: 'este', O: 'oeste' };

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const eq = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;
export const key = (v: Vec): string => `${v.x},${v.y}`;

export function dirOf(v: Vec): Dir {
  for (const d of DIRS) if (DV[d].x === v.x && DV[d].y === v.y) return d;
  throw new Error(`No es una dirección unitaria: ${key(v)}`);
}

/** Gira 90° en sentido horario en pantalla (N→E→S→O), con y hacia el sur. */
export const rotCW = (v: Vec): Vec => ({ x: -v.y, y: v.x });
export const rotCCW = (v: Vec): Vec => ({ x: v.y, y: -v.x });

/** B3: el sofá ocupa tres casillas en línea y tiene un lado rojo y uno azul. */
export interface Sofa {
  E1: Vec;
  C: Vec;
  E2: Vec;
  /** Dirección hacia la que mira el lado rojo. El azul mira a la contraria. */
  red: Dir;
}

export function axisOf(s: Sofa): Dir {
  return dirOf(sub(s.E2, s.C));
}

/** «De costado» (B10): perpendicular al eje del sofá. */
export function isSideways(s: Sofa, d: Dir): boolean {
  const a = DV[axisOf(s)];
  const v = DV[d];
  return a.x * v.x + a.y * v.y === 0;
}
