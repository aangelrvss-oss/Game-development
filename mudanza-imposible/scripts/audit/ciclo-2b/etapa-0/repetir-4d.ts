// Ciclo 2b, etapa 0: repite en Node, paso a paso, la parte A de una ejecución de duo-e2e grabada con
// grabador-fotogramas.cjs (rec.jsonl), sobre el árbol ROOT (la misma versión o la otra: repetición cruzada).
// Usa la semilla grabada y las entradas de cada paso. Dice si los sucesos coinciden con los del navegador, el error
// máximo de posición y, en el paso 4d (la suelta de J2 seguida de tambaleo en el navegador), lo que pasa en Node:
// tensión sostenida de J2, giro del tirón, inclinación máxima, sucesos de J2 en 1,5 s y si le atropella un coche.
// Con CORTE=n (pasos) repite solo hasta n pasos antes de la suelta y, desde ahí, sustituye las entradas por las de una
// variante (VAR): «grabada» (las mismas), «sin-teclas-tras-soltar» (J2 suelta las flechas al soltar el sofá).
// Con GRIP2="y,z", J2 agarra en su último agarre antes del 4d ese punto local de su extremo (el resto, igual).
// Uso: ROOT=<árbol> REC=<carpeta con rec.jsonl> [VAR=grabada] [GRIP2=y,z] npx vite-node repetir-4d.ts
import { readFileSync, existsSync } from 'node:fs';
const ROOT = process.env.ROOT!, REC = process.env.REC!, VAR = process.env.VAR ?? 'grabada';
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { CARRIER } = await import(`${ROOT}/src/sim/carrier.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const level = existsSync(`${ROOT}/src/levels/calle.ts`) ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
// Filas: [partida, paso, ms, fotograma, fase, t, cuenta atrás, entradas, sx, sy, sz, giro, porteadores, sucesos]
let load = 0;
const rows: any[] = [];
for (const l of readFileSync(`${REC}/rec.jsonl`, 'utf8').trim().split('\n')) {
  let chunk: any[];
  try { chunk = JSON.parse(l); } catch { continue; }
  for (const r of chunk) { if (r[1] === 0 && r[0] === 1) load++; rows.push([`${load}:${r[0]}`, ...r.slice(1)]); }
}
const heads = new Map(rows.filter((r) => r[1] === 0).map((r) => [r[0], r]));
const byGame = new Map<string, any[]>();
for (const r of rows) if (r[1] > 0) { if (!byGame.has(r[0])) byGame.set(r[0], []); byGame.get(r[0])!.push(r); }
const realFrames = (S: any[]) => { const c = new Map<number, number>(); for (const r of S) if (r[4] === 'p') c.set(r[3], (c.get(r[3]) ?? 0) + 1); return c.size > 0 && Math.max(...c.values()) <= 5; };
const gid = [...byGame.keys()].filter((g) => heads.get(g)?.[6] > 0 && realFrames(byGame.get(g)!))
  .sort((a, b) => byGame.get(b)!.length - byGame.get(a)!.length)[0];
const head = heads.get(gid)!, steps = byGame.get(gid)!, seed = head[7];
const before = steps[0][4] === 'c' ? Math.round((RULES.countdown - steps[0][6]) * 60) - 1 : 0;
// Suelta de J2 seguida de tambaleo en el navegador
let kRel = -1;
for (let k = 0; k < steps.length; k++) if (steps[k][13].includes('r1') && steps.slice(k, k + 20).some((r) => r[13].includes('w1'))) kRel = k;
const toIn = (x: number[]) => ({ mx: x[0], mz: x[1], grab: !!x[2], turn: x[3], right: !!x[4] });
// GRIP2="y,z": en el último agarre de J2 antes de la suelta del paso 4d, J2 agarra ese punto local en vez del grabado
const GRIP2 = process.env.GRIP2 ? process.env.GRIP2.split(',').map(Number) : null;
let kGrab2 = -1;
if (GRIP2) for (let k = 0; k < kRel; k++) if (steps[k][13].includes('g1')) kGrab2 = k;
const g = new Game(RAPIER, { ...level, humans: head[6], carriers: head[5], botStyle: 'atentos', seed });
for (let i = 0; i < before; i++) g.step(1 / 60, Array(head[6]).fill(NO_INPUT));
let evOk = true, maxErr = 0, firstBad = -1;
const out: string[] = [];
const c2 = g.carriers[1] as any;
let pre: any = null, maxLean = 0, wob = false, fell = false, stun: number[] | null = null, tRel = 0;
const end = kRel >= 0 ? Math.min(steps.length, kRel + 91) : steps.length;
for (let k = 0; k < end; k++) {
  const r = steps[k];
  let ins = r[7].map(toIn);
  if (kRel >= 0 && k > kRel && VAR === 'sin-teclas-tras-soltar') ins = [ins[0], { ...NO_INPUT }];
  if (k === kRel) {
    const fe = c2.forceExp, mass = c2.body.mass();
    pre = { tension: +Math.hypot(fe.x, fe.z).toFixed(0), kick: +((CARRIER.releaseKick * Math.hypot(fe.x, fe.z)) / (mass * CARRIER.comHeight)).toFixed(2), yaw: +g.sofaYaw.toFixed(3), sofa: [+g.sofaPos.x.toFixed(2), +g.sofaPos.z.toFixed(2)], J2: [+c2.pos.x.toFixed(2), +c2.pos.z.toFixed(2)], inputs: r[7] };
    tRel = g.time;
  }
  g.step(1 / 60, ins);
  if (GRIP2 && kGrab2 === k) {
    // Variante: J2, en el mismo agarre del navegador, agarra otro punto (local y, z) de su extremo
    const { localToWorld } = await import(`${ROOT}/src/sim/sofa.ts`);
    const gl0 = c2.grabLocal; c2.release(true); c2.grab(g.sofa, localToWorld(g.sofa, { x: gl0.x, y: GRIP2[0], z: GRIP2[1] }));
    // GRIP1="y,z": en ese mismo paso, también J1 (que ya agarraba) pasa a ese punto de su extremo
    if (process.env.GRIP1) { const c1 = g.carriers[0] as any, q = process.env.GRIP1.split(',').map(Number), gl1 = c1.grabLocal; c1.release(true); c1.grab(g.sofa, localToWorld(g.sofa, { x: gl1.x, y: q[0], z: q[1] })); }
  }
  const ev = g.out.filter((e: any) => ['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)).map((e: any) => e.type[0] + e.carrier);
  if (VAR === 'grabada' && ev.join() !== r[13].join()) { if (evOk) firstBad = k; evOk = false; }
  if (VAR === 'grabada') {
    const s = g.sofa.translation();
    maxErr = Math.max(maxErr, Math.abs(s.x - r[8]), Math.abs(s.z - r[10]), ...g.carriers.map((c: any, i: number) => Math.abs(c.pos.x - r[12][i][0]) + Math.abs(c.pos.z - r[12][i][1])));
  }
  if (kRel >= 0 && k >= kRel) {
    maxLean = Math.max(maxLean, Math.hypot(c2.lean.x, c2.lean.z));
    if (c2.wobbling) wob = true;
    if (c2.stunned > 0 && c2.knock === 'balance') fell = true;
    if (c2.stunned > 0 && c2.knock === 'car' && !stun) stun = [+(g.time - tRel).toFixed(2), +c2.pos.x.toFixed(2), +c2.pos.z.toFixed(2)];
    for (const e of ev) out.push(`${(g.time - tRel).toFixed(2)} ${e}`);
  }
}
const browser = kRel >= 0 ? steps.slice(kRel, end).flatMap((r: any) => r[13].map((e: string) => `${(r[5] - steps[kRel][5] + 1 / 60).toFixed(2)} ${e}`)) : [];
console.log(JSON.stringify({ rec: REC.split('/').pop(), root: ROOT.split('/').slice(-2, -1)[0], var: VAR, grip2: GRIP2, seed, before, steps: end, evOk, firstBad, maxErr: +maxErr.toExponential(2), soltar: kRel >= 0 ? { pre, wob, fell, stun, maxLean: +maxLean.toFixed(2), sucesosNode: out, sucesosNavegador: browser } : null }));
g.dispose?.();
