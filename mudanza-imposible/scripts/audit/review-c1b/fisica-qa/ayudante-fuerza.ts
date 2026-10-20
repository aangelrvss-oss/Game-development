// Revisión c1b, roles B+F. T-phys-unify con un ayudante de verdad (con cerebro) arrastrando solo el sofá, como en la
// prueba nueva, más variantes que la prueba no mira: tirando de lado (90°) en vez de a lo largo.
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/ayudante-fuerza.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SLOTS, localToWorld } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05, OPEN = { x: -35, z: 25 };
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const play = (g: Game, s: number, f: () => PlayerInput[] = () => []) => { for (let i = 0; i < Math.round(s * 60); i++) g.step(DT, f()); };

function pull(helper: boolean, mx: number, mz: number) {
  const g = new Game(RAPIER, { humans: 1, carriers: 2, botStyle: 'atentos', seed: 1 });
  if (!helper) g.bots.clear();
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  const hb = 0.25;
  const body = g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(OPEN.x + 3, hb + 0.01, OPEN.z - 8).setCcdEnabled(true));
  const col = g.world.createCollider(RAPIER.ColliderDesc.cuboid(hb, hb, hb).setDensity(10 / (8 * hb * hb * hb)).setFriction(0.6), body);
  g.addGrabbable(body, [col]);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  const me = g.carriers[0], who = g.carriers[helper ? 1 : 0], a = localToWorld(g.sofa, SLOTS[1].p);
  who.teleport({ x: a.x - 0.6, y: standY, z: a.z }); who.facing = { x: 1, z: 0 };
  if (helper) { me.teleport({ x: OPEN.x + 3.95, y: standY, z: OPEN.z - 8 }); me.facing = { x: -1, z: 0 }; }
  play(g, 0.3);
  if (helper) g.step(DT, [inp({ grab: true })]);
  else { me.grab(g.sofa, a); g.step(DT, [NO_INPUT]); }
  play(g, 0.5, () => [NO_INPUT]);
  const ok = who.heldBody === g.sofa && (!helper || me.heldBody === body);
  const s0 = g.sofaPos;
  let maxF = 0;
  play(g, 3, () => { maxF = Math.max(maxF, Math.hypot(who.handForce.x, who.handForce.z)); return [inp({ mx, mz })]; });
  const r = { ok, d: Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z), maxF, holding: who.heldBody === g.sofa };
  g.dispose();
  return r;
}
for (const [name, mx, mz] of [['a lo largo (la prueba)', -1, 0], ['de lado', 0, -1], ['diagonal', -0.7071, -0.7071]] as const) {
  const hu = pull(false, mx, mz), he = pull(true, mx, mz);
  console.log(`${name}: humano ${hu.d.toFixed(2)} m (F máx ${hu.maxF.toFixed(0)} N, agarra ${hu.holding}); ayudante ${he.d.toFixed(2)} m (F máx ${he.maxF.toFixed(0)} N, agarra ${he.holding}, montaje ${he.ok}); cociente ${(he.d / hu.d).toFixed(2)}`);
}
