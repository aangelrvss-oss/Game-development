// qa-06: perf.ts corta a 3600 pasos (60 s simulados). ¿En qué fase está cada partida al cortar?
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
await RAPIER.init();
for (const n of [2, 4, 6]) {
  const g = new Game(RAPIER as any, { humans: 1, carriers: n, botStyle: 'atentos', seed: 3 });
  const ap = new Autopilot(0);
  let steps = 0;
  while ((g.phase === 'countdown' || g.phase === 'playing') && steps < 60 * 60) { g.step(1 / 60, [ap.input(g, 1 / 60)]); steps++; }
  console.log(`${n} porteadores: ${steps} pasos, fase al cortar=${g.phase}, etapa=${g.stageLabel}, t de partida=${g.time.toFixed(1)}`);
  g.dispose();
}
