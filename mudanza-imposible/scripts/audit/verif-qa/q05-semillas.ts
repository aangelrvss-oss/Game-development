// qa-05: ¿cambia algo la semilla con ayudantes atentos? Huella (hash) de la trayectoria completa del sofá y de
// los porteadores, paso a paso, para las semillas 1..8. Si todas las huellas coinciden, la semilla no interviene.
import RAPIER from '@dimforge/rapier3d-compat';
import { createHash } from 'node:crypto';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
await RAPIER.init();
const DT = 1 / 60;
const configs: [number, number, 'atentos' | 'despistados'][] = [[1, 2, 'atentos'], [1, 3, 'atentos'], [1, 4, 'atentos'], [2, 2, 'atentos'], [1, 4, 'despistados']];
for (const [humans, n, style] of configs) {
  const prints = new Map<string, number[]>();
  for (let seed = 1; seed <= 8; seed++) {
    const g = new Game(RAPIER as any, { humans, carriers: n, botStyle: style, seed });
    const aps = Array.from({ length: humans }, (_, i) => new Autopilot(i));
    const h = createHash('sha1');
    for (let i = 0; i < 60 * (RULES.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(DT, aps.map((a) => a.input(g, DT)));
      const s = g.sofaPos; h.update(`${s.x},${s.y},${s.z};`);
      for (const c of g.carriers) { const p = c.pos; h.update(`${p.x},${p.z},${c.holding ? 1 : 0};`); }
    }
    const key = `${h.digest('hex').slice(0, 12)} ${g.phase} t=${g.time.toFixed(2)} int=${g.integrity}`;
    prints.set(key, [...(prints.get(key) ?? []), seed]);
    g.dispose();
  }
  console.log(`humanos=${humans} porteadores=${n} ${style}: ${prints.size} trayectorias distintas en 8 semillas`);
  for (const [k, seeds] of prints) console.log(`   ${k}  <- semillas ${seeds.join(',')}`);
}
