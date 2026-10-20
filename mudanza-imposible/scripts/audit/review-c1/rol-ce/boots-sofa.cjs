// Revisor C+E (ciclo 1): ¿se meten las botas dibujadas en el sofá? (las botas están bien colocadas respecto al cuerpo;
// la cápsula es redonda abajo y deja que el canto del sofá se acerque a los pies). Recorrido a dos con el piloto y
// empuje del lateral sin agarrar. Uso: node boots-sofa.cjs [url]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4176/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game; let worst = 0;
    for (const v of m.view.carriers) {
      if (!v.rig) continue;
      for (const bt of v.rig.boots) {
        bt.updateMatrixWorld(true);
        for (const [x, y, z] of [[-0.09, 0.02, -0.2], [0.09, 0.02, -0.2], [-0.09, 0.02, 0.11], [0.09, 0.02, 0.11], [0, 0.07, -0.21], [0, 0.12, 0.02]]) {
          const w = bt.localToWorld(bt.position.clone().set(x, y, z));
          for (const col of g.sofaColliders) { const pr = col.projectPoint(w, false); if (pr && pr.isInside) worst = Math.max(worst, Math.hypot(pr.point.x - w.x, pr.point.y - w.y, pr.point.z - w.z)); }
        }
      }
    }
    return worst;
  });
  const I = (o) => JSON.stringify({ mx: 0, mz: 0, grab: false, turn: 0, right: false, ...o });
  // Empuja el lateral sin agarrar (como sofa-contact-check, escenario 1)
  await p.evaluate(() => { const g = window.__mudanza.game; g.carriers[0].teleport({ x: 0.5, y: 0.7, z: g.sofaPos.z + 1.6 }); });
  let push = 0;
  for (let k = 0; k < 60; k++) { await p.evaluate((s) => window.__mudanza.advance(1, 30, s), `return [${I({ mz: -1, mx: -0.3 })}, ${I({})}]`); push = Math.max(push, await measure()); }
  console.log(`empujando el lateral: bota metida en el sofá como mucho ${(push * 100).toFixed(1)} cm`);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  let route = 0, n = 0, over3 = 0;
  for (let k = 0; k < 1600; k++) {
    const r = await p.evaluate(() => { const m = window.__mudanza; m.advance(1, 30, 'return window.__mudanza.autoInputs(g)'); return m.screen; });
    const d = await measure(); route = Math.max(route, d); n++; if (d > 0.03) over3++;
    if (r === 'results') break;
  }
  console.log(`recorrido a dos: bota metida en el sofá como mucho ${(route * 100).toFixed(1)} cm; fotogramas con >3 cm: ${over3}/${n}`);
  await b.close();
})();
