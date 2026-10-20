// Registro de niveles y selección por la url (`?nivel=calle`, por defecto, o `?nivel=pruebas`).
import { CALLE } from './calle';
import { PATIO } from './patio';
import type { LevelDef } from './types';

export type { LevelDef } from './types';

/** Niveles por el nombre con el que se piden en la url. */
export const LEVELS: Record<string, LevelDef> = {
  calle: CALLE,
  pruebas: PATIO,
};

/** Nivel pedido con `?nivel=`; sin él, o si no existe, «La calle» (el nivel de referencia). */
export function levelFromParam(p: string | null | undefined): LevelDef {
  const k = p?.toLowerCase();
  return k && Object.hasOwn(LEVELS, k) ? LEVELS[k] : CALLE;
}
