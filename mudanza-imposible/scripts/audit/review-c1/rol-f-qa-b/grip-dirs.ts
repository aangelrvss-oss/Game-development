// Revisión independiente C1, rol F. T-grip-2/3 en llano en todas las direcciones de tirón (la prueba solo mide -x,
// a lo largo del sofá) y en varias orientaciones del sofá y sitios llanos.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa-b/grip-dirs.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const play = (g: Game, s: number, f: (g: Game) => PlayerInput[] = () => []) => { const ev: string[] = []; for (let i = 0; i < s * 60; i++) { g.step(DT, f(g)); for (const e of g.out) ev.push(e.type); } return ev; };

function run(at: { x: number; z: number }, yaw: number, angDeg: number, both: boolean) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: at.x, y: 0.25, z: at.z }, true);
  g.sofa.setRotation(yawQuat(yaw), true);
  g.carriers.forEach((c, i) => c.teleport({ x: at.x + 5 + i * 1.5, y: standY, z: at.z + 6 }));
  play(g, 0.5);
  for (const [i, side] of [[0, -1], [1, 1]] as const) {
    const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 }), o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
    const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
    c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  }
  if (!both) g.carriers[1].teleport({ x: at.x, y: standY, z: at.z + 7 });
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: both })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  // Dirección: ángulo respecto al eje del sofá que sale por el extremo agarrado (-x local), girado con el sofá
  const ax = localToWorld(g.sofa, { x: -1, y: 0, z: 0 }), o0 = g.sofaPos;
  const ux = ax.x - o0.x, uz = ax.z - o0.z, ul = Math.hypot(ux, uz);
  const a = (angDeg * Math.PI) / 180, dx = (ux / ul) * Math.cos(a) - (uz / ul) * Math.sin(a), dz = (ux / ul) * Math.sin(a) + (uz / ul) * Math.cos(a);
  const s0 = g.sofaPos;
  const ev = play(g, 3, () => [inp({ mx: dx, mz: dz }), inp({ mx: both ? dx : 0, mz: both ? dz : 0 })]);
  const d = Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z);
  const r = { d, held: g.carriers[0].holding, breaks: ev.filter((e) => e === 'gripBreak').length, falls: ev.filter((e) => e === 'fall').length };
  g.dispose();
  return r;
}

const spots = [{ name: 'descampado', at: { x: -35, z: 25 } }, { name: 'descampado2', at: { x: -30, z: 30 } }];
for (const sp of spots) for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
  const row: string[] = [];
  for (const ang of [0, 30, 60, 90, 120, 150, 180]) {
    const s = run(sp.at, yaw, ang, false), b = run(sp.at, yaw, ang, true);
    const flag = s.d < 0.3 || s.d > 1.5 ? '!' : '';
    const flag2 = b.d <= 2.5 * s.d ? '#' : '';
    row.push(`${ang}°: solo ${s.d.toFixed(2)}${flag}${s.held ? '' : '(suelta)'} dos ${b.d.toFixed(2)}${flag2}`);
  }
  console.log(`${sp.name} yaw=${yaw.toFixed(2)} | ${row.join(' | ')}`);
}
console.log('! = fuera de 0,3–1,5 m (T-grip-2); # = entre dos no llega a 2,5× (T-grip-3). 180° = empujando hacia el sofá');
