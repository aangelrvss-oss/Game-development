// Verificación independiente ui-audio-03 (Start de mandos ≠ J1) y ui-audio-05 (asignación de mandos por posición).
// InputManager REAL con navigator.getGamepads simulado. Se copia la lógica de main.ts:235-257 (padStart, pausa,
// resultados → start) sin Game (no hace falta para la pausa): `humans` es el nº de humanos de la partida.
// Uso: npx vite-node scripts/audit/verif-ui-audio/indep-03-start-mando.ts
type Btn = { pressed: boolean };
type Pad = { index: number; connected: boolean; axes: number[]; buttons: Btn[] };
const mkPad = (index: number): Pad => ({ index, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) });
let slots: (Pad | null)[] = [];
(globalThis as any).window = { addEventListener: () => {} };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => slots }, configurable: true });
const { InputManager } = await import('../../../src/input/input.ts');

function run(label: string, humans: number, nPads: number, who: number, startScreen: 'play' | 'results', holdFrames: number, auto = false) {
  const input = new InputManager();
  slots = Array.from({ length: nPads }, (_, i) => mkPad(i));
  let screen: 'menu' | 'play' | 'results' = startScreen;
  let paused = false;
  let starts = 0;
  const setPaused = (p: boolean) => { if (screen !== 'play') return; paused = p; };
  const start = () => { starts++; screen = 'play'; paused = false; };
  const hum = auto ? 1 : humans;
  const trace: string[] = [];
  // 3 fotogramas en reposo, luego Start mantenido `holdFrames` fotogramas, luego suelto 3 fotogramas
  const total = 3 + holdFrames + 3;
  for (let f = 0; f < total; f++) {
    slots[who]!.buttons[9].pressed = f >= 3 && f < 3 + holdFrames;
    // --- main.ts:235-257 ---
    if (input.padStart()) { if (screen === 'play') setPaused(!paused); else if (screen === 'results') start(); }
    if (!paused) input.read(Math.max(1, hum));
    else input.read(1);
    trace.push(paused ? 'P' : screen === 'results' ? 'R' : '·');
  }
  console.log(`${label.padEnd(64)} ${trace.join('')}   (reinicios: ${starts})`);
}
console.log('Leyenda: · jugando  P en pausa  R resultados. Fotogramas 0-2 en reposo, Start pulsado desde el 3.\n');
run('2 humanos, mando de J1 (índice 0) pulsa Start 1 fotograma', 2, 2, 0, 'play', 1);
run('2 humanos, mando de J1 (índice 0) mantiene Start 6 fotogramas', 2, 2, 0, 'play', 6);
run('2 humanos, mando de J2 (índice 1) pulsa Start 1 fotograma', 2, 2, 1, 'play', 1);
run('2 humanos, mando de J2 (índice 1) mantiene Start 6 fotogramas', 2, 2, 1, 'play', 6);
run('2 humanos, 3.er mando (índice 2, no leído) mantiene Start 6 fotogr.', 2, 3, 2, 'play', 6);
run('Resultados, 2 humanos, mando de J2 mantiene Start 6 fotogramas', 2, 2, 1, 'results', 6);
run('Resultados, 2 humanos, 3.er mando mantiene Start 6 fotogramas', 2, 3, 2, 'results', 6);
run('Demo (piloto, 1 humano), mando 2 mantiene Start 6 fotogramas', 2, 2, 1, 'play', 6, true);

// --- ui-audio-05: asignación por posición en la lista filtrada ---
console.log('\nAsignación de mandos (read(n) usa pads()[i], la lista filtrada de conectados):');
{
  const input = new InputManager();
  const a = mkPad(0), b = mkPad(1), c = mkPad(2);
  slots = [a, b, c];
  c.axes[0] = 1; // el mando c empuja a la derecha
  console.log('  3 mandos [a,b,c], c empuja el stick → mx por jugador (4 humanos):', input.read(4).map((x) => x.mx.toFixed(1)).join(' '));
  slots = [a, null, c]; // se desconecta b (el hueco queda null en getGamepads)
  console.log('  b desconectado ([a,null,c]) → mx por jugador:', input.read(4).map((x) => x.mx.toFixed(1)).join(' '), ' ← c pasa de J3 a J2');
  slots = [a, b];
  a.axes[0] = 1; c.axes[0] = 0;
  console.log('  2 mandos, el mando a (índice 0) empuja → mx de J1/J2:', input.read(2).map((x) => x.mx.toFixed(1)).join(' '), ' ← mueve a J1 aunque J1 juegue con WASD');
}
