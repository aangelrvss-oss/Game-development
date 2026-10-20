// Revisión ciclo 1 (rol A+G): 4 jugadores a 1920×1080 (resolución de emisión), recorrido con el piloto de pruebas.
// Capturas en la calle, la escalera y la rampa, y tamaño de los textos de la interfaz.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/director-producto/stream-4j.cjs [url]
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/review-c1/ag';
const base = new URL(process.argv[2] || 'http://localhost:4175/');
base.searchParams.set('capture', '1'); base.searchParams.set('humans', '4'); base.searchParams.set('carriers', '4');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(base.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.screen === 'play');
  await p.evaluate(() => window.__mudanza.advance(95, 30));
  const fonts = await p.evaluate(() => Object.fromEntries(['#h-warn', '#h-time', '.pl', '.pl small', '#h-hint', '.stage', '.toast'].map((s) => { const e = document.querySelector(s); return [s, e ? getComputedStyle(e).fontSize : 'n/a']; })));
  console.log('Tamaños de letra a 1920×1080:', JSON.stringify(fonts));
  await p.screenshot({ timeout: 120000, path: `${OUT}/4j-720-inicio.png` });
  const shots = { Calle: 'calle', Escalera: 'escalera', Rampa: 'rampa' };
  let last = '';
  for (let i = 0; i < 200; i++) {
    const r = await p.evaluate(() => { window.__mudanza.advance(10, 30, 'return window.__mudanza.autoInputs(g)'); const g = window.__mudanza.game; return { st: g.stageLabel, t: g.time, ph: g.phase }; });
    if (r.st !== last) { last = r.st; if (shots[r.st]) { await p.evaluate(() => window.__mudanza.advance(15, 30, 'return window.__mudanza.autoInputs(g)')); await p.screenshot({ timeout: 120000, path: `${OUT}/4j-720-${shots[r.st]}.png` }); } }
    if (r.ph !== 'playing') { console.log('fin', r.ph, r.t.toFixed(1)); break; }
  }
  await b.close();
})();
