// Revisión ciclo 2, rol arte: cuánto sobresale el sofá DIBUJADO de sus cajas de choque, en 657fd30 y en 5cab122
// (sin contorno). Uso: npx vite-node scripts/audit/review-c2/arte/sofa-sobresale.ts
import * as THREE from 'three';
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const B = '/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src';
const { SofaView: SofaBase } = await import(`${B}/view/sofaView`);
const { SofaView: SofaC2 } = await import('../../../../src/view/sofaView');
const { ITEMS } = await import('../../../../src/sim/items');
const shape = ITEMS.sofa.shape;
function report(name: string, root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const byPart: Record<string, number> = {};
  let worst = 0, total = 0, over3 = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || (m.material as THREE.Material).side === THREE.BackSide) return;
    const pos = m.geometry.attributes.position;
    let w = 0;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      let best = Infinity;
      for (const b of shape) { const dx = Math.max(0, Math.abs(p.x - b.p.x) - b.h.x), dy = Math.max(0, Math.abs(p.y - b.p.y) - b.h.y), dz = Math.max(0, Math.abs(p.z - b.p.z) - b.h.z); best = Math.min(best, Math.hypot(dx, dy, dz)); }
      w = Math.max(w, best); total++; if (best > 0.03) over3++;
    }
    const key = `${m.geometry.type}`;
    byPart[key] = Math.max(byPart[key] ?? 0, w);
    worst = Math.max(worst, w);
  });
  const bb = new THREE.Box3().setFromObject(root);
  console.log(`${name}: sobresale como máximo ${(worst * 100).toFixed(1)} cm; vértices a más de 3 cm: ${((100 * over3) / total).toFixed(1)} %; caja envolvente dibujada ${bb.min.toArray().map((v) => v.toFixed(2))} → ${bb.max.toArray().map((v) => v.toFixed(2))}; por geometría ${JSON.stringify(Object.fromEntries(Object.entries(byPart).map(([k, v]) => [k, +(v * 100).toFixed(1)])))}`);
}
const base = new SofaBase();
report('657fd30 (base)', base.group);
const c2 = new SofaC2(ITEMS.sofa);
report('5cab122 (ciclo 2)', c2.group);
