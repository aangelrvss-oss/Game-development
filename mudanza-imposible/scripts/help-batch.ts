// Modo con ayudantes: el piloto automático (J1) con 2, 3, 4 y 6 porteadores, atentos y despistados, semillas 1–8.
// Victoria (G), tiempo agotado (T) o roto (R), segundos/integridad, etapa si no gana, caídas (c), sueltas (s) y
// enderezados (e). Uso: npx tsx scripts/help-batch.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../src/sim/game';
import { Autopilot } from '../src/sim/autopilot';
await RAPIER.init({});
const configs: [number, 'atentos' | 'despistados'][] = [[2, 'atentos'], [3, 'atentos'], [4, 'atentos'], [4, 'despistados'], [6, 'despistados']];
const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
let total = 0, wins = 0;
for (const [n, style] of configs) {
  const res: string[] = []; let w = 0;
  for (const seed of seeds) {
    const g = new Game(RAPIER, { humans: 1, carriers: n, botStyle: style, seed });
    const ap = new Autopilot(0);
    let falls = 0, rel = 0, rights = 0;
    for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(1 / 60, [ap.input(g, 1 / 60)]);
      for (const e of g.out) { if (e.type === 'fall') falls++; if (e.type === 'gripBreak' || e.type === 'release') rel++; if (e.type === 'righted') rights++; }
    }
    if (g.phase === 'won') w++;
    res.push(`${g.phase === 'won' ? 'G' : g.loseReason === 'time' ? 'T' : 'R'}${g.time.toFixed(0)}/${g.integrity}${g.phase === 'won' ? '' : '@' + g.stageLabel}(c${falls},s${rel},e${rights})`);
    g.dispose();
  }
  total += seeds.length; wins += w;
  console.log(`${n} ${style}: ${w}/${seeds.length}  ${res.join(' ')}`);
}
console.log(`TOTAL ${wins}/${total}`);
