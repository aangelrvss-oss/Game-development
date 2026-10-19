// Verificación fisica-02 (b): ¿le sale a cuenta a uno solo alzar y llevar el sofá durante más tiempo? (física cooperativa)
// Uso: npx vite-node scripts/audit/verif-fisica/v02b-solo-largo.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
for (const [mx, mz] of [[0, -1], [0, -0.6], [1, 0], [0.6, 0]]) for (const lift of [false, true]) {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.carriers[1].teleport({ x: -8, y: 0.7, z: 16 });
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  const s0 = g.sofaPos; const marks: string[] = []; let path = 0, prev = g.sofaPos;
  for (let i = 0; i < 12 * 60; i++) {
    // lleva al patio abierto: si el sofá se aleja más de 8 m del inicio, invierte (zona libre del patio)
    g.step(DT, [inp({ mx, mz, lift }), NO_INPUT]);
    const p = g.sofaPos; path += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p;
    if (i % 180 === 179) marks.push(`${(i + 1) / 60}s:${path.toFixed(1)}m/integ${g.integrity}/${g.carriers[0].holding ? 'agarra' : 'suelto'}`);
  }
  console.log(`mando=(${mx},${mz}) alza=${lift}: ${marks.join(' ')} | desplazamiento neto ${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(1)} m, final (${g.sofaPos.x.toFixed(1)},${g.sofaPos.z.toFixed(1)})`);
  g.dispose();
}
