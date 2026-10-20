// Revisor A+G+C+E (ciclo 1, segunda ronda): el menú que ve un jugador nuevo (1280×720): captura, altura del contenido
// frente a la ventana, y si la X del teclado lanza la demo que anuncia la etiqueta (menor de la primera ronda).
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/menu.cjs
const { launch, URL0, OUT, mkOut } = require('./comun.cjs');
const path = require('path');
(async () => {
  mkOut();
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(URL0);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.screenshot({ path: path.join(OUT, 'menu-720.png') });
  const m = await p.evaluate(() => { const c = document.querySelector('#menu .card'); return { scrollH: c.scrollHeight, clientH: c.clientHeight, win: innerHeight, demo: document.getElementById('btn-demo')?.textContent }; });
  console.log('Tarjeta del menú: contenido', m.scrollH, 'px, visible', m.clientH, 'px; ventana', m.win, '; botón demo «' + m.demo + '»');
  await p.keyboard.press('KeyX');
  await p.waitForTimeout(400);
  console.log('Tras pulsar X en el menú: pantalla', await p.evaluate(() => window.__mudanza.screen));
  await b.close();
})();
