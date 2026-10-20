// Revisión independiente ciclo 1, rol F (QA). Lotes de partidas con el piloto: ayudantes, N humanos y mixtas.
// Mide victorias, tiempo, caídas, sueltas, NaN y coste por paso (media, p99, máximo).
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa/batch.ts [helpers|team|mixed|all] [seeds]
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
await RAPIER.init({});
const mode = process.argv[2] ?? 'all';
const nSeeds = Number(process.argv[3] ?? 8);
const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
const hasTeam = typeof (Autopilot as any).team === 'function';

type Cfg = { humans: number; carriers: number; style: 'atentos' | 'despistados' };
function run(cfg: Cfg, seed: number) {
  const g = new Game(RAPIER, { humans: cfg.humans, carriers: cfg.carriers, botStyle: cfg.style, seed });
  const aps: Autopilot[] = cfg.humans > 1 && hasTeam ? (Autopilot as any).team(g) : [new Autopilot(0)];
  let falls = 0, rel = 0, rights = 0, stuns = 0, nan = false, maxSofaV = 0;
  const times: number[] = [];
  for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const inputs = aps.map((a) => a.input(g, 1 / 60));
    const t0 = performance.now();
    g.step(1 / 60, inputs);
    times.push(performance.now() - t0);
    for (const e of g.out) {
      if (e.type === 'fall') falls++;
      if (e.type === 'stun') stuns++;
      if (e.type === 'gripBreak' || e.type === 'release') rel++;
      if (e.type === 'righted') rights++;
    }
    const p = g.sofaPos, v = g.sofa.linvel();
    maxSofaV = Math.max(maxSofaV, Math.hypot(v.x, v.y, v.z));
    if (!Number.isFinite(p.x + p.y + p.z) || g.carriers.some((c) => !Number.isFinite(c.pos.x + c.pos.y + c.pos.z))) nan = true;
  }
  times.sort((a, b) => a - b);
  const r = {
    won: g.phase === 'won', time: g.time, integrity: g.integrity, stage: g.stageLabel, lose: g.loseReason,
    falls, stuns, rel, rights, nan, maxSofaV,
    mean: times.reduce((a, b) => a + b, 0) / times.length, p99: times[Math.floor(times.length * 0.99)], max: times[times.length - 1],
  };
  g.dispose();
  return r;
}

function batch(label: string, cfgs: Cfg[]) {
  console.log(`== ${label}`);
  let W = 0, N = 0, worstMax = 0, worstP99 = 0;
  for (const cfg of cfgs) {
    const rs = seeds.map((s) => run(cfg, s));
    const w = rs.filter((r) => r.won).length;
    W += w; N += rs.length;
    worstMax = Math.max(worstMax, ...rs.map((r) => r.max));
    worstP99 = Math.max(worstP99, ...rs.map((r) => r.p99));
    const avg = (f: (r: (typeof rs)[0]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
    console.log(`${cfg.humans}h+${cfg.carriers - cfg.humans}b ${cfg.style}: ${w}/${rs.length} t̄=${avg((r) => r.time)} int̄=${avg((r) => r.integrity)} caídas̄=${avg((r) => r.falls)} stun̄=${avg((r) => r.stuns)} sueltā=${avg((r) => r.rel)} enderezā=${avg((r) => r.rights)} nan=${rs.some((r) => r.nan)} vmax=${Math.max(...rs.map((r) => r.maxSofaV)).toFixed(1)} ms(media ${avg((r) => r.mean * 1000)}µs p99max ${Math.max(...rs.map((r) => r.p99)).toFixed(2)} max ${Math.max(...rs.map((r) => r.max)).toFixed(2)})`);
    for (const [i, r] of rs.entries()) if (!r.won) console.log(`   semilla ${seeds[i]}: ${r.lose} @${r.stage} t=${r.time.toFixed(1)} int=${r.integrity} caídas ${r.falls}`);
  }
  console.log(`TOTAL ${label}: ${W}/${N}; peor p99 ${worstP99.toFixed(2)} ms, peor paso ${worstMax.toFixed(2)} ms`);
}

if (mode === 'helpers' || mode === 'all') {
  const cfgs: Cfg[] = [];
  for (const style of ['atentos', 'despistados'] as const) for (const c of [2, 3, 4, 5, 6]) cfgs.push({ humans: 1, carriers: c, style });
  batch('1 humano con ayudantes', cfgs);
}
if (mode === 'team' || mode === 'all') batch('N humanos sin ayudantes', [2, 3, 4].map((n) => ({ humans: n, carriers: n, style: 'atentos' as const })));
if (mode === 'mixed' || mode === 'all') batch('humanos + ayudantes', [
  { humans: 2, carriers: 3, style: 'atentos' }, { humans: 2, carriers: 4, style: 'atentos' }, { humans: 2, carriers: 4, style: 'despistados' },
  { humans: 3, carriers: 4, style: 'atentos' }, { humans: 3, carriers: 6, style: 'despistados' }, { humans: 4, carriers: 6, style: 'atentos' }, { humans: 4, carriers: 6, style: 'despistados' },
]);
