import RAPIER from '@dimforge/rapier3d-compat';
import { CALLE } from '../src/levels/calle';
import { Game } from '../src/sim/game';
import { Autopilot } from '../src/sim/autopilot';
await RAPIER.init();
for (const n of [2, 4, 6]) {
  const g = new Game(RAPIER, { level: CALLE, humans: 1, carriers: n, botStyle: 'atentos', seed: 3 });
  const ap = new Autopilot(0);
  let steps = 0; const t0 = performance.now();
  while ((g.phase === 'countdown' || g.phase === 'playing') && steps < 60 * 60) { g.step(1 / 60, [ap.input(g, 1 / 60)]); steps++; }
  const ms = (performance.now() - t0) / steps;
  console.log(`${n} porteadores: ${ms.toFixed(3)} ms por paso de simulación (${steps} pasos, presupuesto 16,7 ms por fotograma)`);
  g.dispose();
}
