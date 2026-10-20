// Diagnóstico ciclo 2: corre las mismas entradas grabadas (duo-instr.json) en dos árboles a la vez (A y B) y dice en
// qué paso se separan por primera vez, con los sucesos y el estado de cada porteador en ese paso.
// Uso: A=<árbol 657fd30> B=<árbol 23b8c66> JSON=<duo-instr.json> npx vite-node divergencia.ts
import { existsSync, readFileSync } from 'node:fs';
const J = JSON.parse(readFileSync(process.env.JSON!, 'utf8'));
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
async function make(ROOT: string) {
  const { Game } = await import(`${ROOT}/src/sim/game.ts`);
  const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
  const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
  const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
  const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  let guard = 0;
  while (!(g.phase === 'playing' && g.time >= J.phaseAt.t - 1e-9) && guard++ < 2000) g.step(1 / 60, [NO_INPUT, NO_INPUT]);
  return g;
}
const a = await make(process.env.A!), b = await make(process.env.B!);
const st = (g: any) => {
  const s = g.sofa.translation(), q = g.sofa.rotation();
  return { s: [s.x, s.y, s.z, q.x, q.y, q.z, q.w], c: g.carriers.map((c: any) => ({ p: [c.pos.x, c.pos.y, c.pos.z], h: c.holding, gl: c.grabLocal, hand: c.handWorld?.() })) };
};
const desc = (g: any) => g.carriers.map((c: any, i: number) => `J${i + 1} pos(${c.pos.x.toFixed(4)},${c.pos.y.toFixed(4)},${c.pos.z.toFixed(4)}) h=${c.holding} gl=${c.grabLocal ? `(${c.grabLocal.x.toFixed(4)},${c.grabLocal.y.toFixed(4)},${c.grabLocal.z.toFixed(4)})` : '-'}`).join(' | ');
let first = -1, firstBig = -1;
for (let i = 0; i < J.inputs.length; i++) {
  const inp = J.inputs[i].map((r: number[]) => ({ mx: r[0], mz: r[1], grab: !!r[2], turn: r[3], right: !!r[4] }));
  a.step(1 / 60, inp); b.step(1 / 60, inp);
  const A = st(a), B = st(b);
  const d = Math.max(...A.s.map((v: number, k: number) => Math.abs(v - B.s[k])), ...A.c.flatMap((c: any, k: number) => c.p.map((v: number, m: number) => Math.abs(v - B.c[k].p[m]))));
  const ga = a.out.filter((e: any) => ['grab', 'release', 'gripBreak'].includes(e.type)).map((e: any) => `${e.type} J${e.carrier + 1}`);
  const gb = b.out.filter((e: any) => ['grab', 'release', 'gripBreak'].includes(e.type)).map((e: any) => `${e.type} J${e.carrier + 1}`);
  if ((d > 0 || ga.join() !== gb.join()) && first < 0) {
    first = i + 1;
    console.log(`primera diferencia en el paso ${first} (t=${a.time.toFixed(4)}), máx ${d.toExponential(2)}; entradas ${JSON.stringify(J.inputs[i])}`);
    console.log('  sucesos A:', ga.join(', ') || '-', '| B:', gb.join(', ') || '-');
    console.log('  A:', desc(a)); console.log('  B:', desc(b));
  }
  if (d > 1e-3 && firstBig < 0) {
    firstBig = i + 1;
    console.log(`primera diferencia > 1 mm en el paso ${firstBig} (t=${a.time.toFixed(4)}), máx ${d.toExponential(2)}`);
    console.log('  A:', desc(a)); console.log('  B:', desc(b));
    break;
  }
}
if (first < 0) console.log('sin diferencias en', J.inputs.length, 'pasos');
