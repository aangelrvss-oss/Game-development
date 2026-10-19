// qa-01: ¿por qué 3 y 4 humanos en cooperativo no pasan de 'Calle'? Traza de asas, posiciones y contactos.
// Uso: npx vite-node scripts/audit/verif-qa/q02-diagnostico-coop.ts <humanos> [modo]
//   modo 'normal'  : el piloto lleva a todos los humanos (como el barrido).
//   modo 'dos'     : solo J1 y J2 usan el piloto; J3/J4 no tocan nada (NO_INPUT) — misma física cooperativa.
//   modo 'sueltan' : J3/J4 usan el piloto pero sueltan y se apartan cuando el sofá está entre z=-9 y z=-16 (contrafactual).
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const humans = Number(process.argv[2] ?? 3), mode = process.argv[3] ?? 'normal';
const DT = 1 / 60;
const g = new Game(RAPIER as any, { humans, carriers: humans, botStyle: 'atentos', seed: 1 });
const aps = Array.from({ length: humans }, (_, i) => new Autopilot(i));
let next = 0;
const f = (n: number) => n.toFixed(2);
for (let i = 0; i < 60 * (RULES.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  const inputs = aps.map((a, k) => {
    const inp = a.input(g, DT);
    if (k < 2) return inp;
    if (mode === 'dos') return NO_INPUT;
    if (mode === 'sueltan') {
      const z = g.sofaPos.z, c = g.carriers[k];
      const narrow = z < -9 && z > -16;
      if (narrow) {
        if (c.holding) return { ...NO_INPUT, grab: true };
        // apartarse hacia un lado de la puerta y no volver a agarrar
        return { ...NO_INPUT, mx: c.pos.x > 0 ? 0.5 : -0.5, mz: 0 };
      }
    }
    return inp;
  });
  g.step(DT, inputs);
  if (g.time >= next && g.phase === 'playing') {
    next += mode === 'normal' ? 10 : 20;
    const p = g.sofaPos;
    console.log(`t=${f(g.time)} etapa=${g.stageLabel} wp=[${aps.map((a) => a.wp)}] sofa=(${f(p.x)},${f(p.y)},${f(p.z)}) yaw=${f(g.sofaYaw)} int=${g.integrity}`);
    for (const c of g.carriers) {
      const gl = c.grabLocal;
      console.log(`   J${c.id + 1} pos=(${f(c.pos.x)},${f(c.pos.z)}) agarra=${c.holding ? `(${f(gl!.x)},${f(gl!.z)})` : 'no'} aturdido=${f(c.stunned)}`);
    }
  }
}
console.log('FIN', mode, g.phase, g.loseReason, 'tiempo', g.time.toFixed(2), 'integridad', g.integrity, 'etapa', g.stageLabel);
g.dispose();
