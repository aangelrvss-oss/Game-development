// Diagnóstico ciclo 2: traza de «La calle» con H humanos (Autopilot.team) y C porteadores en el árbol ROOT, desde T0 s:
// cada PASO s, el sofá (posición, giro, vertical, parte dentro de la caja de carga), el estado del equipo de pilotos y
// cada porteador; y los sucesos de agarre, caída y carga con quién y dónde.
// Uso: ROOT=<árbol> CFG="4,6,atentos" SEED=1 T0=30 T1=130 PASO=1 npx vite-node traza-calle.ts
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const CALLE = c2 ? (await import(`${ROOT}/src/levels/calle.ts`)).CALLE : undefined;
const [H, C, style] = (process.env.CFG ?? '4,6,atentos').split(',');
const T0 = +(process.env.T0 ?? 30), T1 = +(process.env.T1 ?? 200), P = +(process.env.PASO ?? 1);
const g = new Game(RAPIER, { ...(c2 ? { level: CALLE } : {}), humans: +H, carriers: +C, botStyle: style, seed: +(process.env.SEED ?? 1) });
const aps = Autopilot.team(g);
const name = (i: number) => (g.carriers[i].human !== null ? `J${g.carriers[i].human + 1}` : `A${i}`);
let next = T0;
for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(1 / 60, aps.map((a: any) => a.input(g, 1 / 60)));
  if (g.time < T0 || g.time > T1) continue;
  for (const e of g.out) {
    if (['grab', 'release', 'gripBreak', 'fall', 'stun'].includes(e.type)) console.log(`  ${g.time.toFixed(2)} ${e.type} ${name(e.carrier)} (${e.pos.x.toFixed(1)},${e.pos.y.toFixed(2)},${e.pos.z.toFixed(1)})`);
    if (['itemLoaded', 'itemUnloaded', 'win'].includes(e.type)) console.log(`  ${g.time.toFixed(2)} ${e.type}`);
  }
  if (g.time >= next) {
    next += P;
    const s = g.sofaPos, it = c2 ? g.sofaItem : null;
    const cr = aps[0].crew;
    const crew = cr ? `wp=${cr.wp} realign=${cr.realign ?? '-'} done=${cr.done ?? '-'} stuck=${(cr.stuck ?? 0).toFixed(1)} wig=${cr.wiggles ?? '-'}${cr.gate ? ` gate=${cr.gate(g)}` : ''}` : '';
    const bots = [...(g.bots?.entries?.() ?? [])].map(([k, b]: any) => `${name(k)}:slot${b.slot}${b.regrab > 0 ? ' regrab' : ''}${b.yielding ? ' cede' : ''}${b.letGo > 0 ? ' suelta' : ''}`).join(' ');
    console.log(`t=${g.time.toFixed(1)} sofá (${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) giro ${g.sofaYaw.toFixed(2)} vert ${g.sofaUp.toFixed(2)}${it ? ` dentro ${g.holdFraction(it).toFixed(2)} ${it.state} carga ${it.loadTime.toFixed(2)}` : ''} | ${crew} | ` +
      g.carriers.map((c: any, k: number) => `${name(k)}(${c.pos.x.toFixed(1)},${c.pos.y.toFixed(2)},${c.pos.z.toFixed(1)}${c.holding ? ' A' : ''}${c.stunned > 0 ? ' S' : ''})`).join(' ') + ` | ${bots}`);
  }
}
console.log(`fin ${g.phase} t=${g.time.toFixed(2)}`);
