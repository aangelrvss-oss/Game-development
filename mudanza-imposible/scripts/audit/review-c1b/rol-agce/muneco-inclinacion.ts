// Revisor A+G+C+E (ciclo 1, segunda ronda): el muñeco se cuelga hacia atrás al tirar (EFFORT.lean 0,28, antes 0,16),
// pero solo lo que cabe (TiltFit, radio exacto, sin margen). En una partida a 2 con el piloto: ¿cuánto de la
// inclinación pedida se dibuja mientras agarra? (menor de la primera ronda: «sube recto como un palo»)
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/muneco-inclinacion.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView } = await import('../../../../src/view/doll/dollView');
await RAPIER.init({});
const DT = 1 / 60, camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const team = Autopilot.team(g);
const views = g.carriers.map((c) => new DollView(c, c.human ?? 0, g.world, camera));
const byStage = new Map<string, number[]>();
let t = 0;
for (let i = 0; i < 60 * 60 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  const ins: PlayerInput[] = [NO_INPUT, NO_INPUT];
  for (const a of team) ins[g.carriers[a.carrierIndex].human!] = a.input(g, DT);
  g.step(DT, ins); t += DT;
  views.forEach((v, k) => {
    const c = g.carriers[k], gw = c.grabWorld();
    v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, t, DT);
    const s = (v as unknown as { src: { lean: { x: number; z: number } } }).src, fit = (v as unknown as { tilt: { fit: number } }).tilt.fit;
    if (g.phase === 'playing' && c.holding && Math.hypot(s.lean.x, s.lean.z) > 0.1) {
      const a = byStage.get(g.stageLabel) ?? []; a.push(fit); byStage.set(g.stageLabel, a);
    }
  });
}
for (const [st, a] of byStage) {
  a.sort((x, y) => x - y);
  console.log(`${st}: n=${a.length}, inclinación dibujada mediana ${a[Math.floor(a.length / 2)].toFixed(2)}, recortada a < 0,3 en ${((100 * a.filter((x) => x < 0.3).length) / a.length).toFixed(0)} %, a 0 en ${((100 * a.filter((x) => x === 0).length) / a.length).toFixed(0)} %`);
}
g.dispose();
