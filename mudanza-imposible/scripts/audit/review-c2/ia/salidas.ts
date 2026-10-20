// Salidas alternativas del «Patio de pruebas» para poner a prueba T-roles con posiciones distintas de las de
// tests/roles-starts.ts (oeste, sur, rampa). Revisión independiente del ciclo 2 (dimensión IA y modos).
import { PATIO } from '../../../../src/levels/patio';
const f = (x: number, z: number) => ({ x, z });
export const STARTS: Record<string, { x: number; z: number; facing: { x: number; z: number } }[]> = {
  /** Espejo de «sur»: en fila junto al seto norte, mirando al sur. */
  norte: [-4, -1.5, -6.5, 1, -9, 3.5].map((x) => ({ x, z: -8, facing: f(0, 1) })),
  /** Las del nivel en orden inverso (el reparto elige por cercanía: cambia quién va a qué). */
  oesteInv: [...PATIO.spawns.slice(0, 4)].reverse().concat(PATIO.spawns.slice(4)),
  /** Apiñados en la esquina noroeste. */
  esquinaNO: [{ x: -14, z: -8 }, { x: -13, z: -8 }, { x: -14, z: -7 }, { x: -13, z: -7 }, { x: -12, z: -8 }, { x: -12, z: -7 }].map((p) => ({ ...p, facing: f(1, 0) })),
  /** Repartidos en las cuatro esquinas (dos detrás del camión). */
  esquinas: [{ x: -14, z: -8 }, { x: 14, z: 8 }, { x: -14, z: 8 }, { x: 14, z: -8 }, { x: 0, z: -8 }, { x: 0, z: 8 }].map((p) => ({ ...p, facing: f(-Math.sign(p.x), 0) })),
  /** Al sur del camión, junto a él (lejos de los objetos). */
  camionSur: [{ x: 4, z: 7 }, { x: 6, z: 7 }, { x: 8, z: 7 }, { x: 10, z: 7 }, { x: 5, z: 8.5 }, { x: 9, z: 8.5 }].map((p) => ({ ...p, facing: f(-1, 0) })),
};
