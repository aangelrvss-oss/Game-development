// Prueba de humo en navegador real (Chromium sin interfaz): carga, juega en modo demo, captura pantallas.
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4173/?auto=1&carriers=4';
const outDir = process.argv[3] || 'shots';
const maxSec = Number(process.argv[4] || 120);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await p.goto(url);
  await p.waitForFunction(() => window.__mudanza && window.__mudanza.game, null, { timeout: 30000 });
  const t0 = Date.now();
  let shot = 0, lastStage = -1, lastShotAt = 0;
  const log = [];
  while ((Date.now() - t0) / 1000 < maxSec) {
    await p.waitForTimeout(500);
    const s = await p.evaluate(() => { const m = window.__mudanza, g = m.game; const sp = g.sofaPos; return { screen: m.screen, phase: g.phase, t: g.time, stage: g.stage, label: g.stageLabel, integ: g.integrity, fps: m.fps(), sofa: [sp.x, sp.y, sp.z].map((v) => +v.toFixed(1)) }; });
    const el = (Date.now() - t0) / 1000;
    if (s.stage !== lastStage || el - lastShotAt > 12) {
      lastStage = s.stage; lastShotAt = el;
      await p.screenshot({ path: `${outDir}/s${String(shot++).padStart(2, '0')}-${s.label}.png` });
      log.push(s);
      console.log(JSON.stringify(s));
    }
    if (s.screen === 'results') { await p.waitForTimeout(600); await p.screenshot({ path: `${outDir}/s${String(shot++).padStart(2, '0')}-resultado.png` }); console.log('RESULT', JSON.stringify(s)); break; }
  }
  console.log('RENDER', JSON.stringify(await p.evaluate(() => window.__mudanza.renderInfo())));
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log('  ', e.slice(0, 300));
  await b.close();
})();
