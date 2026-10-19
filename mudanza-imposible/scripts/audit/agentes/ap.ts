import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { ROUTE } from '../../../src/sim/level.ts';
await RAPIER.init();
const DT = 1/60;
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const aps = [new Autopilot(0), new Autopilot(1)];
let prevWig = 0, prevWp = 0;
for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(DT, aps.map((a) => a.input(g, DT)));
  const a = aps[0];
  if (a.wp !== prevWp) { console.log(`t=${g.time.toFixed(2)} wp -> ${a.wp} (${ROUTE[a.wp].label}) lastDist=${a.lastDist.toFixed(2)}`); prevWp = a.wp; }
  if (a.wiggle > 0 && prevWig <= 0) console.log(`t=${g.time.toFixed(2)}   WIGGLE (retrocede 1 s) wp=${a.wp} sofa z=${g.sofaPos.z.toFixed(2)}`);
  prevWig = a.wiggle;
}
console.log('FIN', g.phase, g.time.toFixed(1));
