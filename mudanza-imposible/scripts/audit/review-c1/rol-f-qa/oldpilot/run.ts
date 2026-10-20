// Revisión ciclo 1, rol F: física de HEAD con el piloto de la línea base (837dca7, sin `lift`).
// ¿Las pruebas de T-help y T-route pasan por la física o por las mejoras del piloto?
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../../../src/sim/game';
import { STAGES } from '../../../../../src/sim/level';
import { Autopilot as OldPilot } from './autopilot-base';
await RAPIER.init({});
const seeds = Array.from({ length: Number(process.argv[2] ?? 8) }, (_, i) => i + 1);
function run(humans: number, carriers: number, style: 'atentos' | 'despistados', seed: number) {
  const g = new Game(RAPIER, { humans, carriers, botStyle: style, seed });
  const aps = Array.from({ length: humans }, (_, i) => new OldPilot(i));
  const stages: number[] = [];
  for (let i = 0; i < 60 * (RULES.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(1 / 60, aps.map((a) => a.input(g, 1 / 60)));
    for (const e of g.out) if (e.type === 'stage') stages.push(e.index);
  }
  const ok = g.phase === 'won' && JSON.stringify(stages) === JSON.stringify(STAGES.map((_, i) => i).slice(1));
  const r = `${g.phase === 'won' ? 'G' : g.loseReason}${g.time.toFixed(0)}/${g.integrity}${g.phase === 'won' ? '' : '@' + g.stageLabel}`;
  g.dispose();
  return { ok, r };
}
for (const [h, c, s] of [[1, 2, 'atentos'], [1, 4, 'atentos'], [1, 4, 'despistados'], [1, 6, 'despistados'], [2, 2, 'atentos'], [3, 3, 'atentos'], [4, 4, 'atentos']] as const) {
  const rs = seeds.map((sd) => run(h, c, s, sd));
  console.log(`piloto base, física HEAD: ${h}h/${c} ${s}: ${rs.filter((r) => r.ok).length}/${rs.length}  ${rs.map((r) => r.r).join(' ')}`);
}
