// Fotos reales en modo captura: el piloto automático juega y se fotografía en instantes concretos.
const { chromium } = require('playwright');
const out = process.argv[2] || 'shots/stills';
const carriers = process.argv[3] || '4';
(async () => {
  const fs = require('fs'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`http://localhost:4173/?capture=1&carriers=${carriers}`);
  await p.waitForFunction(() => window.__mudanza && window.__mudanza.game);
  await p.evaluate(() => window.__mudanza.start(true, false));
  // [segundo de juego, zoom, nombre]
  const plan = [[4.2, 0.5, 'cerca-patio'], [6, 1, 'patio'], [10.5, 1, 'calle'], [15.2, 1, 'puerta'], [15.6, 0.5, 'cerca-puerta'], [21, 1, 'escalera'], [25, 1, 'rellano'], [31, 1, 'rampa'], [33, 0.5, 'cerca-rampa'], [37, 1, 'entrega'], [40, 1, 'resultado']];
  for (const [t, zoom, name] of plan) {
    const now = await p.evaluate(() => window.__mudanza.simTime);
    const frames = Math.max(1, Math.round((t - now) * 30));
    await p.evaluate(([n, z]) => { window.__mudanza.setZoom(z === 1 ? null : z); window.__mudanza.advance(n, 30); }, [frames, zoom]);
    await p.evaluate(() => window.__mudanza.advance(1, 30));
    await p.screenshot({ path: `${out}/${name}.png` });
    console.log(name, JSON.stringify(await p.evaluate(() => { const g = window.__mudanza.game; return { t: +g.time.toFixed(1), fase: g.phase, etapa: g.stageLabel }; })));
  }
  console.log('errores', errors.length, errors.slice(0, 3));
  await b.close();
})();
