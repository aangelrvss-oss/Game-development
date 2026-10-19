// Barrido propio de verificación (qa-01, qa-02, qa-04, qa-05).
// Uso: npx vite-node scripts/audit/verif-qa/q01-barrido.ts <humanos> <porteadores> <estilo> [semillaIni] [semillaFin]
// El piloto automático lleva a TODOS los humanos (Autopilot(i) para i < humanos), igual que la prueba de 2 jugadores.
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES, isCoop } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { STAGES } from '../../../src/sim/level.ts';
await RAPIER.init();
const humans = Number(process.argv[2] ?? 1), carriers = Number(process.argv[3] ?? 4), style = (process.argv[4] ?? 'atentos') as 'atentos' | 'despistados';
const s0 = Number(process.argv[5] ?? 1), s1 = Number(process.argv[6] ?? 8);
const DT = 1 / 60;
let wins = 0;
const lines: string[] = [];
for (let seed = s0; seed <= s1; seed++) {
  const g = new Game(RAPIER as any, { humans, carriers, botStyle: style, seed });
  const aps = Array.from({ length: humans }, (_, i) => new Autopilot(i));
  const stages: number[] = [];
  let respawns = 0, rights = 0, maxStage = 0, minZAfterArriba = Infinity;
  const tStart = performance.now();
  let steps = 0;
  for (let i = 0; i < 60 * (RULES.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(DT, aps.map((a) => a.input(g, DT)));
    steps++;
    for (const e of g.out) {
      if (e.type === 'stage') stages.push(e.index);
      if (e.type === 'respawnSofa') respawns++;
      if (e.type === 'righted') rights++;
    }
    maxStage = Math.max(maxStage, g.stage);
    if (g.stageLabel === 'Arriba') minZAfterArriba = Math.min(minZAfterArriba, g.sofaPos.y);
  }
  const ms = (performance.now() - tStart) / steps;
  const p = g.sofaPos;
  const ok = g.phase === 'won';
  if (ok) wins++;
  const orderOk = JSON.stringify(stages) === JSON.stringify(STAGES.map((_, i) => i).slice(1));
  lines.push(`semilla ${seed}: ${g.phase}${g.loseReason ? '/' + g.loseReason : ''} t=${g.time.toFixed(2)} int=${g.integrity} etapa=${g.stageLabel} wp=[${aps.map((a) => a.wp).join(',')}] sofa=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) yaw=${g.sofaYaw.toFixed(2)} agarran=${g.carriers.map((c) => (c.holding ? 1 : 0)).join('')} etapasEnOrden=${orderOk} respawns=${respawns} enderezados=${rights} ${ms.toFixed(3)}ms/paso`);
  g.dispose();
}
console.log(`== humanos=${humans} porteadores=${carriers} estilo=${style} coop=${isCoop({ humans, carriers, botStyle: style })}`);
for (const l of lines) console.log('  ' + l);
console.log(`VICTORIAS ${wins}/${s1 - s0 + 1}`);
