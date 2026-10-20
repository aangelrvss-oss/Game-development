import { playerControls, type PlayerControls } from '../input/inputCore';
import { RULES, type Game } from '../sim/game';
import { STAGES } from '../sim/level';
import { PLAYER_COLORS } from '../view/carrierView';
import { carrierName } from '../view/doll/dollView';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function fmt(t: number) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Controles por defecto (solo teclado), para los avisos cuando no se ha dicho otra cosa. */
const KEYBOARD_ONLY: PlayerControls[] = [0, 1, 2, 3].map((p) => playerControls(p, null, false));

/** Tecla o botón de un jugador para los avisos («ESPACIO», «U», «A»…). */
const key = (s: string | undefined) => (s ?? 'A').toUpperCase();

/**
 * Aviso cuando uno solo arrastra algo que pesa demasiado para una persona: falta alguien en el otro extremo.
 * Si hay otros jugadores sin agarrar, dice con qué tecla o botón pueden echar una mano.
 */
export function heavyAloneHint(game: Game, controls: readonly PlayerControls[] = KEYBOARD_ONLY): string {
  const free = game.carriers.filter((c) => c.human !== null && !c.holding && c.stunned <= 0);
  const keys = free.map((c) => `J${c.human! + 1} con ${key(controls[c.human!]?.grab)}`);
  return `Pesa mucho: falta alguien en el otro extremo${keys.length ? ` (${keys.join(', ')})` : ''}`;
}

/** Avisos con los controles de cada jugador humano: cómo agarrar, enderezar y, si hay ayudantes, pedir giro. */
export function controlHints(game: Game, controls: readonly PlayerControls[] = KEYBOARD_ONLY) {
  const humans = game.carriers.filter((c) => c.human !== null).map((c) => c.human!);
  const list = (f: (c: PlayerControls | undefined) => string) => humans.map((h) => `J${h + 1} con ${f(controls[h])}`).join(', ');
  const one = humans.length <= 1 ? controls[humans[0] ?? 0] : undefined;
  const helpers = game.carriers.some((c) => c.human === null);
  return {
    grab: one ? `Acércate al sofá y pulsa ${key(one.grab)} para agarrarlo` : `Acercaos al sofá y agarradlo: ${list((c) => key(c?.grab))}`,
    fix: one ? `¡Volcado! Pulsa ${key(one.fix)} para enderezarlo` : `¡Volcado! Enderezadlo: ${list((c) => key(c?.fix ?? 'Y'))}`,
    // Girar es opcional: sirve para pedírselo a los ayudantes. Sin ellos, el sofá gira tirando hacia lados opuestos
    stuck: helpers
      ? `¿Atascados? Pedid un giro a los ayudantes (${humans.map((h) => controls[h]?.turn ?? 'LB/RB').join(' · ')}) o soltad un asa`
      : '¿Atascados? Tirad hacia lados opuestos para girar el sofá, o soltad un asa',
  };
}

/** Interfaz durante la partida: tiempo, etapas, estado del sofá, avisos y mensajes cortos. */
export class Hud {
  private root = $('hud');
  private time = $('h-time');
  private stages = $('h-stages');
  private bar = $('h-bar');
  private barTxt = $('h-bar-txt');
  private center = $('h-center');
  private warn = $('h-warn');
  private light = $('h-light');
  private players = $('h-players');
  private toastBox = $('h-toasts');
  private lastStage = -1;
  private toasts: { el: HTMLElement; until: number }[] = [];
  /** Controles de cada jugador humano (por índice de jugador), según su teclado o su mando. */
  private controls: PlayerControls[] = KEYBOARD_ONLY;
  /** Reloj de la partida: los mensajes duran tiempo de juego, no tiempo real (así también en las grabaciones). */
  constructor(private now: () => number) {}

  show(on: boolean) { this.root.style.display = on ? 'block' : 'none'; }

  setup(game: Game, controls: PlayerControls[]) {
    this.stages.innerHTML = STAGES.map((s, i) => `<span class="stage" data-i="${i}">${s.label}</span>`).join('<i>›</i>');
    this.setControls(game, controls);
    this.lastStage = -1;
    this.toastBox.innerHTML = '';
  }

  /** Panel de jugadores con los controles de cada uno (también cuando un mando se conecta o se va a media partida). */
  setControls(game: Game, controls: PlayerControls[]) {
    this.controls = controls;
    this.players.innerHTML = game.carriers
      .filter((c) => c.human !== null)
      .map((c) => `<div class="pl" style="--c:${PLAYER_COLORS[c.human!]}"><b>J${c.human! + 1}</b> ${carrierName(c)}<span id="pl-${c.id}"></span><small>${controls[c.human!]?.line ?? ''}</small></div>`)
      .join('');
  }

  toast(text: string, kind: 'bad' | 'good' | 'info' = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toastBox.prepend(el);
    this.toasts.push({ el, until: this.now() + 2.2 });
    while (this.toastBox.children.length > 4) this.toastBox.lastElementChild?.remove();
  }

  update(game: Game) {
    const t = this.now();
    this.toasts = this.toasts.filter((x) => (x.until > t ? true : (x.el.remove(), false)));
    const left = Math.max(0, RULES.timeLimit - game.time);
    this.time.textContent = fmt(game.time);
    this.time.classList.toggle('late', left < 30);
    if (game.stage !== this.lastStage) {
      this.lastStage = game.stage;
      this.stages.querySelectorAll<HTMLElement>('.stage').forEach((el, i) => {
        el.classList.toggle('done', i < game.stage);
        el.classList.toggle('now', i === game.stage);
      });
    }
    const integ = Math.round(game.integrity);
    this.bar.style.width = `${integ}%`;
    this.bar.style.background = integ > 60 ? '#22c55e' : integ > 30 ? '#f59e0b' : '#ef4444';
    this.barTxt.textContent = `${integ}%`;
    // Cuenta atrás
    if (game.phase === 'countdown') {
      this.center.textContent = String(Math.ceil(game.countdown));
      this.center.className = 'big';
    } else if (game.time < 1.2 && game.phase === 'playing') {
      this.center.textContent = '¡A mover!';
      this.center.className = 'big go';
    } else {
      this.center.textContent = '';
      this.center.className = '';
    }
    // Avisos de estado del sofá
    let w = '';
    if (game.phase === 'playing') {
      const hints = controlHints(game, this.controls);
      if (game.sofaUp < 0.55) w = hints.fix;
      else if (game.sofaUp < 0.8) w = '¡Que se vuelca!';
      else if (game.heavyAlone) w = heavyAloneHint(game, this.controls);
      else if (game.stuckTime > 1.5) w = hints.stuck;
      // (no mientras el jugador sigue mareado: todavía no puede agarrar)
      else if (!game.carriers.some((c) => c.human !== null && (c.holding || c.stunned > 0))) w = hints.grab;
    }
    this.warn.textContent = w;
    this.warn.style.display = w ? 'block' : 'none';
    // Semáforo de peatones cuando el sofá está cerca de la calle
    const s = game.sofaPos;
    const nearStreet = s.z < 7 && s.z > -12 && s.y < 1.5;
    const l = game.light;
    this.light.style.display = nearStreet ? 'flex' : 'none';
    this.light.className = l.ped === 'green' ? 'go' : 'stop';
    this.light.innerHTML = l.ped === 'green' ? `🚶 Verde · ${Math.ceil(l.left)} s` : `✋ Rojo · ${Math.ceil(l.left)} s`;
    for (const c of game.carriers) {
      if (c.human === null) continue;
      const el = document.getElementById(`pl-${c.id}`);
      if (el) el.textContent = c.stunned > 0 ? (c.knock === 'balance' ? ' · ¡al suelo!' : ' · ¡mareado!') : c.wobbling ? ' · ¡tambaleándose!' : c.holding ? ' · agarrando' : '';
    }
  }
}
