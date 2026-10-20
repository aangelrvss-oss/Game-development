// Revisor A+G+C+E (ciclo 1, segunda ronda): ayudantes sin cerebro, de pie y en reposo, y tumbados: cuánto sale de su
// cápsula el cuerpo dibujado (tronco, cabeza, adornos), las piernas y botas, y cuánto se mete bajo el suelo. Mide
// por su cuenta lo que el informe da como «≤ 1,4 cm» (tronco y cabeza) y «6,4–9,4 cm» (con piernas y botas).
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/ayudantes-reposo.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Game } from '../../../../src/sim/game';
import { CARRIER, CENTER_Y } from '../../../../src/sim/carrier';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { CarrierView } = await import('../../../../src/view/carrierView');

await RAPIER.init({});
const DT = 1 / 60;
const g = new Game(RAPIER, { humans: 0, carriers: 6, botStyle: 'atentos', seed: 1 });
g.bots.clear();
g.phase = 'playing'; g.countdown = 0;
g.sofa.setTranslation({ x: -35, y: 0.25, z: 21 }, true);
const place = () => g.carriers.forEach((c, i) => { c.teleport({ x: -42 + i * 3, y: CENTER_Y + 0.05, z: 28 }); c.facing = { x: 1, z: 0 }; });
place();
const vs = g.carriers.map((c) => new CarrierView(c, null, undefined, g.world));
let t = 0;
function measure(v: InstanceType<typeof CarrierView>) {
  const c = v.carrier; v.group.updateMatrixWorld(true);
  const k = c.collider.translation(), q = c.collider.rotation();
  const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  const hh = CARRIER.halfHeight, r = CARRIER.radius, feet = c.down ? c.pos.y - r : c.pos.y - CENTER_Y;
  const res = { body: 0, limbs: 0, below: 0 };
  const walk = (o: THREE.Object3D, limb: boolean) => {
    if (o.userData.outline) return;
    const l = limb || !!o.userData.limb;
    if ((o as THREE.Mesh).isMesh) {
      const pos = (o as THREE.Mesh).geometry.attributes.position, w = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const d = w.clone().sub(k as THREE.Vector3Like), tt = Math.max(-hh, Math.min(hh, d.dot(ax)));
        const out = d.sub(ax.clone().multiplyScalar(tt)).length() - r;
        if (l) res.limbs = Math.max(res.limbs, out); else res.body = Math.max(res.body, out);
        res.below = Math.max(res.below, feet - w.y);
      }
    }
    for (const ch of o.children) walk(ch, l);
  };
  walk((v as unknown as { rig: { pivot: THREE.Object3D } }).rig.pivot, false);
  return res;
}
const run = (n: number, label: string) => {
  const worst = new Map<string, { body: number; limbs: number; below: number }>();
  for (let i = 0; i < n; i++) {
    g.step(DT, []); t += DT;
    for (const v of vs) {
      v.sync(null, t, DT);
      const m = measure(v), key = v.carrier.cast.cast, w = worst.get(key) ?? { body: 0, limbs: 0, below: 0 };
      worst.set(key, { body: Math.max(w.body, m.body), limbs: Math.max(w.limbs, m.limbs), below: Math.max(w.below, m.below) });
    }
  }
  console.log(`${label}: ` + [...worst].map(([k, w]) => `${k} cuerpo ${(w.body * 100).toFixed(1)} cm, piernas/botas ${(w.limbs * 100).toFixed(1)}, bajo suelo ${(w.below * 100).toFixed(1)}`).join(' | '));
};
run(40, 'DE PIE');
for (const [label, sgn] of [['TUMBADOS DELANTE', 1], ['TUMBADOS ATRÁS', -1]] as const) {
  g.carriers.forEach((c) => c.knockDown({ x: sgn * c.facing.x, z: sgn * c.facing.z }, CARRIER.fallTime, 'balance'));
  run(Math.round(CARRIER.fallTime / DT), label);
  run(40, `${label} → levantándose y de pie`);
  place();
  run(20, 'de pie otra vez');
}
console.log('Escalas (fitScale):', vs.map((v) => `${v.carrier.cast.cast} ${v.fit.toFixed(2)}`).join(', '));
g.dispose();
