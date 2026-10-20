// Depuración de las piernas estiradas de dibujo-partida.ts: en el recorrido a dos, momentos en que una bota dibujada
// queda a más de 0,9 m (en horizontal) del centro de su porteador, y qué pasa entonces.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/pies.ts
import * as THREE from 'three';
import { init, f2, DT, RAPIER, Game } from './comun';
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

const n = Number(process.argv[2] ?? 2);
const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
const aps = Autopilot.team(g);
const views = g.carriers.map((c) => new DollView(c, c.human ?? 0, g.world, camera));
let printed = 0, worst = 0, worstLine = '', legWorst = 0, legLine = '', legEpisodes = 0;
const episodes: string[] = [];
const open = new Map<string, { t0: number; max: number; line: string }>();
for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(DT, aps.map((a) => a.input(g, DT)));
  views.forEach((v, k) => { const gw = g.carriers[k].grabWorld(); v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, i * DT, DT); });
  for (const [k, v] of views.entries()) {
    const rig = (v as unknown as { rig: { boots: THREE.Group[]; legs: { geometry: THREE.BufferGeometry }[]; group: THREE.Group } }).rig;
    // Vértices de las piernas (tubos) más lejos del centro del porteador
    rig.group.updateMatrixWorld(true);
    const legMeshes: THREE.Mesh[] = [];
    const legG = new Set(rig.legs.map((l) => l.geometry));
    rig.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && legG.has(m.geometry)) legMeshes.push(m); });
    for (const m of legMeshes) {
      const pos = m.geometry.attributes.position, vv = new THREE.Vector3();
      let far = 0, at = new THREE.Vector3(), idx = -1;
      const cp = g.carriers[k].pos;
      for (let q = 0; q < pos.count; q++) { vv.fromBufferAttribute(pos, q).applyMatrix4(m.matrixWorld); const d = Math.hypot(vv.x - cp.x, vv.z - cp.z); if (d > far) { far = d; at = vv.clone(); idx = q; } }
      if (far > legWorst) { legWorst = far; legLine = `t=${f2(i / 60)} J${k + 1}: vértice ${idx}/${pos.count} de la pierna a ${f2(far)} m del centro, en (${f2(at.x)}, ${f2(at.y)}, ${f2(at.z)}); porteador (${f2(cp.x)}, ${f2(cp.y)}, ${f2(cp.z)})`; }
      if (far > 1.0) legEpisodes++;
    }
    const c = g.carriers[k], p = c.pos, vel = c.body.linvel();
    rig.boots.forEach((b, j) => {
      const w = b.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      const key = `${k}-${j}`;
      const line = `t=${f2(i / 60)} J${k + 1} bota ${j}: a ${f2(d)} m; porteador (${f2(p.x)}, ${f2(p.y)}, ${f2(p.z)}) v=(${f2(vel.x)}, ${f2(vel.y)}, ${f2(vel.z)}) ${c.holding ? 'agarrando' : 'suelto'}${c.down ? ' ' + c.down : ''}${c.wobbling ? ' tambalea' : ''}; bota (${f2(w.x)}, ${f2(w.y)}, ${f2(w.z)})`;
      if (d > worst) { worst = d; worstLine = line; }
      if (d > 0.9) {
        const e = open.get(key);
        if (!e) open.set(key, { t0: i / 60, max: d, line });
        else if (d > e.max) { e.max = d; e.line = line; }
      } else if (open.has(key)) {
        const e = open.get(key)!; open.delete(key);
        episodes.push(`de t=${f2(e.t0)} a ${f2(i / 60)} (${Math.round((i / 60 - e.t0) * 60)} fot.), máx: ${e.line}`);
      }
    });
  }
}
void printed;
console.log(`${n} humanos: ${g.phase} en ${f2(g.time)} s; bota más lejos del cuerpo: ${worstLine}`);
console.log(`Pierna: vértice más lejos ${legLine}; muestras con un vértice a más de 1 m: ${legEpisodes}`);
console.log(`Episodios con una bota a más de 0,9 m del centro (${episodes.length}):`);
for (const e of episodes) console.log('  ' + e);
