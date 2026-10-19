// Núcleo de las entradas sin DOM: teclas de los 4 jugadores, mandos asignados por Gamepad.index, pulsaciones
// guardadas hasta que un paso de física las consume y paso fijo. `input.ts` solo lo conecta al navegador; las
// pruebas (tests/input.test.ts) lo manejan con eventos y mandos simulados.
import type { PlayerInput } from '../sim/types';

/** Jugadores humanos como máximo. */
export const MAX_PLAYERS = 4;

/** Botones de la distribución estándar de la Gamepad API. */
export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

/** Zona muerta radial del stick. Se reescala: justo al salir de ella el movimiento empieza en 0, no en 0,2. */
export const STICK_DEADZONE = 0.2;
/** Inclinación del stick que cuenta como una dirección en el menú. */
const STICK_MENU = 0.6;

/** Teclas de un jugador (`KeyboardEvent.code`: posición física, igual en el teclado español que en el inglés). */
export interface KeyScheme {
  up: string[]; down: string[]; left: string[]; right: string[];
  /** Agarrar o soltar (pulsación). */
  grab: string[];
  /** Enderezar el sofá volcado (pulsación). */
  fix: string[];
  /** Opcional: pedir a los ayudantes que giren (antihorario y horario, mantener). */
  ccw: string[]; cw: string[];
  /** Nombres para la ayuda en pantalla. */
  label: { move: string; grab: string; fix: string; turn: string };
}

/**
 * Teclado compartido por hasta 4 jugadores. No hay tecla de alzar: al agarrar, la mano sube sola.
 * Ninguna tecla está en dos esquemas ni coincide con las globales (Esc, Retroceso, M).
 */
export const KEY_SCHEMES: readonly KeyScheme[] = [
  {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], grab: ['Space'], fix: ['KeyR'], ccw: ['KeyQ'], cw: ['KeyE'],
    label: { move: 'WASD', grab: 'Espacio', fix: 'R', turn: 'Q/E' },
  },
  {
    // Sin Intro del teclado numérico: lo tiene a mano J4 y le haría agarrar a J2
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], grab: ['Enter'], fix: ['Slash'], ccw: ['Comma'], cw: ['Period'],
    label: { move: 'flechas', grab: 'Intro', fix: '-', turn: ', .' },
  },
  {
    // Como WASD, pero con la mano derecha: U agarra, O endereza, H y Ñ (Semicolon) piden giro
    up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], grab: ['KeyU'], fix: ['KeyO'], ccw: ['KeyH'], cw: ['Semicolon'],
    label: { move: 'IJKL', grab: 'U', fix: 'O', turn: 'H/Ñ' },
  },
  {
    // Teclado numérico (el código es el de la tecla física, con Bloq Num activado o no)
    up: ['Numpad8'], down: ['Numpad5'], left: ['Numpad4'], right: ['Numpad6'], grab: ['Numpad0'], fix: ['NumpadAdd'], ccw: ['Numpad7'], cw: ['Numpad9'],
    label: { move: 'Num 8 4 5 6', grab: 'Num 0', fix: 'Num +', turn: 'Num 7/9' },
  },
];

/** Todas las teclas de juego (para anular su acción del navegador: desplazar, buscar con «/»…). */
const GAME_KEYS = new Set(KEY_SCHEMES.flatMap((k) => [...k.up, ...k.down, ...k.left, ...k.right, ...k.grab, ...k.fix, ...k.ccw, ...k.cw]));

/** Lo que hace falta de un mando: la forma de `Gamepad` del navegador, para poder probarlo sin DOM. */
export interface PadSnapshot {
  readonly index: number;
  readonly connected: boolean;
  readonly mapping?: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean }[];
}

/**
 * Lo que un mando pide al juego en este fotograma (flancos), sea cual sea la pantalla:
 * Start, A (confirmar), B (atrás), X (alternativa), direcciones del menú, y si se conecta o desconecta.
 */
export type PadAction = 'start' | 'confirm' | 'back' | 'alt' | 'up' | 'down' | 'left' | 'right' | 'connect' | 'disconnect';
export interface PadEvent { pad: number; player: number | null; action: PadAction }

interface PadState {
  /** Botones en la última lectura: los flancos de la siguiente se calculan contra ella (en todos los mandos). */
  buttons: boolean[];
  axes: number[];
  /** Dirección digital (cruceta o stick inclinado) para el menú. */
  dir: { x: number; y: number };
  player: number | null;
  standard: boolean;
}

/**
 * Reparto de mandos al empezar una partida de `players` jugadores: el teclado se queda con los primeros
 * jugadores y los mandos, por orden de `Gamepad.index`, con los últimos. Con 4 jugadores y 2 mandos:
 * J1 y J2 en el teclado, J3 y J4 con mando. Con 2 jugadores y 2 mandos, cada uno el suyo.
 * Los mandos que sobran no llevan a nadie (pero sí pausan y manejan el menú).
 */
export function planPads(players: number, padIndices: readonly number[]): Map<number, number> {
  const sorted = [...new Set(padIndices)].sort((a, b) => a - b);
  const m = Math.min(sorted.length, players);
  const plan = new Map<number, number>();
  for (let k = 0; k < m; k++) plan.set(sorted[k], players - m + k);
  return plan;
}

/** Stick con zona muerta radial reescalada (0 dentro de la zona, 1 al fondo). */
export function stickXY(ax: number, ay: number): [number, number] {
  const m = Math.hypot(ax, ay);
  if (m <= STICK_DEADZONE) return [0, 0];
  const k = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
  return [ax * k, ay * k];
}

function digitalDir(b: boolean[], axes: number[]) {
  const ax = axes[0] ?? 0, ay = axes[1] ?? 0;
  const x = b[PAD.right] || ax > STICK_MENU ? 1 : b[PAD.left] || ax < -STICK_MENU ? -1 : 0;
  const y = b[PAD.down] || ay > STICK_MENU ? 1 : b[PAD.up] || ay < -STICK_MENU ? -1 : 0;
  return { x, y };
}

/**
 * Estado de las entradas de todos los jugadores.
 * - Teclado: `keyDown`/`keyUp` con el `code` de cada evento.
 * - Mandos: `pollPads` una vez por fotograma con todos los mandos; actualiza el estado previo de todos, así un
 *   Start (o un A) cuenta una sola vez sea de quien sea el mando.
 * - Pulsaciones (agarrar, enderezar): se guardan por jugador hasta que `step` las entrega a un paso de física.
 *   Si un fotograma no ejecuta ningún paso (pantallas de más de 60 Hz), siguen ahí para el siguiente.
 */
export class InputCore {
  /** Teclas mantenidas ahora mismo. */
  private down = new Set<string>();
  /** Pulsaciones de cada jugador que todavía no ha usado ningún paso de física. */
  private latched = Array.from({ length: MAX_PLAYERS }, () => ({ grab: false, right: false }));
  /** Mandos conectados, por `Gamepad.index`. */
  private pads = new Map<number, PadState>();
  /** Jugador que llevaba cada mando desconectado en esta partida (para devolvérselo, o dárselo a otro mando nuevo). */
  private lost = new Map<number, number>();
  private players = 1;

  /** Número de jugadores de la partida: reparte de nuevo los mandos conectados (`planPads`). */
  setPlayers(n: number) {
    this.players = Math.max(1, Math.min(MAX_PLAYERS, Math.round(n)));
    const plan = planPads(this.players, [...this.pads.keys()]);
    for (const [i, st] of this.pads) st.player = plan.get(i) ?? null;
    this.lost.clear();
  }

  /** `Gamepad.index` de los mandos conectados, en orden. */
  connectedPads(): number[] { return [...this.pads.keys()].sort((a, b) => a - b); }
  /** Si algún mando conectado no tiene la distribución estándar (sus botones pueden no coincidir). */
  hasNonStandardPad(): boolean { return [...this.pads.values()].some((s) => !s.standard); }
  /** Jugador que lleva el mando con ese `Gamepad.index` (null si ninguno). */
  playerOfPad(index: number): number | null { return this.pads.get(index)?.player ?? null; }
  /** `Gamepad.index` del mando de un jugador (null si va solo con teclado). */
  padOfPlayer(player: number): number | null {
    for (const [i, st] of this.pads) if (st.player === player) return i;
    return null;
  }

  /** Tecla pulsada. Devuelve si es una tecla de juego (para anular su acción del navegador). */
  keyDown(code: string, repeat = false): boolean {
    if (!repeat && !this.down.has(code)) {
      KEY_SCHEMES.forEach((k, i) => {
        if (k.grab.includes(code)) this.latched[i].grab = true;
        if (k.fix.includes(code)) this.latched[i].right = true;
      });
    }
    this.down.add(code);
    return GAME_KEYS.has(code);
  }

  keyUp(code: string) { this.down.delete(code); }

  /** La ventana pierde el foco: no llegarán los `keyup`, así que se sueltan todas las teclas. */
  blur() { this.down.clear(); }

  /**
   * Lee todos los mandos (una vez por fotograma, haya o no pasos de física). Guarda las pulsaciones de A y Y para
   * su jugador y devuelve las acciones de menú y pausa. Un mando recién visto no cuenta flancos en esa lectura: el
   * botón con el que el navegador lo descubre no empieza la partida ni agarra.
   */
  pollPads(list: readonly (PadSnapshot | null | undefined)[]): PadEvent[] {
    const events: PadEvent[] = [];
    const now = new Map<number, PadSnapshot>();
    for (const p of list) if (p && p.connected) now.set(p.index, p);
    // Primero los que se han ido: su jugador queda libre para el próximo mando
    for (const [i, st] of this.pads) {
      if (now.has(i)) continue;
      this.pads.delete(i);
      if (st.player !== null) this.lost.set(i, st.player);
      events.push({ pad: i, player: st.player, action: 'disconnect' });
    }
    for (const [i, p] of now) {
      const buttons = p.buttons.map((b) => !!b?.pressed);
      const axes = [...p.axes];
      const dir = digitalDir(buttons, axes);
      const st = this.pads.get(i);
      if (!st) {
        const player = this.freePlayerFor(i);
        this.pads.set(i, { buttons, axes, dir, player, standard: p.mapping === 'standard' });
        this.lost.delete(i);
        events.push({ pad: i, player, action: 'connect' });
        continue;
      }
      const edge = (j: number) => !!buttons[j] && !st.buttons[j];
      const push = (action: PadAction) => events.push({ pad: i, player: st.player, action });
      if (st.player !== null) {
        if (edge(PAD.a)) this.latched[st.player].grab = true;
        if (edge(PAD.y)) this.latched[st.player].right = true;
      }
      if (edge(PAD.start)) push('start');
      if (edge(PAD.a)) push('confirm');
      if (edge(PAD.b)) push('back');
      if (edge(PAD.x)) push('alt');
      if (dir.y < 0 && st.dir.y >= 0) push('up');
      if (dir.y > 0 && st.dir.y <= 0) push('down');
      if (dir.x < 0 && st.dir.x >= 0) push('left');
      if (dir.x > 0 && st.dir.x <= 0) push('right');
      st.buttons = buttons;
      st.axes = axes;
      st.dir = dir;
      st.standard = p.mapping === 'standard';
    }
    return events;
  }

  /**
   * Jugador para un mando que aparece a media partida, sin mover a nadie de su mando:
   * el que llevaba ese mismo mando, si sigue libre; si no, alguien que se haya quedado sin el suyo;
   * si no, el último jugador sin mando (como en `planPads`, los mandos se quedan con los últimos).
   */
  private freePlayerFor(index: number): number | null {
    const used = new Set<number>();
    for (const st of this.pads.values()) if (st.player !== null) used.add(st.player);
    const free = (p: number) => p < this.players && !used.has(p);
    const own = this.lost.get(index);
    if (own !== undefined && free(own)) return own;
    for (const p of this.lost.values()) if (free(p)) return p;
    for (let p = this.players - 1; p >= 0; p--) if (free(p)) return p;
    return null;
  }

  /** Entradas de los `n` primeros jugadores para el próximo paso, sin consumir las pulsaciones. */
  peek(n: number): PlayerInput[] {
    const out: PlayerInput[] = [];
    for (let i = 0; i < n; i++) {
      let mx = 0, mz = 0, turn: -1 | 0 | 1 = 0;
      const k = KEY_SCHEMES[i];
      if (k) {
        mx += (this.any(k.right) ? 1 : 0) - (this.any(k.left) ? 1 : 0);
        mz += (this.any(k.down) ? 1 : 0) - (this.any(k.up) ? 1 : 0);
        if (this.any(k.ccw)) turn = 1;
        if (this.any(k.cw)) turn = -1;
      }
      for (const st of this.pads.values()) {
        if (st.player !== i) continue;
        const [sx, sz] = stickXY(st.axes[0] ?? 0, st.axes[1] ?? 0);
        const b = (j: number) => !!st.buttons[j];
        mx += sx + (b(PAD.right) ? 1 : 0) - (b(PAD.left) ? 1 : 0);
        mz += sz + (b(PAD.down) ? 1 : 0) - (b(PAD.up) ? 1 : 0);
        if (b(PAD.lb)) turn = 1;
        if (b(PAD.rb)) turn = -1;
      }
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      const l = this.latched[i] ?? { grab: false, right: false };
      out.push({ mx, mz, grab: l.grab, turn, right: l.right });
    }
    return out;
  }

  /** Entradas para un paso de física. Consume las pulsaciones: el paso siguiente ya no las ve. */
  step(n: number): PlayerInput[] {
    const out = this.peek(n);
    this.clearPresses();
    return out;
  }

  /** Olvida las pulsaciones pendientes (al empezar una partida y al entrar o salir de la pausa). */
  clearPresses() {
    for (const l of this.latched) { l.grab = false; l.right = false; }
  }

  private any(codes: string[]) { return codes.some((c) => this.down.has(c)); }
}

/**
 * Paso fijo de la física: acumula el tiempo real de cada fotograma y dice cuántos pasos tocan (puede ser 0 a más
 * de 60 Hz). Con más de `maxSteps` pendientes se descarta el resto, para no entrar en espiral tras un parón.
 */
export class FixedStep {
  private acc = 0;
  constructor(readonly dt = 1 / 60, readonly maxSteps = 5) {}

  frame(dtReal: number): number {
    this.acc += dtReal;
    let n = 0;
    while (this.acc >= this.dt && n < this.maxSteps) { this.acc -= this.dt; n++; }
    if (n === this.maxSteps) this.acc = 0;
    return n;
  }

  reset() { this.acc = 0; }
}

/** Cómo se maneja un jugador, para el panel de la partida y los avisos. */
export interface PlayerControls {
  /** Línea de ayuda del panel inferior. */
  line: string;
  grab: string;
  fix: string;
  turn: string;
}

/**
 * Controles de un jugador según su dispositivo. Con mando se nombran sus botones (el teclado sigue valiendo).
 * El giro solo se menciona si hay ayudantes: es opcional y sirve para pedirles que giren.
 */
export function playerControls(player: number, pad: number | null, helpers: boolean): PlayerControls {
  const k = KEY_SCHEMES[player];
  if (pad !== null) {
    const kb = k ? ` · o ${k.label.move} y ${k.label.grab}` : '';
    return { line: `Mando ${pad + 1} · agarrar A · enderezar Y${helpers ? ' · giro LB/RB' : ''}${kb}`, grab: 'A', fix: 'Y', turn: 'LB/RB' };
  }
  if (!k) return { line: 'Sin mando', grab: 'A', fix: 'Y', turn: 'LB/RB' };
  const l = k.label;
  return { line: `${l.move} · agarrar ${l.grab} · enderezar ${l.fix}${helpers ? ` · giro ${l.turn}` : ''}`, grab: l.grab, fix: l.fix, turn: l.turn };
}
