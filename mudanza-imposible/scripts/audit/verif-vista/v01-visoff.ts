// Verificación vista-01 (visOff) y parte de vista-02 (volumen dibujado vs cápsula).
// Ejecuta la vista real (WorldView.attach/render con DollView) sin navegador y mide, por fotograma:
//   - |visOff| (desplazamiento horizontal del dibujo respecto a la cápsula, dollView.ts:61,169-171);
//   - el desplazamiento que haría falta sin tope (pushOut(Infinity));
//   - la penetración de la CÁPSULA física en el sofá (contactCollider, distancia < 0 = dentro);
//   - la penetración residual del tronco/cabeza dibujados en el sofá una vez aplicado visOff.
// Uso: npx vite-node scripts/audit/verif-vista/v01-visoff.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { headlessWorld } from './harness.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { CARRIER, CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const view = await headlessWorld();

function capsulePen(g: Game, i: number) {
  let d = Infinity;
  for (const s of g.sofaColliders) { const k = g.carriers[i].collider.contactCollider(s, 0.5); if (k) d = Math.min(d, k.distance); }
  return d; // < 0: la cápsula está dentro del sofá
}
function drawnPen(dv: any) {
  const off = dv.visOff as THREE.Vector3;
  let worst = -Infinity;
  for (const sp of dv.rig.bodySpheres()) worst = Math.max(worst, dv.sofaDepth(sp.c.clone().add(off), sp.r).d);
  return worst; // > 0: el tronco/cabeza dibujados están dentro del sofá
}
function newGame() {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  view.attach(g);
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
  return g;
}

// A) Empujar el sofá con el cuerpo sin agarrarlo (por el extremo +x y por el lado azul +z), 90 fotogramas
for (const [name, start, dir] of [
  ['extremo +x', { x: 1.75, z: 10 }, { x: -1, z: 0 }],
  ['lado +z (asiento)', { x: 0.3, z: 11.15 }, { x: 0, z: -1 }],
] as const) {
  const g = newGame();
  const c = g.carriers[0];
  g.carriers[1].teleport({ x: -6, y: CENTER_Y + 0.05, z: 16 });
  c.teleport({ x: start.x, y: CENTER_Y + 0.05, z: start.z }); c.facing = { ...dir };
  for (let i = 0; i < 10; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
  const dv = view.carriers[0] as any;
  let n = 0, nOff5 = 0, offSum = 0, maxOff = 0, minCap = Infinity, capPenFrames = 0, maxNeed = 0, maxResid = -Infinity;
  const s0 = { ...g.sofaPos };
  for (let i = 0; i < 90; i++) {
    g.step(DT, [inp({ mx: dir.x, mz: dir.z }), NO_INPUT]);
    view.render(g, g.clock, DT);
    const off = dv.visOff.length(); const cap = capsulePen(g, 0);
    const need = dv.pushOut(Infinity).length();
    n++; offSum += off; maxOff = Math.max(maxOff, off); if (off > 0.05) nOff5++;
    minCap = Math.min(minCap, cap); if (cap < -0.005) capPenFrames++;
    maxNeed = Math.max(maxNeed, need); maxResid = Math.max(maxResid, drawnPen(dv));
  }
  console.log(`A ${name}: holding=${c.holding} sofá avanzó ${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} m | visOff>5cm en ${nOff5}/${n} fotogramas, medio ${(offSum / n).toFixed(3)} m, máx ${maxOff.toFixed(3)} m | desplazamiento necesario sin tope máx ${maxNeed.toFixed(3)} m | cápsula: distancia mínima al sofá ${minCap.toFixed(3)} m, fotogramas con penetración >5 mm: ${capPenFrames} | penetración residual del dibujo máx ${maxResid.toFixed(3)} m`);
  g.dispose();
}

// B) Tambaleándose hacia el sofá (estado losingBalance) con desequilibrio fijo, pegado al sofá
for (const leanMag of [0.3, 0.5, 0.65, 0.78]) {
  const g = newGame();
  const c = g.carriers[0];
  g.carriers[1].teleport({ x: -6, y: CENTER_Y + 0.05, z: 16 });
  // Cápsula tocando el extremo +x del sofá (x del extremo 1.1 + radio 0.32)
  c.teleport({ x: 1.1 + CARRIER.radius + 0.01, y: CENTER_Y + 0.05, z: 10 }); c.facing = { x: -1, z: 0 };
  for (let i = 0; i < 20; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
  const dv = view.carriers[0] as any;
  // Se fija el desequilibrio hacia el sofá y se dibuja sin avanzar la física (la cápsula no se mueve)
  c.wobbling = true; c.lean = { x: -leanMag, z: 0 }; c.leanVel = { x: 0, z: 0 }; c.wantVel = { x: -(1.2 + 3 * leanMag), z: 0 };
  for (let i = 0; i < 40; i++) view.render(g, g.clock + i * DT, DT);
  const need = dv.pushOut(Infinity).length();
  console.log(`B desequilibrio ${leanMag.toFixed(2)} rad hacia el sofá: cápsula a ${capsulePen(g, 0).toFixed(3)} m del sofá | haría falta apartar el dibujo ${need.toFixed(3)} m | visOff aplicado ${dv.visOff.length().toFixed(3)} m (tope ${0.2}) | penetración residual del tronco/cabeza dibujados ${drawnPen(dv).toFixed(3)} m | estado=${dv.src.state}`);
  g.dispose();
}

// C) Tumbado junto al sofá: caída por equilibrio con dirección hacia el sofá
{
  const g = newGame();
  const c = g.carriers[0];
  g.carriers[1].teleport({ x: -6, y: CENTER_Y + 0.05, z: 16 });
  c.teleport({ x: 1.1 + CARRIER.radius + 0.01, y: CENTER_Y + 0.05, z: 10 }); c.facing = { x: -1, z: 0 };
  for (let i = 0; i < 20; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
  const dv = view.carriers[0] as any;
  c.stunned = CARRIER.fallTime; c.knock = 'balance'; c.fallDir = { x: -1, z: 0 };
  const offs: number[] = [];
  for (let i = 0; i < 70; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); if (c.stunned > 0) offs.push(dv.visOff.length()); }
  console.log(`C tumbado junto al sofá (dirección de la simulación (-1,0), dibujada (${dv.fallDir.x.toFixed(2)},${dv.fallDir.z.toFixed(2)})): visOff mín ${Math.min(...offs).toFixed(3)} máx ${Math.max(...offs).toFixed(3)} m en ${offs.length} fotogramas tumbado`);
  g.dispose();
}
