import { playerControls, type PlayerControls } from '../input/inputCore';
import { inRegion } from '../levels/geometry';
import type { Game } from '../sim/game';
import type { ItemId, ItemState } from '../sim/items';
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

/** Estado de un objeto tal como lo dice la lista de la mudanza. */
export const STATE_LABEL: Record<ItemState, string> = { pending: 'pendiente', carried: 'en camino', loaded: 'cargado', broken: 'roto' };

/**
 * Lista de la mudanza: «Cargados N/M» (los obligatorios cargados de los obligatorios) y una fila por objeto con su
 * nombre, su estado y si es opcional. Sin DOM: la pinta `Hud` y la comprueban las pruebas.
 */
export function loadList(game: Game) {
  const rows = game.items.map((it) => ({
    id: it.def.id, name: it.def.name, state: it.state, label: STATE_LABEL[it.state], required: it.required, heavy: it.def.minCarriers,
  }));
  return { title: `Cargados ${game.loadedRequired}/${game.requiredCount}`, rows };
}

/** Siluetas de los objetos para la lista (24 × 24, del color del texto). */
const ICON: Record<ItemId, string> = {
  caja: '<path d="M3 7h18v13H3z"/><path d="M10 7h4v5h-4z" fill="#0004"/>',
  silla: '<path d="M6 2h3v10h9v3h-1v7h-3v-7H9v7H6z"/>',
  lampara: '<path d="M8 2h8l3 7H5zM11 9h2v11h-2zM7 20h10v2H7z"/>',
  mesa: '<path d="M2 7h20v3H2zM4 10h2.5v11H4zM17.5 10H20v11h-2.5z"/>',
  sofa: '<path d="M5 6h14v6H5zM2 9h4v10H2zM18 9h4v10h-4zM6 13h12v4H6z"/>',
  nevera: '<path d="M6 2h12v20H6z"/><path d="M8 5h1.5v4H8zM8 12h1.5v5H8z" fill="#0006"/>',
  piano: '<path d="M3 3h18v12H3zM3 16h18v4H3z"/><path d="M6 16h1v4H6zM10 16h1v4h-1zM14 16h1v4h-1zM18 16h1v4h-1z" fill="#0006"/>',
};
/** Pesa: el objeto necesita varias personas (el número va al lado). */
const WEIGHT = '<path d="M8 8a4 4 0 0 1 8 0h-2a2 2 0 0 0-4 0z M5 9h14l-1.5 12h-11z"/>';
const svg = (paths: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${paths}</svg>`;

/** Avisos con los controles de cada jugador humano: cómo agarrar, enderezar y, si hay ayudantes, pedir giro. */
export function controlHints(game: Game, controls: readonly PlayerControls[] = KEYBOARD_ONLY) {
  const humans = game.carriers.filter((c) => c.human !== null).map((c) => c.human!);
  const list = (f: (c: PlayerControls | undefined) => string) => humans.map((h) => `J${h + 1} con ${f(controls[h])}`).join(', ');
  const one = humans.length <= 1 ? controls[humans[0] ?? 0] : undefined;
  const helpers = game.carriers.some((c) => c.human === null);
  // Con varios objetos, «un mueble»; si no, el sofá de «La calle» (la partida de las pruebas de entradas no trae lista)
  const what = (game.items?.length ?? 0) > 1 ? 'a un mueble' : 'al sofá';
  return {
    grab: one ? `Acércate ${what} y pulsa ${key(one.grab)} para agarrarlo` : `Acercaos ${what} y agarradlo: ${list((c) => key(c?.grab))}`,
    fix: one ? `¡Volcado! Pulsa ${key(one.fix)} para enderezarlo` : `¡Volcado! Enderezadlo: ${list((c) => key(c?.fix ?? 'Y'))}`,
    // Girar es opcional: sirve para pedírselo a los ayudantes. Sin ellos, el sofá gira tirando hacia lados opuestos
    stuck: helpers
      ? `¿Atascados? Pedid un giro a los ayudantes (${humans.map((h) => controls[h]?.turn ?? 'LB/RB').join(' · ')}) o soltad un asa`
      : '¿Atascados? Tirad hacia lados opuestos para girar el sofá, o soltad un asa',
  };
}

/** Interfaz durante la partida: tiempo, etapas, estado de la carga, lista de la mudanza, avisos y mensajes cortos. */
export class Hud {
  private root = $('hud');
  private time = $('h-time');
  private stages = $('h-stages');
  private bar = $('h-bar');
  private barTxt = $('h-bar-txt');
  private barLbl = $('h-bar-lbl');
  private load = $('h-load');
  /** Lo último pintado en la lista de la mudanza (solo se vuelve a pintar si cambia). */
  private loadKey = '';
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
    const stages = game.level.stages;
    this.stages.innerHTML = stages.map((s, i) => `<span class="stage" data-i="${i}">${s.label}</span>`).join('<i>›</i>');
    // Con una sola etapa (el patio de pruebas) no hay recorrido que seguir: la lista de la mudanza dice lo que falta
    this.stages.style.display = stages.length > 1 ? '' : 'none';
    this.barLbl.textContent = game.items.length === 1 ? `Estado del ${game.sofaItem.def.name.toLowerCase()}` : 'Estado de la carga';
    this.setControls(game, controls);
    this.lastStage = -1;
    this.loadKey = '';
    this.toastBox.innerHTML = '';
  }

  /** Lista de la mudanza: «Cargados N/M» y cada objeto con su estado (los rotos, tachados y en rojo). */
  private drawLoad(game: Game) {
    const l = loadList(game);
    const key = l.title + l.rows.map((r) => r.state).join();
    if (key === this.loadKey) return;
    this.loadKey = key;
    this.load.innerHTML = `<div class="ttl">${l.title}</div>` + l.rows.map((r) =>
      `<div class="it ${r.state}">${svg(ICON[r.id])}<span class="nm">${r.name}${r.required ? '' : ' <small>(opcional)</small>'}</span>`
      + (r.heavy > 1 ? `<span class="hv" title="Hacen falta ${r.heavy}">${svg(WEIGHT)}${r.heavy}</span>` : '')
      + `<span class="st">${r.label}</span></div>`).join('');
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
    const left = Math.max(0, game.level.timeLimit - game.time);
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
    this.drawLoad(game);
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
    // Semáforo de peatones cuando el objeto principal está cerca de la calle (si el nivel la tiene)
    const traffic = game.level.traffic;
    const nearStreet = !!traffic && inRegion(traffic.near, game.sofaPos);
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
