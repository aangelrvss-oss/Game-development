import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { localToWorld } from '../../../src/sim/sofa.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1/60;
for (const lift of [false, true]) {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.carriers[1].teleport({ x: -6, y: 0.7, z: 14 });
  g.step(DT, [{ ...NO_INPUT, grab: true }, NO_INPUT]); if (process.env.NOCONTACT) g.carriers[0].joint!.setContactsEnabled(false); if (process.env.NOWRIST) { (RULES as any).wristK = 0; (RULES as any).wristDamp = 0; }
  const s0 = g.sofaPos;
  for (let i = 0; i < 180; i++) {
    g.step(DT, [{ ...NO_INPUT, mz: -1, lift }, NO_INPUT]);
    if (i % 30 === 29) {
      const a = localToWorld(g.sofa, { x: 1.1, y: 0, z: 0 }), b = localToWorld(g.sofa, { x: -1.1, y: 0, z: 0 });
      console.log(`lift=${lift} t=${((i+1)*DT).toFixed(1)} dist=${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} extremo agarrado y=${a.y.toFixed(2)} extremo libre y=${b.y.toFixed(2)} up=${g.sofaUp.toFixed(2)} soloDrag=${g.soloDrag.toFixed(1)} holding=${g.carriers[0].holding}`);
    }
  }
  g.dispose();
}
