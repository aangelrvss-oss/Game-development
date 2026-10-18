import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES, type GameOptions } from './sim/game';
import { Autopilot } from './sim/autopilot';
import type { BotStyle } from './sim/bots';
import type { GameEvent, PlayerInput } from './sim/types';
import { WorldView } from './view/world';
import { InputManager } from './input/input';
import { Sfx } from './audio/sfx';
import { Hud } from './ui/hud';

const DT = 1 / 60;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const opts: GameOptions & { auto: boolean } = {
  humans: clampInt(params.get('humans'), 1, 4, 1),
  carriers: clampInt(params.get('carriers'), 2, 6, 4),
  botStyle: (params.get('style') === 'despistados' ? 'despistados' : 'atentos') as BotStyle,
  auto: params.get('auto') === '1',
};

function clampInt(v: string | null, lo: number, hi: number, def: number) {
  const n = v === null ? def : parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
}

await RAPIER.init();
const view = new WorldView($('c') as HTMLCanvasElement);
const input = new InputManager();
const sfx = new Sfx();
const hud = new Hud();

let game: Game | null = null;
let autopilot: Autopilot | null = null;
let paused = false;
let screen: 'menu' | 'play' | 'results' = 'menu';
let acc = 0;
let last = performance.now();
let simTime = 0;
const fpsSamples: number[] = [];
const toastCooldown = new Map<string, number>();

// --- Menú ---
function seg(id: string, values: (number | string)[], get: () => number | string, set: (v: number | string) => void, label = (v: number | string) => String(v)) {
  const el = $(id);
  const draw = () => {
    el.innerHTML = '';
    for (const v of values) {
      const b = document.createElement('button');
      b.textContent = label(v);
      b.className = get() === v ? 'on' : '';
      if (id === 'opt-carriers' && typeof v === 'number' && v < opts.humans) b.disabled = true;
      b.onclick = () => { set(v); drawAll(); };
      el.appendChild(b);
    }
  };
  return draw;
}
const draws = [
  seg('opt-humans', [1, 2, 3, 4], () => opts.humans, (v) => { opts.humans = v as number; if (opts.carriers < opts.humans) opts.carriers = opts.humans; }),
  seg('opt-carriers', [2, 3, 4, 5, 6], () => opts.carriers, (v) => (opts.carriers = v as number)),
  seg('opt-style', ['atentos', 'despistados'], () => opts.botStyle, (v) => (opts.botStyle = v as BotStyle), (v) => (v === 'atentos' ? 'Atentos' : 'Despistados')),
];
function drawAll() { draws.forEach((d) => d()); }
drawAll();
setInterval(() => {
  const n = input.pads().length;
  $('pads-note').textContent = n ? `Mandos detectados: ${n}. El mando 1 es de J1, el 2 de J2…` : 'Conecta mandos y pulsa un botón para que el navegador los detecte (J3 y J4 solo con mando).';
}, 1000);

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
  if (screen === 'menu' && code === 'Enter') start(false);
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
}

function start(auto: boolean) {
  sfx.unlock();
  game?.dispose();
  const humans = auto ? 1 : opts.humans;
  game = new Game(RAPIER, { humans, carriers: Math.max(opts.carriers, humans), botStyle: opts.botStyle, seed: Math.floor(Math.random() * 1e9) });
  autopilot = auto ? new Autopilot(0) : null;
  view.attach(game);
  hud.setup(game, auto ? ['Piloto automático'] : ['WASD · Espacio · Mayús · Q/E', 'Flechas · Intro · Mayús dcha.', 'Mando 3', 'Mando 4']);
  hud.show(true);
  show('menu', false); show('results', false); show('pause', false);
  screen = 'play';
  paused = false;
  acc = 0;
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
    case 'grab': if (who(e.carrier).human !== null) sfx.grab(); break;
    case 'release': if (who(e.carrier).human !== null) sfx.release(); break;
    case 'gripBreak':
      sfx.slip();
      if (cooled(`slip${e.carrier}`, 2)) view.fx.text(e.pos, '¡Se escapa!', '#fde68a', 36);
      break;
    case 'impact':
      sfx.impact(e.strength);
      view.fx.dust(e.pos, 5 + Math.min(8, Math.round(e.strength)), 0.8);
      view.fx.shake = Math.min(0.8, view.fx.shake + e.strength * 0.05);
      if (e.damage > 0) view.fx.text(e.pos, `-${e.damage}%`, '#fca5a5', 42);
      break;
    case 'carHit':
      sfx.crash();
      view.fx.stars(e.pos, 8);
      view.fx.shake = Math.min(1, view.fx.shake + 0.6);
      if (e.target === 'sofa') { view.fx.text(e.pos, '¡CATAPUM!', '#ffffff', 54); hud.toast(`¡Atropello al sofá! −${RULES.carDamage}%`, 'bad'); }
      else if (cooled(`run${e.carrier}`, 1.5)) hud.toast(`¡Han atropellado a ${who(e.carrier!).cast.name}!`, 'bad');
      break;
    case 'stun': sfx.stun(); view.fx.stars(e.pos, 5); break;
    case 'honk':
      if (cooled(`honk${e.car}`, 1.5)) { sfx.honk(); view.fx.text({ ...e.pos, y: e.pos.y + 0.8 }, '¡PIIII!', '#fef08a', 40); }
      break;
    case 'light': {
      const s = g.sofaPos;
      if (e.ped === 'green' && s.z < 7 && s.z > -12) { hud.toast('Semáforo en verde: ¡cruzad!', 'good'); sfx.beep(true); }
      break;
    }
    case 'stage': sfx.checkpoint(); if (e.index > 0) hud.toast(`¡${e.label}!`, 'good'); break;
    case 'righted': sfx.hop(); view.fx.dust(e.pos, 8, 1); hud.toast(`Sofá enderezado (−${RULES.rightCost}%)`); break;
    case 'respawnSofa': hud.toast(`El sofá vuelve al último punto (−${RULES.respawnCost}% y +5 s)`, 'bad'); break;
    case 'win': sfx.win(); setTimeout(() => results(g), 900); break;
    case 'lose': sfx.lose(); setTimeout(() => results(g), 900); break;
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
}

// --- Bucle ---
function frame(now: number) {
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsSamples.push(dtReal);
  if (fpsSamples.length > 120) fpsSamples.shift();
  if (game && screen !== 'menu') {
    if (input.padStart()) { if (screen === 'play') setPaused(!paused); else if (screen === 'results') start(!!autopilot); }
    const g = game;
    if (!paused) {
      const humans = g.carriers.filter((c) => c.human !== null).length;
      let inputs: PlayerInput[] = input.read(Math.max(1, humans));
      acc += dtReal;
      let steps = 0;
      while (acc >= DT && steps < 5) {
        if (autopilot) inputs = [autopilot.input(g, DT)];
        g.step(DT, inputs);
        simTime += DT;
        for (const e of g.out) handle(e, g);
        // Los flancos (agarrar, enderezar) solo cuentan en el primer paso del fotograma
        inputs = inputs.map((i) => ({ ...i, grab: false, right: false }));
        acc -= DT;
        steps++;
      }
      if (steps === 5) acc = 0;
      if (g.light.ped === 'green' && cooled('pedtick', 0.5) && g.sofaPos.z < 7 && g.sofaPos.z > -12) sfx.pedTick();
    } else {
      input.read(1);
    }
    hud.update(g);
    view.render(g, now / 1000, paused ? 0 : dtReal);
  } else {
    input.read(1);
    // De fondo en el menú: la escena quieta
    if (!game) { game = new Game(RAPIER, { humans: 0, carriers: opts.carriers, botStyle: 'atentos' }); view.attach(game); }
    view.render(game, now / 1000, dtReal);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (opts.auto) start(true);

// Ganchos para las pruebas automáticas en navegador
(window as unknown as { __mudanza: unknown }).__mudanza = {
  get game() { return game; },
  get screen() { return screen; },
  start,
  fps: () => fpsSamples.length / fpsSamples.reduce((a, b) => a + b, 0),
};
