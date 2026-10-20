// Revisión c1b, roles B+F. Efecto de la correa que cede en la escalera: dos suben el sofá; a media escalera uno suelta
// y el otro sigue pidiendo subir (o se queda quieto). ¿Se le escapa al de arriba y el sofá cae escalera abajo?
// Comparar con el árbol anterior (e0a1711). Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/escalera-suelta.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { STAIRS } from '../../../../src/sim/level';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function run(label: string, who: 0 | 1, other: Partial<PlayerInput>, releaseAt: number) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: 0, y: 0.25, z: STAIRS.z0 + 2.2 }, true);
  g.sofa.setRotation(yawQuat(Math.PI / 2), true);
  for (const [i, side] of [[0, 1], [1, -1]] as const) {
    const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 }), o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
    const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
    c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  }
  for (let i = 0; i < 18; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  // Suben juntos hasta que el sofá pasa `releaseAt` (z); entonces `who` suelta y el otro hace `other` 4 s
  let i = 0;
  while (g.sofaPos.z > releaseAt && i++ < 600) g.step(DT, [inp({ mz: -1 }), inp({ mz: -1 })]);
  const z0 = g.sofaPos.z, y0 = g.sofaPos.y, int0 = g.integrity;
  const rel = [inp({ mz: -1 }), inp({ mz: -1 })];
  rel[who] = inp({ grab: true });
  g.step(DT, rel);
  const stay = 1 - who;
  let breaks = 0, falls = 0, slide = 0, firstBreak = -1;
  for (let k = 0; k < 4 * 60; k++) {
    const ins = [NO_INPUT, NO_INPUT];
    ins[stay] = inp(other);
    g.step(DT, ins);
    for (const e of g.out) {
      if (e.type === 'gripBreak' && e.carrier === stay) { breaks++; if (firstBreak < 0) firstBreak = k * DT; }
      if (e.type === 'fall') falls++;
    }
    slide = Math.max(slide, g.sofaPos.z - z0);
  }
  console.log(`${label}: suelta a z=${z0.toFixed(2)} (y ${y0.toFixed(2)}); en 4 s el sofá baja hasta ${slide.toFixed(2)} m; al que queda se le escapa ${breaks ? `sí, a los ${firstBreak.toFixed(2)} s` : 'no'}; caídas ${falls}; sigue agarrando ${g.carriers[stay].holding}; integridad ${int0} → ${g.integrity}; sofá y ${g.sofaPos.y.toFixed(2)}`);
  g.dispose();
}

for (const zr of [-23.5, -25, -26.5]) {
  run(`[z ${zr}] suelta el de abajo (J2), el de arriba sigue subiendo`, 1, { mz: -1 }, zr);
  run(`[z ${zr}] suelta el de abajo (J2), el de arriba se queda quieto`, 1, {}, zr);
  run(`[z ${zr}] suelta el de arriba (J1), el de abajo sigue empujando hacia arriba`, 0, { mz: -1 }, zr);
}
