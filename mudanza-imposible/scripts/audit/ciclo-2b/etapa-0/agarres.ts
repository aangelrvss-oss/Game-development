// Ciclo 2b, etapa 0: repite en Node la parte A de una ejecución grabada (grabador-fotogramas.cjs) y lista cada agarre
// (porteador, t, punto local agarrado del sofá y hacia dónde miraba) y, en el paso 4d, la tensión de J2 al soltar.
// Uso: ROOT=<árbol> REC=<carpeta con rec.jsonl> npx vite-node agarres.ts
import { readFileSync, existsSync } from 'node:fs';
const ROOT = process.env.ROOT!, REC = process.env.REC!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default; await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const level = existsSync(`${ROOT}/src/levels/calle.ts`) ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
let load = 0; const rows: any[] = [];
for (const l of readFileSync(`${REC}/rec.jsonl`, 'utf8').trim().split('\n')) { let c: any[]; try { c = JSON.parse(l); } catch { continue; } for (const r of c) { if (r[1] === 0 && r[0] === 1) load++; rows.push([`${load}:${r[0]}`, ...r.slice(1)]); } }
const per = (id: string) => { const m = new Map<number, number>(); for (const r of rows) if (r[0] === id && r[1] > 0 && r[4] === 'p') m.set(r[3], (m.get(r[3]) ?? 0) + 1); return m; };
const head = rows.filter((r) => r[1] === 0 && r[6] === 2).find((h) => { const m = per(h[0]); return m.size > 100 && Math.max(...m.values()) <= 5; })!;
const steps = rows.filter((r) => r[0] === head[0] && r[1] > 0);
const before = steps[0][4] === 'c' ? Math.round((RULES.countdown - steps[0][6]) * 60) - 1 : 0;
const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: head[7] });
for (let i = 0; i < before; i++) g.step(1 / 60, [NO_INPUT, NO_INPUT]);
const out: string[] = [];
let prevFacing = g.carriers.map((c: any) => ({ ...c.facing }));
for (const r of steps) {
  const fac = g.carriers.map((c: any) => ({ ...c.facing }));
  const tens = g.carriers.map((c: any) => Math.hypot(c.forceExp.x, c.forceExp.z));
  g.step(1 / 60, r[7].map((x: number[]) => ({ mx: x[0], mz: x[1], grab: !!x[2], turn: x[3], right: !!x[4] })));
  for (const e of g.out as any[]) {
    const c = g.carriers[e.carrier] as any;
    if (e.type === 'grab') {
      const gl = c.grabLocal, a = Math.atan2(fac[e.carrier].z, fac[e.carrier].x) - g.sofaYaw;
      out.push(`${g.time.toFixed(2)} agarra J${e.carrier + 1} local(${gl.x.toFixed(2)}, ${gl.y.toFixed(2)}, ${gl.z.toFixed(2)}) mirada respecto al eje ${((Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI).toFixed(0)}°`);
    }
    if (e.type === 'release' || e.type === 'gripBreak') out.push(`${g.time.toFixed(2)} ${e.type} J${e.carrier + 1} (tensión antes ${tens[e.carrier].toFixed(0)} N)`);
    if (['wobble', 'fall', 'stun'].includes(e.type)) out.push(`${g.time.toFixed(2)} ${e.type} J${e.carrier + 1}`);
  }
  prevFacing = fac;
}
console.log(`${REC.split('/').pop()} [${ROOT.split('/').slice(-2, -1)[0]}] semilla ${head[7]}\n  ${out.join('\n  ')}`);
