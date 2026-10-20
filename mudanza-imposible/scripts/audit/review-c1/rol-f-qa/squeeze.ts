// Revisión ciclo 1, rol F: un coche arrolla a un porteador contra la pared invisible del borde de la calle (x = 18).
// Mide la velocidad máxima a la que sale despedido el porteador. Sirve igual para la línea base y para HEAD.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa/squeeze.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
await RAPIER.init({});
const standY = (CENTER_Y ?? 0.65) + 0.05;
let worstAll = 0;
for (const x of [16.0, 16.8, 17.3, 17.6]) for (const dz of [-0.6, 0, 0.6]) {
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  // El sofá lejos de la calle
  g.sofa.setTranslation({ x: 8, y: 0.3, z: 2.5 }, true);
  const c = g.carriers[0];
  const lz = -1.6 + dz; // carril 0 (los coches van hacia +x)
  c.teleport({ x, y: standY, z: lz });
  // Un coche del carril 0 justo detrás, a toda velocidad
  const car = g.cars.find((k) => k.lane === 0)!;
  car.x = x - 6; car.speed = 10;
  car.body.setTranslation({ x: car.x, y: car.body.translation().y, z: car.z }, true);
  for (const o of g.cars) if (o !== car && o.lane === 0) { o.x = -40; o.body.setTranslation({ x: -40, y: o.body.translation().y, z: o.z }, true); }
  let vmax = 0, at = '';
  // El jugador no se aparta: espera quieto (o tumbado) durante 3 s; el semáforo en verde para los coches (t = 0)
  for (let i = 0; i < 180; i++) {
    g.step(1 / 60, [{ mx: 0, mz: 0, grab: false, turn: 0, right: false }]);
    const v = c.body.linvel(), s = Math.hypot(v.x, v.y, v.z);
    if (s > vmax) { vmax = s; at = `t=${g.time.toFixed(2)} p=(${c.pos.x.toFixed(2)},${c.pos.y.toFixed(2)},${c.pos.z.toFixed(2)}) down=${(c as any).down} stun=${c.stunned.toFixed(2)}`; }
  }
  worstAll = Math.max(worstAll, vmax);
  console.log(`x=${x} dz=${dz}: porteador v máx ${vmax.toFixed(1)} m/s ${at}`);
  g.dispose();
}
console.log(`peor ${worstAll.toFixed(1)} m/s`);
