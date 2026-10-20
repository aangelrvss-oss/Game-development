// Revisor (rendimiento): ¿crece la memoria de Rapier (WASM) al crear y liberar partidas seguidas? 15 partidas de 600
// pasos con dispose y, como control, 5 sin dispose. Uso (cwd = árbol 5cab122): npx vite-node <ruta>/wasm-reinicios.ts -- <nivel>
import RAPIER from '@dimforge/rapier3d-compat';
const root = process.cwd();
const nivel = process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'pruebas';
const { levelFromParam } = await import(root + '/src/levels/index.ts');
const { Game } = await import(root + '/src/sim/game.ts');
const { Autopilot } = await import(root + '/src/sim/autopilot.ts');
await RAPIER.init({});
const mb = (x: number) => +(x / 1048576).toFixed(1);
const run = (dispose: boolean) => {
  const g = new Game(RAPIER, { level: levelFromParam(nivel), humans: 4, carriers: 6, botStyle: 'atentos', seed: 1 });
  const aps = Autopilot.team(g);
  for (let i = 0; i < 600; i++) g.step(1 / 60, aps.map((a: { input: (g: unknown, dt: number) => unknown }) => a.input(g, 1 / 60)));
  if (dispose) g.dispose();
};
for (let k = 1; k <= 15; k++) { run(true); (globalThis as { gc?: () => void }).gc?.(); const m = process.memoryUsage(); console.log(JSON.stringify({ partida: k, dispose: true, rssMB: mb(m.rss), arrayBuffersMB: mb(m.arrayBuffers), heapMB: mb(m.heapUsed) })); }
for (let k = 1; k <= 5; k++) { run(false); const m = process.memoryUsage(); console.log(JSON.stringify({ partida: 15 + k, dispose: false, rssMB: mb(m.rss), arrayBuffersMB: mb(m.arrayBuffers), heapMB: mb(m.heapUsed) })); }
