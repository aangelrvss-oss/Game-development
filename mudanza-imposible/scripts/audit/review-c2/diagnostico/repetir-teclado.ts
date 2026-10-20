// Diagnóstico ciclo 2: repite en Node las entradas grabadas por teclado-instr.cjs (1 jugador + ayudantes) sobre el
// árbol ROOT, con la semilla grabada (Math.random de start). Imprime los sucesos de agarre (paso, tiempo, tipo,
// porteador) para compararlos con los del navegador, y el estado al final.
// Uso: ROOT=<árbol> JSON=<teclado-instr.json> [SEED=n] npx vite-node repetir-teclado.ts
import { existsSync, readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const J = JSON.parse(readFileSync(process.env.JSON!, 'utf8'));
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const u = new URL(J.url);
const seed = process.env.SEED ? +process.env.SEED : Math.floor(J.at.seedRnd[0] * 1e9);
const H = +(u.searchParams.get('humans') ?? 2), C = +(u.searchParams.get('carriers') ?? 2);
const g = new Game(RAPIER, { ...level, humans: H, carriers: Math.max(C, H), botStyle: 'atentos', seed });
const pre = Math.round((RULES.countdown - J.at.countdown) * 60);
for (let i = 0; i < pre; i++) g.step(1 / 60, [NO_INPUT]);
console.log(`semilla ${seed}; pasos previos ${pre}; cuenta atrás ${g.countdown.toFixed(4)} (navegador ${J.at.countdown.toFixed(4)})`);
const ev: string[] = [];
J.inputs.forEach((row: number[][], i: number) => {
  g.step(1 / 60, row.map((r) => ({ mx: r[0], mz: r[1], grab: !!r[2], turn: r[3], right: !!r[4] })));
  for (const e of g.out) if (['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)) ev.push(`${i + 1} ${g.time.toFixed(2)} ${e.type} ${e.carrier}`);
});
const same = JSON.stringify(ev) === JSON.stringify(J.ev);
console.log('sucesos Node     :', ev.join(' | '));
console.log('sucesos navegador:', J.ev.join(' | '));
console.log('¿iguales?', same);
const s = g.sofaPos;
console.log(`final t=${g.time.toFixed(2)} sofá (${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) ` + g.carriers.map((c: any, i: number) => `${i}:(${c.pos.x.toFixed(2)},${c.pos.z.toFixed(2)} h=${c.holding ? 1 : 0})`).join(' '));
g.dispose();
