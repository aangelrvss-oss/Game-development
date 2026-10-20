// Diagnóstico ciclo 2: en «La calle» con H humanos (Autopilot.team) y C porteadores, cuánto tiempo pasa cada porteador
// sin agarrar el sofá (total y racha más larga, con dónde empezó la racha), y cuántos agarran a la vez de media.
// Uso: ROOT=<árbol> CFG="4,6,atentos" SEEDS="1,...,8" npx vite-node sueltos.ts
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const CALLE = c2 ? (await import(`${ROOT}/src/levels/calle.ts`)).CALLE : undefined;
const [H, C, style] = (process.env.CFG ?? '4,6,atentos').split(',');
for (const seed of (process.env.SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)) {
  const g = new Game(RAPIER, { ...(c2 ? { level: CALLE } : {}), humans: +H, carriers: +C, botStyle: style, seed });
  const aps = Autopilot.team(g);
  const n = g.carriers.length, tot = Array(n).fill(0), run = Array(n).fill(0), best = Array(n).fill(0), at: string[] = Array(n).fill(''), from: string[] = Array(n).fill('');
  let holders = 0, steps = 0, firstGrab = -1;
  for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(1 / 60, aps.map((a: any) => a.input(g, 1 / 60)));
    if (g.phase !== 'playing') continue;
    const all = g.carriers.filter((c: any) => c.heldBody === g.sofa).length;
    if (firstGrab < 0 && all >= 2) firstGrab = g.time;
    if (firstGrab < 0) continue;
    steps++; holders += all;
    g.carriers.forEach((c: any, k: number) => {
      if (c.heldBody === g.sofa) { run[k] = 0; return; }
      if (run[k] === 0) from[k] = `(${c.pos.x.toFixed(1)},${c.pos.z.toFixed(1)})@${g.time.toFixed(0)}`;
      run[k] += 1 / 60; tot[k] += 1 / 60;
      if (run[k] > best[k]) { best[k] = run[k]; at[k] = from[k]; }
    });
  }
  const name = (k: number) => (g.carriers[k].human !== null ? `J${g.carriers[k].human + 1}` : `A${k}`);
  console.log(`s${seed} ${g.phase} t=${g.time.toFixed(2)} manos medias ${(holders / Math.max(1, steps)).toFixed(2)} | ` + g.carriers.map((_: any, k: number) => `${name(k)} suelto ${tot[k].toFixed(1)} s (racha ${best[k].toFixed(1)} desde ${at[k]})`).join('; '));
  g.dispose();
}
