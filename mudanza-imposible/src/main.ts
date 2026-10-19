import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES, type GameOptions } from './sim/game';
import { Autopilot } from './sim/autopilot';
import type { BotStyle } from './sim/bots';
import type { GameEvent, PlayerInput } from './sim/types';
import { WorldView } from './view/world';
import { InputManager } from './input/input';
import { FixedStep, planPads, playerControls, type PadEvent } from './input/inputCore';
import { Sfx, renderTrack, type SfxName } from './audio/sfx';
import { NO_INPUT } from './sim/types';
import { Hud } from './ui/hud';
import { carrierName } from './view/doll/dollView';

const DT = 1 / 60;
/** Paso fijo de 1/60 s, como mucho 5 pasos por fotograma. */
const stepper = new FixedStep(DT, 5);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const opts: GameOptions & { auto: boolean } = {
  // Por defecto, dos jugadores en el mismo teclado y sin ayudantes (física cooperativa)
  humans: clampInt(params.get('humans'), 1, 4, 2),
  carriers: clampInt(params.get('carriers'), 2, 6, 2),
  botStyle: (params.get('style') === 'despistados' ? 'despistados' : 'atentos') as BotStyle,
  auto: params.get('auto') === '1',
};
/** Modo captura: la simulación solo avanza cuando lo pide el script de grabación (fotograma a fotograma). */
const capture = params.get('capture') === '1';
const soundLog: { t: number; name: SfxName; args: number[] }[] = [];

function clampInt(v: string | null, lo: number, hi: number, def: number) {
  const n = v === null ? def : parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
}

await RAPIER.init();
const view = new WorldView($('c') as HTMLCanvasElement);
const input = new InputManager();
const sfx = new Sfx();
sfx.onPlay = (name, args) => soundLog.push({ t: simTime, name, args });
const hud = new Hud(() => simTime);

let game: Game | null = null;
let autopilot: Autopilot | null = null;
let paused = false;
let screen: 'menu' | 'play' | 'results' = 'menu';
let last = performance.now();
let simTime = 0;
let pendingResults: { g: Game; at: number } | null = null;
/** Cuándo apareció la pantalla de resultados (reloj real): un A machacado al ganar no la salta. */
let resultsShownAt = 0;
const fpsSamples: number[] = [];
const toastCooldown = new Map<string, number>();
let testPilots: { game: Game | null; list: Autopilot[] } = { game: null, list: [] };

// --- Menú (ratón, teclado o mando: arriba/abajo elige la opción, izquierda/derecha la cambia) ---
type Opt = number | string;
interface MenuRow { id: string; values: Opt[]; get: () => Opt; set: (v: Opt) => void; label?: (v: Opt) => string; enabled?: (v: Opt) => boolean }
const rows: MenuRow[] = [
  { id: 'opt-humans', values: [1, 2, 3, 4], get: () => opts.humans, set: (v) => { opts.humans = v as number; if (opts.carriers < opts.humans) opts.carriers = opts.humans; } },
  { id: 'opt-carriers', values: [2, 3, 4, 5, 6], get: () => opts.carriers, set: (v) => (opts.carriers = v as number), enabled: (v) => (v as number) >= opts.humans },
  { id: 'opt-style', values: ['atentos', 'despistados'], get: () => opts.botStyle, set: (v) => (opts.botStyle = v as BotStyle), label: (v) => (v === 'atentos' ? 'Atentos' : 'Despistados') },
];
/** Opción elegida con el mando o las flechas (-1: aún no se ha usado; no se resalta ninguna). */
let menuFocus = -1;
function drawAll() {
  rows.forEach((r, i) => {
    const el = $(r.id);
    el.innerHTML = '';
    for (const v of r.values) {
      const b = document.createElement('button');
      b.textContent = r.label ? r.label(v) : String(v);
      b.className = r.get() === v ? 'on' : '';
      if (r.enabled && !r.enabled(v)) b.disabled = true;
      b.onclick = () => { r.set(v); drawAll(); };
      el.appendChild(b);
    }
    el.parentElement?.classList.toggle('focus', i === menuFocus);
  });
  drawPadsNote();
}
function menuNav(dx: number, dy: number) {
  if (dy) menuFocus = Math.max(0, Math.min(rows.length - 1, (menuFocus < 0 ? 0 : menuFocus) + dy));
  else if (dx) {
    if (menuFocus < 0) menuFocus = 0;
    const r = rows[menuFocus];
    const ok = r.values.filter((v) => !r.enabled || r.enabled(v));
    const at = ok.indexOf(r.get());
    const next = ok[Math.max(0, Math.min(ok.length - 1, at + dx))];
    if (next !== undefined) r.set(next);
  }
  drawAll();
}
/** Qué mando llevará a qué jugador con la opción elegida (el mismo reparto que hará `start`). */
function drawPadsNote() {
  const pads = input.connectedPads();
  if (!pads.length) {
    $('pads-note').textContent = 'Mandos: conéctalos y pulsa un botón para que el navegador los detecte. Con mando, A o Start empieza y la cruceta cambia las opciones.';
    return;
  }
  const plan = planPads(opts.humans, pads);
  const who = pads.map((i) => `mando ${i + 1} → ${plan.has(i) ? `J${plan.get(i)! + 1}` : 'sin jugador'}`).join(', ');
  $('pads-note').textContent = `Mandos: ${who}. Los demás jugadores van con el teclado. A o Start: empezar · cruceta: opciones · X: demo.`
    + (input.hasNonStandardPad() ? ' Algún mando no tiene la distribución estándar: sus botones pueden no coincidir.' : '');
}
drawAll();

$('btn-start').onclick = () => start(false);
$('btn-demo').onclick = () => start(true);
$('btn-again').onclick = () => start(!!autopilot);
$('btn-menu').onclick = () => toMenu();
$('btn-resume').onclick = () => setPaused(false);
$('btn-restart-p').onclick = () => start(!!autopilot);
$('btn-menu-p').onclick = () => toMenu();

input.onGlobal = (code) => {
  sfx.unlock();
  if (code === 'KeyM') { const m = sfx.toggleMute(); hud.toast(m ? 'Sonido apagado' : 'Sonido encendido'); }
  const arrow = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[code];
  if (screen === 'menu' && arrow) menuNav(arrow[0], arrow[1]);
  else if (screen === 'menu' && code === 'Enter') start(false);
  else if (screen === 'results' && (code === 'Enter' || code === 'KeyR')) start(!!autopilot);
  else if (screen === 'results' && code === 'Escape') toMenu();
  else if (screen === 'play' && code === 'Escape') setPaused(!paused);
  else if (screen === 'play' && code === 'Backspace') start(!!autopilot);
};

function show(id: string, on: boolean) { $(id).style.display = on ? 'flex' : 'none'; }

function toMenu() {
  screen = 'menu';
  paused = false;
  show('results', false); show('pause', false); show('menu', true);
  hud.show(false);
}

function setPaused(p: boolean) {
  if (screen !== 'play') return;
  paused = p;
  show('pause', p);
  // Lo pulsado durante la pausa (o justo antes) no se aplica al volver
  input.clearPresses();
  stepper.reset();
}

/** Acciones de los mandos, de cualquier mando y en cualquier pantalla (también los que no llevan a nadie). */
function padAction(e: PadEvent) {
  sfx.unlock();
  if (e.action === 'connect' || e.action === 'disconnect') {
    drawPadsNote();
    if (screen === 'play' && game) {
      hud.setControls(game, controlsOf(game));
      const who = e.player !== null ? `J${e.player + 1}` : 'sin jugador';
      hud.toast(e.action === 'connect' ? `Mando ${e.pad + 1} conectado: ${who}` : `Mando ${e.pad + 1} desconectado (${who})`, e.action === 'connect' ? 'good' : 'bad');
    }
    return;
  }
  if (screen === 'menu') {
    if (e.action === 'confirm' || e.action === 'start') start(false);
    else if (e.action === 'alt') start(true);
    else if (e.action === 'up' || e.action === 'down') menuNav(0, e.action === 'up' ? -1 : 1);
    else if (e.action === 'left' || e.action === 'right') menuNav(e.action === 'left' ? -1 : 1, 0);
  } else if (screen === 'results') {
    if (performance.now() - resultsShownAt < 800) return;
    if (e.action === 'confirm' || e.action === 'start') start(!!autopilot);
    else if (e.action === 'back') toMenu();
  } else if (screen === 'play') {
    if (e.action === 'start') setPaused(!paused);
    else if (paused && (e.action === 'confirm' || e.action === 'back')) setPaused(false);
  }
}

/** Controles de cada jugador humano según su dispositivo (teclado o mando asignado). */
function controlsOf(g: Game) {
  const helpers = g.carriers.some((c) => c.human === null);
  return [0, 1, 2, 3].map((p) => playerControls(p, input.padOfPlayer(p), helpers));
}

function start(auto: boolean, fromGesture = true) {
  if (fromGesture) sfx.unlock();
  game?.dispose();
  const humans = auto ? 1 : opts.humans;
  game = new Game(RAPIER, { humans, carriers: Math.max(opts.carriers, humans), botStyle: opts.botStyle, seed: Math.floor(Math.random() * 1e9) });
  autopilot = auto ? new Autopilot(0) : null;
  view.attach(game);
  // Mandos repartidos para este número de jugadores; lo pulsado en el menú (Intro, A…) no cuenta en la partida
  input.setPlayers(humans);
  input.clearPresses();
  const controls = controlsOf(game);
  hud.setup(game, auto ? [{ ...controls[0], line: 'Piloto automático' }] : controls);
  hud.show(true);
  show('menu', false); show('results', false); show('pause', false);
  screen = 'play';
  paused = false;
  stepper.reset();
  simTime = 0;
  if (auto) hud.toast('Demo: el jugador 1 lo lleva el piloto automático', 'info');
}

// --- Eventos de la simulación → sonido, efectos y mensajes ---
function cooled(key: string, s: number) {
  const t = toastCooldown.get(key) ?? -99;
  if (simTime - t < s) return false;
  toastCooldown.set(key, simTime);
  return true;
}

function handle(e: GameEvent, g: Game) {
  const who = (i: number) => g.carriers[i];
  switch (e.type) {
    case 'grab': if (who(e.carrier).human !== null) sfx.play('grab'); break;
    case 'release': if (who(e.carrier).human !== null) sfx.play('release'); break;
    case 'gripBreak':
      sfx.play('slip');
      view.carriers[e.carrier]?.stumble();
      if (cooled(`slip${e.carrier}`, 2)) view.fx.text(e.pos, '¡Se escapa!', '#1f1a2e', 34, '#fde68a');
      break;
    case 'impact':
      sfx.play('impact', e.strength);
      view.fx.dust(e.pos, 5 + Math.min(8, Math.round(e.strength)), 0.8);
      view.sofa.bump(e.strength);
      if (e.strength > 3) view.fx.ring(e.pos, '#fff7d6', Math.min(1.6, 0.6 + e.strength * 0.12));
      view.fx.shake = Math.min(0.8, view.fx.shake + e.strength * 0.05);
      // Tras un atropello, el «¡CATAPUM!» ya lo dice: el texto de daño pequeño se taparía con él
      if (e.damage > 0 && g.phase === 'playing' && simTime - (toastCooldown.get('carHit') ?? -99) > 0.8) view.fx.text(e.pos, `-${e.damage}%`, '#fca5a5', 42);
      break;
    case 'carHit':
      toastCooldown.set('carHit', simTime);
      sfx.play('crash');
      view.fx.stars(e.pos, 8);
      view.fx.ring(e.pos, '#fde047', 1.4);
      view.fx.dust(e.pos, 8, 1.2);
      if (e.target === 'sofa') view.sofa.bump(10);
      view.fx.shake = Math.min(1, view.fx.shake + 0.6);
      if (e.target === 'sofa') { view.fx.text(e.pos, '¡CATAPUM!', '#ffffff', 50, '#dc2626', 2.3); hud.toast(`¡Atropello al sofá! −${RULES.carDamage}%`, 'bad'); }
      else if (cooled(`run${e.carrier}`, 1.5)) hud.toast(`¡Han atropellado a ${who(e.carrier!).human !== null ? `J${who(e.carrier!).human! + 1}` : carrierName(who(e.carrier!))}!`, 'bad');
      break;
    case 'stun': sfx.play('stun'); view.fx.stars(e.pos, 5); break;
    case 'wobble':
      sfx.play('wobble');
      if (cooled(`wob${e.carrier}`, 1.5)) view.fx.text({ ...e.pos, y: e.pos.y + 0.9 }, '¡Uy, uy, uy!', '#1f1a2e', 32, '#fef3c7');
      break;
    case 'fall':
      sfx.play('fall');
      view.fx.dust({ ...e.pos, y: e.pos.y - 0.4 }, 9, 1);
      view.fx.ring({ ...e.pos, y: e.pos.y - 0.6 }, '#fff7d6', 1.1);
      view.fx.shake = Math.min(0.8, view.fx.shake + 0.35);
      view.fx.text({ ...e.pos, y: e.pos.y + 1.6 }, '¡PATAPLOF!', '#ffffff', 44, '#7c3aed', 1.8);
      break;
    case 'honk':
      if (cooled(`honk${e.car}`, 1.5)) { sfx.play('honk'); view.fx.text({ ...e.pos, y: e.pos.y + 0.8 }, '¡PIIII!', '#fef08a', 40); }
      break;
    case 'light': {
      const s = g.sofaPos;
      if (e.ped === 'green' && s.z < 7 && s.z > -12) { hud.toast('Semáforo en verde: ¡cruzad!', 'good'); sfx.play('beep', 1); }
      break;
    }
    case 'stage': sfx.play('checkpoint'); if (e.index > 0) hud.toast(`¡${e.label}!`, 'good'); break;
    case 'righted': sfx.play('hop'); view.fx.dust(e.pos, 8, 1); hud.toast(`Sofá enderezado (−${RULES.rightCost}%)`); break;
    case 'respawnSofa': hud.toast(`El sofá vuelve al último punto (−${RULES.respawnCost}% y +5 s)`, 'bad'); break;
    case 'win':
      sfx.play('win');
      view.fx.confetti(g.sofaPos, 70);
      view.fx.text(g.sofaPos, '¡ENTREGADO!', '#ffffff', 56, '#16a34a', 2.2);
      pendingResults = { g, at: simTime + 1.2 }; break;
    case 'lose': sfx.play('lose'); pendingResults = { g, at: simTime + 1.2 }; break;
  }
}

function results(g: Game) {
  if (screen !== 'play' || g !== game) return;
  screen = 'results';
  const won = g.phase === 'won';
  let best: number | null = null;
  if (won) {
    try {
      const prev = Number(localStorage.getItem('mudanza.best') ?? 'NaN');
      best = Number.isFinite(prev) ? Math.min(prev, g.time) : g.time;
      localStorage.setItem('mudanza.best', String(best));
    } catch { best = null; }
  }
  $('r-title').textContent = won ? '¡Sofá entregado!' : g.loseReason === 'broken' ? 'El sofá ha quedado destrozado' : 'El camión se ha ido sin el sofá';
  $('r-sub').textContent = won ? 'Lo habéis dejado en el camión. ¿Más rápido y más entero?' : g.loseReason === 'broken' ? 'Demasiados golpes. Probad a cruzar con el semáforo y a no dejarlo caer.' : `Límite: ${RULES.timeLimit / 60} minutos.`;
  const stars = won ? 1 + (g.time <= RULES.parTime ? 1 : 0) + (g.integrity >= 70 ? 1 : 0) : 0;
  $('r-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  const t = `${Math.floor(g.time / 60)}:${(g.time % 60).toFixed(1).padStart(4, '0')}`;
  $('r-grid').innerHTML = [
    ['Tiempo', t, `★ si ≤ ${RULES.parTime} s`],
    ['Estado del sofá', `${Math.round(g.integrity)}%`, '★ si ≥ 70 %'],
    ['Etapa alcanzada', g.stageLabel, ''],
    ...(best !== null ? [['Mejor tiempo', `${best.toFixed(1)} s`, 'en este navegador']] : []),
  ].map(([a, b, c]) => `<div><small>${a}</small>${b}<small>${c}</small></div>`).join('');
  show('results', true);
  resultsShownAt = performance.now();
}

// --- Bucle ---
function frame(now: number) {
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (capture && screen !== 'menu') { requestAnimationFrame(frame); return; }
  if (pendingResults && simTime >= pendingResults.at) { const r = pendingResults; pendingResults = null; results(r.g); }
  fpsSamples.push(dtReal);
  if (!capture) view.adapt(dtReal);
  if (fpsSamples.length > 120) fpsSamples.shift();
  // Todos los mandos, en cada fotograma y en cualquier pantalla: así el Start de cualquiera pausa una sola vez
  for (const e of input.poll()) padAction(e);
  if (game && screen !== 'menu') {
    const g = game;
    if (!paused) {
      const humans = g.carriers.filter((c) => c.human !== null).length;
      // Las pulsaciones (agarrar, enderezar) esperan en `input` hasta el primer paso que se ejecute: a más de
      // 60 Hz hay fotogramas sin ningún paso, y antes se perdían
      const steps = stepper.frame(dtReal);
      for (let i = 0; i < steps; i++) {
        let inputs: PlayerInput[] = input.step(Math.max(1, humans));
        if (autopilot) inputs = [autopilot.input(g, DT)];
        g.step(DT, inputs);
        simTime += DT;
        for (const e of g.out) handle(e, g);
      }
      if (g.light.ped === 'green' && cooled('pedtick', 0.5) && g.sofaPos.z < 7 && g.sofaPos.z > -12) sfx.play('pedTick');
    }
    hud.update(g);
    view.render(g, now / 1000, paused ? 0 : dtReal);
  } else {
    // De fondo en el menú: la escena quieta
    if (!game) { game = new Game(RAPIER, { humans: 0, carriers: opts.carriers, botStyle: 'atentos' }); view.attach(game); }
    view.render(game, now / 1000, dtReal);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (opts.auto) start(true, false);

// Ganchos para las pruebas automáticas en navegador
(window as unknown as { __mudanza: unknown }).__mudanza = {
  get game() { return game; },
  get screen() { return screen; },
  start,
  /** Grabación: avanza n fotogramas de 1/fps s de juego cada uno y dibuja el último. */
  advance(frames: number, fps = 30, script?: string) {
    const g = game;
    if (!g) return;
    const fn = script ? (new Function('g', script) as (g: Game) => PlayerInput[]) : null;
    for (let f = 0; f < frames; f++) {
      const humans = g.carriers.filter((c) => c.human !== null).length;
      const steps = Math.round(60 / fps);
      for (let i = 0; i < steps && screen === 'play'; i++) {
        // Con guion, sus pulsaciones cuentan en el primer paso del fotograma; con teclado, las consume el primer paso
        const inputs: PlayerInput[] = autopilot ? [autopilot.input(g, DT)]
          : fn ? (fn(g) ?? []).map((x) => (i > 0 ? { ...x, grab: false, right: false } : x))
          : input.step(Math.max(1, humans));
        g.step(DT, inputs.length ? inputs : [NO_INPUT]);
        simTime += DT;
        for (const e of g.out) handle(e, g);
      }
      if (pendingResults && simTime >= pendingResults.at) { const r = pendingResults; pendingResults = null; results(r.g); }
      if (g.light.ped === 'green' && cooled('pedtick', 0.5) && g.sofaPos.z < 7 && g.sofaPos.z > -12) sfx.play('pedTick');
      hud.update(g);
      view.render(g, simTime, 1 / fps);
    }
  },
  get simTime() { return simTime; },
  /**
   * Pruebas y grabación: el piloto automático lleva a todos los jugadores humanos (uno por jugador).
   * Uso: `advance(n, fps, 'return window.__mudanza.autoInputs(g)')`.
   */
  autoInputs(g: Game): PlayerInput[] {
    if (testPilots.game !== g) testPilots = { game: g, list: g.carriers.filter((c) => c.human !== null).map((c) => new Autopilot(c.id)) };
    return testPilots.list.map((a) => a.input(g, DT));
  },
  sound: (from: number, to: number) => renderTrack(soundLog.filter((e) => e.t >= from && e.t < to).map((e) => ({ ...e, t: e.t - from })), to - from),
  setZoom: (k: number | null) => view.setZoomOverride(k),
  fps: () => fpsSamples.length / fpsSamples.reduce((a, b) => a + b, 0),
  renderInfo: () => ({ ...view.renderer.info.render, triangles: view.renderer.info.render.triangles }),
  /** Solo para medir: acceso a la escena 3D. */
  view,
};
