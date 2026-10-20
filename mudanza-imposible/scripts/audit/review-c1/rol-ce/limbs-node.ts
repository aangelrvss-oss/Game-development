// Revisor C+E (ciclo 1): reproducción sin navegador del desprendimiento de brazos y piernas del muñeco.
// El grupo del muñeco está escalado a DOLL_SCALE (dollView.ts), pero dollRig.ts calcula hombros, caderas y tobillos con
// localToWorld (coordenadas del MUNDO, ya escaladas) y se los pasa a mallas hijas de ese mismo grupo (que las vuelve a
// escalar). Predicción: el miembro queda a (1 − DOLL_SCALE)·|posición| del tronco. Uso:
//   npx vite-node scripts/audit/review-c1/rol-ce/limbs-node.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { DOLL_SCALE, CENTER_Y } from '../../../../src/sim/carrier';
import { Game } from '../../../../src/sim/game';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
await RAPIER.init();
const DT = 1 / 60;
for (const at of [{ x: 0.5, z: 0.5 }, { x: 2.4, z: 10 }, { x: 0, z: -25.5 }, { x: -35, z: 25 }]) {
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: at.x + 4, y: 0.4, z: at.z }, true);
  const c = g.carriers[0];
  c.teleport({ x: at.x, y: CENTER_Y + 0.05 + (at.z < -22 ? 1.4 : 0), z: at.z });
  const v = new DollView(c, 0, g.world, new THREE.PerspectiveCamera());
  for (let i = 0; i < 20; i++) { g.step(DT, []); v.sync(null, i * DT, DT); }
  const rig = (v as unknown as { rig: { group: THREE.Object3D; torso: THREE.Object3D; sleeves: THREE.Mesh[]; boots: THREE.Object3D[] } }).rig;
  rig.group.updateMatrixWorld(true);
  const shoulder = rig.torso.localToWorld(new THREE.Vector3(-0.325, 0.83, 0));
  const sleeve = rig.sleeves[0].getWorldPosition(new THREE.Vector3());
  const boot = rig.boots[0].getWorldPosition(new THREE.Vector3());
  const p = c.pos, r = Math.hypot(p.x, p.y, p.z);
  console.log(`porteador en (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}): manga–hombro ${shoulder.distanceTo(sleeve).toFixed(2)} m ` +
    `(predicción (1−DOLL_SCALE)·|p| = ${((1 - DOLL_SCALE) * r).toFixed(2)} m); bota–cuerpo (horizontal) ${Math.hypot(boot.x - p.x, boot.z - p.z).toFixed(2)} m`);
  g.dispose();
}
