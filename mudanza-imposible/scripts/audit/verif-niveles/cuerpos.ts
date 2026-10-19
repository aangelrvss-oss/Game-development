// Verificación (niveles-15): ¿cuesta algo que cada caja sólida tenga su propio cuerpo fijo?
// Compara el patrón actual (game.ts:108-115, un cuerpo fijo por caja) con un único cuerpo fijo con colisores
// desplazados, con los mismos colisores de LEVEL y la misma carga dinámica. No toca el código del juego.
// Uso: npx vite-node scripts/audit/verif-niveles/cuerpos.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { LEVEL } from '../../../src/sim/level.ts';
import { eulerQuat, Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';

await RAPIER.init();
const solids = LEVEL.filter((b) => b.solid);

function build(single: boolean, copies: number) {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  w.integrationParameters.numSolverIterations = 8;
  const one = single ? w.createRigidBody(RAPIER.RigidBodyDesc.fixed()) : null;
  // copies > 1: el mismo nivel repetido cada 150 m en x (un «nivel más grande»)
  for (let c = 0; c < copies; c++) for (const b of solids) {
    const q = eulerQuat(b.rx ?? 0, b.rz ?? 0);
    const p: [number, number, number] = [b.p[0] + c * 150, b.p[1], b.p[2]];
    const cd = RAPIER.ColliderDesc.cuboid(...b.h).setFriction(0.6);
    if (one) { cd.setTranslation(...p).setRotation(q); w.createCollider(cd, one); }
    else w.createCollider(cd, w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...p).setRotation(q)));
  }
  // Carga dinámica repartida por el recorrido (patio, calle, escalera, rampa, entrega): 40 cajas
  const spots = [[0, 10], [3, 6], [-3, 6], [0, -5], [5, -5], [0, -17], [0, -25], [0, -27], [18, -30.6], [25, -30]];
  let k = 0;
  for (const [x, z] of spots) for (let j = 0; j < 4; j++) {
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setTranslation(x + (j % 2) * 0.7, 3 + j, z + Math.floor(j / 2) * 0.7));
    w.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3), body);
    k++;
  }
  return w;
}

function bench(single: boolean, steps: number, copies: number) {
  const w = build(single, copies);
  for (let i = 0; i < 60; i++) w.step(); // calentamiento
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) w.step();
  const ms = (performance.now() - t0) / steps;
  let bodies = 0; w.bodies.forEach(() => bodies++);
  w.free();
  return { ms, bodies };
}

const STEPS = 2000;
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const copies of [1, 10]) {
  const res: Record<string, number[]> = { varios: [], uno: [] };
  const nb: Record<string, number> = {};
  for (let r = 0; r < 5; r++) {
    for (const single of [false, true]) {
      const { ms, bodies } = bench(single, STEPS, copies);
      res[single ? 'uno' : 'varios'].push(ms);
      nb[single ? 'uno' : 'varios'] = bodies;
    }
  }
  console.log(`-- colisores fijos: ${solids.length * copies} (nivel x${copies}); cajas dinámicas sin dormir: 40; pasos por medida: ${STEPS}; 5 repeticiones alternas`);
  console.log(`   un cuerpo fijo por caja (actual): cuerpos=${nb.varios}  mediana ${med(res.varios).toFixed(4)} ms/paso  [${res.varios.map((v) => v.toFixed(4)).join(', ')}]`);
  console.log(`   un solo cuerpo fijo:              cuerpos=${nb.uno}  mediana ${med(res.uno).toFixed(4)} ms/paso  [${res.uno.map((v) => v.toFixed(4)).join(', ')}]`);
}

// Contexto: coste real de Game.step con 4 porteadores y piloto automático
const g = new Game(RAPIER as any, { humans: 1, carriers: 4, botStyle: 'atentos', seed: 1 });
const ap = new Autopilot(0);
const t0 = performance.now();
let n = 0;
for (; n < 60 * 40 && g.phase !== 'won' && g.phase !== 'lost'; n++) g.step(1 / 60, [ap.input(g, 1 / 60)]);
console.log(`Game.step real (1 humano en piloto + 3 ayudantes): ${((performance.now() - t0) / n).toFixed(4)} ms/paso en ${n} pasos (fase final: ${g.phase})`);
g.dispose();
