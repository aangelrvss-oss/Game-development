// Diagnóstico ciclo 2: «La calle» con H humanos (piloto Autopilot.team, como regresion.ts) y C porteadores, semillas
// dadas, en el árbol ROOT. Para cada caída: quién (humano/ayudante), dónde (zona), si agarraba, y la fase del sofá.
// También el tiempo en que el sofá entra en la zona del camión (x ≥ 22) y lo que tarda desde ahí en ganar.
// Uso: ROOT=<árbol> CFG="4,6,atentos" SEEDS="1,2,..." npx vite-node caidas.ts
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const CALLE = c2 ? (await import(`${ROOT}/src/levels/calle.ts`)).CALLE : undefined;
const [H, C, style] = (process.env.CFG ?? '4,6,atentos').split(',');
const seeds = (process.env.SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number);
const DT = 1 / 60;
const zone = (p: { x: number; y: number; z: number }) => p.x < 22 ? 'antes' : p.y > 0.95 && p.x > 28 ? 'caja' : p.x >= 24 && p.x <= 28.2 && p.y > 0.15 ? 'rampa' : 'suelo-camion';
const tot: Record<string, number> = {};
for (const seed of seeds) {
  const g = new Game(RAPIER, { ...(c2 ? { level: CALLE } : {}), humans: +H, carriers: +C, botStyle: style, seed });
  const aps = Autopilot.team(g);
  let tTruck = -1; const falls: string[] = []; let breaks = 0, grabs = 0, releases = 0;
  for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(DT, aps.map((a: any) => a.input(g, DT)));
    const sp = g.sofaPos;
    if (tTruck < 0 && sp.x >= 22) tTruck = g.time;
    for (const e of g.out) {
      if (e.type === 'gripBreak') breaks++;
      if (e.type === 'grab' && tTruck >= 0) grabs++;
      if (e.type === 'release' && tTruck >= 0) releases++;
      if (e.type === 'fall' || e.type === 'stun') {
        const c = g.carriers[e.carrier]; const who = c.human !== null ? `J${c.human + 1}` : `A${e.carrier}`;
        const z = zone(e.pos); const k = `${c.human !== null ? 'humano' : 'ayudante'}:${z}`; tot[k] = (tot[k] ?? 0) + 1;
        falls.push(`${e.type}@${g.time.toFixed(1)} ${who} ${z} (${e.pos.x.toFixed(1)},${e.pos.y.toFixed(2)},${e.pos.z.toFixed(1)}) sofá(${sp.x.toFixed(1)},${sp.y.toFixed(2)},${sp.z.toFixed(1)})`);
      }
    }
  }
  console.log(`s${seed} ${g.phase} t=${g.time.toFixed(2)} integ=${Math.round(g.integrity)} entra-zona-camión=${tTruck.toFixed(2)} tramo-final=${(g.time - tTruck).toFixed(2)}s caídas=${falls.length} (x≥22: ${falls.filter((f) => !/ antes /.test(f)).length}) se-escapa=${breaks} agarres/sueltas-en-zona=${grabs}/${releases}`);
  if (process.env.V) for (const f of falls) console.log('   ', f);
  g.dispose();
}
console.log('caídas por quién:zona', JSON.stringify(tot));
