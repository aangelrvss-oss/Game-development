// Revisión ciclo 1 (rol A+G): ¿hace falta cooperar? ¿qué pasa si un jugador no hace nada?
// Uso: npx vite-node scripts/audit/review-c1/director-producto/coop-necesaria.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60;

function run(label: string, humans: number, carriers: number, active: number[], seed = 1, limit = 185) {
  const g = new Game(RAPIER, { humans, carriers, botStyle: 'atentos', seed });
  const team = Autopilot.team(g).filter((a) => active.includes(g.carriers[a.carrierIndex].human!));
  let falls = 0, breaks = 0, heavyT = 0, maxStage = 0, stuckT = 0;
  const stageAt: string[] = [];
  for (let i = 0; i < 60 * limit && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const inputs: PlayerInput[] = Array.from({ length: humans }, () => NO_INPUT);
    for (const a of team) inputs[g.carriers[a.carrierIndex].human!] = a.input(g, DT);
    g.step(DT, inputs);
    for (const e of g.out) {
      if (e.type === 'fall') falls++;
      if (e.type === 'gripBreak') breaks++;
      if (e.type === 'stage') stageAt.push(`${e.label}@${g.time.toFixed(0)}s`);
    }
    if (g.heavyAlone) heavyT += DT;
    if (g.stuckTime > 1.5) stuckT += DT;
    maxStage = Math.max(maxStage, g.stage);
  }
  console.log(`${label}: ${g.phase} t=${g.time.toFixed(1)} integ=${g.integrity} etapa=${g.stageLabel} [${stageAt.join(', ')}] caídas=${falls} escapes=${breaks} aviso«Pesa mucho»=${heavyT.toFixed(1)}s atasco>1.5=${stuckT.toFixed(1)}s sofá=(${g.sofaPos.x.toFixed(1)},${g.sofaPos.y.toFixed(1)},${g.sofaPos.z.toFixed(1)})`);
  g.dispose();
}

run('2 humanos, ambos pilotos', 2, 2, [0, 1]);
run('2 humanos, solo J1 (J2 quieto)', 2, 2, [0]);
run('2 humanos, solo J2 (J1 quieto)', 2, 2, [1]);
run('3 humanos, J1 y J2 (J3 quieto)', 3, 3, [0, 1]);
run('4 humanos, J1 y J2 (J3, J4 quietos)', 4, 4, [0, 1]);
run('4 humanos, solo J1', 4, 4, [0]);
run('1 humano + 1 ayudante', 1, 2, [0]);
run('1 humano + 1 ayudante, J1 quieto', 1, 2, []);
