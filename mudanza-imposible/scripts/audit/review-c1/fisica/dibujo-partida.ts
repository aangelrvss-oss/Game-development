// Recorrido completo con 2 y 4 humanos (piloto) y sus muñecos reales: cuánto y cuántas veces se mete cada parte del
// muñeco dibujado en el sofá y en lo fijo (paredes, escalera). Uso:
// ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/dibujo-partida.ts
import * as THREE from 'three';
import { init, f3, DT, RAPIER, Game } from './comun';
import { Autopilot } from '../../../../src/sim/autopilot';
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
await init();
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
camera.position.set(0, 14, 20);

type Part = 'tronco+cabeza' | 'piernas' | 'botas';
function parts(view: InstanceType<typeof DollView>): Record<Part, THREE.Mesh[]> {
  const rig = (view as unknown as { rig: { torso: THREE.Object3D; legs: { geometry: THREE.BufferGeometry }[]; boots: THREE.Group[]; group: THREE.Group } }).rig;
  const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };
  const legG = new Set(rig.legs.map((l) => l.geometry));
  return { 'tronco+cabeza': meshes(rig.torso), piernas: meshes(rig.group).filter((m) => legG.has(m.geometry)), botas: rig.boots.flatMap(meshes) };
}
export let lastHit: { col: RAPIER.Collider | null; p: THREE.Vector3 } = { col: null, p: new THREE.Vector3() };
function depthInto(cols: RAPIER.Collider[], ms: THREE.Mesh[], every = 3) {
  let worst = 0;
  const v = new THREE.Vector3();
  for (const m of ms) {
    m.updateMatrixWorld(true);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += every) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      for (const c of cols) { const pr = c.projectPoint(v, false); if (pr?.isInside) { const d = Math.hypot(pr.point.x - v.x, pr.point.y - v.y, pr.point.z - v.z); if (d > worst) { worst = d; lastHit = { col: c, p: v.clone() }; } } }
    }
  }
  return worst;
}

for (const n of [2, 4]) {
  const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  const aps = Autopilot.team(g);
  const views = g.carriers.map((c) => new DollView(c, c.human ?? 0, g.world, camera));
  const ps = views.map(parts);
  const worst: Record<Part, number> = { 'tronco+cabeza': 0, piernas: 0, botas: 0 };
  const over3: Record<Part, number> = { 'tronco+cabeza': 0, piernas: 0, botas: 0 };
  let samples = 0, frame = 0;
  const where: Record<Part, string> = { 'tronco+cabeza': '', piernas: '', botas: '' };
  const overSofa: Record<Part, number> = { 'tronco+cabeza': 0, piernas: 0, botas: 0 };
  for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++, frame++) {
    g.step(DT, aps.map((a) => a.input(g, DT)));
    views.forEach((v, k) => { const gw = g.carriers[k].grabWorld(); v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, i * DT, DT); });
    if (i % 3) continue;
    samples++;
    for (const [k, p] of ps.entries()) {
      // Sofá y lo fijo cercano
      const near: RAPIER.Collider[] = [...g.sofaColliders];
      const c = g.carriers[k].collider;
      g.world.intersectionsWithShape(c.translation(), { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(1.6), (o) => { if (o.parent()?.isFixed()) near.push(o); return true; });
      for (const part of Object.keys(worst) as Part[]) {
        const d = depthInto(near, p[part]);
        if (d > worst[part]) {
          worst[part] = d;
          const isSofa = g.sofaColliders.includes(lastHit.col!);
          const cp = g.carriers[k].pos, sp = g.sofaPos;
          where[part] = `${isSofa ? 'sofá' : 'fijo'} en (${lastHit.p.x.toFixed(2)}, ${lastHit.p.y.toFixed(2)}, ${lastHit.p.z.toFixed(2)}), J${k + 1} en (${cp.x.toFixed(2)}, ${cp.y.toFixed(2)}, ${cp.z.toFixed(2)}) ${g.carriers[k].holding ? 'agarrando' : 'suelto'}${g.carriers[k].down ? ' ' + g.carriers[k].down : ''}, sofá (${sp.x.toFixed(1)}, ${sp.y.toFixed(2)}, ${sp.z.toFixed(1)}), t=${(i / 60).toFixed(1)}`;
        }
        if (d > 0.03) { over3[part]++; if (g.sofaColliders.includes(lastHit.col!)) overSofa[part]++; }
      }
    }
  }
  console.log(`${n} humanos, recorrido ${g.phase} (${(frame / 60).toFixed(1)} s), ${samples} muestras × ${n} muñecos: ` + (Object.keys(worst) as Part[]).map((k) => `${k} máx ${f3(worst[k])} m (${over3[k]} muestras > 3 cm, ${overSofa[k]} en el sofá)`).join('; '));
  for (const k of Object.keys(worst) as Part[]) console.log(`   peor ${k}: ${where[k]}`);
  g.dispose();
}
