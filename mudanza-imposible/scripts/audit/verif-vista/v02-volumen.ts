// Verificación vista-02 (volumen dibujado vs cápsula) y vista-03 (dirección de caída dibujada vs simulada).
// Uso: npx vite-node scripts/audit/verif-vista/v02-volumen.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { headlessWorld } from './harness.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { CARRIER, CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const view = await headlessWorld();
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
view.attach(g);
for (let i = 0; i < (RULES.countdown + 1) * 60; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
const c = g.carriers[1], dv = view.carriers[1] as any, rig = dv.rig;
c.teleport({ x: -6, y: CENTER_Y + 0.05, z: 16 });
for (let i = 0; i < 60; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }

// Caja del muñeco de pie (sin la sombra de contacto ni el aro/etiqueta), medida en vértices reales
function extent(root: THREE.Object3D, skip: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(); const v = new THREE.Vector3();
  let maxR = 0; const p = c.pos;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip.has(m) || !m.visible) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); box.expandByPoint(v); maxR = Math.max(maxR, Math.hypot(v.x - p.x, v.z - p.z)); }
  });
  return { box, maxR };
}
const skip = new Set<THREE.Object3D>([rig.shadow]);
const feetY = c.pos.y - CENTER_Y;
const st = extent(rig.group, skip);
// Radio del tronco (piezas de torso): máximo radio horizontal de los vértices del torso respecto a su eje
const torsoR = (() => { let r = 0; const v = new THREE.Vector3(); const q = rig.torso; q.updateMatrixWorld(true); const axis = new THREE.Vector3().setFromMatrixPosition(q.matrixWorld);
  for (const m of q.children as THREE.Mesh[]) { if (!(m as THREE.Mesh).isMesh || m.geometry.type !== 'LatheGeometry') continue; const pos = m.geometry.getAttribute('position'); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); r = Math.max(r, Math.hypot(v.x - axis.x, v.z - axis.z)); } } return r; })();
console.log(`De pie y quieto: altura dibujada (pies→punto más alto) ${(st.box.max.y - feetY).toFixed(3)} m; cápsula ${(2 * CENTER_Y).toFixed(3)} m (${CARRIER.halfHeight}·2 + ${CARRIER.radius}·2)`);
console.log(`  radio horizontal del tronco (lathes del torso) ${torsoR.toFixed(3)} m frente a radio de cápsula ${CARRIER.radius}; vértice más alejado del eje de la cápsula (con brazos, botas) ${st.maxR.toFixed(3)} m`);
// Altura de la cabeza (lathe 0..0.55) + gorra respecto a la altura total
console.log(`  cabeza: lathe de 0,55 m + gorra; cuello a ${0.93} m sobre la pelvis`);

// Tumbado: caída por equilibrio en campo abierto, dirección (0,1)
c.stunned = CARRIER.fallTime; c.knock = 'balance'; c.fallDir = { x: 0, z: 1 };
let maxLie = 0, capMove = 0; const p0 = { ...c.pos };
for (let i = 0; i < 50; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); const e = extent(rig.group, skip); maxLie = Math.max(maxLie, e.maxR); capMove = Math.max(capMove, Math.hypot(c.pos.x - p0.x, c.pos.z - p0.z)); }
const capRot = c.body.rotation();
console.log(`Tumbado: vértice dibujado más alejado del eje de la cápsula ${maxLie.toFixed(3)} m; la cápsula se ha movido ${capMove.toFixed(3)} m y su rotación es (${[capRot.x, capRot.y, capRot.z, capRot.w].map((x) => x.toFixed(3)).join(', ')}) (de pie; lockRotations)`);
for (let i = 0; i < 120; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }

// vista-03: dirección de caída. Porteador pegado al extremo +x del sofá, cae hacia el sofá (-1,0)
c.teleport({ x: 1.1 + CARRIER.radius + 0.01, y: CENTER_Y + 0.05, z: 10 }); c.facing = { x: -1, z: 0 };
for (let i = 0; i < 30; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
c.stunned = CARRIER.fallTime; c.knock = 'balance'; c.fallDir = { x: -1, z: 0 };
for (let i = 0; i < 40; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
const fd = dv.fallDir; const ang = Math.acos(fd.x * c.fallDir.x + fd.z * c.fallDir.z) * 180 / Math.PI;
// Cabeza dibujada vs punto que usa la oclusión (world.ts:172)
rig.group.updateMatrixWorld(true);
const head = rig.head.localToWorld(new THREE.Vector3(0, 0.25, 0));
const p = c.pos; const occ = { x: p.x + c.fallDir.x * 0.7, z: p.z + c.fallDir.z * 0.7 };
console.log(`Caída junto al sofá: simulación c.fallDir=(${c.fallDir.x.toFixed(2)},${c.fallDir.z.toFixed(2)}), dibujo DollView.fallDir=(${fd.x.toFixed(2)},${fd.z.toFixed(2)}): ${ang.toFixed(0)}° de diferencia`);
console.log(`  cabeza dibujada en (${head.x.toFixed(2)}, ${head.z.toFixed(2)}); punto extra de oclusión (world.ts:172) en (${occ.x.toFixed(2)}, ${occ.z.toFixed(2)}): separados ${Math.hypot(head.x - occ.x, head.z - occ.z).toFixed(2)} m; cápsula en (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
// Caída en campo abierto: ¿coinciden?
c.teleport({ x: -6, y: CENTER_Y + 0.05, z: 16 });
for (let i = 0; i < 100; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
c.stunned = CARRIER.fallTime; c.knock = 'balance'; c.fallDir = { x: 0.6, z: -0.8 };
for (let i = 0; i < 5; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
console.log(`Caída en campo abierto: simulación (0.60,-0.80), dibujo (${dv.fallDir.x.toFixed(2)},${dv.fallDir.z.toFixed(2)})`);
