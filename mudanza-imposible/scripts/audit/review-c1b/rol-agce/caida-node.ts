// Revisor A+G+C+E (ciclo 1, segunda ronda): caída del muñeco lejos del origen, sin navegador. J1 se derriba en 4
// direcciones en (26,9, −36) (junto al camión) y en (−35, 25); se miden en el mundo las uniones (hombro, cadera,
// tobillo, mano: tubo frente a la pieza) y cuánto salen manos y botas de la cápsula tumbada, de pie → cayendo →
// tumbado → levantándose → de pie.
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/caida-node.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Game } from '../../../../src/sim/game';
import { CARRIER, CENTER_Y } from '../../../../src/sim/carrier';
import { NO_INPUT } from '../../../../src/sim/types';
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
const { DIM } = await import('../../../../src/view/doll/dollRig');
await RAPIER.init({});
const DT = 1 / 60, camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
type Rig = { group: THREE.Object3D; torso: THREE.Object3D; arms: { pts: THREE.Vector3[] }[]; legs: { pts: THREE.Vector3[] }[]; boots: THREE.Object3D[]; hands: THREE.Object3D[] };
for (const at of [{ x: 26.9, z: -36 }, { x: -35, z: 25 }]) {
  for (const dir of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
    const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    g.phase = 'playing'; g.countdown = 0;
    g.sofa.setTranslation({ x: at.x + 8, y: 0.25, z: at.z + 8 }, true);
    g.carriers.forEach((c, i) => c.teleport({ x: at.x + i * 3, y: CENTER_Y + 0.05, z: at.z }));
    const v = new DollView(g.carriers[0], 0, g.world, camera), c = g.carriers[0];
    let t = 0;
    const step = () => { g.step(DT, [NO_INPUT, NO_INPUT]); t += DT; v.sync(null, t, DT); };
    for (let i = 0; i < 30; i++) step();
    c.knockDown(dir, CARRIER.fallTime, 'balance');
    const worst: Record<string, number[]> = {};
    for (let i = 0; i < Math.round((CARRIER.fallTime + 1.2) / DT); i++) {
      step();
      const r = (v as unknown as { rig: Rig }).rig;
      r.group.updateMatrixWorld(true);
      const GM = r.group.matrixWorld, W = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z));
      const end = (tb: { pts: THREE.Vector3[] }, last: boolean) => tb.pts[last ? tb.pts.length - 1 : 0].clone().applyMatrix4(GM);
      let j = 0;
      for (let k = 0; k < 2; k++) {
        const s = k ? 1 : -1;
        j = Math.max(j, end(r.arms[k], false).distanceTo(W(r.torso, s * DIM.shoulderX, DIM.shoulderY, 0)));
        j = Math.max(j, end(r.legs[k], false).distanceTo(W(r.torso, s * DIM.hipX, DIM.hipY - 0.03, 0)));
        j = Math.max(j, end(r.legs[k], true).distanceTo(W(r.boots[k], 0, DIM.ankleH, 0.02)));
      }
      const k0 = c.collider.translation(), q = c.collider.rotation();
      const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      const out = (p: THREE.Vector3) => { const d = p.clone().sub(k0 as THREE.Vector3Like), tt = Math.max(-CARRIER.halfHeight, Math.min(CARRIER.halfHeight, d.dot(ax))); return d.sub(ax.clone().multiplyScalar(tt)).length() - CARRIER.radius; };
      const ho = Math.max(...r.hands.map((h) => out(h.getWorldPosition(new THREE.Vector3()))));
      const bo = Math.max(...r.boots.map((b) => out(b.getWorldPosition(new THREE.Vector3()))));
      const key = c.down ?? 'pie';
      const w = (worst[key] ??= [0, 0, 0]);
      w[0] = Math.max(w[0], j); w[1] = Math.max(w[1], ho); w[2] = Math.max(w[2], bo);
    }
    console.log(`(${at.x}, ${at.z}) hacia (${dir.x}, ${dir.z}): ` + Object.entries(worst).map(([k, w]) => `${k}: uniones ≤ ${(w[0] * 100).toFixed(2)} cm, manos fuera ≤ ${(w[1] * 100).toFixed(0)} cm, botas fuera ≤ ${(w[2] * 100).toFixed(0)} cm`).join(' | '));
    g.dispose();
  }
}
