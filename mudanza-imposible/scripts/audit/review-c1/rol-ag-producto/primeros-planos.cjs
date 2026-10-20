// Revisor A+G (ciclo 1): primeros planos laterales del muñeco quieto, agarrando solo (esfuerzo) y llevando entre dos.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-ag-producto/primeros-planos.cjs http://localhost:4175/
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://localhost:4175/';
const OUT = '/tmp/claude-0/review-c1/ag';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url + '?capture=1');
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  const adv = (n, script) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, script ?? null]);
  /** Cámara lateral fija respecto al sofá: a `d` m al sur (z+) del punto medio entre (x, z), a `h` m de altura. */
  const side = (name, d = 5, h = 1.0) => p.evaluate(([d, h]) => {
    const m = window.__mudanza, v = m.view, g = m.game, s = g.sofaPos, cam = v.camera;
    const yaw = g.sofaYaw; // eje largo del sofá
    // Mirar perpendicular al eje largo
    const px = -Math.sin(yaw), pz = Math.cos(yaw);
    cam.position.set(s.x + px * d, 0.6 + h, s.z + pz * d);
    cam.lookAt(s.x, 0.5, s.z); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  }, [d, h]).then(() => p.screenshot({ path: `${OUT}/pp-${name}.png` }));
  const info = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game, sb = g.sofa;
    // Altura mínima del sofá (esquinas inferiores aproximadas: puntos de sus colliders)
    let minY = Infinity;
    for (let i = 0; i < sb.numColliders(); i++) { const c = sb.collider(i); const aabb = c.computeAabb ? null : null; const t = c.translation(); minY = Math.min(minY, t.y - (c.halfExtents ? c.halfExtents().y : 0)); }
    return { sofaY: +g.sofaPos.y.toFixed(3), minY: +minY.toFixed(3), up: +g.sofaUp.toFixed(3), cs: g.carriers.map((c, i) => ({ h: c.holding, eff: +(m.view.carriers[i].effort ?? NaN).toFixed(2), hand: c.holding ? +c.handWorld().y.toFixed(2) : null })) };
  });
  await adv(100);
  log('Quietos:', JSON.stringify(await info()));
  await side('0-quietos');
  // Solo J1 con el piloto, J2 quieto
  const solo = `const a = window.__mudanza.autoInputs(g); return a.map((x, i) => i === 0 ? x : { mx: 0, mz: 0, grab: false, turn: 0, right: false });`;
  for (let k = 0; k < 40; k++) { await adv(3, solo); const i = await info(); if (i.cs[0].h) break; }
  await adv(30, solo);
  log('J1 solo tirando:', JSON.stringify(await info()));
  await side('1-j1-solo');
  for (let k = 0; k < 60; k++) { await adv(3, 'return window.__mudanza.autoInputs(g)'); const i = await info(); if (i.cs.every((c) => c.h)) break; }
  await adv(30, 'return window.__mudanza.autoInputs(g)');
  log('Entre dos:', JSON.stringify(await info()));
  await side('2-entre-dos');
  await side('2b-entre-dos-cerca', 3.2, 0.6);
  await b.close();
})();
