// Estado interno de un ayudante (revisión ciclo 2, IA). Uso: ROOT=$PWD MODE=calle H=2 C=4 STYLE=despistados SEED=2 BOT=2 T0=60 T1=70 npx vite-node bot-estado.ts
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const { localToWorld, rotate } = await import(`${ROOT}/src/sim/sofa.ts`);
const MODE = process.env.MODE ?? 'calle';
let LEVEL = MODE === 'patio' ? (await import(`${ROOT}/src/levels/patio.ts`)).PATIO : (await import(`${ROOT}/src/levels/calle.ts`)).CALLE;
if (process.env.SPAWNS) LEVEL = { ...LEVEL, spawns: (await import(process.env.SPAWNS_FILE!)).STARTS[process.env.SPAWNS] };
const g = new Game(RAPIER, { level: LEVEL, humans: +process.env.H!, carriers: +process.env.C!, botStyle: process.env.STYLE as any, seed: +process.env.SEED! });
const aps = Autopilot.team(g);
const B = +process.env.BOT!, T0 = +process.env.T0!, T1 = +process.env.T1!;
let next = T0;
for (let i = 0; i < 60 * 200 && g.phase !== 'won' && g.phase !== 'lost'; i++) {
  g.step(1 / 60, aps.map((a: any) => a.input(g, 1 / 60)));
  if (g.time >= next && g.time <= T1) {
    next += 0.5;
    const c = g.carriers[B], b = g.bots.get(B), it = g.items[b.item];
    const h = it.def.handles[b.slot], a = localToWorld(it.body, h.p), o = rotate(it.body.rotation(), h.out), ol = Math.hypot(o.x, o.z) || 1;
    const goal = { x: a.x + o.x / ol * 0.6, z: a.z + o.z / ol * 0.6 };
    const holders = g.carriers.filter((k: any) => k.heldBody === it.body).map((k: any) => `${k.human === null ? 'A' : 'J'}${k.id}`).join(',');
    const v = c.body.linvel();
    const tr = (await import(`${ROOT}/src/levels/truck.ts`)); const lt = tr.worldToTruck(g.level.truck, c.pos);
    console.log(`truck-local=(${lt.x.toFixed(2)},${lt.z.toFixed(2)}) asas=${it.def.handles.map((q: any) => `(${q.p.x},${q.p.z})`).join('')} t=${g.time.toFixed(1)} A${B} p=(${c.pos.x.toFixed(2)},${c.pos.y.toFixed(2)},${c.pos.z.toFixed(2)}) v=${Math.hypot(v.x, v.z).toFixed(2)} hold=${!!c.heldBody} stun=${c.stunned.toFixed(1)} slot=${b.slot} ancla=(${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}) meta=(${goal.x.toFixed(2)},${goal.z.toFixed(2)}) d=${Math.hypot(goal.x - c.pos.x, goal.z - c.pos.z).toFixed(2)} try=${b.tryTime.toFixed(1)} regrab=${b.regrab.toFixed(1)} letGo=${b.letGo.toFixed(1)} agarran=${holders}`);
  }
}
