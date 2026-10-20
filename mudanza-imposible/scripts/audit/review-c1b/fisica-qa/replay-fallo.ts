// Revisión c1b, roles B+F. Repite una partida del lote (batch.ts) y registra lo que pasa: sueltas, «¡Se escapa!»,
// caídas, enderezados y, cada 5 s, etapa, posición del sofá y quién agarra. Sirve también en el árbol anterior.
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/replay-fallo.ts <humanos> <porteadores> <estilo> <semilla>
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
await RAPIER.init({});
const [hs, ns, style, ss] = process.argv.slice(2);
const humans = Number(hs ?? 1), n = Number(ns ?? 4), seed = Number(ss ?? 1);
const g = new Game(RAPIER, { humans, carriers: n, botStyle: (style ?? 'despistados') as 'atentos' | 'despistados', seed });
const aps: Autopilot[] = humans > 1 ? (Autopilot as any).team(g) : [new Autopilot(0)];
let last = -1;
const counts: Record<string, number> = {};
const who = (c: number) => (g.carriers[c]?.human !== null ? `J${(g.carriers[c].human ?? 0) + 1}` : `A${c}`);
for (let i = 0; i < 60 * 180 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(1 / 60, aps.map((a) => a.input(g, 1 / 60)));
  for (const e of g.out) {
    if (['gripBreak', 'fall', 'righted', 'release', 'stun', 'wobble'].includes(e.type)) {
      const k = `${e.type}${'carrier' in e ? ' ' + who((e as any).carrier) : ''}`;
      counts[k] = (counts[k] ?? 0) + 1;
      if (e.type !== 'wobble' && g.time < 400) console.log(`  ${g.time.toFixed(2)} ${e.type}${'carrier' in e ? ' ' + who((e as any).carrier) : ''} @${g.stageLabel}`);
    }
  }
  if (Math.floor(g.time / 5) !== last) {
    last = Math.floor(g.time / 5);
    const p = g.sofaPos;
    console.log(`t=${g.time.toFixed(1)} ${g.stageLabel} sofá (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}) up ${g.sofaUp.toFixed(2)} int ${g.integrity} agarran ${g.carriers.map((c) => (c.holding ? who(c.id) : '·')).join(' ')}`);
  }
}
console.log('FIN', g.phase, g.loseReason, g.time.toFixed(1), 'integridad', g.integrity, JSON.stringify(counts));
