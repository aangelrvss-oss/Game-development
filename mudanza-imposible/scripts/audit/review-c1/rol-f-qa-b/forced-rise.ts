// Revisión independiente C1, rol F. Sin sitio para levantarse en 1,2 m a la redonda, a los `maxWaitRoom` s se levanta
// igualmente (carrier.ts, stepDown): ¿cuánto se mete y sale despedido? Caso 1: losa fija baja (1 m) de 4×4 m.
// Caso 2: el sofá cae encima de un porteador tumbado y otros dos lo sujetan ahí.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa-b/forced-rise.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CARRIER, CENTER_Y } from '../../../../src/sim/carrier';
import { yawQuat } from '../../../../src/sim/sofa';
await RAPIER.init({});
const DT = 1 / 60, OPEN = { x: -35, z: 25 };

function overlap(g: Game, i: number) {
  const c = g.carriers[i];
  let worst = 0;
  g.world.intersectionsWithShape(c.collider.translation(), c.collider.rotation(), c.collider.shape, (o) => {
    const k = c.collider.contactCollider(o, 0);
    if (k && k.distance < 0) worst = Math.max(worst, -k.distance);
    return true;
  }, undefined, undefined, c.collider);
  return worst;
}

{
  const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x - 10, y: 0.25, z: OPEN.z - 10 }, true);
  const c = g.carriers[0];
  c.teleport({ x: OPEN.x, y: CENTER_Y + 0.05, z: OPEN.z });
  for (let i = 0; i < 20; i++) g.step(DT, []);
  c.knockDown({ x: 1, z: 0 }, CARRIER.fallTime, 'balance');
  for (let i = 0; i < 40; i++) g.step(DT, []);
  const p = c.pos;
  const slab = g.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y - CENTER_Y + 1.05, p.z));
  g.world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.05, 2), slab);
  let worst = 0, vmax = 0, downFor = 0, t = 0;
  for (; t < 8; t += DT) {
    g.step(DT, []);
    worst = Math.max(worst, overlap(g, 0));
    const v = c.body.linvel(); vmax = Math.max(vmax, Math.hypot(v.x, v.y, v.z));
    if (c.down) downFor = t;
  }
  console.log(`losa a 1 m: en el suelo ${downFor.toFixed(2)} s, de pie al final ${c.down === null}, solape máx ${(worst * 100).toFixed(1)} cm, velocidad máx ${vmax.toFixed(2)} m/s, y final ${c.pos.y.toFixed(2)}`);
  g.dispose();
}
