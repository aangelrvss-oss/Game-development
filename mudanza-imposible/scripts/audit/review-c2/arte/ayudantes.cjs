// Revisión ciclo 2, rol arte: ayudantes (CarrierView) con los objetos del patio. Capturas de juego y de cerca, y hueco
// entre la «mano» dibujada del ayudante y el objeto que agarra (si el ayudante dibuja manos).
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c2/arte/ayudantes.cjs <url> <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const base = process.argv[2] || 'http://localhost:4192/';
const out = path.resolve(process.argv[3] || '/tmp/claude-0/review-c2/arte/work');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`${base}?nivel=pruebas&humans=1&carriers=4&style=atentos&capture=1`);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.evaluate(() => window.__mudanza.start(false));
  for (const t of [9, 20]) {
    await p.evaluate((t) => { const m = window.__mudanza, g = m.game; for (let i = 0; i < 60 * 300 && g.time < t; i++) g.step(1 / 60, m.autoInputs(g)); }, t - 1);
    await p.evaluate(() => window.__mudanza.advance(30, 30, 'return window.__mudanza.autoInputs(window.__mudanza.game)'));
    await p.screenshot({ path: path.join(out, `ayudantes-juego-t${t}.jpg`), type: 'jpeg', quality: 70 });
    const info = await p.evaluate(() => { const g = window.__mudanza.game; return g.carriers.map((c) => ({ id: c.id, h: c.human, held: c.heldBody ? (g.itemOf(c.heldBody)?.def.id ?? '?') : null, down: c.down })); });
    const at = await p.evaluate(() => { const g = window.__mudanza.game; const c = g.carriers.find((c) => c.human === null && c.heldBody) ?? g.carriers[1]; const t = c.pos; return { x: t.x, y: t.y, z: t.z }; });
    await p.evaluate(([at]) => { const v = window.__mudanza.view, cam = v.camera; cam.position.set(at.x + 1.6, at.y + 1.6, at.z + 2.2); cam.lookAt(at.x, at.y - 0.1, at.z); cam.updateMatrixWorld(); v.renderer.render(v.scene, cam); }, [at]);
    await p.screenshot({ path: path.join(out, `ayudantes-cerca-t${t}.jpg`), type: 'jpeg', quality: 70 });
    console.log(`t=${t}: ${JSON.stringify(info)}`);
  }
  await b.close();
})();
