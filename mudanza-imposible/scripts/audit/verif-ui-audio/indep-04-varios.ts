// Verificación independiente de varios defectos ui-audio con el Game REAL:
//  - ui-audio-11: menú 2→3→2 jugadores (copia literal del setter de main.ts:69) e isCoop (game.ts:42)
//  - ui-audio-12: eventos emitidos durante la cuenta atrás y al reaparecer el sofá
//  - ui-audio-07: efecto visible de «alzar» (altura del sofá) con dos humanos en física cooperativa
//  - ui-audio-15: eventos (y por tanto sonidos/toasts) que siguen tras perder con el sofá en la calzada
//  - ui-audio-17: pasos por fotograma de advance() (Math.round(60/fps), main.ts:285)
//  - ui-audio-23: índice del primer evento 'stage'
// Uso: npx vite-node scripts/audit/verif-ui-audio/indep-04-varios.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES, isCoop } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;

// ui-audio-11
{
  const opts = { humans: 2, carriers: 2, botStyle: 'atentos' as const };
  const setHumans = (v: number) => { opts.humans = v; if (opts.carriers < opts.humans) opts.carriers = opts.humans; }; // main.ts:69
  const log: string[] = [`inicio h=${opts.humans} c=${opts.carriers} coop=${isCoop(opts)}`];
  for (const v of [3, 2]) { setHumans(v); log.push(`elige ${v} → h=${opts.humans} c=${opts.carriers} coop=${isCoop(opts)}`); }
  console.log('[11] ' + log.join(' | '));
}

// ui-audio-12: cuenta atrás
{
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  const types = new Map<string, number>();
  let steps = 0;
  while (g.phase === 'countdown') { g.step(DT, [NO_INPUT, NO_INPUT]); steps++; for (const e of g.out) types.set(e.type, (types.get(e.type) ?? 0) + 1); }
  console.log(`[12] cuenta atrás: ${steps} pasos, eventos emitidos: ${JSON.stringify(Object.fromEntries(types))}`);
  g.dispose();
}

// ui-audio-07: alzar con dos humanos (coop)
{
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  while (g.phase === 'countdown') g.step(DT, [NO_INPUT, NO_INPUT]);
  g.step(DT, [{ ...NO_INPUT, grab: true }, { ...NO_INPUT, grab: true }]);
  for (let i = 0; i < 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const y0 = g.sofaPos.y, held = g.carriers.map((c) => c.holding);
  for (let i = 0; i < 60; i++) g.step(DT, [{ ...NO_INPUT, lift: true }, { ...NO_INPUT, lift: true }]);
  const y1 = g.sofaPos.y;
  console.log(`[07] agarran=${held} · sofá y sin alzar ${y0.toFixed(3)} m → tras 1 s alzando ${y1.toFixed(3)} m (Δ ${(y1 - y0).toFixed(3)} m); handLift=${g.carriers.map((c) => c.handLift.toFixed(2))}`);
  g.dispose();
}

// ui-audio-15: tras perder, ¿sigue habiendo eventos con sonido?
{
  const g = new Game(RAPIER as any, { humans: 1, carriers: 2, botStyle: 'atentos', seed: 3 });
  while (g.phase === 'countdown') g.step(DT, [NO_INPUT]);
  // Fuerza una derrota «por tiempo» con el sofá en mitad de la calzada (z entre -3 y -9 aprox.)
  g.sofa.setTranslation({ x: 0, y: 0.6, z: -6 }, true);
  g.time = RULES.timeLimit - 0.05;
  const after = new Map<string, number>();
  let endAt: number | null = null, t = 0;
  for (let i = 0; i < 60 * 30; i++) {
    g.step(DT, [NO_INPUT]); t += DT;
    for (const e of g.out) {
      if (endAt !== null) after.set(e.type, (after.get(e.type) ?? 0) + 1);
      if (e.type === 'lose' && endAt === null) endAt = t;
    }
  }
  console.log(`[15] derrota en t=${endAt?.toFixed(2)} s (fase ${g.phase}); eventos en los 30 s siguientes (resultados): ${JSON.stringify(Object.fromEntries(after))}`);
  g.dispose();
}

// ui-audio-17: pasos por fotograma de advance()
{
  const rows = [24, 25, 30, 50, 60].map((fps) => { const steps = Math.round(60 / fps); return `${fps} fps → ${steps} pasos = ${(steps / 60).toFixed(4)} s por fotograma (debería ${(1 / fps).toFixed(4)}; ${(((steps / 60) * fps - 1) * 100).toFixed(1)} %)`; });
  console.log('[17] ' + rows.join(' | '));
}

// ui-audio-23 y 19: primer índice de 'stage' y etapa al ganar (demo con piloto)
{
  const g = new Game(RAPIER as any, { humans: 1, carriers: 2, botStyle: 'atentos', seed: 7 });
  const ap = new Autopilot(0);
  const idx: number[] = [];
  for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(DT, [ap.input(g, DT)]);
    for (const e of g.out) if (e.type === 'stage') idx.push(e.index);
  }
  console.log(`[23/19] índices de 'stage' emitidos: ${idx.join(',')} · fase final ${g.phase} en ${g.time.toFixed(1)} s · stageLabel al acabar: «${g.stageLabel}»`);
  g.dispose();
}
