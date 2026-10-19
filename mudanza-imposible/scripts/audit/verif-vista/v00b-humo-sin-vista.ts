// Control: la misma partida sin vista (para aislar fallos del arnés).
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
await RAPIER.init();
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const aps = g.carriers.map((c) => new Autopilot(c.id));
for (let i = 0; i < 400; i++) g.step(1 / 60, aps.map((a) => a.input(g, 1 / 60)));
console.log('ok', g.phase, g.sofaPos);
