// Revisión independiente C1, rol F. T-input-1 en el juego de verdad (main.ts), no en la copia del bucle de la prueba:
// se falsea el reloj de requestAnimationFrame a 144 Hz (cada fotograma avanza 1/144 s), se pulsan Espacio, Intro y R
// entre fotogramas y se cuenta en Game.step cuántos pasos reciben cada pulsación. También Start de un mando simulado
// (navigator.getGamepads) mantenido varios fotogramas: debe pausar una sola vez.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-f-qa-b/presses-144hz.cjs http://localhost:4191/
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4191/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => {
    let fake = 1000;
    const orig = window.requestAnimationFrame.bind(window);
    window.__frames = 0;
    performance.now = () => fake;
    window.requestAnimationFrame = (cb) => orig(() => { fake += 1000 / 144; window.__frames++; cb(fake); });
    // Mando simulado: el índice 0, con los botones que diga window.__padButtons
    window.__padButtons = [];
    window.__padOn = false;
    navigator.getGamepads = () => (window.__padOn ? [{ index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, j) => ({ pressed: window.__padButtons.includes(j), value: 0 })) }] : []);
  });
  await p.goto(url + '?humans=2&carriers=2');
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.click('#btn-start');
  // A 144 Hz falsos y ~10 fotogramas reales por segundo, la cuenta atrás duraría casi un minuto: se acorta
  await p.waitForFunction(() => window.__mudanza.game && window.__mudanza.screen === 'play');
  await p.evaluate(() => { window.__mudanza.game.countdown = 0.05; });
  await p.waitForFunction(() => window.__mudanza.game.phase === 'playing', null, { timeout: 120000 });
  // Registro: por cada paso, si J1/J2 llevan grab o right
  await p.evaluate(() => {
    const g = window.__mudanza.game; window.__log = { steps: 0, grab0: 0, grab1: 0, right0: 0 };
    const orig = g.step.bind(g);
    g.step = (dt, inputs) => { const L = window.__log; L.steps++; if (inputs[0]?.grab) L.grab0++; if (inputs[1]?.grab) L.grab1++; if (inputs[0]?.right) L.right0++; orig(dt, inputs); };
  });
  const N = 40;
  const f0 = await p.evaluate(() => window.__frames);
  for (let k = 0; k < N; k++) {
    await p.keyboard.press('Space');
    await p.keyboard.press('Enter');
    await p.keyboard.press('KeyR');
    // Entre 0 y 2 fotogramas hasta la siguiente
    const target = (await p.evaluate(() => window.__frames)) + (k % 3);
    await p.waitForFunction((t) => window.__frames >= t, target);
  }
  await p.waitForFunction((t) => window.__frames >= t, (await p.evaluate(() => window.__frames)) + 3);
  const log = await p.evaluate(() => window.__log);
  const frames = (await p.evaluate(() => window.__frames)) - f0;
  console.log(`fotogramas ${frames}, pasos ${log.steps} (${(100 * (1 - log.steps / frames)).toFixed(0)} % de fotogramas sin paso a 144 Hz)`);
  console.log(`${N} pulsaciones de cada tecla → pasos con agarrar J1 ${log.grab0}, J2 ${log.grab1}, enderezar J1 ${log.right0}`);
  const okKeys = log.grab0 === N && log.grab1 === N && log.right0 === N;
  // Start de un mando mantenido 10 fotogramas: una sola pausa; otro Start: se quita
  await p.evaluate(() => { window.__padOn = true; });
  await p.waitForFunction((t) => window.__frames >= t, (await p.evaluate(() => window.__frames)) + 3);
  const pausedVisible = () => p.evaluate(() => document.getElementById('pause').style.display === 'flex');
  const holdStart = async (frames) => {
    await p.evaluate(() => { window.__padButtons = [9]; });
    await p.waitForFunction((t) => window.__frames >= t, (await p.evaluate(() => window.__frames)) + frames);
    await p.evaluate(() => { window.__padButtons = []; });
    await p.waitForFunction((t) => window.__frames >= t, (await p.evaluate(() => window.__frames)) + 3);
  };
  await holdStart(10);
  const afterFirst = await pausedVisible();
  await holdStart(10);
  const afterSecond = await pausedVisible();
  console.log(`Start mantenido 10 fotogramas: pausa ${afterFirst}; otra vez: pausa ${afterSecond}`);
  console.log(`errores de consola: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
  const ok = okKeys && afterFirst && !afterSecond && errors.length === 0;
  console.log(ok ? 'TODO OK' : 'FALLA');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
