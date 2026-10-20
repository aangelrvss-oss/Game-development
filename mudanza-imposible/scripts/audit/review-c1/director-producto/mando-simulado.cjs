// Revisión ciclo 1 (rol A+G): flujo completo con un mando simulado (navigator.getGamepads sustituido), modo normal.
// Menú → partida → pausa → ¿reiniciar o ir al menú con el mando? → desconexión y reconexión.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/director-producto/mando-simulado.cjs [url]
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/review-c1/ag';
const url = process.argv[2] || 'http://localhost:4175/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    window.__pads = [];
    Object.defineProperty(Navigator.prototype, 'getGamepads', { value: function () { return window.__pads; }, configurable: true });
    window.__mkPad = (index) => ({ index, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) });
  });
  await p.goto(url);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  const scr = () => p.evaluate(() => ({ screen: window.__mudanza.screen, pause: document.getElementById('pause').style.display, phase: window.__mudanza.game?.phase, t: +(window.__mudanza.game?.time ?? 0).toFixed(2) }));
  /** Pulsa un botón del mando `i` durante unos fotogramas reales. */
  const press = async (i, btn, ms = 350) => {
    await p.evaluate(([i, btn]) => { window.__pads[i].buttons[btn].pressed = true; }, [i, btn]);
    await p.waitForTimeout(ms);
    await p.evaluate(([i, btn]) => { window.__pads[i].buttons[btn].pressed = false; }, [i, btn]);
    await p.waitForTimeout(ms);
  };
  // Conectar el mando con A ya pulsado (como al descubrirlo): no debe empezar
  await p.evaluate(() => { const pd = window.__mkPad(0); pd.buttons[0].pressed = true; window.__pads[0] = pd; });
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__pads[0].buttons[0].pressed = false; });
  await p.waitForTimeout(400);
  console.log('Mando conectado con A pulsado →', JSON.stringify(await scr()));
  console.log('Nota de mandos:', await p.textContent('#pads-note'));
  await press(0, 15); // cruceta derecha
  console.log('Cruceta → en el menú:', await p.evaluate(() => [...document.querySelectorAll('#opt-humans .on, #opt-carriers .on')].map((e) => e.textContent).join('/')));
  await press(0, 14); // izquierda, de vuelta a 2
  await press(0, 0); // A: empezar
  await p.waitForFunction(() => window.__mudanza.game?.phase === 'playing', null, { timeout: 60000 });
  console.log('A en el menú →', JSON.stringify(await scr()));
  const pl = await p.evaluate(() => [...document.querySelectorAll('#h-players .pl')].map((e) => e.textContent));
  console.log('Panel de jugadores:', JSON.stringify(pl));
  console.log('Aviso:', await p.textContent('#h-warn'));
  await p.screenshot({ path: `${OUT}/mando-partida.png` });
  // Start: pausa
  await press(0, 9);
  console.log('Start →', JSON.stringify(await scr()));
  // Con la pausa abierta, ¿hay botón del mando para «Reiniciar» o «Menú»? Probamos B, X, Y, Back, cruceta
  for (const [name, btn] of [['B', 1], ['X', 2], ['Y', 3], ['Back', 8], ['abajo', 13], ['derecha', 15]]) {
    await press(0, btn, 250);
    const s = await scr();
    console.log(`  en pausa, ${name} →`, JSON.stringify(s));
    if (s.pause !== 'flex' && s.screen === 'play') await press(0, 9, 250); // si la quitó, volver a pausar
  }
  await press(0, 9); // seguir
  console.log('Start otra vez →', JSON.stringify(await scr()));
  // Desconectar y reconectar a media partida
  await p.evaluate(() => { window.__pads = []; });
  await p.waitForTimeout(500);
  const toasts1 = await p.evaluate(() => [...document.querySelectorAll('#h-toasts .toast')].map((e) => e.textContent));
  const pl1 = await p.evaluate(() => [...document.querySelectorAll('#h-players .pl small')].map((e) => e.textContent));
  console.log('Desconectado → avisos:', JSON.stringify(toasts1), 'panel:', JSON.stringify(pl1));
  await p.evaluate(() => { window.__pads = [window.__mkPad(0)]; });
  await p.waitForTimeout(500);
  const toasts2 = await p.evaluate(() => [...document.querySelectorAll('#h-toasts .toast')].map((e) => e.textContent));
  console.log('Reconectado → avisos:', JSON.stringify(toasts2));
  console.log('Errores:', errors.length ? errors : 'ninguno');
  await b.close();
})();
