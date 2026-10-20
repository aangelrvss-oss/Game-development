// Revisor A+G+C+E (ciclo 1, segunda ronda): utilidades comunes de los scripts de navegador.
// Chromium en /opt/pw-browsers/chromium con SwiftShader; la demo servida por `vite preview` en :4176.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = '/tmp/claude-0/review-c1b/agce';
const URL0 = process.env.URL || 'http://localhost:4176/';

async function launch() {
  return chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/** Página en modo captura con N humanos y M porteadores (ayudantes = M − N), partida empezada y cuenta atrás pasada. */
async function page(b, { humans = 2, carriers = humans, style = null, query = '', vw = 1280, vh = 720, skip = 100 } = {}) {
  const p = await b.newPage({ viewport: { width: vw, height: vh } });
  p.setDefaultTimeout(600000);
  p.__errors = [];
  p.on('pageerror', (e) => p.__errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.__errors.push(m.text()); });
  await p.goto(`${URL0}?capture=1${query}`);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.click(`#opt-humans button:nth-child(${humans})`);
  const cbtn = await p.$$('#opt-carriers button');
  for (const bt of cbtn) if ((await bt.textContent()).trim() === String(carriers)) await bt.click();
  if (style) {
    const sb = await p.$$('#opt-style button');
    for (const bt of sb) if ((await bt.textContent()).trim().toLowerCase().startsWith(style)) await bt.click();
  }
  await p.evaluate(() => window.__mudanza.start(false));
  if (skip) await p.evaluate((n) => window.__mudanza.advance(n, 30), skip);
  return p;
}

const NOI = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
/** Avanza n fotogramas (a 30 fps) con un guion que devuelve las entradas de los humanos. */
const adv = (p, n, script = 'return window.__mudanza.autoInputs(g)') => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, script]);
const shot = (p, name, clip) => p.screenshot({ path: path.join(OUT, name), ...(clip ? { clip } : {}) });

/** Cámara cercana a un porteador (ángulo a respecto a hacia dónde mira), renderiza y deja la cámara como estaba. */
async function closeShot(p, name, i, { a = 0.6, d = 2.6, h = 1.2, ty = 0.2 } = {}) {
  await p.evaluate(([i, a, d, h, ty]) => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[i], cam = v.camera;
    window.__camSave = { p: cam.position.clone(), q: cam.quaternion.clone() };
    const k = c.collider.translation(), f = c.facing, yaw = Math.atan2(f.x, f.z) + a;
    cam.position.set(k.x + Math.sin(yaw) * d, k.y + h, k.z + Math.cos(yaw) * d);
    cam.lookAt(k.x, k.y + ty, k.z); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  }, [i, a, d, h, ty]);
  await shot(p, name);
  await p.evaluate(() => { const cam = window.__mudanza.view.camera; cam.position.copy(window.__camSave.p); cam.quaternion.copy(window.__camSave.q); cam.updateMatrixWorld(); });
}

/** Rectángulo de pantalla alrededor de un porteador (proyectado con la cámara de juego) para recortar capturas. */
async function screenBox(p, i, half = 130) {
  return p.evaluate(([i, half]) => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[i];
    const P = v.camera.position.constructor;
    const k = c.collider.translation();
    const q = new P(k.x, k.y + 0.4, k.z).project(v.camera);
    const W = innerWidth, H = innerHeight;
    const x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H;
    const x0 = Math.max(0, Math.min(W - 2 * half, x - half)), y0 = Math.max(0, Math.min(H - 2 * half, y - half));
    return { x: x0, y: y0, width: 2 * half, height: 2 * half };
  }, [i, half]);
}

const hud = (p) => p.evaluate(() => {
  const vis = (id) => { const e = document.getElementById(id); return e && e.style.display !== 'none' && getComputedStyle(e).display !== 'none' ? e.textContent.trim() : ''; };
  return { warn: vis('h-warn'), center: vis('h-center'), toasts: document.getElementById('h-toasts')?.textContent.trim() ?? '' };
});

function mkOut() { fs.mkdirSync(OUT, { recursive: true }); }

module.exports = { launch, page, adv, shot, closeShot, screenBox, hud, NOI, OUT, URL0, mkOut };
