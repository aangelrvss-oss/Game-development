// Diagnóstico ciclo 2: repite en Node, paso a paso, las entradas que registró duo-instr.cjs en el navegador, sobre
// el árbol ROOT (puede ser otra versión distinta de la que se grabó). Compara el estado en cada marca con lo grabado.
// Uso: ROOT=<árbol> JSON=<duo-instr.json> [SEED=n] npx vite-node repetir.ts
import { existsSync, readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const J = JSON.parse(readFileSync(process.env.JSON!, 'utf8'));
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const DT = 1 / 60;
const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: +(process.env.SEED ?? 1) });
let guard = 0;
while (!(g.phase === 'playing' && g.time >= J.phaseAt.t - 1e-9) && guard++ < 2000) g.step(DT, [NO_INPUT, NO_INPUT]);
const marks = new Map<number, any[]>();
for (const m of J.marks) { if (!marks.has(m.n)) marks.set(m.n, []); marks.get(m.n)!.push(m); }
let maxErr = 0;
const show = (m: any) => {
  const s = g.sofaPos;
  const cs = g.carriers.map((c: any) => `(${c.pos.x.toFixed(3)},${c.pos.z.toFixed(3)} h=${c.holding ? 1 : 0})`).join(' ');
  const e = Math.max(Math.abs(s.x - m.sofa[0]), Math.abs(s.z - m.sofa[2]), Math.abs(g.sofaYaw - m.yaw));
  maxErr = Math.max(maxErr, e);
  console.log(`${m.tag.padEnd(14)} n=${String(m.n).padStart(5)} t=${g.time.toFixed(3)} yaw=${g.sofaYaw.toFixed(4)} (nav ${m.yaw.toFixed(4)}) sofa=(${s.x.toFixed(3)},${s.z.toFixed(3)}) (nav ${m.sofa[0]},${m.sofa[2]}) ${cs} err=${e.toExponential(1)}`);
};
for (const m of marks.get(0) ?? []) show(m);
J.inputs.forEach((row: number[][], i: number) => {
  g.step(DT, row.map((r) => ({ mx: r[0], mz: r[1], grab: !!r[2], turn: r[3], right: !!r[4] })));
  for (const m of marks.get(i + 1) ?? []) show(m);
});
console.log(`pasos ${J.inputs.length}, error máximo frente al navegador ${maxErr.toExponential(2)}`);
g.dispose();
