// Muñeco derribado lejos del origen: ¿dónde quedan botas y manos (partículas de los miembros sueltos) respecto a la
// cápsula tumbada? Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/caida-escala.ts
import * as THREE from 'three';
import { init, f2, DT, RAPIER, Game, standY } from './comun';
import { CARRIER } from '../../../../src/sim/carrier';
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
await init();
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
for (const at of [{ x: 0, z: 0 }, { x: -35, z: 25 }]) {
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: at.x + 6, y: 0.25, z: at.z }, true);
  const c = g.carriers[0];
  c.teleport({ x: at.x, y: standY, z: at.z });
  const v = new DollView(c, 0, g.world, camera);
  for (let i = 0; i < 30; i++) { g.step(DT, []); v.sync(null, i * DT, DT); }
  c.knockDown({ x: 1, z: 0 }, CARRIER.fallTime, 'balance');
  for (let i = 0; i < 50; i++) { g.step(DT, []); v.sync(null, (30 + i) * DT, DT); }
  const rig = (v as unknown as { rig: { boots: THREE.Group[]; hands: THREE.Group[]; torso: THREE.Object3D; group: THREE.Group } }).rig;
  rig.group.updateMatrixWorld(true);
  const k = c.collider.translation();
  const b = rig.boots.map((x) => x.getWorldPosition(new THREE.Vector3()));
  const hd = rig.hands.map((x) => x.getWorldPosition(new THREE.Vector3()));
  const t = rig.torso.getWorldPosition(new THREE.Vector3());
  console.log(`Tumbado (${c.down}, tilt ${f2(c.tilt)}) con la cápsula en (${f2(k.x)}, ${f2(k.y)}, ${f2(k.z)}): tronco (${f2(t.x)}, ${f2(t.z)}); botas ${b.map((p) => `(${f2(p.x)}, ${f2(p.y)}, ${f2(p.z)})`).join(' ')}; manos ${hd.map((p) => `(${f2(p.x)}, ${f2(p.y)}, ${f2(p.z)})`).join(' ')}`);
  g.dispose();
}
