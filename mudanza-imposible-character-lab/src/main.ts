import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Lab, DT } from './sim/lab';
import { STATE_LABEL, NO_INPUT, type LabInput, type TestId } from './sim/types';
import { Stage } from './view/scene';
import { CharacterRig } from './view/characterRig';
import { SofaView } from './view/sofaView';

await RAPIER.init();

const params = new URLSearchParams(location.search);
/** Modo grabación: la simulación solo avanza con `__lab.advance` (fotograma a fotograma, a velocidad real). */
const capture = params.get('capture') === '1';
const $ = (id: string) => document.getElementById(id)!;

const lab = new Lab(RAPIER);
const stage = new Stage($('c') as HTMLCanvasElement);
const rig = new CharacterRig();
const sofa = new SofaView();
stage.scene.add(rig.group, sofa.group);

let paused = false, slow = false, acc = 0, last = performance.now(), simTime = 0;
const keys = new Set<string>();
let grabEdge = false;

function focus() {
  const c = lab.char.pos, s = lab.sofaPos;
  const d = Math.hypot(c.x - s.x, c.z - s.z);
  const k = d < 3.5 ? 0.3 : 0;
  // Un poco por delante cuando corre, para que la caída quede dentro del encuadre
  const v = lab.char.body.linvel(), lead = lab.char.upright ? 0.35 : 0.15;
  return new THREE.Vector3(c.x * (1 - k) + s.x * k + v.x * lead, Math.max(0, c.y - 0.65) * (1 - k) + 0.7, c.z * (1 - k) + s.z * k + v.z * lead);
}

function runTest(t: TestId) {
  lab.reset(t);
  rig.snap();
  document.querySelectorAll<HTMLButtonElement>('.tests button').forEach((b) => b.classList.toggle('on', b.dataset.test === t));
  stage.follow(focus(), 1, true);
  stage.setGameView(stage.gameView, t);
  updateHud();
}

function readKeys(): LabInput {
  let mx = 0, mz = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
  // Las teclas siguen la cámara: «arriba» es hacia donde mira
  const yaw = Math.atan2(stage.camera.position.x - stage.controls.target.x, stage.camera.position.z - stage.controls.target.z);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const inp = { mx: mx * cs + mz * sn, mz: -mx * sn + mz * cs, run: keys.has('ShiftLeft') || keys.has('ShiftRight'), grab: grabEdge };
  grabEdge = false;
  return inp;
}

function stepSim() {
  const manual = lab.test === 'libre' ? readKeys() : NO_INPUT;
  lab.step(manual);
  simTime += DT;
}

function updateHud() {
  const c = lab.char;
  $('now').textContent = STATE_LABEL[c.state];
  $('chip-state').textContent = STATE_LABEL[c.state];
  $('chip-test').textContent = lab.test === 'libre' ? 'Libre' : `Prueba ${lab.test}`;
  ($('chip') as HTMLElement).dataset.state = c.state;
  ($('state') as HTMLElement).style.background = { idle: '#231d2e', walking: '#2f5d8a', grabbing: '#6a4c93', pulling: '#9a3d8c', losingBalance: '#c46a12', falling: '#c0392b', recovering: '#2e7d4f' }[c.state];
  $('m-lean').textContent = `${Math.round(Math.hypot(c.lean.x, c.lean.z) * 57.3)}°`;
  $('m-force').textContent = `${Math.round(Math.hypot(c.force.x, c.force.z))} N`;
  $('m-effort').textContent = c.holding ? `${Math.round(c.effort * 100)} %` : '—';
  $('log').textContent = lab.log.slice(-4).map((l) => `${l.t.toFixed(1)} s · ${l.e}`).join('\n');
  ($('log') as HTMLElement).style.whiteSpace = 'pre-line';
}

function draw(dt: number) {
  sofa.sync(lab.sofa);
  rig.sync(lab, dt, stage.camera);
  stage.follow(focus(), dt);
  stage.render();
}

function frame(now: number) {
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
  if (capture) return;
  let simDt = 0;
  if (!paused) {
    acc += dtReal * (slow ? 0.25 : 1);
    let n = 0;
    while (acc >= DT && n < 6) { stepSim(); acc -= DT; simDt += DT; n++; }
    if (n === 6) acc = 0;
  }
  draw(simDt);
  updateHud();
}

// --- Interfaz ---
document.querySelectorAll<HTMLButtonElement>('.tests button').forEach((b) => b.addEventListener('click', () => runTest(b.dataset.test as TestId)));
$('restart').addEventListener('click', () => runTest(lab.test));
const toggle = (id: string, fn: (on: boolean) => void) => $(id).addEventListener('click', () => {
  const el = $(id), on = el.getAttribute('aria-pressed') !== 'true';
  el.setAttribute('aria-pressed', String(on));
  fn(on);
});
toggle('pause', (on) => { paused = on; });
toggle('slow', (on) => { slow = on; });
toggle('view', (on) => stage.setGameView(on, lab.test));
toggle('reactions', (on) => lab.setReactions(on));
toggle('sofaphys', (on) => lab.setSofaPhysics(on));
const slider = $('intensity') as HTMLInputElement;
slider.addEventListener('input', () => {
  // Valores seguros: de 0,5 a 1,5
  lab.setIntensity(Number(slider.value));
  $('intval').textContent = lab.intensity.toFixed(2).replace('.', ',');
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') { runTest(lab.test); return; }
  if (e.code === 'KeyP') { $('pause').click(); return; }
  if (e.code === 'KeyH') { $('panel').classList.toggle('hide'); return; }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) grabEdge = true; }
  const moving = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);
  if (moving) e.preventDefault();
  // Tocar el teclado durante una prueba guionizada pasa el control al usuario (sin reiniciar)
  if ((moving || e.code === 'Space') && lab.test !== 'libre') {
    lab.test = 'libre';
    lab.script = null;
    document.querySelectorAll<HTMLButtonElement>('.tests button').forEach((b) => b.classList.toggle('on', b.dataset.test === 'libre'));
  }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

runTest((['A', 'B', 'C', 'D', 'libre'].includes(params.get('test') ?? '') ? params.get('test') : 'A') as TestId);
requestAnimationFrame(frame);

// Ganchos para pruebas automáticas y grabación
(window as unknown as { __lab: unknown }).__lab = {
  lab,
  stage,
  run: (t: TestId) => runTest(t),
  /** Avanza `frames` fotogramas de 1/fps s de simulación, dibujando cada uno. */
  advance(frames: number, fps = 30) {
    for (let f = 0; f < frames; f++) {
      const steps = Math.round(60 / fps);
      for (let i = 0; i < steps; i++) stepSim();
      draw(steps * DT);
    }
    updateHud();
  },
  state: () => ({ test: lab.test, t: +lab.testTime.toFixed(3), state: lab.char.state, log: lab.log, pos: lab.char.pos, sofa: lab.sofaPos }),
  setView: (game: boolean) => stage.setGameView(game, lab.test),
  panel: (show: boolean) => $('panel').classList.toggle('hide', !show),
  get simTime() { return simTime; },
};
