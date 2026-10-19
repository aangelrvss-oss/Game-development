import { RULES, type Game } from '../sim/game';
import { STAGES } from '../sim/level';
import { PLAYER_COLORS } from '../view/carrierView';
import { carrierName } from '../view/doll/dollView';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function fmt(t: number) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
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
  /** Reloj de la partida: los mensajes duran tiempo de juego, no tiempo real (así también en las grabaciones). */
  constructor(private now: () => number) {}

  show(on: boolean) { this.root.style.display = on ? 'block' : 'none'; }

  setup(game: Game, keyboardHelp: string[]) {
    this.stages.innerHTML = STAGES.map((s, i) => `<span class="stage" data-i="${i}">${s.label}</span>`).join('<i>›</i>');
    this.players.innerHTML = game.carriers
      .filter((c) => c.human !== null)
      .map((c) => `<div class="pl" style="--c:${PLAYER_COLORS[c.human!]}"><b>J${c.human! + 1}</b> ${carrierName(c)}<span id="pl-${c.id}"></span><small>${keyboardHelp[c.human!] ?? 'Mando'}</small></div>`)
      .join('');
    this.lastStage = -1;
    this.toastBox.innerHTML = '';
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
      if (game.sofaUp < 0.55) w = '¡Volcado! Pulsa R (o Y en el mando) para enderezarlo';
      else if (game.sofaUp < 0.8) w = '¡Que se vuelca!';
      else if (game.coop && game.soloDrag > 1.2) w = '¡Uno solo apenas puede con él! Agarradlo los dos';
      else if (game.stuckTime > 1.5) w = '¿Atascados? Gira el sofá (Q/E) o soltad un asa';
      // (no mientras el jugador sigue mareado: todavía no puede agarrar)
      else if (!game.carriers.some((c) => c.human !== null && (c.holding || c.stunned > 0))) {
        w = game.carriers.filter((c) => c.human !== null).length > 1 ? 'Acercaos al sofá y agarradlo: J1 con ESPACIO, J2 con INTRO' : 'Acércate al sofá y pulsa ESPACIO para agarrarlo';
      }
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
