// Verificación independiente (auditoría «niveles»): mediciones en la simulación real (Rapier) sin tocar el código.
// Uso: npx vite-node scripts/audit/verif-niveles/fisica.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { LEVEL, STAIRS, DOOR, ZONE, STAGES, ROUTE, FLOOR2 } from '../../../src/sim/level.ts';
import { PROPS } from '../../../src/sim/props.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';

await RAPIER.init();
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
g.step(1 / 60, [NO_INPUT, NO_INPUT]); // actualiza las consultas espaciales
const W = g.world;
const f = (n: number, d = 3) => n.toFixed(d);

/** Rayo contra cuerpos fijos solamente (nivel). Devuelve el punto de impacto o null. */
function ray(o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, max = 50) {
  const r = new RAPIER.Ray(o, d);
  const hit = W.castRay(r, max, true, undefined, undefined, undefined, undefined, (c: RAPIER.Collider) => !!c.parent()?.isFixed());
  if (!hit) return null;
  const t = (hit as any).timeOfImpact ?? (hit as any).toi;
  return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t, c: hit.collider };
}

console.log('=== 1. Camión: colisión frente a dibujo ===');
for (const b of LEVEL.filter((b) => b.kind === 'truck' || b.kind === 'zone')) {
  console.log(`  caja ${b.kind}: x ${f(b.p[0] - b.h[0], 2)}..${f(b.p[0] + b.h[0], 2)}  y ${f(b.p[1] - b.h[1], 2)}..${f(b.p[1] + b.h[1], 2)}  z ${f(b.p[2] - b.h[2], 2)}..${f(b.p[2] + b.h[2], 2)}  solid=${b.solid}`);
}
for (const y of [0.3, 1.0, 2.0, 3.0]) {
  const h = ray({ x: 26, y, z: -30.25 }, { x: 1, y: 0, z: 0 });
  console.log(`  rayo horizontal +x desde x=26, y=${y}, z=-30.25 (por la abertura trasera dibujada): choca en x=${h ? f(h.x) : 'nada'}`);
}
const down = ray({ x: 31, y: 10, z: -30.25 }, { x: 0, y: -1, z: 0 });
console.log(`  rayo vertical en x=31,z=-30.25 desde y=10: choca en y=${down ? f(down.y) : 'nada'} (suelo de carga dibujado: y=1.3+0.075=1.375; techo dibujado: 3.4)`);
console.log(`  zona de entrega ZONE x ${ZONE.x0}..${ZONE.x1}, z ${ZONE.z0}..${ZONE.z1} (en el suelo, delante del camión)`);

console.log('\n=== 2. Escalera: peldaños dibujados frente a pendiente de colisión ===');
console.log('  STAIRS =', JSON.stringify(STAIRS), '(claves:', Object.keys(STAIRS).join(','), ')');
const n = 14, run = (STAIRS.z0 - STAIRS.z1) / n, rise = STAIRS.top / n;
let maxNose = 0, sumMid = 0;
const rows: string[] = [];
for (let i = 0; i < n; i++) {
  const drawnTop = rise * (i + 1); // levelView.ts:245 (h) y canto en h+0.005 (levelView.ts:252)
  const zNose = STAIRS.z0 - run * i - 0.05; // centro del canto (levelView.ts:252)
  const zMid = STAIRS.z0 - run * (i + 0.5);
  const zBack = STAIRS.z0 - run * (i + 1) + 0.01;
  const hn = ray({ x: 0, y: 6, z: zNose }, { x: 0, y: -1, z: 0 });
  const hm = ray({ x: 0, y: 6, z: zMid }, { x: 0, y: -1, z: 0 });
  const hb = ray({ x: 0, y: 6, z: zBack }, { x: 0, y: -1, z: 0 });
  const dn = drawnTop - hn!.y, dm = drawnTop - hm!.y, db = drawnTop - hb!.y;
  maxNose = Math.max(maxNose, dn); sumMid += dm;
  if (i < 3 || i >= n - 2) rows.push(`  peldaño ${String(i).padStart(2)}: tope dibujado ${f(drawnTop)} | colisión en canto ${f(hn!.y)} (dif ${f(dn)}), centro ${f(hm!.y)} (dif ${f(dm)}), fondo ${f(hb!.y)} (dif ${f(db)})`);
}
console.log(rows.join('\n'));
console.log(`  altura de peldaño rise=${f(rise, 4)} m; dif. máx. en el canto=${f(maxNose, 4)}; dif. media en el centro de la huella=${f(sumMid / n, 4)}`);

console.log('\n=== 3. Rotaciones de las cajas (sim: eulerQuat solo rx o rz) ===');
const both = LEVEL.filter((b) => b.rx && b.rz);
console.log(`  cajas con rx: ${LEVEL.filter((b) => b.rx).map((b) => b.kind + ' rx=' + f(b.rx!)).join(', ')}`);
console.log(`  cajas con rz: ${LEVEL.filter((b) => b.rz).map((b) => b.kind + ' rz=' + f(b.rz!)).join(', ')}`);
console.log(`  cajas con rx y rz a la vez: ${both.length}`);
console.log(`  ¿alguna caja tiene campo ry? ${LEVEL.some((b) => 'ry' in b)}`);

console.log('\n=== 4. Decoradores por caja (contenido actual) ===');
for (const b of LEVEL.filter((b) => b.kind === 'fence')) console.log(`  valla p=(${b.p.map((v) => f(v, 2))}) h=(${b.h.map((v) => f(v, 2))}) -> larga en ${b.h[2] > b.h[0] ? 'z' : 'x'}`);
for (const b of LEVEL.filter((b) => b.kind === 'ramp')) console.log(`  rampa rx=${b.rx ?? 0} rz=${f(b.rz ?? 0)} h=(${b.h.map((v) => f(v, 2))})`);
for (const b of LEVEL.filter((b) => b.kind === 'wall')) console.log(`  pared y ${f(b.p[1] - b.h[1], 2)}..${f(b.p[1] + b.h[1], 2)} x ${f(b.p[0] - b.h[0], 2)}..${f(b.p[0] + b.h[0], 2)} z ${f(b.p[2] - b.h[2], 2)}..${f(b.p[2] + b.h[2], 2)} -> rodapié ${b.p[1] < 2.2 ? 'SÍ (y=0.07)' : 'NO'}`);

console.log('\n=== 5. Cajas de choque de los objetos frente a su giro ry ===');
for (const o of PROPS) {
  if (!o.hit || !o.ry) continue;
  const [hx, , hz] = o.hit;
  const c = Math.abs(Math.cos(o.ry)), s = Math.abs(Math.sin(o.ry));
  const ex = hx * c + hz * s, ez = hx * s + hz * c; // semiextensión del rectángulo girado
  // colisor real en el mundo: punto en el centro de la caja de choque
  let rot = 'no encontrado';
  W.intersectionsWithPoint({ x: o.x, y: (o.y ?? 0) + o.hit[1], z: o.z }, (col: RAPIER.Collider) => {
    if (col.parent()?.isFixed()) { const q = col.rotation(); rot = `q=(${f(q.x)},${f(q.y)},${f(q.z)},${f(q.w)})`; }
    return true;
  });
  console.log(`  ${o.type.padEnd(11)} ry=${f(o.ry, 2)} hit(x,z)=(${hx},${hz}) colisor ${rot}; dibujo girado ocupa ±(${f(ex)},${f(ez)}) -> sobresale ${f(Math.max(0, ex - hx))} m en x, ${f(Math.max(0, ez - hz))} m en z`);
}

console.log('\n=== 6. Literales de STAGES frente a constantes ===');
console.log(`  DOOR.z=${DOOR.z} (STAGES 'Portal' usa -13.5); STAIRS.z0=${STAIRS.z0} (STAGES 'Escalera' usa -22)`);
console.log(`  'Portal'.reached(0,0,DOOR.z-0.01)=${STAGES[2].reached(0, 0, DOOR.z - 0.01)}; 'Escalera'.reached(0,1,STAIRS.z0-0.01)=${STAGES[3].reached(0, 1, STAIRS.z0 - 0.01)}`);
console.log(`  longitudes: ROUTE=${ROUTE.length}, STAGES=${STAGES.length} (${STAGES.map((s) => s.label).join(', ')})`);
console.log(`  waypoints con y definido: ${ROUTE.filter((w) => w.y !== undefined).length}; FLOOR2=${FLOOR2}`);

console.log('\n=== 7. Cuerpos fijos de Rapier ===');
let fixed = 0, total = 0, fixedCols = 0;
W.bodies.forEach((b) => { total++; if (b.isFixed()) { fixed++; fixedCols += b.numColliders(); } });
console.log(`  cajas sólidas en LEVEL: ${LEVEL.filter((b) => b.solid).length} (de ellas 'prop': ${LEVEL.filter((b) => b.kind === 'prop').length})`);
console.log(`  cuerpos en el mundo: ${total}; fijos: ${fixed}; colisores en cuerpos fijos: ${fixedCols}`);
g.dispose();
