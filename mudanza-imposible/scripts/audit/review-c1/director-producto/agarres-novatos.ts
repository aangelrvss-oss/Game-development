// Revisión ciclo 1 (rol A+G): agarres «de novato» entre dos (los dos por el mismo extremo, los dos por el lado
// largo, en diagonal por el lado largo) frente al correcto (un extremo cada uno). ¿Se lleva en el aire? ¿Sale algún
// aviso que diga que lo están haciendo mal? Llano y escalera (como T-grip-3).
// Uso: npx vite-node scripts/audit/review-c1/director-producto/agarres-novatos.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { STAIRS } from '../../../../src/sim/level';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { heavyAloneHint } from '../../../../src/ui/hud';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60;
const OPEN = { x: -35, z: 25 };
const standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
/** Pone al porteador i a 0,75 m del punto local (lx, lz) del borde del sofá, por fuera, mirándolo. */
function at(g: Game, i: number, lx: number, lz: number, ox: number, oz: number) {
  const a = localToWorld(g.sofa, { x: lx, y: 0, z: lz });
  const o = localToWorld(g.sofa, { x: lx + ox * 0.75, y: 0, z: lz + oz * 0.75 });
  const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z });
  c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
}
const endBase = (g: Game, side: 1 | -1) => Math.min(...[-1, 1].map((sz) => localToWorld(g.sofa, { x: side * SOFA.half.x, y: -SOFA.half.y, z: sz * SOFA.half.z }).y));
const H = SOFA.half;
const cases: [string, (g: Game) => void][] = [
  ['un extremo cada uno (correcto)', (g) => { at(g, 0, -H.x, 0, -1, 0); at(g, 1, H.x, 0, 1, 0); }],
  ['los dos por el mismo extremo', (g) => { at(g, 0, -H.x, -0.25, -1, 0); at(g, 1, -H.x, 0.25, -1, 0); }],
  ['los dos por el lado largo', (g) => { at(g, 0, -0.55, H.z, 0, 1); at(g, 1, 0.55, H.z, 0, 1); }],
  ['lado largo, uno a cada lado', (g) => { at(g, 0, -0.55, H.z, 0, 1); at(g, 1, 0.55, -H.z, 0, -1); }],
];
for (const [name, place] of cases) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true); g.sofa.setRotation(yawQuat(0), true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  place(g);
  for (let i = 0; i < 18; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const hold0 = g.carriers.map((c) => c.holding);
  const s0 = g.sofaPos;
  let minB = Infinity, hint = '', falls = 0, breaks = 0;
  // Los dos andan hacia -x (a lo largo del sofá) 3 s
  for (let i = 0; i < 180; i++) {
    g.step(DT, [inp({ mx: -1 }), inp({ mx: -1 })]);
    minB = Math.min(minB, endBase(g, 1), endBase(g, -1));
    for (const e of g.out) { if (e.type === 'fall') falls++; if (e.type === 'gripBreak') breaks++; }
    if (g.heavyAlone) hint = heavyAloneHint(g);
  }
  const d = Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z);
  console.log(`${name}: agarran ${hold0.join('/')}; ${d.toFixed(2)} m en 3 s; base más baja ${minB.toFixed(2)} m; caídas ${falls}; escapes ${breaks}; aviso «${hint || 'ninguno'}»; sofaUp ${g.sofaUp.toFixed(2)}`);
  g.dispose();
}
