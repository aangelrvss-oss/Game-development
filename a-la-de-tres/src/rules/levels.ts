import type { Dir, TokenContent, Vec } from './types';

/**
 * Tableros del kit del test de papel v3 (hojas 2 y 3, y «Contenido de las fichas»).
 * Leyenda: # muro · . suelo · U bulto visible · g meta · dígito n = ficha oculta On.
 * La casilla (0,4) es a la vez meta y ficha O7. Fuera del tablero cuenta como muro (B1).
 */
export interface Level {
  id: 'A' | 'B';
  name: string;
  /** Filas por coordenada y (2..16), 9 columnas (x = 0..8). */
  rows: Record<number, string>;
  goal: Vec[];
  contents: Record<string, TokenContent>;
  start: { E2: Vec; C: Vec; E1: Vec; red: Dir };
}

const ROWS_A: Record<number, string> = {
  2: '#########',
  3: '####.4.##',
  4: '7gg6..5##',
  5: '####.3.##',
  6: '####.####',
  7: '####2####',
  8: '####1####',
  9: '####.####',
  10: '####.####',
  11: '####U####',
  12: '####.####',
  13: '####.####',
  14: '####.####',
  15: '####.####',
  16: '#########',
};

const mirror = (rows: Record<number, string>): Record<number, string> =>
  Object.fromEntries(Object.entries(rows).map(([y, s]) => [y, [...s].reverse().join('')]));

const B = 'BULTO';
const N = 'NADA';

export const LEVEL_A: Level = {
  id: 'A',
  name: 'Mudanza A · el rellano del oeste',
  rows: ROWS_A,
  goal: [
    { x: 0, y: 4 },
    { x: 1, y: 4 },
    { x: 2, y: 4 },
  ],
  contents: { O1: B, O2: N, O3: B, O4: N, O5: N, O6: B, O7: B },
  start: { E2: { x: 4, y: 13 }, C: { x: 4, y: 14 }, E1: { x: 4, y: 15 }, red: 'E' },
};

export const LEVEL_B: Level = {
  id: 'B',
  name: 'Mudanza B · el rellano del este',
  rows: mirror(ROWS_A),
  goal: [
    { x: 8, y: 4 },
    { x: 7, y: 4 },
    { x: 6, y: 4 },
  ],
  contents: { O1: N, O2: B, O3: N, O4: B, O5: N, O6: B, O7: N },
  start: { E2: { x: 4, y: 13 }, C: { x: 4, y: 14 }, E1: { x: 4, y: 15 }, red: 'E' },
};

export const LEVELS = { A: LEVEL_A, B: LEVEL_B };

export const BOARD_W = 9;
export const BOARD_Y0 = 2;
export const BOARD_Y1 = 16;

/** Carácter crudo del tablero en v; fuera del tablero es muro. */
export function rawAt(level: Level, v: Vec): string {
  const row = level.rows[v.y];
  if (!row || v.x < 0 || v.x >= row.length) return '#';
  return row[v.x];
}

export function isGoal(level: Level, v: Vec): boolean {
  return level.goal.some((g) => g.x === v.x && g.y === v.y);
}
