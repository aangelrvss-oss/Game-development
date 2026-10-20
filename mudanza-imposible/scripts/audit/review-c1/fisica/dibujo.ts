// Lo dibujado frente al cuerpo físico (T-coh-1), con el muñeco real en Node: las pruebas del ciclo solo miden tronco
// y cabeza. Aquí se miden también piernas, botas, brazos y manos metidos en el sofá, y el tronco en situaciones que
// las pruebas no cubren (a la carrera contra el sofá, el sofá llevado por otros contra uno que está quieto, agarrado
// por un costado andando a lo largo). Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/dibujo.ts
import * as THREE from 'three';
import { init, setup, near, inp, f3, SOFA, DT, NO_INPUT, OPEN, standY, RAPIER } from './comun';
import type { Game } from '../../../../src/sim/game';
import type { PlayerInput } from '../../../../src/sim/types';
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
await init();
const h = SOFA.half;
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
camera.position.set(0, 14, 20);

type Part = 'tronco+cabeza' | 'piernas' | 'botas' | 'brazos' | 'manos';
function parts(view: InstanceType<typeof DollView>): Record<Part, THREE.Mesh[]> {
  const rig = (view as unknown as { rig: { torso: THREE.Object3D; legs: { geometry: THREE.BufferGeometry }[]; arms: { geometry: THREE.BufferGeometry }[]; boots: THREE.Group[]; hands: THREE.Group[]; group: THREE.Group } }).rig;
  const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };
  const all = meshes(rig.group);
  const legG = new Set(rig.legs.map((l) => l.geometry)), armG = new Set(rig.arms.map((l) => l.geometry));
  return {
    'tronco+cabeza': meshes(rig.torso),
    piernas: all.filter((m) => legG.has(m.geometry)),
    botas: rig.boots.flatMap(meshes),
    brazos: all.filter((m) => armG.has(m.geometry)),
    manos: rig.hands.flatMap(meshes),
  };
}

function depthInto(cols: RAPIER.Collider[], ms: THREE.Mesh[], every = 2) {
  let worst = 0;
  const v = new THREE.Vector3();
  for (const m of ms) {
    m.updateMatrixWorld(true);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += every) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      for (const c of cols) {
        const pr = c.projectPoint(v, false);
        if (pr?.isInside) worst = Math.max(worst, Math.hypot(pr.point.x - v.x, pr.point.y - v.y, pr.point.z - v.z));
      }
    }
  }
  return worst;
}

type Case = { name: string; n: number; place: (g: Game) => void; input: (g: Game, i: number) => PlayerInput[]; frames: number };
const cases: Case[] = [
  { name: 'J1 a la carrera contra el costado del sofá (sin agarrar)', n: 1, frames: 120,
    place: (g) => { g.carriers[0].teleport({ x: OPEN.x, y: standY, z: OPEN.z + 4 }); }, input: () => [inp({ mz: -1 })] },
  { name: 'J1 empuja el costado y anda a lo largo pegado al sofá', n: 1, frames: 180,
    place: (g) => near(g, 0, -0.8, h.z, 0, 1, 0.34), input: () => [inp({ mx: 0.6, mz: -0.4 })] },
  { name: 'Dos llevan el sofá a lo largo (-x) 3 s', n: 2, frames: 200,
    place: (g) => { near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0); },
    input: (_g, i) => (i === 0 ? [inp({ grab: true }), inp({ grab: true })] : i < 40 ? [NO_INPUT, NO_INPUT] : [inp({ mx: -1 }), inp({ mx: -1 })]) },
  { name: 'J1 agarra por el costado y andan de lado (a lo largo del sofá)', n: 2, frames: 200,
    place: (g) => { near(g, 0, 0, h.z, 0, 1); near(g, 1, h.x, 0, 1, 0); },
    input: (_g, i) => (i === 0 ? [inp({ grab: true }), inp({ grab: true })] : i < 40 ? [NO_INPUT, NO_INPUT] : [inp({ mx: 1 }), inp({ mx: 1 })]) },
  { name: 'J2 y J3 llevan el sofá contra J1, que está quieto', n: 3, frames: 220,
    place: (g) => { near(g, 1, -h.x, 0, -1, 0); near(g, 2, h.x, 0, 1, 0); g.carriers[0].teleport({ x: OPEN.x, y: standY, z: OPEN.z + h.z + 1.1 }); },
    input: (_g, i) => (i === 0 ? [NO_INPUT, inp({ grab: true }), inp({ grab: true })] : i < 40 ? [NO_INPUT, NO_INPUT, NO_INPUT] : [NO_INPUT, inp({ mz: 1 }), inp({ mz: 1 })]) },
  { name: 'Dos llevan el sofá y lo giran tirando en sentidos opuestos', n: 2, frames: 200,
    place: (g) => { near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0); },
    input: (_g, i) => (i === 0 ? [inp({ grab: true }), inp({ grab: true })] : i < 40 ? [NO_INPUT, NO_INPUT] : [inp({ mz: -1 }), inp({ mz: 1 })]) },
];

for (const cs of cases) {
  const g = setup(cs.n);
  const views = g.carriers.map((c) => new DollView(c, c.human ?? 0, g.world, camera));
  cs.place(g);
  for (let i = 0; i < 10; i++) g.step(DT, []);
  const worst: Record<Part, number> = { 'tronco+cabeza': 0, piernas: 0, botas: 0, brazos: 0, manos: 0 };
  const over3: Record<Part, number> = { 'tronco+cabeza': 0, piernas: 0, botas: 0, brazos: 0, manos: 0 };
  let capsule = 0;
  const ps = views.map(parts);
  for (let i = 0; i < cs.frames; i++) {
    g.step(DT, cs.input(g, i));
    views.forEach((v, k) => { const gw = g.carriers[k].grabWorld(); v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, i * DT, DT); });
    for (const c of g.carriers) for (const s of g.sofaColliders) { const k = c.collider.contactCollider(s, 0); if (k && k.distance < 0) capsule = Math.max(capsule, -k.distance); }
    if (i % 2) continue;
    for (const p of ps) for (const part of Object.keys(worst) as Part[]) {
      const d = depthInto(g.sofaColliders, p[part], 3);
      worst[part] = Math.max(worst[part], d);
      if (d > 0.03) over3[part]++;
    }
  }
  console.log(`${cs.name}: cápsula ${f3(capsule)} m | ` + (Object.keys(worst) as Part[]).map((k) => `${k} ${f3(worst[k])} (${over3[k]} fot. >3 cm)`).join(', '));
  g.dispose();
}
