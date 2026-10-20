// Revisor C+E (ciclo 1): captura del fotograma en que la bota de J1 más se mete en el sofá al empujar el lateral.
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4176/';
const out = process.argv[3] || '/tmp/claude-0/review-c1/ce/boots';
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  const I = (o) => JSON.stringify({ mx: 0, mz: 0, grab: false, turn: 0, right: false, ...o });
  await p.evaluate(() => { const g = window.__mudanza.game; g.carriers[0].teleport({ x: 0.5, y: 0.7, z: g.sofaPos.z + 1.6 }); });
  let best = 0;
  for (let k = 0; k < 60; k++) {
    await p.evaluate((s) => window.__mudanza.advance(1, 30, s), `return [${I({ mz: -1, mx: -0.3 })}, ${I({})}]`);
    const d = await p.evaluate(() => {
      const m = window.__mudanza, g = m.game, v = m.view.carriers[0]; let worst = 0;
      for (const bt of v.rig.boots) { bt.updateMatrixWorld(true); for (const [x, y, z] of [[-0.09, 0.02, -0.2], [0.09, 0.02, -0.2], [0, 0.07, -0.21], [0, 0.12, 0.02]]) { const w = bt.localToWorld(bt.position.clone().set(x, y, z)); for (const col of g.sofaColliders) { const pr = col.projectPoint(w, false); if (pr && pr.isInside) worst = Math.max(worst, Math.hypot(pr.point.x - w.x, pr.point.y - w.y, pr.point.z - w.z)); } } }
      return worst;
    });
    if (d > best + 0.02) {
      best = d;
      await p.evaluate(() => { const m = window.__mudanza, v = m.view, c = m.game.carriers[0], cam = v.camera; cam.position.set(c.pos.x + 1.6, c.pos.y - 0.25, c.pos.z + 0.1); cam.lookAt(c.pos.x, c.pos.y - 0.55, c.pos.z - 0.2); cam.updateMatrixWorld(); v.renderer.render(v.scene, cam); });
      await p.screenshot({ path: `${out}/bota-en-sofa.png` });
      console.log(`fotograma ${k}: bota metida ${(d * 100).toFixed(1)} cm`);
    }
  }
  await b.close();
})();
