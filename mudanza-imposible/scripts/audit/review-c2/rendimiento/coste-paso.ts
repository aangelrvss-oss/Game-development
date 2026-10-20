// Revisor independiente del ciclo 2 (rendimiento). Coste por paso de Game.step y del piloto, por separado, con la
// distribución (mediana, p95, p99, máximo) y la partida entera, no 40 s. Funciona en 657fd30 (sin LevelDef) y en
// 5cab122 (con LevelDef): se ejecuta con cwd = raíz del árbol que se mide.
// Uso: cd <árbol>/mudanza-imposible && npx vite-node <ruta>/coste-paso.ts -- <nivel: calle|pruebas> <humanos> <porteadores> <semillas, coma> <cap s>
import RAPIER from '@dimforge/rapier3d-compat';
const root = process.cwd();
const [nivel = 'calle', H = '4', C = '6', SEEDS = '1,2,3', CAP = '240'] = process.argv.slice(2).filter((a) => a !== '--');
const { Game } = await import(root + '/src/sim/game.ts');
const { Autopilot } = await import(root + '/src/sim/autopilot.ts');
let level: unknown = undefined;
try { const L = await import(root + '/src/levels/index.ts'); level = L.levelFromParam(nivel); } catch { if (nivel !== 'calle') throw new Error('este árbol no tiene niveles'); }
await RAPIER.init({});
const DT = 1 / 60;
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const humans = +H, carriers = +C;
for (const seed of SEEDS.split(',').map(Number)) {
  const opts: Record<string, unknown> = { humans, carriers, botStyle: 'atentos', seed };
  if (level) opts.level = level;
  const g = new Game(RAPIER, opts);
  const aps = Autopilot.team(g);
  const step: number[] = [], pilot: number[] = [];
  const t00 = performance.now();
  for (let i = 0; i < 60 * (+CAP + 3) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const t0 = performance.now();
    const inputs = aps.map((a: { input: (g: unknown, dt: number) => unknown }) => a.input(g, DT));
    const t1 = performance.now();
    g.step(DT, inputs);
    const t2 = performance.now();
    pilot.push(t1 - t0); step.push(t2 - t1);
  }
  const wall = performance.now() - t00;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const items = (g as { items?: unknown[] }).items?.length ?? 1;
  console.log(JSON.stringify({ arbol: root.includes('/base/') ? 'base-657fd30' : 'c2-5cab122', nivel, humans, carriers, seed, fase: g.phase,
    t: +(step.length * DT).toFixed(2), pasos: step.length, objetos: items, cuerpos: g.world.bodies.len(), colliders: g.world.colliders.len(),
    step_ms: { media: +mean(step).toFixed(3), p50: +q(step, 0.5).toFixed(3), p95: +q(step, 0.95).toFixed(3), p99: +q(step, 0.99).toFixed(3), max: +Math.max(...step).toFixed(2) },
    piloto_ms: { media: +mean(pilot).toFixed(3), p95: +q(pilot, 0.95).toFixed(3), max: +Math.max(...pilot).toFixed(2) },
    reloj_s: +(wall / 1000).toFixed(2) }));
  g.dispose();
}
