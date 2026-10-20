// Captura en Chromium para confirmar a ojo lo que mide piernas-escala.ts: el muñeco en el patio de salida y al final,
// con un primer plano de J1. Además mide en la página dónde quedan los tubos de las piernas respecto al cuerpo.
// Uso: node scripts/audit/review-c1/fisica/captura-piernas.cjs <url> <carpeta de salida>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const url = process.argv[2] || 'http://localhost:4199/';
const out = path.resolve(process.argv[3] || '/tmp/claude-0/review-c1/fisica/capturas');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${url}?capture=1&humans=2&carriers=2`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  const adv = (n, script) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, script ?? null]);
  await adv(100);
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza;
    return m.view.carriers.filter((v) => v.rig).map((v) => {
      const c = v.carrier, rig = v.rig;
      rig.group.updateMatrixWorld(true);
      const legG = new Set(rig.legs.map((l) => l.geometry));
      let sx = 0, sz = 0, n = 0;
      rig.group.traverse((o) => {
        if (!o.isMesh || !legG.has(o.geometry)) return;
        const pos = o.geometry.attributes.position, e = o.matrixWorld.elements;
        for (let q = 0; q < pos.count; q++) {
          const x = pos.getX(q), y = pos.getY(q), z = pos.getZ(q);
          sx += e[0] * x + e[4] * y + e[8] * z + e[12]; sz += e[2] * x + e[6] * y + e[10] * z + e[14]; n++;
        }
      });
      const t = c.pos;
      return { carrier: [t.x.toFixed(2), t.z.toFixed(2)], legs: [(sx / n).toFixed(2), (sz / n).toFixed(2)], gap: Math.hypot(sx / n - t.x, sz / n - t.z).toFixed(2) };
    });
  });
  console.log('Patio (al empezar):', JSON.stringify(await measure()));
  await p.screenshot({ path: path.join(out, 'patio-general.png') });
  // Primer plano de J1 de lado
  await p.evaluate(() => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[0], cam = v.camera;
    cam.position.set(c.pos.x + 3.2, c.pos.y + 1.0, c.pos.z + 0.6);
    cam.lookAt(c.pos.x - 0.5, c.pos.y - 0.2, c.pos.z - 0.4); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  });
  await p.screenshot({ path: path.join(out, 'patio-j1-cerca.png') });
  // Recorrido con el piloto hasta la rampa (lejos del origen) y vista general
  for (let k = 0; k < 40; k++) {
    await adv(30, 'return window.__mudanza.autoInputs(g)');
    const st = await p.evaluate(() => window.__mudanza.game.stage);
    if (st >= 5) break;
  }
  await adv(20, 'return window.__mudanza.autoInputs(g)');
  console.log('Rampa:', JSON.stringify(await measure()));
  await p.screenshot({ path: path.join(out, 'rampa-general.png') });
  console.log('Errores de página:', errors.length ? errors.join(' | ') : 'ninguno');
  await b.close();
})();
