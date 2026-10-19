// Tiras de primer plano de los pies: fotogramas consecutivos recortados alrededor del personaje
// (misma cámara del laboratorio, solo se recorta). Uso: node scripts/feet-strips.cjs <carpeta> [url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'shots/tiras');
const url = process.argv[3] || 'http://localhost:4174/';
// [nombre, prueba, desde (s), fotogramas, cada k fotogramas de 60 Hz]
const STRIPS = [
  ['caminar', 'A', 1.6, 8, 4], ['parar', 'A', 5.0, 8, 7],
  ['tirar', 'B', 1.4, 8, 5], ['soltar', 'B', 3.1, 8, 4],
  ['tropezar', 'C', 1.3, 8, 4], ['caer', 'C', 1.9, 8, 5],
  ['levantarse', 'C', 3.4, 8, 7], ['rampa', 'D', 2.2, 8, 5],
];
const S = 500;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__lab);
  await p.evaluate(() => window.__lab.panel(false));
  for (const [name, test, from, n, k] of STRIPS) {
    await p.evaluate((t) => { window.__lab.run(t); window.__lab.setView(false); }, test);
    await p.evaluate((s) => { const l = window.__lab; while (l.lab.testTime < s - 1e-6) l.advance(1, 60); }, from);
    for (let i = 0; i < n; i++) {
      // Centro del recorte: el punto medio entre los pies y la cadera, proyectado en pantalla
      const c = await p.evaluate(() => {
        const l = window.__lab, d = l.rig.debug, cam = l.stage.camera;
        const pts = d.feet.flatMap((f) => [...f.sole, f.hip]);
        const m = pts.reduce((a, q) => [a[0] + q[0], a[1] + q[1], a[2] + q[2]], [0, 0, 0]).map((v) => v / pts.length);
        const v = new cam.position.constructor(m[0], m[1] + 0.3, m[2]).project(cam);
        return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, t: l.lab.testTime, st: l.lab.char.state };
      });
      const x = Math.max(0, Math.min(1400 - S, c.x - S / 2)), y = Math.max(0, Math.min(900 - S, c.y - S / 2));
      await p.screenshot({ path: path.join(out, `${name}-${i}.png`), clip: { x, y, width: S, height: S }, timeout: 120000 });
      if (i === 0) console.log(name, c.t.toFixed(2), c.st);
      await p.evaluate((kk) => window.__lab.advance(kk, 60), k);
    }
  }
  await b.close();
})();
