import type { PlayerInput } from '../sim/types';

/** Esquemas de teclado. J1 y J2 comparten teclado; J1–J4 pueden usar mandos. */
const KEYS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], grab: ['Space'], lift: ['ShiftLeft'], ccw: ['KeyQ'], cw: ['KeyE'], fix: ['KeyR'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], grab: ['Enter', 'NumpadEnter'], lift: ['ShiftRight'], ccw: ['Comma'], cw: ['Period'], fix: ['Slash'] },
];

export class InputManager {
  private down = new Set<string>();
  private pressedOnce = new Set<string>();
  private prevPad: boolean[][] = [];
  private prevEdge: { grab: boolean; fix: boolean }[] = [];
  /** Teclas globales pulsadas en este fotograma (reinicio, pausa). */
  onGlobal: ((code: string) => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.pressedOnce.add(e.code);
      this.down.add(e.code);
      if (!e.repeat) this.onGlobal?.(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: string[]) { return codes.some((c) => this.down.has(c)); }
  private once(codes: string[]) { return codes.some((c) => this.pressedOnce.has(c)); }

  pads(): Gamepad[] {
    return (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
  }

  /** Lee el mando de n jugadores. Las pulsaciones (agarrar, enderezar) son flancos. */
  read(n: number): PlayerInput[] {
    const pads = this.pads();
    const out: PlayerInput[] = [];
    for (let i = 0; i < n; i++) {
      let mx = 0, mz = 0, grab = false, lift = false, turn: -1 | 0 | 1 = 0, fix = false;
      const k = KEYS[i];
      if (k) {
        mx += (this.any(k.right) ? 1 : 0) - (this.any(k.left) ? 1 : 0);
        mz += (this.any(k.down) ? 1 : 0) - (this.any(k.up) ? 1 : 0);
        grab ||= this.once(k.grab);
        lift ||= this.any(k.lift);
        if (this.any(k.ccw)) turn = 1;
        if (this.any(k.cw)) turn = -1;
        fix ||= this.once(k.fix);
      }
      const pad = pads[i];
      if (pad) {
        const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
        if (Math.hypot(ax, ay) > 0.2) { mx += ax; mz += ay; }
        const b = (j: number) => !!pad.buttons[j]?.pressed;
        const prev = this.prevPad[i] ?? [];
        const edge = (j: number) => b(j) && !prev[j];
        grab ||= edge(0);
        lift ||= b(1) || b(7) || b(6);
        if (b(4)) turn = 1;
        if (b(5)) turn = -1;
        fix ||= edge(3);
        // Cruceta
        mx += (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
        mz += (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
        this.prevPad[i] = pad.buttons.map((x) => x.pressed);
      }
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      out.push({ mx, mz, grab, lift, turn, right: fix });
      this.prevEdge[i] = { grab, fix };
    }
    this.pressedOnce.clear();
    return out;
  }

  /** Botón Start/Opciones de cualquier mando (flanco). */
  padStart(): boolean {
    let hit = false;
    this.pads().forEach((p, i) => {
      const prev = this.prevPad[i] ?? [];
      if (p.buttons[9]?.pressed && !prev[9]) hit = true;
    });
    return hit;
  }
}
