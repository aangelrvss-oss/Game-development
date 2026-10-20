// Muñeco de pie (y andando) en la escalera y en la rampa: altura de la suela dibujada frente al suelo real bajo ella.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/botas-escalera.ts
import * as THREE from 'three';
import { init, f3, DT, RAPIER, Game, inp } from './comun';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { STAIRS, RAMP, FLOOR2 } from '../../../../src/sim/level';
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
await init();
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
const groundAt = (g: Game, x: number, z: number) => {
  const hit = g.world.castRay(new RAPIER.Ray({ x, y: 10, z }, { x: 0, y: -1, z: 0 }), 20, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
  return hit ? 10 - hit.timeOfImpact : 0;
};
for (const [name, at, move] of [
  ['escalera, quieto', { x: 0, z: (STAIRS.z0 + STAIRS.z1) / 2 }, { mx: 0, mz: 0 }],
  ['escalera, subiendo', { x: 0, z: STAIRS.z0 - 0.5 }, { mx: 0, mz: -0.6 }],
  ['rampa, quieto', { x: (RAMP.x0 + RAMP.x1) / 2, z: (RAMP.z0 + RAMP.z1) / 2 }, { mx: 0, mz: 0 }],
] as const) {
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: 5, y: 0.25, z: -36 }, true);
  const c = g.carriers[0];
  g.step(DT, []); // la tubería de consultas se actualiza al dar un paso
  const gy = groundAt(g, at.x, at.z);
  c.teleport({ x: at.x, y: gy + CENTER_Y + 0.05, z: at.z });
  const start = { ...c.pos };
  const v = new DollView(c, 0, g.world, camera);
  let worstFloat = 0, worstSink = 0;
  for (let i = 0; i < 120; i++) {
    g.step(DT, [inp(move)]); v.sync(null, i * DT, DT);
    if (i < 30) continue;
    const rig = (v as unknown as { rig: { boots: THREE.Group[]; group: THREE.Group; feet: { swinging: boolean }[] } }).rig;
    rig.group.updateMatrixWorld(true);
    rig.boots.forEach((b, j) => {
      if (rig.feet[j].swinging) return;
      const p = b.getWorldPosition(new THREE.Vector3());
      const d = p.y - groundAt(g, p.x, p.z);
      worstFloat = Math.max(worstFloat, d); worstSink = Math.min(worstSink, d);
    });
  }
  console.log(`${name}: suela apoyada respecto al suelo real, de ${f3(worstSink)} a ${f3(worstFloat)} m (porteador de (${start.x.toFixed(2)}, ${start.y.toFixed(2)}, ${start.z.toFixed(2)}) a (${c.pos.x.toFixed(2)}, ${c.pos.y.toFixed(2)}, ${c.pos.z.toFixed(2)}))`);
  g.dispose();
}
