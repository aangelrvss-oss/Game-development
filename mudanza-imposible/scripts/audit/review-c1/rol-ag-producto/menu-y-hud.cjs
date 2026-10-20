// Revisor A+G (ciclo 1): menú, teclas del menú y legibilidad del HUD a varias resoluciones.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-ag-producto/menu-y-hud.cjs http://localhost:4175/
// Capturas en /tmp/claude-0/review-c1/ag/
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://localhost:4175/';
const OUT = '/tmp/claude-0/review-c1/ag';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

(async () => {
  const b = await chromium.launch({ executablePath: undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [w, h, tag] of [[1280, 720, '720p'], [1920, 1080, '1080p'], [390, 844, 'movil']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(url);
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/menu-${tag}.png` });
    // ¿Cabe el menú sin desplazar?
    const fit = await p.evaluate(() => { const c = document.querySelector('#menu .card'); return { scrollH: c.scrollHeight, clientH: c.clientHeight }; });
    log(`[${tag}] tarjeta del menú: alto contenido ${fit.scrollH}px, visible ${fit.clientH}px ${fit.scrollH > fit.clientH + 2 ? '(HAY QUE DESPLAZAR)' : '(cabe)'}`);
    await p.close();
  }

  // Teclas del menú: X (la etiqueta dice «Ver demo automática (X)»)
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.keyboard.press('KeyX');
  await p.waitForTimeout(400);
  log('Tras pulsar X en el teclado, pantalla =', await p.evaluate(() => window.__mudanza.screen));
  // Navegar con flechas: abajo dos veces y derecha (estilo de ayudantes) cuando no hay ayudantes
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(200);
  const st = await p.evaluate(() => ({
    humans: document.querySelector('#opt-humans .on')?.textContent,
    carriers: document.querySelector('#opt-carriers .on')?.textContent,
    style: document.querySelector('#opt-style .on')?.textContent,
    focus: [...document.querySelectorAll('.row.focus label')].map((l) => l.textContent),
  }));
  log('Menú tras ↓↓↓ →:', JSON.stringify(st), '(con 2 humanos y 2 porteadores no hay ayudantes, pero la fila de estilo sigue activa)');
  await p.screenshot({ path: `${OUT}/menu-foco-estilo.png` });
  // Tamaño de letra de los textos del HUD (para streaming)
  const fonts = await p.evaluate(() => {
    const f = (id) => { const e = document.getElementById(id); const s = getComputedStyle(e); return s.fontSize; };
    return { warn: f('h-warn'), hint: f('h-hint'), players: getComputedStyle(document.querySelector('#h-players') || document.body).fontSize, stages: f('h-stages') };
  });
  log('Tamaños de letra HUD:', JSON.stringify(fonts));
  await b.close();
})();
