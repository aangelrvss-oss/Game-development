// Diagnóstico ciclo 2: repite en Node una partida grabada por grabador-pasivo.cjs (rec.jsonl) sobre el árbol ROOT.
// Prueba como semilla cada candidato grabado (Math.random antes de crear la partida) y se queda con el que reproduce los
// sucesos del navegador. Imprime la semilla, si coincide todo (sucesos y estado) y los sucesos de agarre.
// Uso: ROOT=<árbol> REC=<carpeta con rec.jsonl> [GAME=<id>] [SEED=n] npx vite-node repetir-rec.ts
import { existsSync, readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const rows: any[] = readFileSync(`${process.env.REC}/rec.jsonl`, 'utf8').trim().split('\n').flatMap((l) => { try { return JSON.parse(l); } catch { return []; } });
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const ids = [...new Set(rows.map((r) => r[0]))];
const gid = process.env.GAME ? +process.env.GAME : ids.reduce((a, b) => (rows.filter((r) => r[0] === b && r[1] > 0).length > rows.filter((r) => r[0] === a && r[1] > 0).length ? b : a));
const seedRow = rows.find((r) => r[0] === gid && r[3] === 'seed');
const steps = rows.filter((r) => r[0] === gid && r[1] > 0);
const C = seedRow ? seedRow[4] : steps[0][11].length, H = seedRow ? seedRow[5] : steps[0][6].length;
const cands: number[] = process.env.SEED ? [+process.env.SEED] : seedRow ? [...seedRow[6]].reverse().map((v: number) => Math.floor(v * 1e9)) : [1];
// Pasos dados antes de envolver step: los que faltan para la cuenta atrás que se grabó tras el primer paso envuelto
const before = steps[0][3] === 'c' ? Math.round((RULES.countdown - steps[0][5]) * 60) - 1 : 0;
function run(seed: number, verbose = false) {
  const g = new Game(RAPIER, { ...level, humans: H, carriers: C, botStyle: 'atentos', seed });
  for (let i = 0; i < before; i++) g.step(1 / 60, Array(H).fill(NO_INPUT));
  let maxErr = 0, evOk = true; const evs: string[] = [];
  for (const r of steps) {
    g.step(1 / 60, r[6].map((x: number[]) => ({ mx: x[0], mz: x[1], grab: !!x[2], turn: x[3], right: !!x[4] })));
    const ev = g.out.filter((e: any) => ['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)).map((e: any) => e.type[0] + e.carrier);
    if (ev.join() !== r[12].join()) evOk = false;
    if (ev.length) evs.push(`${r[1]}:${g.time.toFixed(2)}:${ev.join('+')}`);
    const s = g.sofa.translation();
    maxErr = Math.max(maxErr, Math.abs(s.x - r[7]), Math.abs(s.z - r[9]), ...g.carriers.map((c: any, k: number) => Math.abs(c.pos.x - r[11][k][0]) + Math.abs(c.pos.z - r[11][k][1])));
  }
  g.dispose();
  return { seed, evOk, maxErr, evs };
}
for (const s of cands) {
  const r = run(s);
  if (r.evOk && r.maxErr < 2e-3 || process.env.SEED) { console.log(`partida ${gid} (${H} humanos, ${C} porteadores), pasos previos ${before}, semilla ${s}: sucesos iguales ${r.evOk}, error máx ${r.maxErr.toExponential(2)}`); console.log('sucesos (paso:t:tipo+porteador):', r.evs.slice(0, 40).join(' ')); process.exit(0); }
}
console.log('ningún candidato reproduce la partida', gid, cands.length);
