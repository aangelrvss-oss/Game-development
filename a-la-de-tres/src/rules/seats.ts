import type { PartId } from './types';

/** B4: diez asas. Lado de cada asa respecto a su parte. */
export type Handle = 'punta-a' | 'punta-b' | 'rojo' | 'azul';

export interface SeatDef {
  id: number;
  part: PartId;
  handle: Handle;
}

export const SEATS: SeatDef[] = [
  { id: 1, part: 'E1', handle: 'punta-a' },
  { id: 2, part: 'E1', handle: 'punta-b' },
  { id: 3, part: 'E1', handle: 'rojo' },
  { id: 4, part: 'E1', handle: 'azul' },
  { id: 5, part: 'C', handle: 'rojo' },
  { id: 6, part: 'C', handle: 'azul' },
  { id: 7, part: 'E2', handle: 'rojo' },
  { id: 8, part: 'E2', handle: 'azul' },
  { id: 9, part: 'E2', handle: 'punta-a' },
  { id: 10, part: 'E2', handle: 'punta-b' },
];

export const seatDef = (id: number): SeatDef => {
  const s = SEATS.find((d) => d.id === id);
  if (!s) throw new Error(`Asiento inexistente: ${id}`);
  return s;
};

/**
 * Asas ocupadas según el número de jugadores.
 *
 * Fuente: tabla «Escalabilidad de 4 a 10 jugadores» del diseño v3 (reparto E1/C/E2 y
 * «asientos sin información propia», prioridad a los lados rojos). La tabla da el reparto
 * por parte, no la lista de asas; esta lista es la única que encaja con las dos columnas.
 * Con 6 y 8 coincide con los casos B y A del kit del test de papel. Ver docs/AMBIGUEDADES.md.
 */
export const SEATS_BY_COUNT: Record<number, number[]> = {
  4: [1, 5, 6, 9],
  5: [1, 5, 6, 7, 9],
  6: [1, 3, 5, 6, 7, 9],
  7: [1, 3, 4, 5, 6, 7, 9],
  8: [1, 3, 4, 5, 6, 7, 8, 9],
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};

export function seatLabel(id: number): string {
  const s = seatDef(id);
  const h = s.handle.startsWith('punta') ? s.handle : `lado ${s.handle}`;
  return `${s.part} · ${h}`;
}
