// Verificación vista-05: ¿se ven los ojos desde la cámara de juego? ¿qué los tapa? ¿qué tamaño tienen en pantalla?
// Rayo desde la cámara (la de WorldView.updateCamera) al punto frontal de cada ojo; se clasifica el primer
// obstáculo (gorra, cabeza, resto del muñeco, otro muñeco, sofá, nivel). Tamaños proyectados a 1280×720.
// Uso: npx vite-node scripts/audit/verif-vista/v04-caras.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { headlessWorld } from './harness.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60, W = 1280, H = 720;
const view = await headlessWorld(W, H);
const rc = new THREE.Raycaster();
rc.camera = view.camera;
/** Three no salta los objetos ocultos al lanzar rayos: se comprueba el objeto y sus padres. */
const shown = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

function classify(o: THREE.Object3D, dv: any, dolls: any[]) {
  let a: THREE.Object3D | null = o;
  while (a) { if (a === dv.rig.cap) return 'gorra'; a = a.parent; }
  if (o.parent === dv.rig.head && (o as THREE.Mesh).geometry?.type === 'LatheGeometry') return 'cabeza';
  for (const d of dolls) { let b: THREE.Object3D | null = o; while (b) { if (b === d.rig.group) return d === dv ? 'resto del propio muñeco' : 'otro muñeco'; b = b.parent; } }
  let s: THREE.Object3D | null = o; while (s) { if (s === view.sofa.group) return 'sofá'; s = s.parent; }
  return 'nivel/otros';
}
/** Devuelve, para un ojo, null si se ve o el nombre del primer obstáculo. */
function eyeBlock(dv: any, eye: THREE.Mesh, dolls: any[], withLevel: boolean) {
  const target = eye.localToWorld(new THREE.Vector3(0, 0, -0.98));
  const from = view.camera.position.clone();
  const dist = from.distanceTo(target);
  rc.set(from, target.clone().sub(from).normalize()); rc.far = dist - 0.003;
  const objs: THREE.Object3D[] = [...dolls.map((d) => d.rig.group), view.sofa.group];
  if (withLevel) objs.push(view.level.group);
  const hits = rc.intersectObjects(objs, true).filter((h) => h.object !== eye && h.object.parent !== eye && shown(h.object) && h.object !== dv.rig.shadow && !dolls.some((d) => h.object === d.rig.shadow));
  return hits.length ? classify(hits[0].object, dv, dolls) : null;
}
function pxBox(m: THREE.Mesh) {
  const pos = m.geometry.getAttribute('position'); const v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(view.camera); const x = (v.x + 1) * W / 2, y = (1 - v.y) * H / 2; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { w: x1 - x0, h: y1 - y0 };
}
function facingCam(dv: any) {
  const f = new THREE.Vector3(0, 0, -1).transformDirection(dv.rig.head.matrixWorld); f.y = 0; f.normalize();
  const hp = new THREE.Vector3().setFromMatrixPosition(dv.rig.head.matrixWorld);
  const tc = view.camera.position.clone().sub(hp); tc.y = 0; tc.normalize();
  return f.dot(tc);
}
function newGame(humans: number, seed = 1) {
  const g = new Game(RAPIER as any, { humans, carriers: humans, botStyle: 'atentos', seed });
  view.attach(g);
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); view.render(g, g.clock, DT); }
  return g;
}

// A) Estático: J1 quieto mirando de frente a la cámara (+z), J2 lejos
{
  const g = newGame(2);
  const c = g.carriers[0], dv = view.carriers[0] as any;
  g.carriers[1].teleport({ x: -6, y: CENTER_Y + 0.05, z: 16 });
  c.teleport({ x: 0, y: CENTER_Y + 0.05, z: 12.2 }); c.facing = { x: 0, z: 1 };
  for (let i = 0; i < 150; i++) { g.step(DT, [NO_INPUT, NO_INPUT]); view.render(g, g.clock, DT); }
  view.scene.updateMatrixWorld(); view.camera.updateMatrixWorld();
  const hp = new THREE.Vector3().setFromMatrixPosition(dv.rig.head.matrixWorld);
  const d = view.camera.position.clone().sub(hp); const elev = Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180 / Math.PI;
  const res = dv.rig.eyes.map((e: THREE.Mesh) => eyeBlock(dv, e, [dv], true) ?? 'visible');
  const eye = pxBox(dv.rig.eyes[0]), brow = pxBox(dv.rig.brows[0]), head = pxBox(dv.rig.head.children[0] as THREE.Mesh);
  console.log(`A) Quieto de frente: elevación de la cámara vista desde la cabeza ${elev.toFixed(1)}°, distancia ${d.length().toFixed(2)} m, cara hacia la cámara (cos) ${facingCam(dv).toFixed(2)}; ojos: ${res.join(' / ')}`);
  console.log(`   tamaños a ${W}×${H}: ojo ${eye.w.toFixed(1)}×${eye.h.toFixed(1)} px, ceja ${brow.w.toFixed(1)}×${brow.h.toFixed(1)} px, cabeza (sin gorra) ${head.w.toFixed(1)} px de ancho`);
  // Mismo caso sin la visera (oculta solo para la prueba): ¿el obstáculo es la visera o el casquete?
  const brim = dv.rig.cap.children[1] as THREE.Mesh; brim.visible = false;
  const res3 = dv.rig.eyes.map((e: THREE.Mesh) => eyeBlock(dv, e, [dv], true) ?? 'visible');
  brim.visible = true;
  console.log(`   sin la visera: ojos ${res3.join(' / ')}`);
  g.dispose();
}

// B) Recorridos completos con piloto (cada 4 fotogramas)
for (const humans of [2, 4]) {
  const g = newGame(humans, 1);
  const aps = g.carriers.map((c) => new Autopilot(c.id));
  const dolls = view.carriers as any[];
  const vis = dolls.map(() => 0), tot = dolls.map(() => 0), back = dolls.map(() => 0);
  const blockers: Record<string, number> = {}; const blockersFront: Record<string, number> = {};
  const eyePx: number[] = [], headPx: number[] = [];
  let frames = 0;
  while ((g.phase === 'playing' || g.phase === 'countdown') && frames < 180 * 60) {
    g.step(DT, aps.map((a) => a.input(g, DT))); view.render(g, g.clock, DT); frames++;
    if (frames % 4) continue;
    view.scene.updateMatrixWorld(); view.camera.updateMatrixWorld();
    dolls.forEach((dv, k) => {
      if (!dv.rig.debug?.upright) return;
      tot[k]++;
      const fc = facingCam(dv); if (fc < 0) back[k]++;
      let any = false;
      for (const e of dv.rig.eyes) {
        let b = eyeBlock(dv, e, dolls, false);
        if (!b) b = eyeBlock(dv, e, dolls, true);
        if (!b) { any = true; eyePx.push(pxBox(e).w); } else { blockers[b] = (blockers[b] ?? 0) + 1; if (fc >= 0) blockersFront[b] = (blockersFront[b] ?? 0) + 1; }
      }
      if (any) { vis[k]++; headPx.push(pxBox(dv.rig.head.children[0]).w); }
    });
  }
  const sum = Object.values(blockers).reduce((a, b) => a + b, 0), sumF = Object.values(blockersFront).reduce((a, b) => a + b, 0);
  const fmt = (o: Record<string, number>, s: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / s).toFixed(1)}%`).join(', ');
  eyePx.sort((a, b) => a - b); headPx.sort((a, b) => a - b);
  const q = (a: number[], p: number) => (a.length ? a[Math.floor(p * (a.length - 1))].toFixed(1) : '-');
  console.log(`B) Piloto ${humans}J (fase ${g.phase}, ${frames} fotogramas): algún ojo visible: ${vis.map((v, k) => `J${k + 1} ${((100 * v) / Math.max(1, tot[k])).toFixed(0)}%`).join(', ')}; de espaldas a la cámara: ${back.map((v, k) => `J${k + 1} ${((100 * v) / Math.max(1, tot[k])).toFixed(0)}%`).join(', ')}`);
  console.log(`   obstáculos (todos los ojos tapados): ${fmt(blockers, sum)}`);
  console.log(`   obstáculos con la cara hacia la cámara: ${fmt(blockersFront, sumF)} (n=${sumF})`);
  console.log(`   cuando se ve: ancho de ojo p10/p50/p90 ${q(eyePx, 0.1)}/${q(eyePx, 0.5)}/${q(eyePx, 0.9)} px; ancho de cabeza p10/p50/p90 ${q(headPx, 0.1)}/${q(headPx, 0.5)}/${q(headPx, 0.9)} px`);
  g.dispose();
}
