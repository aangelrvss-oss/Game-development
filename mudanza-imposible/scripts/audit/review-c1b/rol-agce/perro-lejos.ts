// Revisor A+G+C+E (ciclo 1, segunda ronda): ¿por qué el perro (ayudante 5) se dibuja a metros de su cápsula en una
// partida con ayudantes atentos? Registra los fotogramas en que el dibujo se aleja más de 1 m de la cápsula: tiempo,
// estado, posición del collider y del dibujo, y si acaba de teletransportarse.
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/perro-lejos.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { CarrierView } = await import('../../../../src/view/carrierView');

await RAPIER.init({});
const DT = 1 / 60;
const g = new Game(RAPIER, { humans: 1, carriers: 6, botStyle: 'atentos', seed: 1 });
const ap = new Autopilot(0);
const vs = g.carriers.map((c) => (c.human === null ? new CarrierView(c, null, undefined, g.world) : null));
let t = 0, prevPos = g.carriers.map((c) => ({ ...c.pos }));
const log: string[] = [];
for (let i = 0; i < 60 * 60 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(DT, [ap.input(g, DT)]); t += DT;
  vs.forEach((v, k) => {
    if (!v) return;
    const c = g.carriers[k], gw = c.grabWorld();
    v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, t, DT);
    const piv = (v as unknown as { rig: { pivot: THREE.Object3D; head: THREE.Object3D } }).rig;
    v.group.updateMatrixWorld(true);
    const head = piv.head.getWorldPosition(new THREE.Vector3());
    const k0 = c.collider.translation();
    const d = Math.hypot(head.x - k0.x, head.z - k0.z);
    const jump = Math.hypot(c.pos.x - prevPos[k].x, c.pos.z - prevPos[k].z);
    if ((d > 1 || jump > 0.5) && log.length < 30) log.push(`t=${g.time.toFixed(2)} ${c.cast.cast} fase ${g.phase}: cabeza a ${d.toFixed(2)} m del collider (horizontal); collider (${k0.x.toFixed(1)}, ${k0.y.toFixed(2)}, ${k0.z.toFixed(1)}), grupo (${v.group.position.x.toFixed(1)}, ${v.group.position.y.toFixed(2)}, ${v.group.position.z.toFixed(1)}), cabeza y=${head.y.toFixed(2)}; salto del cuerpo en este paso ${jump.toFixed(2)} m; down=${c.down}; agarra ${c.holding}; pivote rot (${piv.pivot.rotation.x.toFixed(2)}, ${piv.pivot.rotation.z.toFixed(2)}) escala ${piv.pivot.scale.x.toFixed(2)}`);
  });
  prevPos = g.carriers.map((c) => ({ ...c.pos }));
}
console.log(log.join('\n') || 'ningún fotograma con el dibujo a más de 1 m');
g.dispose();
