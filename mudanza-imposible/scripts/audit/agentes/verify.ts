import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { localToWorld } from '../../../src/sim/sofa.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const warm = (g: Game) => { for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT)); };

// A) 3 y 4 humanos (fisica coop), todos agarran y se quedan quietos 3 s
for (const n of [2, 3, 4]) {
  const g = new Game(RAPIER as any, { humans: n, carriers: n, botStyle: 'atentos', seed: 7 });
  warm(g);
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, grab: true })));
  const held0 = g.carriers.map((c) => (c.holding ? 1 : 0)).join('');
  let minUp = 1, imp = 0, falls = 0;
  for (let i = 0; i < 180; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); minUp = Math.min(minUp, g.sofaUp); for (const e of g.out) { if (e.type === 'impact') imp++; if (e.type === 'fall') falls++; } }
  console.log(`A n=${n} coop=${g.coop} agarran0=${held0} minUp=${minUp.toFixed(2)} integ=${g.integrity} impactos=${imp} caidas=${falls} agarranFin=${g.carriers.map((c) => (c.holding ? 1 : 0)).join('')}`);
  g.dispose();
}

// B) uno solo agarra un extremo y alza (coop 2 humanos)
for (const lift of [false, true]) {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  warm(g);
  g.carriers[1].teleport({ x: -6, y: 0.7, z: 14 });
  g.step(DT, [{ ...NO_INPUT, grab: true }, NO_INPUT]);
  const s0 = g.sofaPos; let maxFree = -9;
  for (let i = 0; i < 180; i++) {
    g.step(DT, [{ ...NO_INPUT, mz: -1, lift }, NO_INPUT]);
    const a = localToWorld(g.sofa, { x: 1.1, y: 0, z: 0 }), b = localToWorld(g.sofa, { x: -1.1, y: 0, z: 0 });
    const free = g.carriers[0].grabLocal && g.carriers[0].grabLocal.x > 0 ? b : a; maxFree = Math.max(maxFree, free.y);
  }
  console.log(`B lift=${lift} holding=${g.carriers[0].holding} grabLocal=${JSON.stringify(g.carriers[0].grabLocal && { x: +g.carriers[0].grabLocal.x.toFixed(2), y: +g.carriers[0].grabLocal.y.toFixed(2) })} dist3s=${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} maxExtremoLibreY=${maxFree.toFixed(2)} up=${g.sofaUp.toFixed(2)} soloDrag=${g.soloDrag.toFixed(2)}`);
  g.dispose();
}

// C) piloto: retrocesos (wiggle) tras cada cambio de punto de paso
{
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  const aps = g.carriers.map((c) => new Autopilot(c.id));
  let lastWp = 0, wpAt = 0; const log: string[] = []; let prevW = 0;
  for (let i = 0; i < 180 * 60 && g.phase !== 'won' && g.phase !== 'lost'; i++) {
    g.step(DT, aps.map((a) => a.input(g, DT)));
    const a = aps[0];
    if (a.wp !== lastWp) { lastWp = a.wp; wpAt = g.time; }
    if (a.wiggle > 0 && prevW <= 0) log.push(`t=${g.time.toFixed(2)}(wp${a.wp},+${(g.time - wpAt).toFixed(2)}s)`);
    prevW = a.wiggle;
  }
  console.log(`C fase=${g.phase} t=${g.time.toFixed(1)} integ=${g.integrity} retrocesosJ1=${log.join(' ')}`);
  g.dispose();
}
