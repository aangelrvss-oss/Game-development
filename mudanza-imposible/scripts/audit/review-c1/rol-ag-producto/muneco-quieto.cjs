// Revisor A+G (ciclo 1): el muñeco quieto al empezar, de lado y de frente (vale para la línea base y para el ciclo 1).
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-ag-producto/muneco-quieto.cjs <url> <prefijo>
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4175/';
const tag = process.argv[3] || 'c1';
const OUT = '/tmp/claude-0/review-c1/ag';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url + '?capture=1');
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  for (const [name, a] of [['lado', Math.PI / 2], ['frente', 0], ['tres-cuartos', 0.8]]) {
    const r = await p.evaluate(([a]) => {
      const m = window.__mudanza, v = m.view, c = m.game.carriers[0], cam = v.camera;
      const f = c.facing, yaw = Math.atan2(f.x, f.z) + a, d = 2.4;
      cam.position.set(c.pos.x + Math.sin(yaw) * d, c.pos.y + 0.9, c.pos.z + Math.cos(yaw) * d);
      cam.lookAt(c.pos.x, c.pos.y + 0.15, c.pos.z); cam.updateMatrixWorld();
      v.renderer.render(v.scene, cam);
      const dv = v.carriers[0];
      return { state: dv.src?.state, holding: c.holding, facing: c.facing };
    }, [a]);
    if (name === 'lado') console.log(tag, JSON.stringify(r));
    await p.screenshot({ path: `${OUT}/quieto-${tag}-${name}.png`, clip: { x: 340, y: 60, width: 600, height: 600 } });
  }
  await b.close();
})();
