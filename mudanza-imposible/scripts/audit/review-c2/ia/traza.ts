// Traza de una partida del patio o de «La calle» (revisión independiente del ciclo 2, IA y modos).
// Uso: ROOT=$PWD MODE=patio H=4 C=5 STYLE=atentos SEED=1 PASO=2 [T0=0 T1=999] npx vite-node traza.ts
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const MODE = process.env.MODE ?? 'patio';
let LEVEL = MODE === 'patio' ? (await import(`${ROOT}/src/levels/patio.ts`)).PATIO : (await import(`${ROOT}/src/levels/calle.ts`)).CALLE;
if (process.env.SPAWNS) LEVEL = { ...LEVEL, spawns: (await import(process.env.SPAWNS_FILE!)).STARTS[process.env.SPAWNS] };
const H = +(process.env.H ?? 4), C = +(process.env.C ?? 5), SEED = +(process.env.SEED ?? 1), PASO = +(process.env.PASO ?? 2);
const T0 = +(process.env.T0 ?? 0), T1 = +(process.env.T1 ?? 999);
const g = new Game(RAPIER, { level: LEVEL, humans: H, carriers: C, botStyle: (process.env.STYLE ?? 'atentos') as any, seed: SEED });
const aps = Autopilot.team(g);
const DT = 1 / 60;
const name = (it: any) => it ? `${it.def.id}${it.index}` : '-';
const f = (x: number) => x.toFixed(1);
let next = 0;
for (let i = 0; i < 60 * 250 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(DT, aps.map((a: any) => a.input(g, DT)));
  const t = g.time;
  for (const e of g.out) {
    if (['grab', 'release', 'gripBreak', 'fall', 'stun', 'wobble', 'righted'].includes(e.type) && t >= T0 && t <= T1) {
      const c = g.carriers[e.carrier];
      console.log(`  ${t.toFixed(2)} ${e.type} ${c.human === null ? 'A' : 'J'}${e.carrier} ${name(g.itemOf(c.heldBody))} en (${f(e.pos.x)},${f(e.pos.z)})`);
    }
    if (['itemBroken', 'itemLoaded', 'itemUnloaded', 'respawnItem', 'win', 'lose'].includes(e.type)) console.log(`  ${t.toFixed(2)} ${e.type} ${e.item !== undefined ? name(g.items[e.item]) : ''} ${e.reason ?? ''}`);
    if (e.type === 'impact' && e.damage > 0) console.log(`  ${t.toFixed(2)} impact ${name(g.items[e.item])} fuerza ${e.strength.toFixed(2)} daño ${e.damage}`);
  }
  if (g.phase === 'playing' && t >= next && t >= T0 && t <= T1) {
    next = t + PASO;
    const cs = g.carriers.map((c: any) => {
      const b = g.bots.get(c.id);
      const ap = aps.find((a: any) => a.carrierIndex === c.id);
      const crew = ap ? (ap.crew?.item ?? '·') : '';
      const tgt = b ? `→${name(g.items[b.item])}` : `→crew${crew}`;
      return `${c.human === null ? 'A' : 'J'}${c.id}(${f(c.pos.x)},${f(c.pos.z)})${c.heldBody ? '[' + name(g.itemOf(c.heldBody)) + ']' : ''}${tgt}`;
    }).join(' ');
    const its = g.items.map((it: any) => { const p = it.body.translation(); return `${name(it)}:${it.state[0]}${it.integrity}(${f(p.x)},${f(p.z)})`; }).join(' ');
    const seen = new Set();
    const crews = aps.map((a: any) => a.crew).filter((c: any) => c && !seen.has(c) && seen.add(c)).map((c: any) => `${name(g.items[c.item ?? g.level.main])} wp${c.wp} re${c.realign ? 1 : 0} done${c.done ? 1 : 0} gate:${c.gate ? c.gate(g) : '-'} stuck${c.stuck.toFixed(1)} wig${c.wiggles}`).join(' | ');
    console.log(`t=${t.toFixed(1)} ${cs}\n      ${its}\n      ${crews}`);
  }
}
console.log(`FIN ${g.phase} ${g.loseReason ?? ''} t=${g.time.toFixed(2)} ${g.loadedRequired}/${g.requiredCount}`);
