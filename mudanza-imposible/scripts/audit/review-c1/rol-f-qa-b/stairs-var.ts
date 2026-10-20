// Revisión independiente C1, rol F. T-grip-2/3 en la escalera fuera del caso exacto de la prueba: sofá desplazado
// en x y girado unos grados al pie de la escalera. Entre dos: < 8 s; uno solo (delante o detrás): no la sube en 20 s.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa-b/stairs-var.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { FLOOR2, STAIRS } from '../../../../src/sim/level';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05, OPEN = { x: -35, z: 25 };
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const play = (g: Game, s: number, f: () => PlayerInput[] = () => []) => { for (let i = 0; i < s * 60; i++) g.step(DT, f()); };

function stairs(who: 'dos' | 'delante' | 'detrás', limit: number, dx: number, dyaw: number) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: dx, y: 0.25, z: STAIRS.z0 + 2.2 }, true);
  g.sofa.setRotation(yawQuat(Math.PI / 2 + dyaw), true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  for (const [i, side] of [[0, 1], [1, -1]] as const) {
    const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 }), o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
    const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
    c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  }
  if (who === 'delante') g.carriers[1].teleport({ x: 0, y: standY, z: -16 });
  if (who === 'detrás') g.carriers[0].teleport({ x: 0, y: standY, z: -16 });
  play(g, 0.3);
  g.step(DT, [inp({ grab: who !== 'detrás' }), inp({ grab: who !== 'delante' })]);
  play(g, 0.5);
  let t = 0, up = -1, falls = 0, breaks = 0;
  for (let i = 0; i < limit * 60 && up < 0; i++) {
    g.step(DT, [inp({ mz: -1 }), inp({ mz: -1 })]);
    for (const e of g.out) { if (e.type === 'fall') falls++; if (e.type === 'gripBreak') breaks++; }
    t += DT;
    if (g.sofaPos.z < STAIRS.z1 && g.sofaPos.y > FLOOR2 + 0.15) up = t;
  }
  const r = { up, falls, breaks, z: g.sofaPos.z, int: g.integrity };
  g.dispose();
  return r;
}
let bad = 0, n = 0;
for (const dx of [-0.4, -0.2, 0, 0.2, 0.4]) for (const dyaw of [-0.2, 0, 0.2]) {
  const d = stairs('dos', 8, dx, dyaw), f = stairs('delante', 20, dx, dyaw), b = stairs('detrás', 20, dx, dyaw);
  const ok = d.up > 0 && d.up < 8 && f.up < 0 && b.up < 0;
  n++; if (!ok) bad++;
  console.log(`dx ${dx} dyaw ${dyaw}: dos ${d.up > 0 ? d.up.toFixed(2) + ' s' : 'NO (z ' + d.z.toFixed(1) + ')'} caídas ${d.falls} sueltas ${d.breaks} int ${d.int} | solo delante ${f.up > 0 ? 'SUBE ' + f.up.toFixed(1) : 'no'} | solo detrás ${b.up > 0 ? 'SUBE ' + b.up.toFixed(1) : 'no'}${ok ? '' : '  <-- FALLA'}`);
}
console.log(`fallan ${bad} de ${n}`);
