// Ejecuta una prueba sin navegador e imprime estados, inclinación, fuerza y sucesos.
// Uso: npx vite-node scripts/run-test.ts B [segundos] [intensidad]
import RAPIER from '@dimforge/rapier3d-compat';
import { Lab, DT } from '../src/sim/lab';
import type { TestId } from '../src/sim/types';

await RAPIER.init();
const test = (process.argv[2] ?? 'A') as TestId;
const secs = Number(process.argv[3] ?? 10);
const lab = new Lab(RAPIER);
lab.setIntensity(Number(process.argv[4] ?? 1));
lab.reset(test);
let last = '';
for (let i = 0; i < secs / DT; i++) {
  lab.step();
  const c = lab.char, p = c.pos, s = lab.sofaPos, v = c.body.linvel();
  const line = `${c.state}`;
  if (line !== last || i % 30 === 0) {
    console.log(`${lab.testTime.toFixed(2).padStart(5)} ${c.state.padEnd(13)} p=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=${Math.hypot(v.x, v.z).toFixed(2)} lean=${Math.hypot(c.lean.x, c.lean.z).toFixed(2)} F=${Math.hypot(c.force.x, c.force.z).toFixed(0)} eff=${c.effort.toFixed(2)} sofa=(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) hold=${c.holding}`);
    last = line;
  }
}
console.log('sucesos', JSON.stringify(lab.log));
