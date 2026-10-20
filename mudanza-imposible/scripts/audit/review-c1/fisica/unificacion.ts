// ¿Una sola física de verdad? El mismo guion (mismo punto agarrado, mismas entradas) con dos humanos y con un humano
// y un ayudante cuyo cerebro se sustituye por el guion. Si la física es la misma, las trayectorias coinciden bit a
// bit. Después, lo que sí cambia por la IA: cómo agarran los ayudantes (asa fija frente al punto más cercano), su
// «dejarse llevar» (yielding) y el giro de los humanos con Q/E, medidos en el mismo escenario.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/unificacion.ts
import { init, near, play, inp, f2, f3, count, SOFA, DT, NO_INPUT, OPEN, standY, RAPIER, Game, yawQuat, localToWorld } from './comun';
import { SLOTS } from '../../../../src/sim/sofa';
import type { PlayerInput } from '../../../../src/sim/types';
await init();
const h = SOFA.half;

let bi = -1;
function mk(humans: number) {
  const g = new Game(RAPIER, { humans, carriers: 2, botStyle: 'atentos', seed: 1 });
  // El ayudante (si lo hay) sigue el guion desde el principio en vez de su IA (antes del guion, quieto)
  const brain = g.bots.get(1);
  if (brain) brain.think = () => (bi < 0 ? NO_INPUT : script(bi));
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.sofa.setRotation(yawQuat(0), true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0);
  play(g, 0.3, () => [NO_INPUT, NO_INPUT]);
  // Mismo punto agarrado para los dos, puesto a mano (el de los humanos: el más cercano a la sonda)
  for (const c of g.carriers) {
    const f = c.findGrab(g.grabbables)!;
    c.grab(f.body, f.point);
  }
  return g;
}
const script = (i: number): PlayerInput => (i < 30 ? NO_INPUT : i < 150 ? inp({ mx: -1 }) : i < 240 ? inp({ mz: -1, mx: -0.5 }) : i < 300 ? inp({ mx: 1 }) : NO_INPUT);

const a = mk(2), b = mk(1);
let maxDiff = 0, maxDiffC = 0;
for (let i = 0; i < 360; i++) {
  bi = i;
  a.step(DT, [script(i), script(i)]);
  b.step(DT, [script(i)]);
  const pa = a.sofaPos, pb = b.sofaPos;
  maxDiff = Math.max(maxDiff, Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z));
  for (const k of [0, 1]) { const ca = a.carriers[k].pos, cb = b.carriers[k].pos; maxDiffC = Math.max(maxDiffC, Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z)); }
}
console.log(`Mismo guion, 2 humanos frente a 1 humano + 1 ayudante con el guion: diferencia máx del sofá ${maxDiff.toExponential(2)} m, de los porteadores ${maxDiffC.toExponential(2)} m`);
console.log(`  (sofá a ${f2(a.sofaPos.x)}, ${f2(a.sofaPos.z)} frente a ${f2(b.sofaPos.x)}, ${f2(b.sofaPos.z)})`);
a.dispose(); b.dispose();

// Punto agarrado: humano (más cercano a la sonda, a la altura de la mano) frente a ayudante (asa fija, y local 0,05)
{
  const g = mk(2);
  const human = g.carriers[1].grabLocal!;
  console.log(`Punto agarrado en el extremo +x: humano (${f2(human.x)}, ${f2(human.y)}, ${f2(human.z)}) local; ayudante, asa SLOTS[0] (${SLOTS[0].p.x}, ${SLOTS[0].p.y}, ${SLOTS[0].p.z})`);
  g.dispose();
}

// Con la IA real: un humano arrastra el sofá y el ayudante agarra y le imita. ¿Se cae alguno? ¿Y con dos humanos
// donde el segundo hace exactamente lo mismo que el primero (sin retraso)?
for (const humans of [2, 1]) {
  const g = new Game(RAPIER, { humans, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  let falls = 0, wob = 0;
  // Los dos agarran (el ayudante, solo) y luego tiran 1 s hacia un lado, frenan y cambian de sentido varias veces
  const plan = (i: number): PlayerInput => (i < 240 ? (i === 60 ? inp({ grab: true }) : NO_INPUT) : inp({ mx: Math.floor(i / 50) % 2 ? 1 : -1, mz: -0.3 }));
  for (let i = 0; i < 900; i++) {
    g.step(DT, humans === 2 ? [plan(i), plan(i)] : [plan(i)]);
    falls += count(g.out, 'fall'); wob += count(g.out, 'wobble');
  }
  console.log(`Vaivén brusco (cambio de sentido cada 0,83 s, 11 s): ${humans === 2 ? '2 humanos' : '1 humano + 1 ayudante'}: tambaleos ${wob}, caídas ${falls}, agarrando ${g.carriers.map((c) => c.holding)}`);
  g.dispose();
}
void f3; void localToWorld;
