// Revisión independiente del ciclo 2, dimensión «IA auxiliar y modos de 1 a 4 jugadores».
// Matriz de modos con el piloto automático (`Autopilot.team`) como «humanos» y los ayudantes de la máquina.
// Funciona en 657fd30 (sin niveles: solo «La calle») y en 5cab122 (con `level`).
// Uso (desde el árbol medido): ROOT=$PWD MODE=calle|patio H=1,2 SEEDS=1-8 STYLES=atentos,despistados [SPAWNS=nombre]
//   npx vite-node <ruta>/matriz.ts
// Salida: una línea JSON por partida (prefijo «R ») con métricas de ayudantes y de bloqueo.
import { existsSync } from 'node:fs';

const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const MODE = process.env.MODE ?? 'calle';
let LEVEL: any;
if (c2) LEVEL = MODE === 'patio' ? (await import(`${ROOT}/src/levels/patio.ts`)).PATIO : (await import(`${ROOT}/src/levels/calle.ts`)).CALLE;
if (c2 && process.env.SPAWNS) {
  const S = (await import(`${process.env.SPAWNS_FILE!}`)).STARTS;
  LEVEL = { ...LEVEL, spawns: S[process.env.SPAWNS] };
}
const DT = 1 / 60;
const LIMIT = MODE === 'patio' ? 245 : 185;
const range = (s: string) => s.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(s.split('-').map(Number)) : s.split(',').map(Number);
const HUM = range(process.env.H ?? '1,2,3,4');
const SEEDS = range(process.env.SEEDS ?? '1-8');
const STYLES = (process.env.STYLES ?? 'atentos,despistados').split(',') as ('atentos' | 'despistados')[];
const MAXHELP = Number(process.env.MAXHELP ?? 6);

function run(humans: number, carriers: number, style: 'atentos' | 'despistados', seed: number) {
  const g = new Game(RAPIER, { ...(c2 ? { level: LEVEL } : {}), humans, carriers, botStyle: style, seed });
  const aps = Autopilot.team(g);
  const items: any[] = c2 ? g.items : [{ body: g.sofa, required: true, state: 'pending' }];
  const nb = g.carriers.length;
  const isBot = g.carriers.map((c: any) => c.human === null);
  const hold = new Array(nb).fill(0), idleStill = new Array(nb).fill(0), idleStreak = new Array(nb).fill(0), idleMax = new Array(nb).fill(0);
  const notHoldStreak = new Array(nb).fill(0), notHoldMax = new Array(nb).fill(0);
  const grabs = new Array(nb).fill(0), rels = new Array(nb).fill(0), fallsBy = new Array(nb).fill(0), stunsBy = new Array(nb).fill(0), breaksBy = new Array(nb).fill(0);
  let waitHold = 0; // tiempo-ayudante agarrando un objeto que no lleva ningún humano
  let helperOnLight = 0; // tiempo-ayudante agarrando un objeto de minCarriers 1
  let parked = 0; // tiempo-ayudante sin nada que hacer (objeto cargado o roto)
  let impacts = 0, dmg = 0, broken = 0, respawn = 0, unloads = 0, loads = 0, fallsTruck = 0;
  // Estancamiento: tiempo desde que algún objeto obligatorio sin cargar se movió 0,5 m
  const anchor = items.map((it: any) => ({ ...it.body.translation() }));
  let lastMove = 0, stallMax = 0;
  let playT = 0;
  for (let i = 0; i < 60 * LIMIT && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(DT, aps.map((a: any) => a.input(g, DT)));
    for (const e of g.out) {
      if (e.type === 'grab') grabs[e.carrier]++;
      if (e.type === 'release') rels[e.carrier]++;
      if (e.type === 'fall') { fallsBy[e.carrier]++; if (e.pos.x >= 22) fallsTruck++; }
      if (e.type === 'stun') stunsBy[e.carrier]++;
      if (e.type === 'gripBreak') breaksBy[e.carrier]++;
      if (e.type === 'impact') { impacts++; dmg += e.damage ?? 0; }
      if (e.type === 'itemBroken') broken++;
      if (e.type === 'respawnSofa' || e.type === 'respawnItem') respawn++;
      if (e.type === 'itemUnloaded') unloads++;
      if (e.type === 'itemLoaded') loads++;
    }
    if (g.phase !== 'playing') continue;
    playT += DT;
    items.forEach((it: any, k: number) => {
      const p = it.body.translation();
      if (!it.required || it.state === 'loaded' || it.state === 'broken') { anchor[k] = { ...p }; return; }
      if (Math.hypot(p.x - anchor[k].x, p.z - anchor[k].z) > 0.5) { anchor[k] = { ...p }; lastMove = g.time; }
    });
    stallMax = Math.max(stallMax, g.time - lastMove);
    g.carriers.forEach((c: any, k: number) => {
      const held = c.heldBody;
      if (held) { hold[k] += DT; notHoldStreak[k] = 0; } else { notHoldStreak[k] += DT; notHoldMax[k] = Math.max(notHoldMax[k], notHoldStreak[k]); }
      if (!isBot[k]) return;
      const b = g.bots.get(k);
      const target = c2 ? g.items[b.item] : items[0];
      const idle = c2 && !held && (target.state === 'loaded' || target.state === 'broken');
      if (idle) { parked += DT; idleStreak[k] = 0; return; }
      if (held) {
        const it = c2 ? g.itemOf(held) : items[0];
        const humanOn = g.carriers.some((o: any) => o.human !== null && o.heldBody === held);
        if (!humanOn) waitHold += DT;
        if (c2 && it && it.def.minCarriers < 2) helperOnLight += DT;
        idleStreak[k] = 0;
        return;
      }
      // Sin agarrar y con algo que hacer: ¿quieto?
      const v = c.body.linvel();
      if (Math.hypot(v.x, v.z) < 0.15 && c.stunned <= 0) { idleStill[k] += DT; idleStreak[k] += DT; idleMax[k] = Math.max(idleMax[k], idleStreak[k]); } else idleStreak[k] = 0;
    });
  }
  const bots = [...Array(nb).keys()].filter((k) => isBot[k]), hum = [...Array(nb).keys()].filter((k) => !isBot[k]);
  const sum = (a: number[], ks: number[]) => ks.reduce((s, k) => s + a[k], 0);
  const r = {
    lvl: MODE, h: humans, c: carriers, helpers: carriers - humans, style, seed, phase: g.phase, reason: g.loseReason ?? null, t: +g.time.toFixed(2),
    integ: g.integrity, loaded: c2 ? `${g.loadedRequired}/${g.requiredCount}` : (g.phase === 'won' ? '1/1' : '0/1'),
    stallMax: +stallMax.toFixed(1),
    fallsH: sum(fallsBy, hum), fallsB: sum(fallsBy, bots), fallsTruck, stunsH: sum(stunsBy, hum), stunsB: sum(stunsBy, bots),
    breaksH: sum(breaksBy, hum), breaksB: sum(breaksBy, bots), impacts, broken, respawn, unloads, loads,
    // Ayudantes: fracción del tiempo de juego agarrando, quietos sin agarrar teniendo tarea, aparcados, esperando agarrados sin humano
    bHold: bots.length ? +(sum(hold, bots) / bots.length / playT).toFixed(3) : null,
    bIdleStill: bots.length ? +(sum(idleStill, bots) / bots.length / playT).toFixed(3) : null,
    bIdleMax: bots.length ? +Math.max(...bots.map((k) => idleMax[k])).toFixed(1) : null,
    bParked: bots.length ? +(parked / bots.length / playT).toFixed(3) : null,
    bWaitHold: bots.length ? +(waitHold / bots.length / playT).toFixed(3) : null,
    bOnLight: bots.length ? +(helperOnLight / bots.length / playT).toFixed(3) : null,
    bGrabs: sum(grabs, bots), bRels: sum(rels, bots),
    hHold: +(sum(hold, hum) / hum.length / playT).toFixed(3),
    hNotHoldMax: +Math.max(...hum.map((k) => notHoldMax[k])).toFixed(1),
  };
  g.dispose();
  return r;
}

const cfgs: [number, number, string, number][] = [];
for (const h of HUM) {
  for (let c = Math.max(h, h === 1 ? 2 : h); c <= Math.min(MAXHELP, 6); c++) {
    if (c === h) { for (const s of SEEDS.slice(0, 2)) cfgs.push([h, c, 'atentos', s]); continue; }
    for (const st of STYLES) for (const s of SEEDS) cfgs.push([h, c, st, s]);
  }
}
for (const [h, c, st, s] of cfgs) {
  const t0 = Date.now();
  const r = run(h, c, st as any, s);
  console.log('R ' + JSON.stringify({ ...r, spawns: process.env.SPAWNS ?? 'nivel', ms: Date.now() - t0 }));
}
