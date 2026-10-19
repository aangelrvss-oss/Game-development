// Verificación vista-07 (coste de dibujo), vista-09 (DoubleSide del peto), vista-12 (fusión estática) y vista-13 (fx).
// Cuenta sobre el grafo de escena real (sin GPU): mallas, materiales, geometrías, triángulos, proyectores de sombra
// y llamadas de dibujo estimadas como hace WebGLRenderer.projectObject (visible + frustum, 1 por grupo de material).
// Uso: npx vite-node scripts/audit/verif-vista/v05-coste.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { headlessWorld } from './harness.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const view = await headlessWorld(1280, 720);

const tris = (m: THREE.Mesh) => { const gm = m.geometry; const n = gm.index ? gm.index.count : gm.getAttribute('position').count; return (n / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1); };
function stats(root: THREE.Object3D, cam?: THREE.Camera) {
  const fr = new THREE.Frustum();
  if (cam) { cam.updateMatrixWorld(); fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); }
  root.updateMatrixWorld(true);
  let meshes = 0, calls = 0, tri = 0, casters = 0, sprites = 0;
  const mats = new Set<THREE.Material>(), geos = new Set<THREE.BufferGeometry>();
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh || (o as THREE.Sprite).isSprite) {
      if ((o as THREE.Sprite).isSprite) sprites++; else meshes++;
      const ms = Array.isArray(m.material) ? m.material : [m.material];
      ms.forEach((x) => mats.add(x)); geos.add(m.geometry);
      if (m.castShadow && m.isMesh) casters++;
      const inView = !cam || m.frustumCulled === false || ((o as THREE.Sprite).isSprite ? fr.intersectsSprite(o as THREE.Sprite) : fr.intersectsObject(m));
      if (inView) { calls += Array.isArray(m.material) && m.geometry.groups.length ? m.geometry.groups.length : 1; if (m.isMesh) tri += tris(m); }
    }
    for (const ch of o.children) walk(ch);
  };
  walk(root);
  return { meshes, sprites, calls, tri: Math.round(tri), casters, mats: mats.size, geos: geos.size };
}

for (const humans of [2, 4]) {
  const g = new Game(RAPIER as any, { humans, carriers: humans, botStyle: 'atentos', seed: 1 });
  view.attach(g);
  for (let i = 0; i < (RULES.countdown + 0.5) * 60; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); view.render(g, g.clock, DT); }
  const dv = view.carriers[0] as any;
  if (humans === 2) {
    const d = stats(dv.rig.group);
    // todas las mallas (incluida la boca oculta) y materiales nuevos
    let all = 0; dv.rig.group.traverse((o: THREE.Object3D) => { if ((o as THREE.Mesh).isMesh) all++; });
    console.log(`Muñeco (rig.group): ${all} mallas en total, ${d.meshes} visibles (=llamadas sin recorte), ${d.mats} materiales, ${d.geos} geometrías, ${d.tri} triángulos, ${d.casters} proyectores de sombra`);
    const eyes = dv.rig.eyes as THREE.Mesh[]; console.log(`  ¿los dos ojos comparten geometría? ${eyes[0].geometry === eyes[1].geometry}; ¿material? ${eyes[0].material === eyes[1].material}`);
    const s = stats(view.sofa.group); console.log(`Sofá (group): ${s.meshes} mallas visibles (llamadas), ${s.tri} triángulos, ${s.mats} materiales, ${s.casters} proyectores`);
    // vista-09: material del peto a doble cara
    const over = (dv.rig.torso.children[1] as THREE.Mesh).material as THREE.Material;
    let shareOver = 0; dv.rig.group.traverse((o: THREE.Object3D) => { if ((o as THREE.Mesh).material === over) shareOver++; });
    console.log(`vista-09: material del peto (torso.children[1]) side=${over.side === THREE.DoubleSide ? 'DoubleSide' : over.side}; mallas que lo comparten: ${shareOver}`);
    // vista-12: fusión estática y fadeables
    const lv = view.level; let big = 0, merged = 0, maxR = 0; const uniq = new Map<THREE.Material, number>(); let lvMeshes = 0;
    lv.group.traverse((o: THREE.Object3D) => { const m = o as THREE.Mesh; if (!m.isMesh) return; lvMeshes++; (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => uniq.set(x, (uniq.get(x) ?? 0) + 1)); });
    let uniqueMatMeshes = 0; lv.group.traverse((o: THREE.Object3D) => { const m = o as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return; if (uniq.get(m.material) === 1) uniqueMatMeshes++; });
    for (const ch of lv.group.children) { const m = ch as THREE.Mesh; if (!m.isMesh || m.parent !== lv.group) continue; m.geometry.computeBoundingSphere(); const r = m.geometry.boundingSphere!.radius; if (m.geometry.getAttribute('position').count > 500 && !lv.fadeables.includes(m)) { merged++; maxR = Math.max(maxR, r); if (r > 20) big++; } }
    let multi = 0; lv.group.traverse((o: THREE.Object3D) => { if (Array.isArray((o as THREE.Mesh).material)) multi++; });
    console.log(`vista-12: nivel ${lvMeshes} mallas, ${uniq.size} materiales, ${uniqueMatMeshes} mallas con material único, ${lv.fadeables.length} fadeables; mallas fundidas grandes: ${merged} (radio de esfera envolvente máx ${maxR.toFixed(1)} m; ${big} con radio > 20 m); mallas multimaterial sin fundir: ${multi}`);
    const fadeOwn = lv.fadeables.filter((m: THREE.Mesh) => uniq.get(m.material as THREE.Material) === 1).length;
    console.log(`  fadeables con material propio: ${fadeOwn}/${lv.fadeables.length}`);
  }
  view.scene.updateMatrixWorld();
  const sc = stats(view.scene, view.camera);
  const dolls = view.carriers.map((v: any) => stats(v.rig.group, view.camera));
  console.log(`Escena ${humans}J (al empezar, cámara de juego, 1280×720): ~${sc.calls} llamadas de dibujo estimadas (pasada principal), ${(sc.tri / 1000).toFixed(1)} k triángulos, ${sc.meshes} mallas + ${sc.sprites} sprites, ${sc.mats} materiales, ${sc.geos} geometrías, ${sc.casters} mallas proyectoras de sombra | muñecos: ${dolls.map((d) => d.calls).join('+')} llamadas, ${(dolls.reduce((a, d) => a + d.tri, 0) / 1000).toFixed(1)} k triángulos`);
  g.dispose();
}
// vista-13: confeti de la victoria (main.ts:193 → fx.confetti(…, 70))
view.fx.clear();
view.fx.confetti({ x: 0, y: 0, z: 0 }, 70);
const mats = new Set<THREE.Material>(); let n = 0; view.fx.group.traverse((o: THREE.Object3D) => { const m = o as THREE.Mesh; if (m.isMesh) { n++; mats.add(m.material as THREE.Material); } });
console.log(`vista-13: confeti(70): ${n} mallas con ${mats.size} materiales distintos`);
