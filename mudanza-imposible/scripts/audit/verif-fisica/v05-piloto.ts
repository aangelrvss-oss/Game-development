// Verificación fisica-05: retrocesos del piloto automático tras cada cambio de punto de paso (lastDist sin reiniciar).
// Compara el piloto original con una subclase EN MEMORIA que reinicia lastDist/stuck al cambiar de punto (prueba causal).
// Uso: npx vite-node scripts/audit/verif-fisica/v05-piloto.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { ROUTE } from '../../../src/sim/level.ts';
await RAPIER.init();
const DT = 1 / 60;

class FixedAutopilot extends Autopilot {
  input(g: Game, dt: number) {
    const w = this.wp;
    const r = super.input(g, dt);
    if (this.wp !== w) { this.lastDist = Infinity; this.stuck = 0; }
    return r;
  }
}

function run(fixed: boolean, seed = 1) {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed });
  const aps = [0, 1].map((i) => (fixed ? new FixedAutopilot(i) : new Autopilot(i)));
  let lastWp = 0, wpAt = 0, prevW = 0; const log: string[] = [];
  let stairsIn = -1, stairsOut = -1, minYAfterClimb = Infinity, maxY = 0;
  for (let i = 0; i < 200 * 60 && g.phase !== 'won' && g.phase !== 'lost'; i++) {
    g.step(DT, aps.map((a) => a.input(g, DT)));
    const a = aps[0];
    if (a.wp !== lastWp) { lastWp = a.wp; wpAt = g.time; }
    if (a.wiggle > 0 && prevW <= 0) log.push(`t=${g.time.toFixed(2)}[wp${a.wp}:${ROUTE[a.wp].label},+${(g.time - wpAt).toFixed(2)}s,sofá y=${g.sofaPos.y.toFixed(2)} z=${g.sofaPos.z.toFixed(2)}]`);
    prevW = a.wiggle;
    const s = g.sofaPos;
    if (stairsIn < 0 && s.z < -22) stairsIn = g.time;
    if (stairsIn > 0 && stairsOut < 0) { maxY = Math.max(maxY, s.y); if (s.y < maxY - 0.3) minYAfterClimb = Math.min(minYAfterClimb, s.y); }
    if (stairsOut < 0 && s.y > 2.6 && s.z < -28) stairsOut = g.time;
  }
  console.log(`${fixed ? 'PILOTO CORREGIDO' : 'PILOTO ORIGINAL '} seed=${seed}: fase=${g.phase} t=${g.time.toFixed(2)} integ=${g.integrity} escalera ${stairsIn.toFixed(2)}→${stairsOut.toFixed(2)} (${(stairsOut - stairsIn).toFixed(2)} s) ${minYAfterClimb < Infinity ? `retrocede escalera abajo hasta y=${minYAfterClimb.toFixed(2)} tras llegar a y=${maxY.toFixed(2)}` : ''}\n  retrocesos J1 (${log.length}): ${log.join(' ')}`);
  g.dispose();
}
run(false); run(true);
run(false, 7); run(true, 7);
