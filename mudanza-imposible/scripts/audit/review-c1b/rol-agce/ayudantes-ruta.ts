// Revisor A+G+C+E (ciclo 1, segunda ronda): ayudantes en una partida real (1 humano con el piloto + 5 ayudantes,
// atentos y despistados), sin navegador, con CarrierView real (TiltFit activo). Por fotograma y ayudante:
//  - cuánto se mete su cuerpo dibujado (tronco, cabeza, adornos) en cualquier collider que no sea el suyo (sofá,
//    paredes, suelo, otros porteadores): el criterio de coherencia de T-coh-1;
//  - cuánto sale de su propia cápsula (inclinarse alrededor de los pies lo saca por diseño, como al muñeco);
//  - cuánto de la inclinación pedida se dibuja (TiltFit): si se queda rígido, pierde expresividad.
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/ayudantes-ruta.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
import { CARRIER, CENTER_Y, DOLL_HEIGHT } from '../../../../src/sim/carrier';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { CarrierView, helperBodyMeshes } = await import('../../../../src/view/carrierView');

await RAPIER.init({});
const DT = 1 / 60;

for (const style of ['atentos', 'despistados'] as const) {
  for (const seed of [1, 2]) {
    const g = new Game(RAPIER, { humans: 1, carriers: 6, botStyle: style, seed });
    const ap = new Autopilot(0);
    const vs = g.carriers.map((c) => (c.human === null ? new CarrierView(c, null, undefined, g.world) : null));
    const W: Record<string, { pen: number; pen3: number; n: number; out: number; kSum: number; kN: number; kLow: number }> = {};
    let t = 0;
    for (let i = 0; i < 60 * 120 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(DT, [ap.input(g, DT)]); t += DT;
      if (i % 3) { vs.forEach((v, k) => { if (v) { const gw = g.carriers[k].grabWorld(); v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, t, DT); } }); continue; }
      vs.forEach((v, k) => {
        if (!v) return;
        const c = g.carriers[k], gw = c.grabWorld();
        v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, t, DT);
        if (g.phase !== 'playing') return;
        const w = (W[c.cast.cast] ??= { pen: 0, pen3: 0, n: 0, out: 0, kSum: 0, kN: 0, kLow: 0 });
        v.group.updateMatrixWorld(true);
        const pts: THREE.Vector3[] = [];
        for (const m of helperBodyMeshes((v as unknown as { rig: { pivot: THREE.Object3D } }).rig.pivot)) {
          const pos = m.geometry.attributes.position;
          for (let j = 0; j < pos.count; j += 3) pts.push(new THREE.Vector3().fromBufferAttribute(pos, j).applyMatrix4(m.matrixWorld));
        }
        const near: RAPIER.Collider[] = [];
        g.world.intersectionsWithShape(c.collider.translation(), { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(DOLL_HEIGHT), (o) => { near.push(o); return true; }, undefined, undefined, c.collider);
        let pen = 0;
        for (const col of near) for (const p of pts) {
          const pr = col.projectPoint(p, false);
          if (pr?.isInside) pen = Math.max(pen, Math.hypot(pr.point.x - p.x, pr.point.y - p.y, pr.point.z - p.z));
        }
        w.pen = Math.max(w.pen, pen); if (pen > 0.03) w.pen3++; w.n++;
        if (!c.down) {
          const k0 = c.collider.translation(), hh = CARRIER.halfHeight, r = CARRIER.radius;
          for (const p of pts) { const ty = Math.max(-hh, Math.min(hh, p.y - k0.y)); w.out = Math.max(w.out, Math.hypot(p.x - k0.x, p.y - k0.y - ty, p.z - k0.z) - r); }
          const vv = v as unknown as { pitch: number; roll: number; tilt: { fit: number } };
          if (Math.abs(vv.pitch) + Math.abs(vv.roll) > 0.1) { w.kSum += vv.tilt.fit; w.kN++; if (vv.tilt.fit < 0.3) w.kLow++; }
        }
      });
    }
    console.log(`${style}, semilla ${seed}: ${g.phase} en ${g.time.toFixed(1)} s`);
    for (const [cast, w] of Object.entries(W)) {
      console.log(`  ${cast}: se mete en otros ≤ ${(w.pen * 100).toFixed(1)} cm (> 3 cm en ${((100 * w.pen3) / w.n).toFixed(1)} % de ${w.n} muestras); sale de su cápsula de pie ≤ ${(w.out * 100).toFixed(1)} cm; inclinación dibujada media ${(w.kSum / (w.kN || 1)).toFixed(2)} (recortada < 0,3 en ${((100 * w.kLow) / (w.kN || 1)).toFixed(0)} % de ${w.kN})`);
    }
    void CENTER_Y;
    g.dispose();
  }
}
