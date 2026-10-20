// Revisión ciclo 1 (rol A+G): la pantalla de resultados se salta con Intro (agarrar de J2) o R (enderezar de J1)
// en cuanto aparece; con mando hay 800 ms de protección, con teclado no. Modo captura, piloto en J1 y J2.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/director-producto/resultados-salto.cjs [url]
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/review-c1/ag';
const base = new URL(process.argv[2] || 'http://localhost:4175/');
base.searchParams.set('capture', '1'); base.searchParams.set('humans', '2'); base.searchParams.set('carriers', '2');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  for (const key of ['Enter', 'KeyR']) {
    await p.goto(base.href);
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__mudanza.screen === 'play');
    await p.evaluate(() => window.__mudanza.advance(95, 30));
    for (let i = 0; i < 300; i++) {
      const s = await p.evaluate(() => { window.__mudanza.advance(10, 30, 'return window.__mudanza.autoInputs(g)'); return window.__mudanza.screen; });
      if (s === 'results') break;
    }
    const r0 = await p.evaluate(() => ({ screen: window.__mudanza.screen, title: document.getElementById('r-title').textContent, grid: document.getElementById('r-grid').textContent }));
    if (key === 'Enter') await p.screenshot({ path: `${OUT}/resultados.png` });
    const t0 = Date.now();
    await p.keyboard.press(key);
    await p.waitForTimeout(50);
    const r1 = await p.evaluate(() => ({ screen: window.__mudanza.screen, phase: window.__mudanza.game.phase, resultsVisible: document.getElementById('results').style.display }));
    console.log(`Resultados «${r0.title}» (${r0.grid}) → ${key} a los ${Date.now() - t0} ms → pantalla ${r1.screen}, fase ${r1.phase}, resultados ${r1.resultsVisible}`);
  }
  await b.close();
})();
