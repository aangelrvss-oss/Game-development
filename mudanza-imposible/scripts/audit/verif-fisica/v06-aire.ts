// Verificación fisica-06: el porteador de detrás pierde el suelo al subir la escalera y sube colgado del sofá.
// Registra, para J1 (detrás), si está en el suelo (grounded), su altura sobre la superficie de la escalera/suelo y la
// aceleración máxima que le permitiría carrier.ts:241-247 en ese estado.
// Uso: npx vite-node scripts/audit/verif-fisica/v06-aire.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { yawQuat } from '../../../src/sim/sofa.ts';
import { CARRIER, CENTER_Y } from '../../../src/sim/carrier.ts';
import { STAIRS, FLOOR2 } from '../../../src/sim/level.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const surf = (z: number) => (z > STAIRS.z0 ? 0 : z < STAIRS.z1 ? FLOOR2 : ((STAIRS.z0 - z) / (STAIRS.z0 - STAIRS.z1)) * FLOOR2);
// Pendiente de la escalera y aceleración máxima según carrier.ts:241-246
const th = Math.atan2(FLOOR2, STAIRS.z0 - STAIRS.z1);
const ny = Math.cos(th), nh = Math.sin(th);
console.log(`pendiente=${(th * 180 / Math.PI).toFixed(1)}°  maxA suelo llano coop=${(CARRIER.pullForce / CARRIER.mass).toFixed(2)} m/s² (${CARRIER.pullForce} N)  maxA escalera coop=${(CARRIER.pullForce / CARRIER.mass + 9.81 * ny * nh * 1.3).toFixed(2)} m/s²  maxA en el aire=${CARRIER.airAccel} m/s² (${CARRIER.airAccel * CARRIER.mass} N)`);

for (const lift of [false, true]) {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const z0 = -17;
  g.sofa.setTranslation({ x: 0, y: 0.6, z: z0 }, true);
  g.sofa.setRotation(yawQuat(Math.PI / 2), true);
  g.carriers[0].teleport({ x: 0, y: CENTER_Y + 0.05, z: z0 + 1.6 }); g.carriers[0].facing = { x: 0, z: -1 };
  g.carriers[1].teleport({ x: 0, y: CENTER_Y + 0.05, z: z0 - 1.6 }); g.carriers[1].facing = { x: 0, z: 1 };
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  let firstAir: string | null = null, maxAbove = 0, maxAt = '', air = 0;
  const samples: string[] = [];
  for (let i = 0; i < 60 * 8; i++) {
    g.step(DT, [inp({ mz: -1, lift }), inp({ mz: -1, lift })]);
    const c = g.carriers[0], p = c.pos;
    const above = p.y - surf(p.z) - CENTER_Y; // 0 = de pie sobre la superficie (en llano)
    if (!c.grounded && c.holding) { air += DT; if (!firstAir) firstAir = `z=${p.z.toFixed(2)} y=${p.y.toFixed(2)} (superficie y=${surf(p.z).toFixed(2)})`; }
    if (above > maxAbove) { maxAbove = above; maxAt = `z=${p.z.toFixed(2)} y=${p.y.toFixed(2)} superficie=${surf(p.z).toFixed(2)} grounded=${c.grounded}`; }
    if (i % 20 === 0 && p.z < -19 && p.z > -30) samples.push(`z=${p.z.toFixed(1)}:y=${p.y.toFixed(2)}/sup=${surf(p.z).toFixed(2)}/${c.grounded ? 'suelo' : 'AIRE'}`);
    if (g.sofaPos.y > FLOOR2 && p.z < STAIRS.z1) break;
  }
  console.log(`alza=${lift}: J1 (detrás) pierde el suelo agarrando en ${firstAir}; total en el aire ${air.toFixed(2)} s; máximo sobre la altura de estar de pie: ${maxAbove.toFixed(2)} m en ${maxAt}`);
  console.log('   ' + samples.join('  '));
  g.dispose();
}
