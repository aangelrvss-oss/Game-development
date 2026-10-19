import { InputCore, type PadEvent } from './inputCore';

/**
 * Entradas del navegador: conecta el teclado (eventos de `window`) y la Gamepad API con `InputCore`, que guarda
 * la lógica sin DOM (teclas de J1–J4, mandos por `Gamepad.index`, pulsaciones retenidas hasta el paso de física).
 */
export class InputManager extends InputCore {
  /** Teclas globales pulsadas (reinicio, pausa, menú), en el momento del evento. */
  onGlobal: ((code: string) => void) | null = null;

  constructor() {
    super();
    window.addEventListener('keydown', (e) => {
      const game = this.keyDown(e.code, e.repeat);
      // Las teclas del juego no hacen su acción del navegador (desplazar la página, buscar con «/», pulsar el botón
      // con el foco), salvo los atajos con Ctrl, Alt o Cmd (recargar, etc.)
      if (game && !e.ctrlKey && !e.altKey && !e.metaKey) e.preventDefault();
      if (!e.repeat) this.onGlobal?.(e.code);
    });
    window.addEventListener('keyup', (e) => this.keyUp(e.code));
    window.addEventListener('blur', () => this.blur());
  }

  /** Lee todos los mandos (una vez por fotograma) y devuelve sus acciones de menú, pausa y conexión. */
  poll(): PadEvent[] {
    return this.pollPads(navigator.getGamepads?.() ?? []);
  }
}
