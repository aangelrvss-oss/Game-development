// qa-08: réplica de la prueba «soltar deja caer el sofá» (tests/sim.test.ts:56-71) midiendo lo que la prueba no mide:
// altura del sofá y del asa agarrada mientras se sostiene y después de soltar.
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { SLOTS, localToWorld, yawQuat } from '../../../src/sim/sofa.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
function place(g: Game, x: number, z: number, yaw: number, y = 0.6) {
  g.bots.clear(); g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x, y, z }, true); g.sofa.setRotation(yawQuat(yaw), true);
  g.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true); g.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
  for (const c of g.carriers) c.teleport({ x: x + 30, y: 0.7, z: z + 30 });
}
const play = (g: Game, s: number, f: () => PlayerInput[] = () => []) => { for (let i = 0; i < s * 60; i++) g.step(DT, f()); };
const g = new Game(RAPIER as any, { humans: 1, carriers: 1, botStyle: 'atentos' });
place(g, 0, 10, 0);
play(g, 1);
const me = g.carriers[0];
const a = localToWorld(g.sofa, SLOTS[0].p);
me.teleport({ x: a.x + 0.7, y: 0.7, z: a.z });
me.facing = { x: -1, z: 0 };
play(g, 0.2);
const f = (n: number) => n.toFixed(3);
const asa = () => localToWorld(g.sofa, SLOTS[0].p).y;
console.log(`antes de agarrar: centro y=${f(g.sofaPos.y)} asa y=${f(asa())}`);
play(g, DT, () => [{ ...NO_INPUT, grab: true }]);
console.log(`agarrado=${me.holding}`);
play(g, 1.5);
console.log(`tras 1,5 s sosteniendo: centro y=${f(g.sofaPos.y)} asa y=${f(asa())} vy=${f(g.sofa.linvel().y)} agarrado=${me.holding}`);
play(g, DT, () => [{ ...NO_INPUT, grab: true }]);
console.log(`soltado: agarrado=${me.holding}`);
let minVy = 0;
for (let i = 0; i < 60; i++) { g.step(DT, []); minVy = Math.min(minVy, g.sofa.linvel().y); }
console.log(`1 s después de soltar: centro y=${f(g.sofaPos.y)} asa y=${f(asa())} vy mínima=${f(minVy)}`);
g.dispose();
