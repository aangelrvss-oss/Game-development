// Revisión c1b, roles B+F. Lote de partidas con el piloto en configuraciones concretas y semillas a elegir.
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/lote.ts <semilla0> <semilla1> h:n:estilo [h:n:estilo ...]
// Ejemplo: ... lote.ts 17 48 1:4:despistados 3:6:despistados
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
await RAPIER.init({});
const [a, b, ...cfgs] = process.argv.slice(2);
let W = 0, N = 0;
for (const cfg of cfgs) {
  const [h, n, style] = cfg.split(':');
  const humans = Number(h), carriers = Number(n);
  let w = 0, gbs = 0, falls = 0, tsum = 0;
  const lost: string[] = [], times: string[] = [];
  for (let seed = Number(a); seed <= Number(b); seed++) {
    const g = new Game(RAPIER, { humans, carriers, botStyle: style as 'atentos' | 'despistados', seed });
    const aps: Autopilot[] = humans > 1 ? (Autopilot as any).team(g) : [new Autopilot(0)];
    for (let i = 0; i < 60 * 180 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(1 / 60, aps.map((p) => p.input(g, 1 / 60)));
      for (const e of g.out) { if (e.type === 'gripBreak') gbs++; if (e.type === 'fall') falls++; }
    }
    times.push(`s${seed}:${g.time.toFixed(0)}`);
    if (g.phase === 'won') { w++; tsum += g.time; } else lost.push(`s${seed}:${g.loseReason}@${g.stageLabel}/int${g.integrity}`);
    N++;
    g.dispose();
  }
  W += w;
  const k = Number(b) - Number(a) + 1;
  console.log(`${h}h+${carriers - humans}b ${style} semillas ${a}–${b}: ${w}/${k} ganadas; t̄ ganadas ${(tsum / Math.max(1, w)).toFixed(1)} s; escapes/partida ${(gbs / k).toFixed(2)}; caídas/partida ${(falls / k).toFixed(2)}${lost.length ? ' | perdidas: ' + lost.join(' ') : ''}${process.env.TIEMPOS ? ' | ' + times.join(' ') : ''}`);
}
console.log(`TOTAL ${W}/${N}`);
