// Verificación independiente ui-audio-01: pulsaciones de agarrar/enderezar perdidas en fotogramas sin paso.
// Usa el InputManager REAL (src/input/input.ts) con window/navigator simulados, un Game REAL y una copia literal
// del bucle de main.ts:238-253 (acumulador DT=1/60, máximo 5 pasos, flancos solo en el primer subpaso).
// Uso (desde mudanza-imposible): npx vite-node scripts/audit/verif-ui-audio/indep-01-flancos.ts
import RAPIER from '@dimforge/rapier3d-compat';

type Ev = { code: string; repeat?: boolean; preventDefault(): void };
const listeners: Record<string, ((e: Ev) => void)[]> = {};
(globalThis as any).window = {
  performance: globalThis.performance,
  crypto: globalThis.crypto,
  addEventListener: (t: string, f: (e: Ev) => void) => (listeners[t] ??= []).push(f),
};
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
const fire = (type: 'keydown' | 'keyup', code: string) => (listeners[type] ?? []).forEach((f) => f({ code, repeat: false, preventDefault() {} }));

await RAPIER.init();
const { InputManager } = await import('../../../src/input/input.ts');
const { Game, RULES } = await import('../../../src/sim/game.ts');
const { NO_INPUT } = await import('../../../src/sim/types.ts');

const DT = 1 / 60;

// --- Parte A: proporción de fotogramas sin ningún paso (solo el acumulador de main.ts:241-253) ---
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
type Model = 'exacto' | 'trunc0.1ms' | 'trunc1ms' | 'jit±0.5ms';
function stamps(hz: number, n: number, model: Model, r: () => number) {
  const P = 1000 / hz, ph = 1000 + r() * 50, out: number[] = [];
  for (let k = 0; k < n; k++) {
    let t = ph + k * P;
    if (model === 'trunc0.1ms') t = Math.floor(t * 10) / 10;
    if (model === 'trunc1ms') t = Math.floor(t);
    if (model === 'jit±0.5ms') t += (r() - 0.5);
    out.push(t);
  }
  return out;
}
function zeroStepFraction(ts: number[]) {
  let acc = 0, last = ts[0], zero = 0, frames = 0;
  for (let k = 1; k < ts.length; k++) {
    const dtReal = Math.min(0.1, (ts[k] - last) / 1000); last = ts[k];
    acc += dtReal; let steps = 0;
    while (acc >= DT && steps < 5) { acc -= DT; steps++; }
    if (steps === 5) acc = 0;
    frames++; if (steps === 0) zero++;
  }
  return zero / frames;
}
console.log('A) Fotogramas sin paso de simulación (acumulador de main.ts:241-253), 20 fases × 20 000 fotogramas');
for (const hz of [60, 75, 120, 144, 165]) {
  const row: string[] = [];
  for (const m of ['exacto', 'trunc0.1ms', 'trunc1ms', 'jit±0.5ms'] as Model[]) {
    const vals: number[] = [];
    for (let s = 1; s <= 20; s++) vals.push(zeroStepFraction(stamps(hz, 20000, m, rng(s * 7919 + hz))));
    const mn = Math.min(...vals) * 100, mx = Math.max(...vals) * 100, mean = (vals.reduce((a, b) => a + b, 0) / vals.length) * 100;
    row.push(`${m}: media ${mean.toFixed(1)} % [${mn.toFixed(1)}–${mx.toFixed(1)}]`);
  }
  console.log(`  ${hz} Hz  ` + row.join(' | '));
}

// --- Parte B: de punta a punta con InputManager y Game reales ---
// J1 (Espacio) pulsa agarrar/soltar a instantes aleatorios; cuento cuántas pulsaciones producen un evento grab/release.
async function endToEnd(hz: number, model: Model, presses: number, seed: number) {
  const input = new InputManager();
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const r = rng(seed);
  const ts = stamps(hz, Math.ceil((presses * 0.6 + 2) * hz), model, r);
  // instantes de pulsación: cada 0,45–0,6 s, en medio de un intervalo entre fotogramas
  const pressAt: number[] = []; let t = ts[0] + 200;
  for (let i = 0; i < presses; i++) { t += 450 + r() * 150; pressAt.push(t); }
  let pi = 0, acc = 0, last = ts[0];
  let reachedStep = 0, grabEvents = 0, droppedFrames = 0;
  for (let k = 1; k < ts.length && (pi < presses || false); k++) {
    // eventos de teclado ocurridos antes de este fotograma (el navegador los entrega antes del rAF)
    let pressedThisFrame = 0;
    while (pi < presses && pressAt[pi] < ts[k]) { fire('keydown', 'Space'); fire('keyup', 'Space'); pi++; pressedThisFrame++; }
    // --- copia de main.ts:227-253 ---
    const now = ts[k];
    const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
    const humans = g.carriers.filter((c) => c.human !== null).length;
    let inputs = input.read(Math.max(1, humans));
    acc += dtReal;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      if (steps === 0 && inputs[0]?.grab) reachedStep++;
      g.step(DT, inputs);
      for (const e of g.out) if ((e.type === 'grab' || e.type === 'release') && e.carrier === 0) grabEvents++;
      inputs = inputs.map((i) => ({ ...i, grab: false, right: false }));
      acc -= DT; steps++;
    }
    if (steps === 5) acc = 0;
    if (steps === 0 && pressedThisFrame) droppedFrames += pressedThisFrame;
  }
  g.dispose();
  return { presses, reachedStep, grabEvents, droppedFrames };
}
console.log('\nB) De punta a punta (InputManager real + Game real, J1 pulsa Espacio junto al sofá)');
for (const [hz, m] of [[60, 'exacto'], [60, 'trunc0.1ms'], [60, 'jit±0.5ms'], [120, 'exacto'], [144, 'exacto'], [144, 'jit±0.5ms']] as [number, Model][]) {
  const r = await endToEnd(hz, m, 120, 42 + hz);
  console.log(`  ${hz} Hz ${m.padEnd(11)} pulsaciones=${r.presses}  llegan a g.step con grab=true: ${r.reachedStep} (${((r.reachedStep / r.presses) * 100).toFixed(1)} %)  eventos grab/release de J1: ${r.grabEvents}  pulsaciones leídas en fotograma sin paso: ${r.droppedFrames} (${((r.droppedFrames / r.presses) * 100).toFixed(1)} %)`);
}

// --- Parte C: una pulsación por partida nueva (aísla el efecto: J1 empieza sin agarrar y al alcance del sofá) ---
// Tras la cuenta atrás se deja correr el bucle de fotogramas a la frecuencia dada; en un instante aleatorio J1 pulsa
// Espacio (keydown+keyup antes del siguiente rAF). Se mira si J1 acaba agarrando el sofá 0,3 s después.
async function onePress(hz: number, model: Model, seed: number) {
  const input = new InputManager();
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const r = rng(seed);
  const ts = stamps(hz, Math.ceil(0.8 * hz), model, r);
  const pressAt = ts[0] + 100 + r() * 200;
  let acc = r() * DT, last = ts[0], pressed = false, zeroStepAtPress = false;
  for (let k = 1; k < ts.length; k++) {
    let pThis = false;
    if (!pressed && pressAt < ts[k]) { fire('keydown', 'Space'); fire('keyup', 'Space'); pressed = true; pThis = true; }
    const dtReal = Math.min(0.1, (ts[k] - last) / 1000); last = ts[k];
    const humans = g.carriers.filter((c) => c.human !== null).length;
    let inputs = input.read(Math.max(1, humans));
    acc += dtReal; let steps = 0;
    while (acc >= DT && steps < 5) {
      g.step(DT, inputs);
      inputs = inputs.map((i) => ({ ...i, grab: false, right: false }));
      acc -= DT; steps++;
    }
    if (steps === 5) acc = 0;
    if (pThis && steps === 0) zeroStepAtPress = true;
  }
  const held = g.carriers[0].holding;
  g.dispose();
  return { held, zeroStepAtPress };
}
console.log('\nC) Una pulsación por partida nueva (40 partidas por fila): ¿agarra J1?');
for (const [hz, m] of [[60, 'jit±0.5ms'], [120, 'exacto'], [144, 'exacto']] as [number, Model][]) {
  let held = 0, zero = 0, heldWhenZero = 0;
  const N = 40;
  for (let s = 0; s < N; s++) { const r = await onePress(hz, m, 1000 + s * 31 + hz); if (r.held) held++; if (r.zeroStepAtPress) { zero++; if (r.held) heldWhenZero++; } }
  console.log(`  ${hz} Hz ${m.padEnd(10)} agarra en ${held}/${N} (${((held / N) * 100).toFixed(0)} %); pulsación leída en fotograma sin paso: ${zero}/${N}, de ellas agarran: ${heldWhenZero}`);
}
