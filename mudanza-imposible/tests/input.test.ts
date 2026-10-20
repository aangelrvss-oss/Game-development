// Pruebas de las entradas sin navegador (entorno Node): pulsaciones retenidas hasta el paso de física,
// teclado para 4 jugadores, mandos asignados por Gamepad.index, Start de cualquier mando y menú con mando.
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import inputSrc from '../src/input/input.ts?raw';
import inputCoreSrc from '../src/input/inputCore.ts?raw';
import mainSrc from '../src/main.ts?raw';
import typesSrc from '../src/sim/types.ts?raw';
import hudSrc from '../src/ui/hud.ts?raw';
import { FixedStep, InputCore, KEY_SCHEMES, PAD, planPads, playerControls, stickXY, type PadEvent, type PadSnapshot } from '../src/input/inputCore';
import type { Game } from '../src/sim/game';
import { NO_INPUT, type PlayerInput } from '../src/sim/types';
import { controlHints, heavyAloneHint } from '../src/ui/hud';

const DT = 1 / 60;

/** Mando simulado con la forma de `Gamepad`: botones pulsados y ejes del stick izquierdo. */
function pad(index: number, pressed: number[] = [], axes: number[] = [0, 0], mapping = 'standard'): PadSnapshot {
  return { index, connected: true, mapping, axes, buttons: Array.from({ length: 17 }, (_, j) => ({ pressed: pressed.includes(j) })) };
}

/**
 * Un fotograma del bucle de `main.ts`: lo que pasó entre fotogramas (teclas), una lectura de todos los mandos y los
 * pasos de física que toquen, cada uno con sus entradas (las pulsaciones las consume el primero).
 */
function frame(core: InputCore, stepper: FixedStep, dt: number, n: number, pads: PadSnapshot[] = [], between?: () => void) {
  between?.();
  const events = core.pollPads(pads);
  const steps = stepper.frame(dt);
  const inputs: PlayerInput[][] = [];
  for (let i = 0; i < steps; i++) inputs.push(core.step(n));
  return { events, steps, inputs };
}

const tap = (core: InputCore, code: string) => () => { core.keyDown(code); core.keyUp(code); };

describe('Entradas: pulsaciones retenidas hasta el paso de física (T-input-1)', () => {
  /**
   * A 144 Hz, para cada fotograma k de un tramo, se pulsa y se suelta la tecla entre el fotograma k-1 y el k (una
   * pulsación corta, como un toque). Se comprueba que la recibe exactamente un paso, el primero que se ejecute.
   */
  function sweep(press: (core: InputCore, k: number) => { between?: () => void; pads: (f: number) => PadSnapshot[] }, field: 'grab' | 'right', player: number, players = 2) {
    let zeroStepPresses = 0;
    for (let k = 3; k < 40; k++) {
      const core = new InputCore();
      core.setPlayers(players);
      const stepper = new FixedStep(DT, 5);
      const p = press(core, k);
      let got = 0, firstStepAfter = -1, firstWithPress = -1, stepIndex = 0;
      for (let f = 0; f < k + 20; f++) {
        const r = frame(core, stepper, 1 / 144, players, p.pads(f), f === k ? p.between : undefined);
        if (f === k && r.steps === 0) zeroStepPresses++;
        for (const inp of r.inputs) {
          if (f >= k && firstStepAfter < 0) firstStepAfter = stepIndex;
          if (inp[player][field]) { got++; if (firstWithPress < 0) firstWithPress = stepIndex; }
          // Nadie más recibe la pulsación
          inp.forEach((x, j) => { if (j !== player) expect(x[field]).toBe(false); });
          stepIndex++;
        }
      }
      expect(got, `pulsación en el fotograma ${k}`).toBe(1);
      expect(firstWithPress, `pulsación en el fotograma ${k}`).toBe(firstStepAfter);
    }
    // A 144 Hz, más de la mitad de los fotogramas no ejecutan ningún paso: el caso que antes perdía la pulsación
    expect(zeroStepPresses).toBeGreaterThan(37 * 0.5);
  }

  it('a 144 Hz, agarrar con el teclado en un fotograma sin paso llega al paso siguiente, una sola vez (J1 Espacio, J2 Intro)', () => {
    sweep((core) => ({ between: tap(core, 'Space'), pads: () => [] }), 'grab', 0);
    sweep((core) => ({ between: tap(core, 'Enter'), pads: () => [] }), 'grab', 1);
  });

  it('a 144 Hz, enderezar con el teclado tampoco se pierde (J1 R, J3 O)', () => {
    sweep((core) => ({ between: tap(core, 'KeyR'), pads: () => [] }), 'right', 0);
    sweep((core) => ({ between: tap(core, 'KeyO'), pads: () => [] }), 'right', 2, 3);
  });

  it('a 144 Hz, A e Y del mando, pulsados un solo fotograma sin paso, llegan al paso siguiente', () => {
    // Un mando con 2 jugadores es de J2 (el teclado lleva a J1). Pulsado solo durante la lectura del fotograma k.
    const withPad = (button: number) => (core: InputCore, k: number) => {
      core.pollPads([pad(0)]);
      core.setPlayers(2);
      return { pads: (f: number) => [pad(0, f === k ? [button] : [])] };
    };
    sweep(withPad(PAD.a), 'grab', 1);
    sweep(withPad(PAD.y), 'right', 1);
  });

  it('con dos pasos en un fotograma, la pulsación cuenta solo en el primero; el movimiento, en los dos', () => {
    const core = new InputCore();
    core.setPlayers(1);
    const stepper = new FixedStep(DT, 5);
    core.keyDown('KeyW');
    const r = frame(core, stepper, 2 / 60 + 1e-6, 1, [], tap(core, 'Space'));
    expect(r.steps).toBe(2);
    expect(r.inputs.map((i) => i[0].grab)).toEqual([true, false]);
    expect(r.inputs.map((i) => i[0].mz)).toEqual([-1, -1]);
  });

  it('el paso fijo no pierde tiempo a 144 Hz y, tras un parón, no ejecuta más de 5 pasos', () => {
    const stepper = new FixedStep(DT, 5);
    let steps = 0;
    for (let f = 0; f < 144 * 2; f++) steps += stepper.frame(1 / 144);
    expect(Math.abs(steps - 120)).toBeLessThanOrEqual(1);
    expect(stepper.frame(0.1)).toBe(5);
    expect(stepper.frame(1 / 144)).toBe(0); // el resto del parón se descarta
  });

  it('pausar no se pierde: Start de cualquier mando, incluso el que no lleva a nadie, cambia la pausa una sola vez aunque se mantenga', () => {
    const core = new InputCore();
    const stepper = new FixedStep(DT, 5);
    const all = (held: Record<number, number[]>) => [0, 1, 2, 3].map((i) => pad(i, held[i] ?? []));
    core.pollPads(all({}));
    core.setPlayers(2); // mandos 0 y 1: J1 y J2; mandos 2 y 3: sin jugador
    expect(core.playerOfPad(3)).toBe(null);
    let paused = false;
    const run = (frames: number, held: Record<number, number[]>) => {
      for (let f = 0; f < frames; f++) {
        // Como en main.ts: los mandos se leen en cada fotograma; en pausa no hay pasos de física
        const r = core.pollPads(all(held));
        for (const e of r) if (e.action === 'start') paused = !paused;
        if (!paused) stepper.frame(1 / 144);
      }
    };
    for (const which of [1, 3, 0, 2]) {
      const before = paused;
      run(20, { [which]: [PAD.start] }); // mantiene Start 20 fotogramas
      expect(paused, `Start del mando ${which}`).toBe(!before);
      run(3, {});
    }
    // Un toque de Start en un fotograma en el que no hay paso de física también cuenta (la lectura no depende de los pasos)
    const fresh = new FixedStep(DT, 5);
    expect(fresh.frame(1 / 144)).toBe(0);
    expect(core.pollPads(all({ 2: [PAD.start] })).filter((e) => e.action === 'start')).toHaveLength(1);
  });

  it('lo pulsado antes de empezar o durante la pausa se descarta al volver (clearPresses)', () => {
    const core = new InputCore();
    core.setPlayers(2);
    core.keyDown('Enter'); // Intro en el menú empieza la partida; no debe hacer agarrar a J2
    core.clearPresses();
    expect(core.step(2)[1].grab).toBe(false);
  });
});

describe('Entradas: cuatro jugadores en teclado y mandos (T-input-2)', () => {
  const schemes = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', grab: 'Space' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', grab: 'Enter' },
    { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', grab: 'KeyU' },
    { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', grab: 'Numpad0' },
  ];

  it('teclado: J1 WASD + Espacio, J2 flechas + Intro, J3 IJKL + U, J4 numérico 8 4 5 6 + 0; cada esquema solo mueve y agarra a su jugador', () => {
    schemes.forEach((s, i) => {
      for (const [dir, mx, mz] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]] as const) {
        const core = new InputCore();
        core.setPlayers(4);
        core.keyDown(s[dir]);
        const out = core.step(4);
        out.forEach((x, j) => {
          expect(x.mx, `J${i + 1} ${dir}`).toBe(j === i ? mx : 0);
          expect(x.mz, `J${i + 1} ${dir}`).toBe(j === i ? mz : 0);
        });
      }
      const core = new InputCore();
      core.setPlayers(4);
      core.keyDown(s.grab);
      expect(core.step(4).map((x) => x.grab)).toEqual([0, 1, 2, 3].map((j) => j === i));
    });
  });

  it('los cuatro a la vez, cada uno en una dirección, sin interferirse', () => {
    const core = new InputCore();
    core.setPlayers(4);
    for (const k of ['KeyW', 'ArrowDown', 'KeyJ', 'Numpad6']) core.keyDown(k);
    const out = core.step(4);
    expect(out.map((x) => [x.mx, x.mz])).toEqual([[0, -1], [0, 1], [-1, 0], [1, 0]]);
  });

  it('ninguna tecla está en dos esquemas ni coincide con las globales (Esc, Retroceso, M)', () => {
    const all = KEY_SCHEMES.flatMap((k) => [...k.up, ...k.down, ...k.left, ...k.right, ...k.grab, ...k.fix, ...k.ccw, ...k.cw]);
    expect(new Set(all).size).toBe(all.length);
    for (const g of ['Escape', 'Backspace', 'KeyM']) expect(all).not.toContain(g);
    expect(KEY_SCHEMES).toHaveLength(4);
  });

  it('reparto de mandos por Gamepad.index: el teclado lleva a los primeros jugadores y los mandos, a los últimos', () => {
    const asObj = (m: Map<number, number>) => Object.fromEntries(m);
    expect(asObj(planPads(4, [0, 1]))).toEqual({ 0: 2, 1: 3 }); // J1 y J2 con teclado; J3 y J4 con mando
    expect(asObj(planPads(4, [1, 0, 3, 2]))).toEqual({ 0: 0, 1: 1, 2: 2, 3: 3 }); // por índice, no por orden de la lista
    expect(asObj(planPads(2, [0, 1]))).toEqual({ 0: 0, 1: 1 });
    expect(asObj(planPads(2, [0]))).toEqual({ 0: 1 }); // J1 con WASD, J2 con el mando
    expect(asObj(planPads(1, [0, 1]))).toEqual({ 0: 0 }); // el mando 2 no lleva a nadie
    expect(asObj(planPads(4, [3, 1]))).toEqual({ 1: 2, 3: 3 }); // huecos en los índices (mandos 0 y 2 desconectados)
  });

  it('con 2 en teclado y 2 con mando, los cuatro tienen control y cada mando mueve y agarra solo a su jugador', () => {
    const core = new InputCore();
    core.pollPads([pad(0), pad(1)]);
    core.setPlayers(4);
    expect([0, 1].map((i) => core.playerOfPad(i))).toEqual([2, 3]);
    core.pollPads([pad(0, [PAD.a]), pad(1, [], [0, -1])]);
    core.keyDown('KeyD');
    core.keyDown('ArrowLeft');
    const out = core.step(4);
    expect(out.map((x) => [x.mx, +x.mz.toFixed(3)])).toEqual([[1, 0], [-1, 0], [0, 0], [0, -1]]);
    expect(out.map((x) => x.grab)).toEqual([false, false, true, false]);
  });

  it('la asignación es estable: si un mando se desconecta, los demás no cambian de jugador; al volver recupera el suyo', () => {
    const core = new InputCore();
    core.pollPads([pad(0), pad(1)]);
    core.setPlayers(4);
    // Se va el mando 0 (J3): el mando 1 sigue siendo de J4 (antes, por su posición en la lista, pasaba a ser de otro)
    let ev = core.pollPads([pad(1)]);
    expect(ev).toEqual([{ pad: 0, player: 2, action: 'disconnect' }]);
    expect(core.playerOfPad(1)).toBe(3);
    expect(core.padOfPlayer(2)).toBe(null);
    // Vuelve con el mismo índice: otra vez J3
    ev = core.pollPads([pad(0), pad(1)]);
    expect(ev).toEqual([{ pad: 0, player: 2, action: 'connect' }]);
    // Se va otra vez y aparece un mando nuevo (índice 2): es para quien se quedó sin mando (J3)
    core.pollPads([pad(1)]);
    core.pollPads([pad(1), pad(2)]);
    expect(core.playerOfPad(2)).toBe(2);
    // Si ahora vuelve el 0, su jugador está ocupado: va al último jugador sin mando (J2); nadie más cambia
    core.pollPads([pad(0), pad(1), pad(2)]);
    expect([0, 1, 2].map((i) => core.playerOfPad(i))).toEqual([1, 3, 2]);
    // Mientras dura la partida no cambia nada más, se lea las veces que se lea
    for (let f = 0; f < 50; f++) core.pollPads([pad(0), pad(1), pad(2)]);
    expect([0, 1, 2].map((i) => core.playerOfPad(i))).toEqual([1, 3, 2]);
  });

  it('un mando recién detectado no cuenta el botón con el que se despierta; luego A, Start, X, B y la cruceta manejan el menú', () => {
    const core = new InputCore();
    const acts = (e: PadEvent[]) => e.map((x) => x.action);
    // El navegador descubre el mando cuando se pulsa un botón: esa pulsación no empieza la partida ni agarra
    expect(acts(core.pollPads([pad(0, [PAD.a])]))).toEqual(['connect']);
    expect(acts(core.pollPads([pad(0, [PAD.a])]))).toEqual([]);
    expect(core.step(1)[0].grab).toBe(false);
    expect(acts(core.pollPads([pad(0)]))).toEqual([]);
    expect(acts(core.pollPads([pad(0, [PAD.a])]))).toEqual(['confirm']);
    expect(acts(core.pollPads([pad(0, [PAD.start])]))).toEqual(['start']);
    expect(acts(core.pollPads([pad(0, [PAD.x])]))).toEqual(['alt']);
    expect(acts(core.pollPads([pad(0, [PAD.b])]))).toEqual(['back']);
    expect(acts(core.pollPads([pad(0, [PAD.right])]))).toEqual(['right']);
    expect(acts(core.pollPads([pad(0, [PAD.down])]))).toEqual(['down']);
    // El stick también sirve, una vez por inclinación
    expect(acts(core.pollPads([pad(0, [], [-0.9, 0])]))).toEqual(['left']);
    expect(acts(core.pollPads([pad(0, [], [-0.9, 0])]))).toEqual([]);
    expect(acts(core.pollPads([pad(0, [], [0, -0.9])]))).toEqual(['up']);
    // Un mando que no lleva a nadie también maneja el menú y la pausa
    core.setPlayers(1);
    core.pollPads([pad(0), pad(1)]);
    core.setPlayers(1);
    core.clearPresses(); // el A de antes (confirmar) quedó guardado para J1
    expect(core.playerOfPad(1)).toBe(null);
    expect(acts(core.pollPads([pad(0), pad(1, [PAD.a])]))).toEqual(['confirm']);
    expect(core.step(1)[0].grab).toBe(false); // pero no hace agarrar a nadie
  });

  it('stick: zona muerta radial reescalada; sumado al teclado, el movimiento nunca pasa de 1', () => {
    expect(stickXY(0.19, 0)).toEqual([0, 0]);
    expect(stickXY(1, 0)).toEqual([1, 0]);
    expect(stickXY(0.6, 0)[0]).toBeCloseTo(0.5, 6);
    // Diagonal a fondo: 1; los mandos que en las esquinas pasan de 1 se recortan a 1, sin cambiar la dirección
    expect(Math.hypot(...stickXY(Math.SQRT1_2, Math.SQRT1_2))).toBeCloseTo(1, 6);
    const [x, y] = stickXY(1, 1);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    expect(x).toBeCloseTo(y, 9);
    const core = new InputCore();
    core.pollPads([pad(0)]);
    core.setPlayers(1);
    core.pollPads([pad(0, [PAD.right], [1, 0])]);
    core.keyDown('KeyD');
    const out = core.step(1)[0];
    expect(Math.hypot(out.mx, out.mz)).toBeCloseTo(1, 6);
  });

  it('ayuda y avisos según el dispositivo de cada jugador (teclado o mando)', () => {
    expect(playerControls(2, null, false).line).toBe('IJKL · agarrar U · enderezar O');
    expect(playerControls(3, null, true).line).toBe('Num 8 4 5 6 · agarrar Num 0 · enderezar Num + · giro Num 7/9');
    expect(playerControls(1, 0, false).grab).toBe('A');
    // Juego simulado con 4 humanos, nadie agarra: el aviso dice cómo agarra cada uno
    const carriers = [0, 1, 2, 3].map((h) => ({ human: h, holding: false, stunned: 0 }));
    const game = { carriers } as unknown as Game;
    const controls = [playerControls(0, null, false), playerControls(1, null, false), playerControls(2, 0, false), playerControls(3, 1, false)];
    expect(controlHints(game, controls).grab).toBe('Acercaos al sofá y agarradlo: J1 con ESPACIO, J2 con INTRO, J3 con A, J4 con A');
    expect(controlHints(game).grab).toBe('Acercaos al sofá y agarradlo: J1 con ESPACIO, J2 con INTRO, J3 con U, J4 con NUM 0');
    expect(controlHints(game).fix).toBe('¡Volcado! Enderezadlo: J1 con R, J2 con -, J3 con O, J4 con NUM +');
    carriers[0].holding = true;
    expect(heavyAloneHint(game, controls)).toBe('Pesa mucho: falta alguien en el otro extremo (J2 con INTRO, J3 con A, J4 con A)');
  });
});

describe('Entradas: sin tecla de alzar (T-input-3)', () => {
  it('las entradas no tienen «lift»; ni Mayús ni B ni los gatillos hacen nada; Q/E solo piden giro', () => {
    const core = new InputCore();
    core.pollPads([pad(0)]);
    core.setPlayers(2);
    for (const k of ['ShiftLeft', 'ShiftRight']) core.keyDown(k);
    core.pollPads([pad(0, [PAD.b, 6, 7])]);
    const out = core.step(2);
    expect(Object.keys(out[0]).sort()).toEqual(Object.keys(NO_INPUT).sort());
    expect(out).toEqual([NO_INPUT, NO_INPUT]);
    expect(KEY_SCHEMES.flatMap((k) => Object.values(k).flat())).not.toContain('ShiftLeft');
    // Q/E (y sus equivalentes) solo cambian `turn`
    const q = new InputCore();
    q.setPlayers(1);
    q.keyDown('KeyQ');
    expect(q.step(1)[0]).toEqual({ ...NO_INPUT, turn: 1 });
    q.keyUp('KeyQ'); q.keyDown('KeyE');
    expect(q.step(1)[0]).toEqual({ ...NO_INPUT, turn: -1 });
  });

  it('ni el código ni la ayuda hablan de alzar con una tecla', () => {
    expect(typesSrc).not.toMatch(/\blift\b/);
    const files = { 'input.ts': inputSrc, 'inputCore.ts': inputCoreSrc, 'hud.ts': hudSrc, 'main.ts': mainSrc, 'index.html': indexHtml };
    for (const [name, src] of Object.entries(files)) {
      expect(src.length, name).toBeGreaterThan(500);
      expect(src, name).not.toMatch(/Mayús|Shift(Left|Right)|\blift\b|Alzar \(mantener\)/);
    }
  });
});
