// Verificación ui-audio-11 (menú: jugadores 2→3→2), ui-audio-07 (¿alzar tiene respuesta visible?) y ui-audio-17
// (advance con fps que no dividen 60). Game REAL; setters del menú copiados de main.ts:69-70.
// Uso: npx vite-node scripts/audit/verif-ui-audio/04-menu-alzar-captura.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES, isCoop } from '../../../src/sim/game.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
import { CARRIER } from '../../../src/sim/carrier.ts';
await RAPIER.init();
const DT = 1 / 60;

// --- ui-audio-11 ---
{
  const opts = { humans: 2, carriers: 2, botStyle: 'atentos' as const }; // main.ts:19-20 (por defecto)
  const setHumans = (v: number) => { opts.humans = v; if (opts.carriers < opts.humans) opts.carriers = opts.humans; }; // main.ts:69
  const trace: string[] = [`inicio h=${opts.humans} c=${opts.carriers} coop=${isCoop(opts)}`];
  for (const v of [3, 2]) { setHumans(v); trace.push(`clic ${v} → h=${opts.humans} c=${opts.carriers} coop=${isCoop(opts)}`); }
  // start(false): main.ts:116-117
  const g = new Game(RAPIER as any, { humans: opts.humans, carriers: Math.max(opts.carriers, opts.humans), botStyle: opts.botStyle, seed: 1 });
  console.log('Menú jugadores 2→3→2: ' + trace.join(' | '));
  console.log(`  Game resultante: coop=${g.coop}, porteadores=${g.carriers.length}, ayudantes=${g.carriers.filter((c) => c.human === null).length}`);
  g.dispose();
}

// --- ui-audio-07: dos humanos agarran y luego alzan (Mayús). ¿Cambia algo visible (altura del sofá / del punto de agarre)? ---
{
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 7 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, [{ ...NO_INPUT, grab: true }, { ...NO_INPUT, grab: true }]);
  for (let i = 0; i < 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const gy = () => g.carriers.map((c) => c.grabWorld(g.sofa)?.y.toFixed(2) ?? '-').join('/');
  const before = { y: g.sofaPos.y, grab: gy(), hold: g.carriers.map((c) => c.holding).join('/') };
  for (let i = 0; i < 60; i++) g.step(DT, [{ ...NO_INPUT, lift: true }, { ...NO_INPUT, lift: true }]);
  console.log(`\nAlzar (CARRIER.handY=${CARRIER.handY} → liftY=${CARRIER.liftY}): agarrando=${before.hold}`);
  console.log(`  sin alzar: sofá y=${before.y.toFixed(2)} m, puntos de agarre y=${before.grab}`);
  console.log(`  tras 1 s con Mayús: sofá y=${g.sofaPos.y.toFixed(2)} m, puntos de agarre y=${gy()}, handLift=${g.carriers.map((c) => c.handLift.toFixed(2)).join('/')}`);
  g.dispose();
}

// --- ui-audio-17: main.ts:285 steps = Math.round(60 / fps) ---
console.log('\nadvance(frames, fps): tiempo simulado por fotograma de vídeo frente al real');
for (const fps of [24, 25, 30, 50, 60]) {
  const steps = Math.round(60 / fps);
  console.log(`  fps=${fps}: ${steps} pasos = ${(steps / 60).toFixed(4)} s por fotograma; debería ser ${(1 / fps).toFixed(4)} s → velocidad ×${((steps / 60) * fps).toFixed(3)}`);
}
