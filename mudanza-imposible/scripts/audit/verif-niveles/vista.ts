// Verificación independiente (auditoría «niveles»): construye la vista del nivel en Node con un `document`
// mínimo (canvas falso que ignora el dibujo) y mide lo que hace `buildLevel()` sin tocar el código del juego.
// Uso: npx vite-node scripts/audit/verif-niveles/vista.ts
import * as THREE from 'three';

// --- DOM mínimo: canvas cuyo contexto 2D acepta cualquier llamada ---
let canvases = 0;
const ctx2d: any = new Proxy({}, {
  get(t: any, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set(t: any, k, v) { t[k] = v; return true; },
});
(globalThis as any).document = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error('solo canvas: ' + tag);
    canvases++;
    return { width: 300, height: 150, style: {}, getContext: () => ctx2d };
  },
};

const { buildLevel } = await import('../../../src/view/levelView.ts');
const { windowsTex } = await import('../../../src/view/textures.ts');

const light = (cars: string, ped: string) => ({ cars, ped, left: 3 });
const sofa = { x: 0, y: 0.6, z: 10 };

const c0 = canvases;
const lv = buildLevel();
const g = lv.group;
g.updateMatrixWorld(true);
console.log(`canvas creados en la 1.ª construcción: ${canvases - c0}`);

// --- Inventario de lo que queda en la escena tras mergeStatic ---
const fade = new Set<THREE.Object3D>(lv.fadeables);
let meshes = 0, inst = 0, sprites = 0, multi = 0, multiGroups = 0, fadeN = 0, merged = 0, mergedTris = 0, bigMerged = 0;
const multiList: string[] = [];
g.traverse((o) => {
  if ((o as THREE.Sprite).isSprite) { sprites++; return; }
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  meshes++;
  if ((m as THREE.InstancedMesh).isInstancedMesh) { inst++; return; }
  if (Array.isArray(m.material)) {
    multi++; multiGroups += m.geometry.groups.length;
    multiList.push(`(${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}) ${m.material.length} mats/${m.geometry.groups.length} grupos`);
    return;
  }
  if (fade.has(m)) { fadeN++; return; }
  if (m.position.lengthSq() === 0 && !m.geometry.index) {
    merged++;
    mergedTris += m.geometry.getAttribute('position').count / 3;
    m.geometry.computeBoundingBox();
    const s = m.geometry.boundingBox!.getSize(new THREE.Vector3());
    if (Math.max(s.x, s.z) > 40) bigMerged++;
  }
});
console.log(`mallas=${meshes} (instanciadas=${inst}, multimaterial=${multi}, recortables=${fadeN}, fundidas=${merged}), sprites=${sprites}`);
console.log(`multimaterial sin fundir: ${multi} mallas, ${multiGroups} grupos => ${multiGroups} llamadas de dibujo en el pase de color`);
console.log('  ' + multiList.join('\n  '));
console.log(`fundidas: ${merged} mallas, ${mergedTris} triángulos; de ellas ${bigMerged} con caja envolvente de más de 40 m (no se descartan por cámara)`);

// --- Zona de entrega: ¿se funde? ¿sigue animándose? ---
let zoneMesh: THREE.Mesh | null = null;
g.traverse((o) => {
  const m = o as THREE.Mesh;
  if (m.isMesh && !Array.isArray(m.material) && (m.material as any).isMeshBasicMaterial && (m.material as THREE.MeshBasicMaterial).map) zoneMesh = m;
});
if (zoneMesh) {
  const zm = zoneMesh as THREE.Mesh;
  zm.geometry.computeBoundingBox();
  const bb = zm.geometry.boundingBox!;
  const mm = zm.material as THREE.MeshBasicMaterial;
  console.log(`zona: malla en escena con posición (${zm.position.toArray().map((v) => v.toFixed(2))}), geometría indexada=${!!zm.geometry.index}, caja geom x ${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)} z ${bb.min.z.toFixed(2)}..${bb.max.z.toFixed(2)} y=${bb.min.y.toFixed(3)}`);
  lv.update(0.4, light('green', 'red'), true, 5, sofa); const a = mm.opacity;
  lv.update(0.4, light('green', 'red'), false, 4, sofa); const b = mm.opacity;
  console.log(`  opacidad tras update(zoneActive=true)=${a.toFixed(4)}; tras update(zoneActive=false)=${b.toFixed(4)} -> la malla fundida ${a !== b ? 'SÍ' : 'NO'} se anima (comparte el material)`);
} else console.log('zona: no encontrada');

// --- Focos del semáforo: ¿fundidos? ¿cambian de color? ---
const colOf = new Map<THREE.Material, string>();
const allMats = new Set<THREE.Material>();
g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material)) allMats.add(m.material); });
lv.update(1, light('green', 'red'), false, 0, sofa);
for (const m of allMats) if ((m as any).color) colOf.set(m, (m as any).color.getHexString());
lv.update(1, light('red', 'green'), false, 0, sofa);
const changed = [...allMats].filter((m) => (m as any).color && (m as any).color.getHexString() !== colOf.get(m));
let bulbMerged = 0, bulbOrig = 0;
g.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || Array.isArray(m.material) || !changed.includes(m.material)) return;
  if (m.position.lengthSq() === 0 && !m.geometry.index) bulbMerged++; else bulbOrig++;
});
console.log(`semáforos: ${changed.length} materiales cambian de color con update(); mallas que los usan: fundidas=${bulbMerged}, originales=${bulbOrig}`);

// --- Camión: ¿queda algo que se pueda mover? ---
const kids = g.children;
const entrega = kids.findIndex((o) => (o as THREE.Sprite).isSprite && Math.abs(o.position.x - 25.75) < 0.01 && Math.abs(o.position.y - 2.2) < 0.01);
const truck = kids[entrega - 1];
console.log(`camión: hijo previo al letrero ENTREGA es ${truck?.type} con ${truck?.children.length} hijos (el grupo t de addTruck, vaciado por mergeStatic)`);
let truckMeshes = 0;
g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.position.x > 27.9 && m.position.x < 37 && m.position.z < -26 && m.position.z > -34.5) truckMeshes++; });
console.log(`  mallas con su origen dentro del camión que siguen sueltas en la escena: ${truckMeshes}`);

// --- dispose / reconstrucción ---
console.log(`LevelView tiene dispose: ${'dispose' in lv}`);
const geos1 = new Set<string>(), mats1 = new Set<string>(), texs1 = new Set<string>();
const collect = (root: THREE.Object3D, gs: Set<string>, ms: Set<string>, ts: Set<string>) => root.traverse((o) => {
  const m = o as THREE.Mesh;
  if (m.geometry) gs.add(m.geometry.uuid);
  const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
  for (const x of mats) { ms.add(x.uuid); const map = (x as any).map as THREE.Texture | null; if (map) ts.add(map.uuid); }
});
collect(g, geos1, mats1, texs1);
const c1 = canvases;
const lv2 = buildLevel();
const geos2 = new Set<string>(), mats2 = new Set<string>(), texs2 = new Set<string>();
collect(lv2.group, geos2, mats2, texs2);
const nuevos = (a: Set<string>, b: Set<string>) => [...b].filter((x) => !a.has(x)).length;
console.log(`2.ª construcción: canvas nuevos=${canvases - c1}; geometrías nuevas=${nuevos(geos1, geos2)}/${geos2.size}; materiales nuevos=${nuevos(mats1, mats2)}/${mats2.size}; texturas nuevas=${nuevos(texs1, texs2)}/${texs2.size}`);

// --- Caché de windowsTex ---
const a1 = windowsTex('#123456', '#654321', 1), a2 = windowsTex('#123456', '#654321', 2);
console.log(`windowsTex(misma pared y persiana, semilla 1 y 2) devuelve la misma textura: ${a1 === a2}`);
