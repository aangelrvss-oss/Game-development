// Revisor A+G (ciclo 1): partida manejada con un mando simulado (Gamepad API sustituida en la página).
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-ag-producto/mando.cjs http://localhost:4175/
// Menú → A (primera pulsación, la que descubre el mando) → A → partida; panel y avisos; Start pausa; desde la pausa,
// ¿se puede ir al menú o reiniciar con el mando?
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4175/';
const OUT = '/tmp/claude-0/review-c1/ag';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.addInitScript(() => {
    const pad = { index: 0, id: 'simulado', connected: false, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad.connected ? pad : null];
  });
  await p.goto(url);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  const frames = async (n = 4) => { for (let i = 0; i < n; i++) await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); };
  /** Pulsa y suelta un botón dejando pasar fotogramas (el juego lee los mandos una vez por fotograma). */
  const press = async (btn) => {
    await p.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, btn); await frames(3);
    await p.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, btn); await frames(3);
  };
  const screen = () => p.evaluate(() => ({ screen: window.__mudanza.screen, paused: document.getElementById('pause').style.display === 'flex', menu: document.getElementById('menu').style.display }));
  // El jugador conecta el mando y pulsa A: el navegador lo descubre con esa pulsación
  await p.evaluate(() => { window.__pad.connected = true; window.__pad.buttons[0] = { pressed: true, value: 1 }; });
  await frames(3);
  await p.evaluate(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; });
  await frames(3);
  console.log('Tras la primera A (la que descubre el mando):', JSON.stringify(await screen()));
  console.log('Nota de mandos:', await p.evaluate(() => document.getElementById('pads-note').textContent));
  await press(0);
  console.log('Tras la segunda A:', JSON.stringify(await screen()));
  await p.waitForFunction(() => window.__mudanza.game?.phase === 'playing', null, { timeout: 60000 });
  await frames(4);
  const hud = await p.evaluate(() => ({ warn: document.getElementById('h-warn').textContent, players: [...document.querySelectorAll('#h-players .pl')].map((e) => e.textContent) }));
  console.log('HUD:', JSON.stringify(hud));
  await p.screenshot({ path: `${OUT}/mando-partida.png` });
  await press(9);
  console.log('Start en partida:', JSON.stringify(await screen()));
  await p.screenshot({ path: `${OUT}/mando-pausa.png` });
  // En la pausa: cruceta abajo/derecha y A (¿elige «Reiniciar» o «Menú»?), B
  await press(13); await press(15); await press(0);
  console.log('Pausa → cruceta abajo, derecha, A:', JSON.stringify(await screen()));
  await press(9);
  await press(1);
  console.log('Start de nuevo y B:', JSON.stringify(await screen()));
  await press(8);
  console.log('Back/Select en partida:', JSON.stringify(await screen()));
  await b.close();
})();
