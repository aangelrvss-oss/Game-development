// Partidas completas con el piloto (2, 3 y 4 humanos; 1 humano con 2-6 ayudantes): cuántas veces salta «¡Se escapa!»
// (gripBreak) frente a las sueltas voluntarias, caídas, solape máximo porteador-sofá y fotogramas con solape > 3 cm,
// y el tope de clampLoads. Además: uno solo empujando el sofá escaleras arriba desde detrás, hasta 60 s.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/partidas.ts
import { init, setup, near, play, inp, f2, f3, count, depth, SOFA, DT, NO_INPUT, RAPIER, Game } from './comun';
import { Autopilot } from '../../../../src/sim/autopilot';
import { STAIRS, FLOOR2 } from '../../../../src/sim/level';
await init();

function full(humans: number, carriers: number, style: 'atentos' | 'despistados', seed: number) {
  const g = new Game(RAPIER, { humans, carriers, botStyle: style, seed });
  const aps = humans > 1 ? Autopilot.team(g) : [new Autopilot(0)];
  let breaks = 0, rel = 0, falls = 0, pen = 0, over3 = 0, clamp = 0, frames = 0;
  for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(DT, aps.map((a) => a.input(g, DT)));
    frames++;
    breaks += count(g.out, 'gripBreak'); rel += count(g.out, 'release'); falls += count(g.out, 'fall');
    const d = depth(g.carriers.map((c) => c.collider), g.sofaColliders);
    pen = Math.max(pen, d); if (d > 0.03) over3++;
    const v = g.sofa.linvel(), w = g.sofa.angvel();
    if (Math.hypot(v.x, v.y, v.z) > 10.9 || Math.hypot(w.x, w.y, w.z) > 5.9) clamp++;
  }
  const r = `${humans} humanos + ${carriers - humans} ayudantes ${style} s${seed}: ${g.phase} en ${f2(g.time)} s, integridad ${g.integrity}; «se escapa» ${breaks}; sueltas voluntarias ${rel}; caídas ${falls}; solape porteador-sofá máx ${f3(pen)} m, ${over3} de ${frames} fotogramas > 3 cm; tope ${clamp}`;
  g.dispose();
  return r;
}
for (const n of [2, 3, 4]) console.log(full(n, n, 'atentos', 1));
for (const [c, st] of [[2, 'atentos'], [4, 'atentos'], [4, 'despistados'], [6, 'despistados']] as const) for (const s of [1, 2, 3]) console.log(full(1, c, st, s));

// Uno solo, detrás, empuja el sofá escaleras arriba (sin límite de 20 s)
{
  const g = setup(2, { x: 0, z: STAIRS.z0 + 2.2, yaw: Math.PI / 2 });
  near(g, 1, -SOFA.half.x, 0, -1, 0);
  g.carriers[0].teleport({ x: 0, y: 0.75, z: -16 });
  play(g, 0.3);
  g.step(DT, [NO_INPUT, inp({ grab: true })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  let t = 0, up = -1, zmin = Infinity;
  for (let i = 0; i < 90 * 60 && up < 0; i++) {
    g.step(DT, [NO_INPUT, inp({ mz: -1 })]); t += DT;
    zmin = Math.min(zmin, g.sofaPos.z);
    if (g.sofaPos.z < STAIRS.z1 && g.sofaPos.y > FLOOR2 + 0.15) up = t;
  }
  console.log(`Uno solo detrás empujando escaleras arriba: ${up > 0 ? `arriba en ${f2(up)} s` : `no llega en 90 s (z mínima ${f2(zmin)})`}; agarrando ${g.carriers[1].holding}`);
  g.dispose();
}
