// Graba las cuatro pruebas del laboratorio fotograma a fotograma (1/30 s de simulación por fotograma:
// velocidad real) y deja los fotogramas y un rótulo de título en shots/video/. Después: scripts/make-video.sh
// Uso: node scripts/record-video.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = process.argv[2] || 'http://localhost:4174/';
const OUT = path.resolve(__dirname, '../shots/video');
// [prueba, desde (s), hasta (s)] — tiempos de la prueba; solo se recorta el principio y el final
const SEGMENTS = [['A', 0.3, 5.2], ['B', 0.4, 5.0], ['C', 0.7, 5.8], ['D', 1.6, 6.4]];

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__lab);
  await p.evaluate(() => window.__lab.panel(false));
  for (const [test, from, to] of SEGMENTS) {
    const dir = path.join(OUT, test);
    fs.mkdirSync(dir, { recursive: true });
    await p.evaluate((t) => { window.__lab.run(t); window.__lab.setView(false); }, test);
    // Hasta el principio del tramo sin guardar (la cámara y la animación siguen corriendo igual)
    await p.evaluate((s) => { const l = window.__lab; while (l.lab.testTime < s - 1e-6) l.advance(1, 30); }, from);
    let n = 0;
    while ((await p.evaluate(() => window.__lab.lab.testTime)) < to - 1e-6) {
      await p.evaluate(() => window.__lab.advance(1, 30));
      await p.screenshot({ path: path.join(dir, `${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    }
    const st = await p.evaluate(() => window.__lab.state());
    console.log(test, 'fotogramas', n, 'sucesos', JSON.stringify(st.log.map((l) => `${l.t}:${l.e}`)));
  }
  // Rótulo de título
  await p.setContent(`<body style="margin:0;width:1280px;height:720px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,#2b2236,#d7392d 120%);color:#fff;font-family:system-ui,sans-serif;text-align:center">
    <div style="font-size:26px;font-weight:800;letter-spacing:.2em;opacity:.85">LA MUDANZA IMPOSIBLE</div>
    <div style="font-size:78px;font-weight:900;margin:12px 0 18px">Laboratorio de personaje</div>
    <div style="font-size:22px;font-weight:600;max-width:1000px;line-height:1.4;opacity:.92">Simulación real (Three.js + Rapier), grabada fotograma a fotograma a velocidad real.<br>Las pruebas las conduce un guion de entrada; las reacciones salen de la física.</div></body>`);
  await p.screenshot({ path: path.join(OUT, 'titulo.png') });
  console.log('errores', errors.length, errors.slice(0, 5));
  await b.close();
})();
