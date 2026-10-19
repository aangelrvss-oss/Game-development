// Verificación vista-05 (complemento): muñeco quieto mirando a la cámara (+z), a distintas distancias del
// objetivo de la cámara (=> distintas elevaciones). ¿Qué ojos tapa la gorra? También con la cabeza girada ±0,4 rad.
// Uso: npx vite-node scripts/audit/verif-vista/v04b-caras-barrido.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { headlessWorld } from './harness.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const view = await headlessWorld(1280, 720);
const rc = new THREE.Raycaster(); rc.camera = view.camera;
const shown = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function eyeBlock(dv: any, eye: THREE.Mesh) {
  const target = eye.localToWorld(new THREE.Vector3(0, 0, -0.98));
  const from = view.camera.position.clone(); const dist = from.distanceTo(target);
  rc.set(from, target.clone().sub(from).normalize()); rc.far = dist - 0.003;
  const hits = rc.intersectObject(dv.rig.group, true).filter((h) => h.object !== eye && h.object.parent !== eye && shown(h.object) && h.object !== dv.rig.shadow);
  if (!hits.length) return 'visible';
  let a: THREE.Object3D | null = hits[0].object; const brim = dv.rig.cap.children[1];
  if (a === brim) return 'visera';
  while (a) { if (a === dv.rig.cap) return 'casquete'; a = a.parent; }
  return 'otro';
}
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
view.attach(g);
for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
g.carriers[1].teleport({ x: 1.6, y: CENTER_Y + 0.05, z: 10 });
const c = g.carriers[0], dv = view.carriers[0] as any;
for (const z of [6, 8, 10.2, 11.5, 12.2, 13, 14, 15]) {
  c.teleport({ x: -1.8, y: CENTER_Y + 0.05, z }); c.facing = { x: 0, z: 1 };
  for (let i = 0; i < 150; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
  view.scene.updateMatrixWorld(); view.camera.updateMatrixWorld();
  const hp = new THREE.Vector3().setFromMatrixPosition(dv.rig.head.matrixWorld);
  const d = view.camera.position.clone().sub(hp); const elev = Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180 / Math.PI;
  const base = dv.rig.eyes.map((e: THREE.Mesh) => eyeBlock(dv, e)).join('/');
  // cabeza girada (como cuando mira de lado): se fuerza el giro de la cabeza solo para medir
  const turned = [-0.4, 0.4].map((yaw) => { dv.rig.head.rotation.y = yaw; dv.rig.group.updateMatrixWorld(true); return dv.rig.eyes.map((e: THREE.Mesh) => eyeBlock(dv, e)).join('/'); });
  console.log(`z=${z.toString().padEnd(4)} elevación ${elev.toFixed(1)}°: ojos (izq/dcho) ${base}; cabeza girada -0,4: ${turned[0]}; +0,4: ${turned[1]}`);
}
