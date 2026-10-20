// Revisor A+G (ciclo 1): con 4 humanos, ¿aportan algo el 3.º y el 4.º? Piloto con 2, 3 o 4 activos (los demás quietos).
//   npx vite-node scripts/audit/review-c1/rol-ag-producto/cuatro-utiles.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60;
for (const active of [2, 3, 4]) {
  for (const seed of [1, 2, 3]) {
    const g = new Game(RAPIER, { humans: 4, carriers: 4, botStyle: 'atentos', seed });
    const pilots = Autopilot.team(g).filter((a) => g.carriers[a.carrierIndex].human! < active);
    let falls = 0;
    for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      const inputs: PlayerInput[] = Array.from({ length: 4 }, () => NO_INPUT);
      for (const a of pilots) inputs[g.carriers[a.carrierIndex].human!] = a.input(g, DT);
      g.step(DT, inputs);
      for (const e of g.out) if (e.type === 'fall' || e.type === 'stun') falls++;
    }
    console.log(`4 humanos, ${active} activos, semilla ${seed}: ${g.phase} en ${g.time.toFixed(1)} s, etapa «${g.stageLabel}», sofá ${Math.round(g.integrity)} %, caídas ${falls}`);
    g.dispose();
  }
}
