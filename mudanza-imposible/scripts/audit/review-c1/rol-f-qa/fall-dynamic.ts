// Revisión ciclo 1, rol F: caída física con movimiento (lo que T-coh-2 no prueba: en las pruebas todo está quieto).
// Dos jugadores sostienen el sofá en alto por los extremos; un tercero corre hacia el costado del sofá y cae (se le
// derriba de lado o hacia atrás) a cierta distancia. Mide el solape máximo del collider del que cae con el sofá.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa/fall-dynamic.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const OPEN = { x: -35, z: 25 }, standY = CENTER_Y + 0.05, DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
let worstAll = 0;
for (const dist of [0.8, 1.2, 1.6, 2.0]) for (const [name, dir] of [['de lado', { x: 1, z: 0 }], ['hacia atrás', { x: 0, z: 1 }], ['de lado (-x)', { x: -1, z: 0 }]] as const) {
  const g = new Game(RAPIER, { humans: 3, carriers: 3, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.sofa.setRotation(yawQuat(0), true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 6 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  for (let i = 0; i < 30; i++) g.step(DT, []);
  // J1 y J2 en los extremos, mirando al sofá; agarran y lo sostienen en alto
  for (const [i, side] of [[0, 1], [1, -1]] as const) {
    const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 }), o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
    g.carriers[i].teleport({ x: o.x, y: standY, z: o.z });
    g.carriers[i].facing = { x: Math.sign(a.x - o.x), z: 0 };
  }
  // J3 a 4 m del costado del asiento (+z), corriendo hacia el sofá (-z)
  const c = g.carriers[2];
  c.teleport({ x: OPEN.x, y: standY, z: OPEN.z + SOFA.half.z + 4 });
  for (let i = 0; i < 10; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), inp({ grab: true }), NO_INPUT]);
  for (let i = 0; i < 45; i++) g.step(DT, [NO_INPUT, NO_INPUT, NO_INPUT]);
  let knocked = false, worst = 0, t = 0;
  for (let i = 0; i < 240; i++) {
    const gap = c.pos.z - (OPEN.z + SOFA.half.z) - 0.32;
    if (!knocked && gap < dist) { c.knockDown(dir, 1.3, 'balance'); knocked = true; }
    g.step(DT, [NO_INPUT, NO_INPUT, knocked ? NO_INPUT : inp({ mz: -1 })]);
    for (const sc of g.sofaColliders) {
      const k = c.collider.contactCollider(sc, 0);
      if (k && k.distance < 0 && -k.distance > worst) { worst = -k.distance; t = i * DT; }
    }
  }
  worstAll = Math.max(worstAll, worst);
  console.log(`cae ${name} a ${dist} m del sofá corriendo: solape máx con el sofá ${(worst * 100).toFixed(1)} cm (t=${t.toFixed(2)}); sofá y=${g.sofaPos.y.toFixed(2)}, J1/J2 agarran ${g.carriers[0].holding}/${g.carriers[1].holding}`);
  g.dispose();
}
console.log(`peor ${(worstAll * 100).toFixed(1)} cm (umbral de T-coh-2: 3 cm)`);
