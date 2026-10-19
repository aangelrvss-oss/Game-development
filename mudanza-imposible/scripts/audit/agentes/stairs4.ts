import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
await RAPIER.init();
const DT = 1/60;
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const aps = [new Autopilot(0), new Autopilot(1)];
for (let i = 0; i < 60 * 30 && g.phase !== 'won'; i++) {
  const inputs = aps.map((a) => ({ ...a.input(g, DT), lift: false }));
  g.step(DT, inputs);
  if (g.time > 17.8 && g.time < 21.6 && i % 6 === 0) {
    const s = g.sofaPos;
    console.log(`t=${g.time.toFixed(2)} sofa y=${s.y.toFixed(2)} z=${s.z.toFixed(2)} x=${s.x.toFixed(2)} yaw=${g.sofaYaw.toFixed(2)} up=${g.sofaUp.toFixed(3)} ` + g.carriers.map((c, k) => `C${k}[y=${c.pos.y.toFixed(2)} z=${c.pos.z.toFixed(2)} gr=${c.grounded?1:0} in=(${inputs[k].mx.toFixed(2)},${inputs[k].mz.toFixed(2)},t${inputs[k].turn}) wp=${aps[k].wp} wig=${aps[k].wiggle.toFixed(2)} st=${aps[k].stuck.toFixed(1)}]`).join(' '));
  }
}
