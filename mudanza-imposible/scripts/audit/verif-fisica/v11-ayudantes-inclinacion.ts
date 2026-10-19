// Verificación fisica-11 (ampliada): inclinación del sofá sostenido por ayudantes (asas a y=0,05) frente a humanos (y=0,48),
// y masa real del sofá según Rapier frente a SOFA.mass / SOFA.coopMass.
// Uso: npx vite-node scripts/audit/verif-fisica/v11-ayudantes-inclinacion.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { SOFA } from '../../../src/sim/sofa.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;

// Masa real
for (const m of [90, 300, 1000]) {
  (SOFA as any).coopMass = m;
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos' });
  console.log(`SOFA.coopMass=${m} -> masa real del cuerpo Rapier=${g.sofa.mass().toFixed(1)} kg`);
  g.dispose();
}
(SOFA as any).coopMass = 90;
{
  const g = new Game(RAPIER as any, { humans: 0, carriers: 2, botStyle: 'atentos' });
  console.log(`SOFA.mass=${SOFA.mass} -> masa real=${g.sofa.mass().toFixed(1)} kg; volumen de colliders según Rapier=${g.sofaColliders.map((c) => c.volume().toFixed(3)).join('+')}`);
  g.dispose();
}

// Serie temporal: 2 ayudantes quietos sosteniendo
for (const [h, n] of [[0, 2], [0, 4], [2, 2]] as const) {
  const g = new Game(RAPIER as any, { humans: h, carriers: n, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  if (h) g.step(DT, g.carriers.map(() => ({ ...NO_INPUT, grab: true })));
  const tr: string[] = [];
  for (let i = 0; i < 10 * 60; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); if (i % 60 === 59) tr.push(`${(i + 1) / 60}s:${g.carriers.filter((c) => c.holding).length}m/up${g.sofaUp.toFixed(2)}`); }
  console.log(`humans=${h} carriers=${n}: ${tr.join(' ')}`);
  g.dispose();
}

// Modo demostración del menú (1 humano con piloto + ayudantes): distribución de sofaUp mientras alguien agarra
for (const n of [2, 4]) {
  const g = new Game(RAPIER as any, { humans: 1, carriers: n, botStyle: 'atentos', seed: 3 });
  const ap = new Autopilot(0);
  let t = 0, low = 0, warn = 0, minUp = 1;
  for (let i = 0; i < 60 * 120 && g.phase !== 'won' && g.phase !== 'lost'; i++) {
    g.step(DT, [ap.input(g, DT)]);
    if (g.phase === 'playing' && g.carriers.some((c) => c.holding)) { t += DT; if (g.sofaUp < 0.9) low += DT; if (g.sofaUp < 0.8 && g.sofaUp >= 0.55) warn += DT; minUp = Math.min(minUp, g.sofaUp); }
  }
  console.log(`demo 1 humano (piloto) + ${n - 1} ayudantes: fase=${g.phase} t=${g.time.toFixed(1)} integ=${g.integrity}; con el sofá agarrado ${t.toFixed(1)} s, de ellos up<0,9: ${low.toFixed(1)} s, aviso «¡Que se vuelca!» (0,55≤up<0,8): ${warn.toFixed(1)} s, up mínimo ${minUp.toFixed(2)}`);
  g.dispose();
}
