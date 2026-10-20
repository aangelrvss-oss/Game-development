import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../src/sim/game';
import { SLOTS, localToWorld } from '../src/sim/sofa';
await RAPIER.init();
let breaks = 0, runs = 0;
for (let seed = 1; seed <= 12; seed++) for (const n of [3, 4, 6]) {
  const g = new Game(RAPIER, { humans: 1, carriers: n, botStyle: 'atentos', seed });
  const me = g.carriers[0];
  let grabbed = false;
  for (let i = 0; i < 60 * 8; i++) {
    let inp = { mx: 0, mz: 0, grab: false, turn: 0 as const, right: false };
    if (g.phase === 'playing' && !grabbed) {
      // Camina hacia el asa +x y agarra
      const a = localToWorld(g.sofa, SLOTS[0].p);
      const dx = a.x + 0.7 - me.pos.x, dz = a.z - me.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.3) inp = { ...inp, mx: dx / d, mz: dz / d };
      else { me.facing = { x: -1, z: 0 }; inp = { ...inp, grab: true }; }
    }
    g.step(1 / 60, [inp]);
    if (me.holding) grabbed = true;
    for (const e of g.out) if (e.type === 'gripBreak' && e.carrier === 0) breaks++;
  }
  runs++;
  if (!me.holding) console.log('suelto al final', seed, n);
  g.dispose();
}
console.log('roturas de agarre de J1 quieto:', breaks, 'en', runs, 'partidas');
