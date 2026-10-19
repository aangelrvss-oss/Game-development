// Verificación vista-10 (manos al agarrar/soltar) y vista-11 (fugas al reiniciar).
// Uso: npx vite-node scripts/audit/verif-vista/v06-manos-fugas.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { headlessWorld } from './harness.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const view = await headlessWorld();
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
view.attach(g);
for (let i = 0; i < (RULES.countdown + 0.5) * 60; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
const c = g.carriers[0], dv = view.carriers[0] as any;
// Se acerca andando al extremo +x y agarra
c.teleport({ x: 2.3, y: CENTER_Y + 0.05, z: 10 }); c.facing = { x: -1, z: 0 };
for (let i = 0; i < 30; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
for (let i = 0; i < 12; i++) { g.step(DT, [inp({ mx: -1 }), NO_INPUT]); view.render(g, g.clock, DT); }
for (let i = 0; i < 10; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
const handPos = () => dv.rig.hands.map((h: THREE.Group) => h.position.clone());
const before = handPos();
g.step(DT, [inp({ grab: true }), NO_INPUT]); view.render(g, g.clock, DT);
const after = handPos();
console.log(`Agarrar: holding=${c.holding}; salto de cada manopla en UN fotograma: ${before.map((b: THREE.Vector3, i: number) => b.distanceTo(after[i]).toFixed(3)).join(' / ')} m`);
// Penetración de la palma (esfera escalada 0,1×0,082×0,12) en el sofá durante 1 s agarrando
const signed = (p: THREE.Vector3) => { let depth = -Infinity; for (const col of g.sofaColliders) { const pr = col.projectPoint(p, false); if (!pr) continue; const d = Math.hypot(p.x - pr.point.x, p.y - pr.point.y, p.z - pr.point.z); depth = Math.max(depth, pr.isInside ? d : -d); } return depth; };
let centerMin = Infinity, vertMax = -Infinity, framesVert = 0; const v = new THREE.Vector3();
for (let i = 0; i < 60; i++) {
  g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT);
  dv.rig.group.updateMatrixWorld(true);
  for (const h of dv.rig.hands as THREE.Group[]) {
    centerMin = Math.min(centerMin, -signed(h.position));
    let worst = -Infinity;
    h.traverse((o: THREE.Object3D) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const pos = m.geometry.getAttribute('position'); for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld); worst = Math.max(worst, signed(v)); } });
    if (worst > 0.005) framesVert++; vertMax = Math.max(vertMax, worst);
  }
}
console.log(`  agarrando 1 s: distancia mínima del centro de la manopla a la superficie del sofá ${centerMin.toFixed(3)} m (fuera); vértices de manopla dentro del sofá >5 mm en ${framesVert}/120 muestras, máx ${vertMax.toFixed(3)} m`);
const gw = c.grabWorld(g.sofa)!; const hw = dv.rig.hands.map((h: THREE.Group) => h.position.distanceTo(new THREE.Vector3(gw.x, gw.y, gw.z)).toFixed(3));
console.log(`  distancia manopla→punto de agarre: ${hw.join(' / ')} m (el asa es un punto: la mano va a ±0,14 m en lateral y +0,06 m a lo largo del antebrazo)`);
const b2 = handPos();
g.step(DT, [inp({ grab: true }), NO_INPUT]); view.render(g, g.clock, DT);
const a2 = handPos();
console.log(`Soltar: holding=${c.holding}; salto de cada manopla en UN fotograma: ${b2.map((b: THREE.Vector3, i: number) => b.distanceTo(a2[i]).toFixed(3)).join(' / ')} m`);

// vista-11: fugas al reiniciar (WorldView.attach con una partida nueva)
const shadowTex = (dv.rig.shadow.material as THREE.MeshBasicMaterial).map!;
let texDisposed = false; shadowTex.addEventListener('dispose', () => { texDisposed = true; });
let shadowMatDisposed = false; (dv.rig.shadow.material as THREE.Material).addEventListener('dispose', () => { shadowMatDisposed = true; });
const brake = (view.cars[0] as any).brake as THREE.Material;
let brakeDisposed = false; brake.addEventListener('dispose', () => { brakeDisposed = true; });
const labelTex = dv.label.material.map as THREE.Texture; let labelDisposed = false; labelTex.addEventListener('dispose', () => { labelDisposed = true; });
const g2 = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 2 });
view.attach(g2);
console.log(`Reinicio (attach): textura de la etiqueta liberada=${labelDisposed}; material de la sombra de contacto liberado=${shadowMatDisposed}; TEXTURA de canvas de la sombra liberada=${texDisposed}; material de freno del coche (ownMat) liberado=${brakeDisposed}`);
