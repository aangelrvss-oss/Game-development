// Simulación sin interfaz con el piloto automático: imprime el progreso.
import RAPIER from '@dimforge/rapier3d-compat';
import { CALLE } from '../src/levels/calle';
import { Game } from '../src/sim/game';
import { Autopilot } from '../src/sim/autopilot';
await RAPIER.init();
const carriers = Number(process.argv[2] ?? 4), style = (process.argv[3] ?? 'atentos') as any, seed = Number(process.argv[4] ?? 1);
const g = new Game(RAPIER, { level: CALLE, humans: 1, carriers, botStyle: style, seed });
const ap = new Autopilot(0);
const dt = 1 / 60;
let lastLog = -1;
for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(dt, [ap.input(g, dt)]);
  for (const e of g.out) if (!['grab', 'honk', 'light'].includes(e.type)) console.log(g.time.toFixed(1), JSON.stringify(e).slice(0, 140));
  if (Math.floor(g.time / 5) !== lastLog) {
    lastLog = Math.floor(g.time / 5);
    const p = g.sofaPos;
    console.log(`t=${g.time.toFixed(1)} wp=${ap.wp} stage=${g.stageLabel} sofa=(${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)}) yaw=${g.sofaYaw.toFixed(2)} up=${g.sofaUp.toFixed(2)} int=${g.integrity} holding=${g.carriers.map(c => c.holding ? 1 : 0).join('')}`);
  }
}
console.log('FIN', g.phase, g.loseReason, 'tiempo', g.time.toFixed(1), 'integridad', g.integrity);
