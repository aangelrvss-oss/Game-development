// qa-07: con 6 porteadores atentos el sofá vuelve a bajar y la etapa sigue en 'Arriba'.
// ¿El atasco se debe a que el piloto nunca vuelve a un punto de paso anterior? Contrafactual: si el sofá está
// abajo (y < FLOOR2 - 0.6) con wp >= 6, se reasigna wp al punto de paso de la planta baja que toca (4 o 5).
// Uso: npx vite-node scripts/audit/verif-qa/q03-retroceso.ts <porteadores> <replan:0|1> [semIni] [semFin]
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { FLOOR2 } from '../../../src/sim/level.ts';
await RAPIER.init();
const n = Number(process.argv[2] ?? 6), replan = process.argv[3] === '1';
const s0 = Number(process.argv[4] ?? 1), s1 = Number(process.argv[5] ?? 8);
const DT = 1 / 60;
let wins = 0;
for (let seed = s0; seed <= s1; seed++) {
  const g = new Game(RAPIER as any, { humans: 1, carriers: n, botStyle: 'atentos', seed });
  const ap = new Autopilot(0);
  let regressions = 0, replans = 0, wasUp = false, labelMismatch = 0;
  for (let i = 0; i < 60 * (RULES.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const p = g.sofaPos;
    if (p.y > FLOOR2 + 0.3) wasUp = true;
    if (wasUp && p.y < FLOOR2 - 0.6 && p.x < 1) { regressions++; wasUp = false; }
    if (g.stageLabel === 'Arriba' && p.y < 1.5) labelMismatch += DT;
    if (replan && ap.wp >= 6 && p.y < FLOOR2 - 0.6 && p.x < 1.4) { ap.wp = p.z > -21 ? 4 : 5; ap.lastDist = Infinity; replans++; }
    g.step(DT, [ap.input(g, DT)]);
  }
  const p = g.sofaPos;
  if (g.phase === 'won') wins++;
  console.log(`n=${n} replan=${replan} semilla ${seed}: ${g.phase}${g.loseReason ? '/' + g.loseReason : ''} t=${g.time.toFixed(1)} int=${g.integrity} etapa=${g.stageLabel} wp=${ap.wp} sofa=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) retrocesos=${regressions} reasignaciones=${replans} s_con_etiqueta_Arriba_en_planta_baja=${labelMismatch.toFixed(1)}`);
  g.dispose();
}
console.log(`VICTORIAS ${wins}/${s1 - s0 + 1}`);
