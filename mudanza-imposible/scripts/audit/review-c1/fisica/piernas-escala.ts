// Reproducción mínima: un muñeco quieto lejos del origen. ¿Dónde se dibujan sus piernas y brazos (tubos) respecto
// a su tronco y sus botas? Si los tubos se calculan en coordenadas del mundo (localToWorld, que ya incluye la escala
// DOLL_SCALE del grupo) y se dibujan dentro del grupo escalado, quedan a DOLL_SCALE × posición del mundo.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/piernas-escala.ts
import * as THREE from 'three';
import { init, f2, DT, RAPIER, Game, standY } from './comun';
import { DOLL_SCALE } from '../../../../src/sim/carrier';
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
await init();
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
camera.position.set(0, 14, 20);

for (const at of [{ x: 0, z: 0 }, { x: 0, z: 10 }, { x: -35, z: 25 }, { x: 26, z: -36 }]) {
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: at.x + 6, y: 0.25, z: at.z }, true);
  const c = g.carriers[0];
  c.teleport({ x: at.x, y: standY, z: at.z });
  const scene = new THREE.Scene();
  const v = new DollView(c, 0, g.world, camera);
  scene.add(v.group);
  for (let i = 0; i < 40; i++) { g.step(DT, []); v.sync(null, i * DT, DT); }
  scene.updateMatrixWorld(true);
  const rig = (v as unknown as { rig: { torso: THREE.Object3D; legs: { geometry: THREE.BufferGeometry }[]; arms: { geometry: THREE.BufferGeometry }[]; boots: THREE.Group[]; hands: THREE.Group[]; group: THREE.Group } }).rig;
  const centroid = (geoms: Set<THREE.BufferGeometry>) => {
    const s = new THREE.Vector3(); let n = 0; const vv = new THREE.Vector3();
    rig.group.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh || !geoms.has(m.geometry)) return; const pos = m.geometry.attributes.position; for (let q = 0; q < pos.count; q++) { s.add(vv.fromBufferAttribute(pos, q).applyMatrix4(m.matrixWorld)); n++; } });
    return s.divideScalar(n);
  };
  const legs = centroid(new Set(rig.legs.map((l) => l.geometry))), arms = centroid(new Set(rig.arms.map((l) => l.geometry)));
  const torso = rig.torso.getWorldPosition(new THREE.Vector3());
  const boot = rig.boots[0].getWorldPosition(new THREE.Vector3()).add(rig.boots[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const hand = rig.hands[0].getWorldPosition(new THREE.Vector3());
  const p = c.pos;
  console.log(`Porteador en (${f2(p.x)}, ${f2(p.z)}): tronco (${f2(torso.x)}, ${f2(torso.z)}), botas (${f2(boot.x)}, ${f2(boot.z)}), centro de las piernas dibujadas (${f2(legs.x)}, ${f2(legs.y)}, ${f2(legs.z)}), de los brazos (${f2(arms.x)}, ${f2(arms.y)}, ${f2(arms.z)}), mano (${f2(hand.x)}, ${f2(hand.z)}); piernas a ${f2(Math.hypot(legs.x - p.x, legs.z - p.z))} m del cuerpo (DOLL_SCALE·p = (${f2(DOLL_SCALE * p.x)}, ${f2(DOLL_SCALE * p.z)}))`);
  g.dispose();
}
