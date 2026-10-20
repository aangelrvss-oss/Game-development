// Referencia sin «humanizar»: el piloto lleva a todos los humanos de «La calle» (N humanos, sin ayudantes), semillas 1–20.
// Uso: ROOT=<árbol> npx vite-node piloto-puro.ts <humanos>
import { existsSync } from 'node:fs';
const RAPIER = (await import('@dimforge/rapier3d-compat')).default; await RAPIER.init({});
const ROOT = process.env.ROOT!;
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const CALLE = c2 ? (await import(`${ROOT}/src/levels/calle.ts`)).CALLE : undefined;
const n = +(process.argv[2] ?? 4);
const ts: number[] = []; let falls = 0, won = 0;
for (let seed = 1; seed <= 20; seed++) {
  const g = new Game(RAPIER, { ...(c2 ? { level: CALLE } : {}), humans: n, carriers: n, botStyle: 'atentos', seed });
  const ps = Autopilot.team(g);
  for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) { g.step(1 / 60, ps.map((a: any) => a.input(g, 1 / 60))); for (const e of g.out) if (e.type === 'fall') falls++; }
  if (g.phase === 'won') { won++; ts.push(g.time); }
  g.dispose();
}
ts.sort((a, b) => a - b);
console.log(`${c2 ? 'c2' : 'base'} piloto puro ${n} humanos: ganadas ${won}/20, mediana ${ts[Math.floor(ts.length / 2)]?.toFixed(2)} s, máx ${ts.at(-1)?.toFixed(2)} s, caídas ${falls}`);
