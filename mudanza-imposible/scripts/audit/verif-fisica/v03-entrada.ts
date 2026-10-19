// Verificación de la entrada (fisica-03, 08, 12, 13, 14) con el InputManager REAL (src/input/input.ts) y window/navigator
// simulados. El bucle de main.ts:235-257 no se puede importar (depende del DOM y de Three): se reproduce aquí línea a
// línea (mismo DT, mismo acumulador, mismo tope de 5 pasos, mismo borrado de flancos tras el primer paso, misma pausa).
// Uso: npx vite-node scripts/audit/verif-fisica/v03-entrada.ts
import RAPIER from '@dimforge/rapier3d-compat';

type Btn = { pressed: boolean };
type FakePad = { index: number; connected: boolean; mapping: string; axes: number[]; buttons: Btn[] };
const handlers: Record<string, ((e: any) => void)[]> = {};
let padList: (FakePad | null)[] = [];
// performance: Rapier (wasm-bindgen) usa window.performance si existe window
(globalThis as any).window = { performance: globalThis.performance, addEventListener: (t: string, f: (e: any) => void) => (handlers[t] ??= []).push(f) };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => padList }, configurable: true, writable: true });
const { InputManager } = await import('../../../src/input/input.ts');
const key = (type: 'keydown' | 'keyup', code: string) => {
  const e = { code, repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const f of handlers[type] ?? []) f(e);
  return e;
};
const mkPad = (index: number): FakePad => ({ index, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) });
const DT = 1 / 60;

// ---------- fisica-03: flancos perdidos en fotogramas sin paso ----------
console.log('=== fisica-03: pulsación de agarrar (Espacio) a distintas frecuencias de pantalla ===');
function lostPresses(hz: number, jitterMs: number, presses = 400, seed = 1) {
  const input = new InputManager();
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  let acc = 0, got = 0, framesNoStep = 0, frames = 0;
  for (let p = 0; p < presses; p++) {
    // tecla pulsada justo antes de un fotograma, mantenida ~100 ms
    key('keydown', 'Space');
    let seen = false;
    const holdFrames = Math.ceil(0.1 * hz);
    const idle = 3 + Math.floor(rnd() * 7);
    for (let f = 0; f < holdFrames + idle; f++) {
      if (f === holdFrames) key('keyup', 'Space');
      const dtReal = Math.min(0.1, 1 / hz + (rnd() - 0.5) * 2 * jitterMs / 1000);
      // --- réplica de main.ts:239-253 ---
      let inputs = input.read(1);
      acc += dtReal;
      let steps = 0;
      while (acc >= DT && steps < 5) {
        if (inputs[0].grab) seen = true; // aquí g.step(DT, inputs) consumiría el flanco
        inputs = inputs.map((i) => ({ ...i, grab: false, right: false }));
        acc -= DT; steps++;
      }
      if (steps === 5) acc = 0;
      frames++; if (steps === 0) framesNoStep++;
    }
    if (seen) got++;
  }
  return `${hz} Hz${jitterMs ? ` (±${jitterMs} ms)` : ''}: fotogramas sin paso ${(100 * framesNoStep / frames).toFixed(1)} %, pulsaciones que llegan a la simulación ${got}/${presses} (${(100 * got / presses).toFixed(1)} %)`;
}
for (const [hz, j] of [[60, 0], [60, 1], [75, 0], [120, 0], [144, 0], [165, 0], [240, 0]] as const) console.log('  ' + lostPresses(hz, j));

// Con la simulación real: J1 frente al sofá pulsa Espacio una vez, a 144 Hz, en distintos fotogramas
await RAPIER.init();
const { Game, RULES } = await import('../../../src/sim/game.ts');
const { NO_INPUT } = await import('../../../src/sim/types.ts');
{
  const res: string[] = [];
  for (let offset = 0; offset < 12; offset++) {
    const input = new InputManager();
    const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
    let acc = 0;
    for (let f = 0; f < 40; f++) {
      if (f === offset) key('keydown', 'Space');
      if (f === offset + 15) key('keyup', 'Space');
      let inputs = input.read(2);
      acc += 1 / 144;
      let steps = 0;
      while (acc >= DT && steps < 5) { g.step(DT, inputs); inputs = inputs.map((i) => ({ ...i, grab: false, right: false })); acc -= DT; steps++; }
      if (steps === 5) acc = 0;
    }
    res.push(`f${offset}:${g.carriers[0].holding ? 'agarra' : 'NO'}`);
    g.dispose();
  }
  console.log('  Juego real a 144 Hz, Espacio pulsado en el fotograma k (J1 al alcance del sofá): ' + res.join(' '));
}
// Mando: botón A mantenido 100 ms a 144 Hz
{
  const input = new InputManager();
  padList = [mkPad(0)];
  let acc = 0, got = 0; const N = 200;
  for (let p = 0; p < N; p++) {
    padList[0]!.buttons[0] = { pressed: true };
    let seen = false;
    for (let f = 0; f < 15 + (p % 7) + 3; f++) {
      if (f === 15) padList[0]!.buttons[0] = { pressed: false };
      let inputs = input.read(1);
      acc += 1 / 144; let steps = 0;
      while (acc >= DT && steps < 5) { if (inputs[0].grab) seen = true; inputs = inputs.map((i) => ({ ...i, grab: false })); acc -= DT; steps++; }
    }
    if (seen) got++;
  }
  console.log(`  Mando, botón A a 144 Hz: llegan ${got}/${N}`);
  padList = [];
}

// ---------- fisica-08: asignación de mandos por orden ----------
console.log('=== fisica-08: 4 jugadores, J1 y J2 en teclado, dos mandos ===');
{
  const input = new InputManager();
  const A = mkPad(0), B = mkPad(1);
  A.axes = [1, 0, 0, 0];   // quien lleva el mando A empuja a la derecha
  B.axes = [0, 1, 0, 0];   // quien lleva el mando B empuja hacia abajo
  padList = [A, B];
  key('keydown', 'KeyW');      // J1 (teclado) arriba
  key('keydown', 'ArrowLeft'); // J2 (teclado) izquierda
  const r = input.read(4);
  r.forEach((x, i) => console.log(`  J${i + 1}: mx=${x.mx.toFixed(2)} mz=${x.mz.toFixed(2)}`));
  key('keyup', 'KeyW'); key('keyup', 'ArrowLeft');
  // Desconexión: el mando A (índice 0) se desconecta; el B pasa a ser pads[0] (J1)
  A.axes = [0, 0, 0, 0]; B.axes = [0, 0, 0, 0];
  A.buttons[0] = { pressed: true }; input.read(2); // A mantiene pulsado «A»
  padList = [null, B]; B.buttons[0] = { pressed: true }; // se desconecta A y B pulsa «A» en ese momento
  const r2 = input.read(2);
  console.log(`  Tras desconectar el mando 0: pads()=${input.pads().map((p: any) => p.index).join(',')} -> el mando de índice 1 controla a J1. Su pulsación de A: J1.grab=${r2[0].grab}, J2.grab=${r2[1].grab} (flanco perdido por prevPad desfasado)`);
  padList = [];
}

// ---------- fisica-12: Start del mando de J2 ----------
console.log('=== fisica-12: Start (botón 9) mantenido en el mando de índice 1 y 2, partida de 2 humanos ===');
for (const padIdx of [0, 1, 2]) {
  const input = new InputManager();
  const pads = [mkPad(0), mkPad(1), mkPad(2)];
  padList = pads;
  let paused = false; const humans = 2; const trace: string[] = [];
  for (let f = 0; f < 8; f++) {
    pads[padIdx].buttons[9] = { pressed: f >= 1 && f <= 5 }; // Start pulsado en los fotogramas 1..5
    // --- réplica de main.ts:236-257 ---
    if (input.padStart()) paused = !paused;
    if (!paused) input.read(Math.max(1, humans)); else input.read(1);
    trace.push(paused ? 'P' : '-');
  }
  console.log(`  mando ${padIdx}: Start pulsado en f1..f5 -> pausa por fotograma f0..f7: ${trace.join('')}`);
}
padList = [];

// ---------- fisica-13: preventDefault ----------
console.log('=== fisica-13: ¿qué teclas asignadas anulan la acción por defecto? ===');
{
  new InputManager();
  const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyQ', 'KeyE', 'KeyR', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'ShiftRight', 'Comma', 'Period', 'Slash'];
  console.log('  ' + codes.map((c) => { const e = key('keydown', c); key('keyup', c); return `${c}:${e.defaultPrevented ? 'sí' : 'NO'}`; }).join(' '));
  // blur vacía las teclas mantenidas
  const input = new InputManager();
  key('keydown', 'ShiftLeft');
  const before = input.read(1)[0].lift;
  for (const f of handlers['blur'] ?? []) f({});
  const after = input.read(1)[0].lift;
  console.log(`  Mayús izq. mantenida: lift=${before}; tras un blur de la ventana (sin soltar la tecla): lift=${after}`);
  key('keyup', 'ShiftLeft');
}

// ---------- fisica-14: zona muerta y distribución ----------
console.log('=== fisica-14: zona muerta del stick y mapping ===');
{
  const input = new InputManager();
  const P = mkPad(0); padList = [P];
  const out: string[] = [];
  for (const ax of [0.15, 0.199, 0.201, 0.25, 0.5]) { P.axes = [ax, 0, 0, 0]; out.push(`eje=${ax}->mx=${input.read(1)[0].mx.toFixed(3)}`); }
  console.log('  ' + out.join('  '));
  P.mapping = ''; P.axes = [0, 0, 0, 0]; P.buttons[1] = { pressed: true };
  console.log(`  mando con mapping='' (no estándar) y botón 1 pulsado: se lee igual -> lift=${input.read(1)[0].lift}`);
  P.buttons[1] = { pressed: false }; P.buttons[15] = { pressed: true }; P.axes = [0.5, 0, 0, 0];
  console.log(`  stick 0,5 a la derecha + cruceta derecha: mx=${input.read(1)[0].mx.toFixed(2)} (se suman y luego se normaliza)`);
  padList = [];
}
