// Revisor A+G+C+E (ciclo 1, segunda ronda): señales de esfuerzo del muñeco a lo largo de una partida normal con el
// piloto (2 y 4 humanos), sin navegador (DollView real, sin lienzo). ¿Cuánto rato se ven las rayas de esfuerzo, la
// bola roja y el sudor cuando NO hace falta ayuda (todos agarrando y llevándolo bien)? ¿Parpadean las rayas y salta
// la etiqueta J1 (sube 0,4 m cuando hay rayas)?
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/esfuerzo-ruta.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { DollView, EFFORT } = await import('../../../../src/view/doll/dollView');

await RAPIER.init({});
const DT = 1 / 60;
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);

for (const humans of [2, 4]) {
  const g = new Game(RAPIER, { humans, carriers: humans, botStyle: 'atentos', seed: 1 });
  const team = Autopilot.team(g);
  const views = g.carriers.map((c) => new DollView(c, c.human ?? 0, g.world, camera));
  type P = { marks: THREE.Sprite; grip: THREE.Mesh; effort: number; label: THREE.Sprite };
  const st = { allHold: 0, allHoldMarks: 0, allHoldRed: 0, allHoldSweat: 0, soloHold: 0, soloMarks: 0, toggles: 0, labelJumps: 0 };
  const prev = views.map(() => false);
  let t = 0;
  for (let i = 0; i < 60 * 120 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const ins: PlayerInput[] = Array.from({ length: humans }, () => NO_INPUT);
    for (const a of team) ins[g.carriers[a.carrierIndex].human!] = a.input(g, DT);
    g.step(DT, ins); t += DT;
    const all = g.carriers.every((c) => c.holding);
    views.forEach((v, k) => {
      const c = g.carriers[k], gw = c.grabWorld();
      v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, t, DT);
      const pv = v as unknown as P;
      if (g.phase !== 'playing' || !c.holding) { prev[k] = pv.marks.visible; return; }
      const col = (pv.grip.material as THREE.MeshBasicMaterial).color;
      const red = col.r > 0.8 && col.g < 0.45 && col.b < 0.45;
      if (all) { st.allHold++; if (pv.marks.visible) st.allHoldMarks++; if (red) st.allHoldRed++; if (pv.effort > EFFORT.sweatAt) st.allHoldSweat++; }
      else { st.soloHold++; if (pv.marks.visible) st.soloMarks++; }
      if (pv.marks.visible !== prev[k]) { st.toggles++; st.labelJumps++; }
      prev[k] = pv.marks.visible;
    });
  }
  const pct = (a: number, b: number) => `${b ? ((100 * a) / b).toFixed(0) : '–'} %`;
  console.log(`${humans} humanos, piloto, ${g.phase} en ${g.time.toFixed(1)} s:`);
  console.log(`  todos agarrando (n=${st.allHold} muñeco·fotograma): rayas ${pct(st.allHoldMarks, st.allHold)}, bola roja ${pct(st.allHoldRed, st.allHold)}, sudor (esfuerzo > ${EFFORT.sweatAt}) ${pct(st.allHoldSweat, st.allHold)}`);
  console.log(`  agarrando sin estar todos (n=${st.soloHold}): rayas ${pct(st.soloMarks, st.soloHold)}`);
  console.log(`  rayas que aparecen o desaparecen (y la etiqueta salta 0,4 m): ${st.toggles} veces en ${g.time.toFixed(0)} s (${(st.toggles / g.time / humans).toFixed(2)} por muñeco y segundo)`);
  g.dispose();
}
