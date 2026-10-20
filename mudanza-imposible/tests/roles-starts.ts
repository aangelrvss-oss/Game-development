// Salidas de prueba del «Patio de pruebas» para T-roles (ciclo 2): tres configuraciones distintas por posición (no
// basta con cambiar la semilla, que en cooperativa no altera nada). Las comparten `tests/roles.test.ts` y
// `scripts/roles-measure.ts`.
import { PATIO } from '../src/levels/patio';
import type { Spawn } from '../src/levels/types';

const face = (x: number, z: number) => ({ x, z });

export const ROLE_STARTS: Record<string, Spawn[]> = {
  /** Las del nivel: al oeste del patio, mirando a los objetos. */
  oeste: PATIO.spawns,
  /** En fila junto al seto sur, mirando al norte. */
  sur: [-4, -1.5, -6.5, 1].map((x) => ({ x, z: 8, facing: face(0, -1) })),
  /** Junto al pie de la rampa del camión, mirando al oeste. */
  rampa: [{ x: -1, z: -6 }, { x: -1, z: 6 }, { x: 1, z: -6 }, { x: 1, z: 6 }].map((p) => ({ ...p, facing: face(-1, 0) })),
};
