// Revisión ciclo 1 (rol A+G): menú, etiquetas de teclas, reinicio, pausa, resultados. Modo normal (teclas reales).
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/director-producto/menu-y-teclas.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/tmp/claude-0/review-c1/ag';
fs.mkdirSync(OUT, { recursive: true });
const base = process.argv[2] || 'http://localhost:4175/';
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  for (const [w, h] of [[1280, 720], [1920, 1080], [1366, 768]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(base);
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    const fit = await p.evaluate(() => { const c = document.querySelector('#menu .card'); return { scrollH: c.scrollHeight, clientH: c.clientHeight }; });
    log(`menú ${w}x${h}: scrollHeight ${fit.scrollH} / visible ${fit.clientH} → ${fit.scrollH > fit.clientH + 2 ? 'HAY QUE DESPLAZAR' : 'cabe'}`);
    await p.screenshot({ path: `${OUT}/menu-${w}x${h}.png` });
    await p.close();
  }
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  const scr = () => p.evaluate(() => window.__mudanza.screen);
  // 1) La etiqueta dice «Ver demo automática (X)»: ¿la X del teclado la lanza?
  await p.keyboard.press('KeyX'); await p.waitForTimeout(400);
  log('Tecla X en el menú →', await scr(), '(etiqueta del botón:', await p.textContent('#btn-demo'), ')');
  // 2) J1 pulsa su botón (Espacio) para empezar
  await p.keyboard.press('Space'); await p.waitForTimeout(400);
  log('Espacio (agarrar de J1) en el menú →', await scr());
  // 3) Con 2 jugadores sin ayudantes, la fila «Ayudantes de la máquina» sigue activa
  const style = await p.evaluate(() => [...document.querySelectorAll('#opt-style button')].map((x) => `${x.textContent}${x.disabled ? '(desact.)' : ''}`));
  const sel = await p.evaluate(() => [...document.querySelectorAll('#opt-humans .on, #opt-carriers .on')].map((e) => e.textContent));
  log('Jugadores/porteadores:', sel.join('/'), '· fila de ayudantes:', style.join(', '));
  // 4) M en el menú: ¿hay respuesta visible?
  await p.keyboard.press('KeyM'); await p.waitForTimeout(300);
  const toastVisible = await p.evaluate(() => { const h = document.getElementById('hud'); return h.style.display !== 'none' && document.getElementById('h-toasts').children.length > 0; });
  log('M en el menú: aviso visible →', toastVisible);
  await p.keyboard.press('KeyM');
  // 5) Navegar con flechas a 4 jugadores
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
  log('Tras → →:', await p.evaluate(() => [...document.querySelectorAll('#opt-humans .on, #opt-carriers .on')].map((e) => e.textContent).join('/')));
  await p.screenshot({ path: `${OUT}/menu-foco-4j.png` });
  // 6) Empieza con Intro; panel de jugadores y aviso de agarre
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.game?.phase === 'playing', null, { timeout: 60000 });
  await p.waitForTimeout(300);
  const hud = await p.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, txt: e.textContent }; };
    return { warn: r('h-warn'), players: r('h-players'), hint: r('h-hint'), plFont: getComputedStyle(document.querySelector('.pl small')).fontSize };
  });
  log('Aviso con 4 jugadores:', JSON.stringify(hud.warn.txt), `(${Math.round(hud.warn.w)} px de ancho)`);
  log('Panel de jugadores:', JSON.stringify(hud.players.txt));
  log(`Panel jugadores: x ${Math.round(hud.players.x)}..${Math.round(hud.players.x + hud.players.w)}, y ${Math.round(hud.players.y)}; ayuda: x ${Math.round(hud.hint.x)}..${Math.round(hud.hint.x + hud.hint.w)}, y ${Math.round(hud.hint.y)}; solapan: ${hud.players.x + hud.players.w > hud.hint.x && hud.players.y + hud.players.h > hud.hint.y}`);
  log('Tamaño de letra de la línea de controles por jugador:', hud.plFont);
  await p.screenshot({ path: `${OUT}/juego-4j-inicio-1280.png` });
  // 7) Retroceso a media partida: reinicio inmediato, sin confirmación
  await p.waitForFunction(() => window.__mudanza.game.time > 1.0, null, { timeout: 60000 });
  const g0 = await p.evaluate(() => ({ t: window.__mudanza.game.time, id: window.__mudanza.game.clock }));
  await p.keyboard.press('Backspace'); await p.waitForTimeout(300);
  const g1 = await p.evaluate(() => ({ t: window.__mudanza.game.time, phase: window.__mudanza.game.phase }));
  log(`Retroceso a los ${g0.t.toFixed(2)} s de juego → tiempo ${g1.t.toFixed(2)} s, fase ${g1.phase} (reinicio sin confirmar)`);
  // 8) Pausa: ¿qué teclas hay para «Reiniciar» y «Menú»?
  await p.waitForFunction(() => window.__mudanza.game.phase === 'playing', null, { timeout: 60000 });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  log('Esc → pausa visible:', await p.evaluate(() => document.getElementById('pause').style.display));
  await p.screenshot({ path: `${OUT}/pausa.png` });
  for (const k of ['Enter', 'Space', 'KeyM']) {
    await p.keyboard.press(k); await p.waitForTimeout(250);
    log(`  en pausa, ${k} →`, await p.evaluate(() => ({ screen: window.__mudanza.screen, pausa: document.getElementById('pause').style.display })));
    if (k === 'KeyM') await p.keyboard.press('KeyM');
  }
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  log('Errores de página:', errors.length ? errors : 'ninguno');
  await b.close();
})();
