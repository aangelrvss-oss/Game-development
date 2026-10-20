// Revisión c1b, roles B+F. El tira y afloja de la prueba nueva (tres contra uno) con detalle: cuándo se suelta el que
// pierde, con qué separación y por qué regla (gripHold con separación > gripBreak, o de golpe > 2·gripBreak).
// También uno contra uno con distinta fuerza aparente (uno tira de lado) y dos contra uno.
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/tira-afloja.ts   (sirve en copias mutadas)
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CARRIER, CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05, OPEN = { x: -35, z: 25 };
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const h = SOFA.half;

function setup(n: number) {
  const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  for (let i = 0; i < 30; i++) g.step(DT, []);
  return g;
}
function near(g: Game, i: number, lx: number, lz: number, ox: number, oz: number) {
  const a = localToWorld(g.sofa, { x: lx, y: 0, z: lz }), o = localToWorld(g.sofa, { x: lx + ox * 0.75, y: 0, z: lz + oz * 0.75 });
  const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
}
function tug(label: string, n: number, place: (g: Game) => void, inputs: PlayerInput[], loner: number, secs = 4) {
  const g = setup(n);
  place(g);
  for (let i = 0; i < 18; i++) g.step(DT, []);
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  for (let i = 0; i < 30; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  const L = g.carriers[loner], x0 = L.pos.x, s0 = g.sofaPos.x;
  let broke = -1, sepB = 0, sepMax = 0, dragged = 0, over = 0;
  for (let t = 0; t < secs && broke < 0; t += DT) {
    const gw = L.grabWorld(), hw = L.handWorld();
    const sep = gw ? Math.hypot(gw.x - hw.x, gw.y - hw.y, gw.z - hw.z) : 0;
    if (sep > CARRIER.gripBreak) over += DT;
    sepMax = Math.max(sepMax, sep);
    g.step(DT, inputs);
    dragged = Math.min(dragged, (L.pos.x - x0) * Math.sign(inputs[loner].mx || 1));
    if (g.out.some((e) => e.type === 'gripBreak' && e.carrier === L.id)) { broke = t; sepB = sep; }
  }
  const rule = broke < 0 ? '—' : sepB > 2 * CARRIER.gripBreak ? 'de golpe (> 2·gripBreak)' : 'gripHold (separado > gripBreak un rato)';
  console.log(`${label}: ${broke < 0 ? `no se suelta en ${secs} s` : `se suelta a los ${broke.toFixed(2)} s`}, separación antes ${sepB.toFixed(2)} (máx ${sepMax.toFixed(2)}), tiempo separado > gripBreak ${over.toFixed(2)} s, regla: ${rule}; arrastrado ${dragged.toFixed(2)} m; sofá movido ${(g.sofaPos.x - s0).toFixed(2)} m`);
  g.dispose();
}
tug('3 contra 1 (la prueba)', 4, (g) => { near(g, 0, -h.x, 0, -1, 0); near(g, 1, -0.5, h.z, 0, 1); near(g, 2, -0.5, -h.z, 0, -1); near(g, 3, h.x, 0, 1, 0); },
  [inp({ mx: -1 }), inp({ mx: -1 }), inp({ mx: -1 }), inp({ mx: 1 })], 3);
tug('2 contra 1 (extremo y costado contra extremo)', 3, (g) => { near(g, 0, -h.x, 0, -1, 0); near(g, 1, -0.5, h.z, 0, 1); near(g, 2, h.x, 0, 1, 0); },
  [inp({ mx: -1 }), inp({ mx: -1 }), inp({ mx: 1 })], 2);
tug('2 extremos contra 1 que tira de lado... (1 contra 1 en extremos)', 2, (g) => { near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0); },
  [inp({ mx: -1 }), inp({ mx: 1 })], 1);
tug('1 contra 1: uno tira hacia atrás y el otro en diagonal (45°)', 2, (g) => { near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0); },
  [inp({ mx: -1 }), inp({ mx: 0.7071, mz: 0.7071 })], 1);
