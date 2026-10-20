// Final de «La calle» con UNA sola persona: el sofá en el llano entre la rampa de la terraza y el destino; uno solo lo
// agarra por el extremo que mira al destino y tira 30 s. En 657fd30 el destino es la zona del suelo; en el ciclo 2, la
// rampa y la caja de carga del camión. Mismo guion contra los dos códigos (SRC).
import RAPIER from '@dimforge/rapier3d-compat';
import path from 'node:path';
const SRC = path.resolve(process.env.SRC ?? 'src');
const { Game } = await import(`${SRC}/sim/game`);
const { CENTER_Y } = await import(`${SRC}/sim/carrier`);
const { SLOTS, localToWorld } = await import(`${SRC}/sim/sofa`);
let level: unknown; try { level = (await import(`${SRC}/levels/calle`)).CALLE; } catch { /* 657fd30 */ }
await RAPIER.init({});
const NO = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
for (const grabSlot of [0, 2]) {
  const opts: any = { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 }; if (level) opts.level = level;
  const g = new Game(RAPIER, opts);
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: 23.0, y: 0.25, z: -30.25 }, true);
  g.sofa.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  for (let i = 0; i < 20; i++) g.step(1 / 60, [NO]);
  const s = SLOTS[grabSlot], a = localToWorld(g.sofa, s.p);
  const c = g.carriers[0];
  c.teleport({ x: a.x + s.out.x * 0.75, y: CENTER_Y + 0.05, z: a.z + s.out.z * 0.75 });
  c.facing = { x: -s.out.x, z: -s.out.z };
  for (let i = 0; i < 18; i++) g.step(1 / 60, [NO]);
  g.step(1 / 60, [{ ...NO, grab: true }]);
  const grabbed = c.heldBody === g.sofa;
  let wonAt = NaN;
  const goal = level ? { x: 30.8, z: -30.25 } : { x: 25.75, z: -30.25 };
  for (let i = 0; i < 60 * 30 && g.phase === 'playing'; i++) {
    const p = g.sofaPos, dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
    const release = d < 0.4 && c.holding;
    g.step(1 / 60, [d < 0.4 ? { ...NO, grab: release } : { ...NO, mx: dx / d, mz: dz / d }]);
    if (g.phase === 'won') wonAt = g.time;
  }
  const p = g.sofaPos;
  console.log(`${level ? 'ciclo 2' : '657fd30'}, asa ${grabSlot}: agarra ${grabbed}; ${g.phase}${Number.isNaN(wonAt) ? '' : ` a ${wonAt.toFixed(2)} s`}; sofá en (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
  g.dispose();
}
