// Verificación ui-audio-01: ¿se pierden pulsaciones (agarrar/enderezar) en fotogramas sin paso de simulación?
// Usa el InputManager REAL (src/input/input.ts) con window/navigator simulados y una copia literal del bucle
// de main.ts:238-253 (acumulador DT=1/60, máx. 5 pasos, flancos solo en el primer subpaso) sobre un Game REAL.
// Uso: npx vite-node scripts/audit/verif-ui-audio/01-flancos-perdidos.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../../../src/input/input.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
// Nota: el pegamento wasm de RAPIER usa window.performance si existe window: el window simulado debe tenerlo.
await RAPIER.init();

type L = (e: { code: string; repeat?: boolean; preventDefault(): void }) => void;
const listeners: Record<string, L[]> = {};
let fakePads: (null | { connected: boolean; axes: number[]; buttons: { pressed: boolean }[] })[] = [];
(globalThis as any).window = { crypto: globalThis.crypto, performance: globalThis.performance, addEventListener: (t: string, f: L) => ((listeners[t] ??= []).push(f)) };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => fakePads }, configurable: true });
const key = (type: 'keydown' | 'keyup', code: string) => (listeners[type] ?? []).forEach((f) => f({ code, repeat: false, preventDefault() {} }));

const DT = 1 / 60;

/** Marcas de tiempo de rAF (ms) para una frecuencia y un modelo de reloj. */
function stamps(hz: number, seconds: number, model: string, rng: () => number): number[] {
  const out: number[] = [];
  const period = 1000 / hz;
  const phase = rng() * 1000;
  for (let k = 0; k <= Math.ceil(seconds * hz); k++) {
    let t = phase + k * period;
    if (model === 'jit0.1') t += (rng() - 0.5) * 0.2; // ±0,1 ms
    if (model === 'jit1') t += (rng() - 0.5) * 2; // ±1 ms
    if (model === 'q0.1') t = Math.floor(t / 0.1) * 0.1; // reloj recortado a 100 µs (truncado)
    if (model === 'q1') t = Math.floor(t); // reloj recortado a 1 ms (truncado)
    out.push(t);
  }
  return out;
}

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Ejecuta `seconds` s de partida (tras la cuenta atrás) pulsando Espacio (J1) y el botón A del mando de J2. */
function run(hz: number, model: string, seconds: number, seed: number) {
  for (const k of Object.keys(listeners)) delete listeners[k];
  fakePads = [null, { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }];
  // J2 juega con mando: el mando 0 de la lista filtrada es el de J1 (pads()[0]); para que A llegue a J2 ponemos dos mandos
  const padJ1 = { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
  const padJ2 = fakePads[1]!;
  fakePads = [padJ1, padJ2];
  const input = new InputManager();
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 7 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  // Como en scripts/audit/agentes/verify.ts: se acercan al sofá 25 pasos para quedar a su alcance
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  const rng = mulberry(seed);
  const ts = stamps(hz, seconds, model, rng);
  // Pulsaciones: cada ~0,37 s con fase aleatoria; se mantienen 90 ms
  type Ev = { t: number; f: () => void };
  const evs: Ev[] = [];
  let nKey = 0, nPad = 0;
  for (let t = ts[0] + 50 + rng() * 300; t < ts[ts.length - 1] - 200; t += 300 + rng() * 140) {
    evs.push({ t, f: () => key('keydown', 'Space') }, { t: t + 90, f: () => key('keyup', 'Space') }); nKey++;
  }
  for (let t = ts[0] + 80 + rng() * 300; t < ts[ts.length - 1] - 200; t += 300 + rng() * 140) {
    evs.push({ t, f: () => (padJ2.buttons[0].pressed = true) }, { t: t + 90, f: () => (padJ2.buttons[0].pressed = false) }); nPad++;
  }
  evs.sort((a, b) => a.t - b.t);
  let ei = 0;
  let acc = 0, last = ts[0];
  let frames = 0, zeroStepFrames = 0, deliveredKey = 0, deliveredPad = 0, grabEvents: number[] = [0, 0];
  for (let fi = 1; fi < ts.length; fi++) {
    const now = ts[fi];
    while (ei < evs.length && evs[ei].t < now) evs[ei++].f(); // los eventos del navegador llegan entre fotogramas
    const dtReal = Math.min(0.1, (now - last) / 1000);
    last = now;
    // --- copia literal de main.ts:239-253 (sin piloto automático) ---
    const humans = g.carriers.filter((c) => c.human !== null).length;
    let inputs = input.read(Math.max(1, humans));
    acc += dtReal;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      if (inputs[0].grab) deliveredKey++;
      if (inputs[1]?.grab) deliveredPad++;
      g.step(DT, inputs);
      for (const e of g.out) if (e.type === 'grab' || e.type === 'release') grabEvents[e.carrier]++;
      inputs = inputs.map((i) => ({ ...i, grab: false, right: false }));
      acc -= DT;
      steps++;
    }
    if (steps === 5) acc = 0;
    frames++;
    if (steps === 0) zeroStepFrames++;
  }
  g.dispose();
  return { frames, zeroStepFrames, nKey, deliveredKey, nPad, deliveredPad, grabEvents };
}

const pct = (a: number, b: number) => ((100 * a) / b).toFixed(1).padStart(5) + ' %';
console.log('A) Barrido: 40 s de partida, J1 pulsa Espacio y J2 el botón A de su mando (~cada 0,37 s, 90 ms).');
console.log('   «llegan» = pasos de g.step() que reciben grab=true. (eventos grab/release: no son 1:1 porque tryGrab puede fallar tras soltar)');
console.log('   hz   reloj     fotogramas  sin-paso   Espacio pulsadas/llegan (perdidas)   Mando-A pulsadas/llegan (perdidas)   eventos grab+release J1/J2');
const cases: [number, string][] = [
  [60, 'ideal'], [60, 'jit0.1'], [60, 'jit1'], [60, 'q0.1'], [60, 'q1'],
  [59.94, 'ideal'], [59.94, 'jit0.1'], [59.94, 'jit1'], [60.05, 'ideal'], [60.05, 'jit0.1'], [60.05, 'jit1'],
  [75, 'ideal'], [90, 'ideal'], [120, 'ideal'], [120, 'jit0.1'], [144, 'ideal'], [144, 'jit0.1'], [165, 'ideal'], [240, 'ideal'],
];
for (const [hz, model] of cases) {
  const r = run(hz, model, 40, Math.round(hz * 31) + model.length);
  console.log(
    `${String(hz).padStart(5)}  ${model.padEnd(7)}  ${String(r.frames).padStart(9)}  ${pct(r.zeroStepFrames, r.frames)}   ` +
    `${String(r.nKey).padStart(4)}/${String(r.deliveredKey).padStart(4)} (${pct(r.nKey - r.deliveredKey, r.nKey)})          ` +
    `${String(r.nPad).padStart(4)}/${String(r.deliveredPad).padStart(4)} (${pct(r.nPad - r.deliveredPad, r.nPad)})          ${r.grabEvents.join('/')}`,
  );
}

// B) Prueba determinista de extremo a extremo a 120 Hz: una sola pulsación de Espacio, justo antes de un
//    fotograma SIN paso o justo antes de un fotograma CON paso. ¿Acaba J1 agarrando el sofá?
function single(hz: number, beforeZeroStepFrame: boolean) {
  for (const k of Object.keys(listeners)) delete listeners[k];
  fakePads = [];
  const input = new InputManager();
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 7 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => ({ ...NO_INPUT, mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  for (let k = 0; k < 30; k++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const period = 1000 / hz;
  let acc = 0, now = 1000, last = now, pressed = false, events: string[] = [];
  for (let f = 0; f < 40; f++) {
    now += period;
    const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
    const willStep = acc + dtReal >= DT;
    if (!pressed && f > 4 && willStep !== beforeZeroStepFrame) { key('keydown', 'Space'); pressed = true; }
    if (pressed && f === 30) key('keyup', 'Space');
    const humans = g.carriers.filter((c) => c.human !== null).length;
    let inputs = input.read(Math.max(1, humans));
    acc += dtReal;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      g.step(DT, inputs);
      for (const e of g.out) if (e.type === 'grab' || e.type === 'release') events.push(`${e.type}(c${e.carrier})`);
      inputs = inputs.map((i) => ({ ...i, grab: false, right: false }));
      acc -= DT; steps++;
    }
    if (steps === 5) acc = 0;
  }
  const r = `${hz} Hz, pulsación antes de un fotograma ${beforeZeroStepFrame ? 'SIN paso' : 'CON paso'}: J1.holding=${g.carriers[0].holding} eventos=[${events.join(', ')}]`;
  g.dispose();
  return r;
}
console.log('\nB) Extremo a extremo (InputManager real + bucle de main.ts + Game real):');
for (const hz of [120, 144]) for (const z of [false, true]) console.log('   ' + single(hz, z));
