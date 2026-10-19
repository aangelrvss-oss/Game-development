// Prueba de humo del arnés: 2 jugadores con piloto, 120 fotogramas de vista.
import RAPIER from '@dimforge/rapier3d-compat';
import { headlessWorld } from './harness.ts';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
await RAPIER.init();
const view = await headlessWorld();
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
view.attach(g);
const aps = g.carriers.map((c) => new Autopilot(c.id));
for (let i = 0; i < 400; i++) { g.step(1 / 60, aps.map((a) => a.input(g, 1 / 60))); view.render(g, i / 60, 1 / 60); }
console.log('ok', view.carriers.length, view.camera.position.toArray().map((x: number) => x.toFixed(2)).join(','), g.phase, g.sofaPos);
