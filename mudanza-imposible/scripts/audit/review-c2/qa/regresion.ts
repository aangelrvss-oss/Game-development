// Revisión QA del ciclo 2: recorridos de «La calle» en el árbol que diga ROOT (657fd30 o 5cab122), con la misma física
// y el mismo piloto de las pruebas. Funciona en los dos árboles: si existe src/levels/calle.ts (ciclo 2) pasa `level`.
// Uso (desde el árbol medido): ROOT=$PWD npx vite-node <ruta>/regresion.ts [patio]
// Salida: una línea JSON por partida y un resumen por configuración.
import { existsSync } from 'node:fs';

const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const CALLE = c2 ? (await import(`${ROOT}/src/levels/calle.ts`)).CALLE : undefined;
const PATIO = c2 ? (await import(`${ROOT}/src/levels/patio.ts`)).PATIO : undefined;
const DT = 1 / 60;

type Run = { cfg: string; seed: number; phase: string; t: number; integ: number; falls: number; fallsTruck: number; stuns: number; breaks: number; respawn: number; unloads: number; stage: string; loaded?: string };

function run(level: unknown, humans: number, carriers: number, style: 'atentos' | 'despistados', seed: number, pilotAll: boolean, limit: number): Run {
  const g = new Game(RAPIER, { ...(c2 ? { level } : {}), humans, carriers, botStyle: style, seed });
  const aps = pilotAll ? Autopilot.team(g) : [new Autopilot(0)];
  let falls = 0, fallsTruck = 0, stuns = 0, breaks = 0, respawn = 0, unloads = 0;
  for (let i = 0; i < 60 * limit && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(DT, aps.map((a: { input(g: unknown, dt: number): unknown }) => a.input(g, DT)));
    for (const e of g.out) {
      if (e.type === 'fall') { falls++; if (e.pos.x >= 22) fallsTruck++; }
      if (e.type === 'stun') stuns++;
      if (e.type === 'gripBreak') breaks++;
      if (e.type === 'respawnSofa' || e.type === 'respawnItem') respawn++;
      if (e.type === 'itemUnloaded') unloads++;
    }
  }
  const r: Run = {
    cfg: `${humans}h/${carriers}c ${style}`, seed, phase: g.phase, t: +g.time.toFixed(2), integ: g.integrity, falls, fallsTruck, stuns, breaks, respawn, unloads,
    stage: g.stageLabel,
  };
  if (c2) r.loaded = `${g.loadedRequired}/${g.requiredCount}`;
  g.dispose();
  return r;
}

const all: Run[] = [];
const mode = process.argv[2] ?? 'calle';
if (mode === 'calle') {
  // Solo humanos (llevados por el piloto, uno por jugador): 2, 3 y 4
  for (const n of [2, 3, 4]) all.push(run(CALLE, n, n, 'atentos', 1, true, 185));
  // Humanos (piloto) + ayudantes atentos: 2 + 2 y 4 + 2
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) all.push(run(CALLE, 2, 4, 'atentos', seed, true, 185));
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) all.push(run(CALLE, 4, 6, 'atentos', seed, true, 185));
  // 1 humano (piloto) + ayudantes
  for (const [n, style] of [[2, 'atentos'], [3, 'atentos'], [4, 'atentos'], [4, 'despistados'], [6, 'despistados']] as const) {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) all.push(run(CALLE, 1, n, style, seed, false, 185));
  }
} else if (mode === 'patio' && c2) {
  const { ROLE_STARTS } = await import(`${ROOT}/tests/roles-starts.ts`);
  for (const [name, spawns] of Object.entries(ROLE_STARTS)) for (const n of [2, 3, 4]) {
    const r = run({ ...PATIO, spawns }, n, n, 'atentos', 1, true, 245); r.cfg += ` ${name}`; all.push(r);
  }
  for (const [n, style] of [[3, 'atentos'], [4, 'atentos'], [4, 'despistados'], [6, 'despistados']] as const) {
    // Como la demo de main.ts con varios obligatorios: el piloto con el reparto (`Autopilot.team`)
    for (const seed of [1, 2, 3, 4, 5, 6]) all.push(run(PATIO, 1, n, style, seed, true, 245));
  }
}
for (const r of all) console.log(JSON.stringify(r));
const groups = new Map<string, Run[]>();
for (const r of all) groups.set(r.cfg, [...(groups.get(r.cfg) ?? []), r]);
console.log('--- resumen');
for (const [cfg, rs] of groups) {
  const won = rs.filter((r) => r.phase === 'won').length, ts = rs.filter((r) => r.phase === 'won').map((r) => r.t).sort((a, b) => a - b);
  const sum = (k: keyof Run) => rs.reduce((s, r) => s + (r[k] as number), 0);
  console.log(`${cfg}: ganadas ${won}/${rs.length}; tiempos ${ts.length ? `${ts[0]}–${ts[ts.length - 1]} (mediana ${ts[Math.floor(ts.length / 2)]})` : '-'}; integridad mín ${Math.min(...rs.map((r) => r.integ))}; caídas ${sum('falls')} (camión ${sum('fallsTruck')}); derribos ${sum('stuns')}; se escapa ${sum('breaks')}; reapariciones ${sum('respawn')}; perdidas: ${rs.filter((r) => r.phase !== 'won').map((r) => `s${r.seed} ${r.phase}@${r.stage} ${r.t}s`).join(', ') || 'ninguna'}`);
}
