// Revisión independiente C1, rol F. ¿De dónde salen los pasos lentos? Envuelve en tiempo de ejecución (sin tocar el
// código del juego) los métodos de Carrier, solveHands y world.step, y desglosa los pasos de más de 2 ms.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa-b/step-profile.ts [porteadores] [estilo]
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Carrier } from '../../../../src/sim/carrier';
import { Autopilot } from '../../../../src/sim/autopilot';
await RAPIER.init({});
const DT = 1 / 60, N = Number(process.argv[2] ?? 2), STYLE = (process.argv[3] ?? 'atentos') as 'atentos';
const acc = new Map<string, number>();
const wrap = (obj: Record<string, unknown>, name: string, label = name) => {
  const f = obj[name] as (...a: unknown[]) => unknown;
  obj[name] = function (this: unknown, ...a: unknown[]) { const t0 = performance.now(); try { return f.apply(this, a); } finally { acc.set(label, (acc.get(label) ?? 0) + performance.now() - t0); } };
};
const P = Carrier.prototype as unknown as Record<string, unknown>;
for (const m of ['stepDown', 'control', 'handResult', 'balance', 'planFall', 'roomToRise', 'findRoom', 'fits', 'touchingLoad', 'touchingBody', 'tryGrabAny', 'tryGrab']) wrap(P, m);
const G = Game.prototype as unknown as Record<string, unknown>;
for (const m of ['wristAssist', 'touchesWall', 'clampLoads']) wrap(G, m);

const slow: string[] = [];
let all = 0, n = 0;
for (const seed of [1, 2, 3, 4]) {
  const g = new Game(RAPIER, { humans: 1, carriers: N, botStyle: STYLE, seed });
  const ws = g.world as unknown as Record<string, unknown>;
  wrap(ws, 'step', 'world.step');
  const ap = new Autopilot(0);
  for (let i = 0; i < 60 * 120 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const a = ap.input(g, DT);
    acc.clear();
    const t0 = performance.now();
    g.step(DT, [a]);
    const ms = performance.now() - t0;
    all += ms; n++;
    if (ms > 2) slow.push(`seed ${seed} t=${g.time.toFixed(2)} ${ms.toFixed(2)} ms: ` + [...acc].filter(([, v]) => v > 0.2).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ') + ` | caídos ${g.carriers.filter((c) => c.down).length}`);
  }
  g.dispose();
}
console.log(slow.slice(0, 25).join('\n'));
console.log(`pasos ${n}, media ${(all / n).toFixed(3)} ms, pasos > 2 ms: ${slow.length}`);
