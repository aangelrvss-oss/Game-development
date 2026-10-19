// Verificación ui-audio-03 (Start de mandos que no son el de J1) y parte de ui-audio-04/05.
// InputManager REAL con navigator.getGamepads simulado + copia del flujo de control de main.ts:235-261
// (padStart antes de read; read(humanos) sin pausa; read(1) en pausa y en menú). Sin física: solo el flujo.
// Uso: npx vite-node scripts/audit/verif-ui-audio/02-start-mando-pausa.ts
type Pad = { connected: boolean; axes: number[]; buttons: { pressed: boolean }[] };
const mk = (): Pad => ({ connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) });
let pads: (Pad | null)[] = [];
(globalThis as any).window = { performance: globalThis.performance, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true });
const { InputManager } = await import('../../../src/input/input.ts');

function scenario(name: string, humans: number, padIndex: number, startScreen: 'play' | 'results', nPads = 3) {
  pads = Array.from({ length: nPads }, mk);
  const input = new InputManager();
  let screen: 'menu' | 'play' | 'results' = startScreen, paused = false, restarts = 0;
  const setPaused = (p: boolean) => { if (screen !== 'play') return; paused = p; };
  const start = () => { restarts++; screen = 'play'; paused = false; };
  const log: string[] = [];
  for (let f = 0; f < 14; f++) {
    pads[padIndex]!.buttons[9].pressed = f >= 3 && f < 9; // Start mantenido 6 fotogramas (100 ms a 60 Hz)
    // --- main.ts:235-257 ---
    if (screen !== 'menu') {
      if (input.padStart()) { if (screen === 'play') setPaused(!paused); else if (screen === 'results') start(); }
      if (!paused) input.read(Math.max(1, humans));
      else input.read(1);
    } else input.read(1);
    log.push(`${f}:${pads[padIndex]!.buttons[9].pressed ? 'S' : '-'}${screen === 'results' ? 'R' : paused ? 'P' : '·'}`);
  }
  console.log(`${name.padEnd(58)} ${log.join(' ')}  reinicios=${restarts}`);
}
console.log('Leyenda por fotograma: S=Start pulsado, P=en pausa, ·=jugando, R=resultados');
scenario('J1 (mando 0), 2 humanos, jugando', 2, 0, 'play');
scenario('J2 (mando 1), 2 humanos, jugando', 2, 1, 'play');
scenario('Mando 2 (no leído: índice >= humanos), 2 humanos, jugando', 2, 2, 'play');
scenario('J2 (mando 1), 2 humanos, en resultados', 2, 1, 'results');
scenario('Mando 2 (no leído), 2 humanos, en resultados', 2, 2, 'results');
scenario('J1 (mando 0), 1 humano, jugando', 1, 0, 'play');
scenario('Mando 1, 1 humano (demo o 1 jugador), jugando', 1, 1, 'play');

// ui-audio-04: en el menú (screen === 'menu') nunca se consulta padStart: Start no hace nada.
{
  pads = [mk()];
  const input = new InputManager();
  let screen: string = 'menu', started = 0;
  for (let f = 0; f < 10; f++) {
    pads[0]!.buttons[9].pressed = f >= 2 && f < 6; pads[0]!.buttons[0].pressed = f >= 6; // Start y luego A
    if (screen !== 'menu') { if (input.padStart()) started++; } else input.read(1);
  }
  console.log(`\nMenú: Start y A pulsados en el mando 0 → partidas empezadas = ${started} (screen sigue '${screen}')`);
}

// ui-audio-05: el mando 0 de la lista controla a J1 aunque J1 juegue con teclado; al desconectar el 0, el 1 pasa a J1.
{
  pads = [mk(), mk()];
  const input = new InputManager();
  pads[0]!.axes = [1, 0]; // el mando 0 empuja a la derecha
  pads[1]!.axes = [0, 1]; // el mando 1 empuja hacia abajo
  const a = input.read(3);
  console.log(`\nDos mandos conectados, 3 humanos → J1 mx=${a[0].mx} mz=${a[0].mz} | J2 mx=${a[1].mx} mz=${a[1].mz} | J3 mx=${a[2].mx} mz=${a[2].mz}`);
  pads[0] = null; // se desconecta el mando 0 (getGamepads deja un hueco null)
  const b = input.read(3);
  console.log(`Se desconecta el mando 0 → J1 mx=${b[0].mx} mz=${b[0].mz} | J2 mx=${b[1].mx} mz=${b[1].mz} (el antiguo mando de J2 ahora mueve a J1)`);
}
