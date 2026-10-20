// Revisión c1b, roles B+F. Reproduce en Node el paso 4d de duo-e2e: los dos agarran los extremos, tiran hacia fuera
// (cada uno hacia su lado en x del mundo, con el sofá girado `yaw`) durante T s y J2 suelta sin dejar de tirar.
// ¿Se tambalea y cae J2? ¿Se le escapó antes de soltar? Comparar con el árbol anterior.
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/soltar-tirando.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05, OPEN = { x: -35, z: 25 };
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function run(yaw: number, T: number) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.sofa.setRotation(yawQuat(yaw), true);
  for (const [i, side] of [[0, -1], [1, 1]] as const) {
    const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 }), o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
    const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
    c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  }
  for (let i = 0; i < 18; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  // Cada uno tira hacia su lado en x del mundo (como duo-e2e: tecla izquierda o derecha según de qué lado del sofá está)
  const out = g.carriers.map((c) => (c.pos.x > g.sofaPos.x ? 1 : -1));
  const pull = () => out.map((s) => inp({ mx: s }));
  let pre = 0, sepMax = 0;
  for (let i = 0; i < Math.round(T * 60); i++) {
    g.step(DT, pull());
    sepMax = Math.max(sepMax, g.carriers[1].handSep);
    for (const e of g.out) if (e.type === 'gripBreak') pre++;
  }
  const held = g.carriers.map((c) => c.holding);
  const rel = pull(); rel[1] = inp({ mx: out[1], grab: true });
  g.step(DT, rel);
  let wob = false, fell = false;
  for (let i = 0; i < 90; i++) {
    g.step(DT, pull());
    if (g.carriers[1].wobbling) wob = true;
    if (g.carriers[1].stunned > 0) fell = true;
  }
  g.dispose();
  return `${wob ? 'T' : '-'}${fell ? 'C' : '-'}${pre ? ` esc${pre}` : ''}${held.every(Boolean) ? '' : ' (no agarraban ambos)'} sep${sepMax.toFixed(2)}`;
}

for (const yaw of [0, 0.5, 1.0, 1.4]) {
  const row: string[] = [];
  for (const T of [0.6, 0.9, 1.2, 1.5, 2.0]) row.push(`${T}s:${run(yaw, T)}`);
  console.log(`yaw ${yaw}: ${row.join(' | ')}`);
}
console.log('(T = se tambalea; C = cae; esc = «¡Se escapa!» antes de soltar; sep = separación máx de la mano de J2 tirando)');
