// qa-09: ¿cuánto crece la memoria si no se llama a g.dispose()? Crea N partidas (y da 60 pasos a cada una) con y sin dispose.
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
await RAPIER.init();
const N = Number(process.argv[2] ?? 40), dispose = process.argv[3] === '1';
const mb = () => (process.memoryUsage().rss / 2 ** 20).toFixed(1);
const r0 = mb();
const keep: Game[] = [];
for (let i = 0; i < N; i++) {
  const g = new Game(RAPIER as any, { humans: 1, carriers: 4, botStyle: 'atentos', seed: i });
  for (let k = 0; k < 60; k++) g.step(1 / 60, []);
  if (dispose) g.dispose(); else keep.push(g);
}
(globalThis as any).gc?.();
console.log(`N=${N} dispose=${dispose}: RSS ${r0} MB -> ${mb()} MB`);
