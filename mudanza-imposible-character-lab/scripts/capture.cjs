// Capturas reales del laboratorio en momentos fijos de cada prueba (modo ?capture=1: la simulación
// avanza fotograma a fotograma, igual que en tiempo real pero sin depender de la velocidad del equipo).
// Uso: node scripts/capture.cjs [carpeta] [url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'shots/capturas');
const url = process.argv[3] || 'http://localhost:4174/';
// [prueba, segundos de prueba, nombre, vista de juego]
const PLAN = [
  ['A', 1.1, 'A1-arranca'], ['A', 2.0, 'A2-caminando'], ['A', 3.4, 'A3-gira'],
  ['B', 1.9, 'B1-tira-sin-avanzar'], ['B', 3.1, 'B2-se-suelta-de-golpe'], ['B', 3.6, 'B3-recupera-pasos'],
  ['C', 1.5, 'C1-tropieza'], ['C', 1.95, 'C2-cae'], ['C', 2.9, 'C3-en-el-suelo'], ['C', 3.95, 'C4-se-levanta'],
  ['D', 2.2, 'D1-lo-agarra'], ['D', 2.9, 'D2-se-le-escapa'], ['D', 5.2, 'D3-le-golpea'],
  ['B', 2.0, 'G-vista-de-juego', true],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__lab);
  for (const [test, secs, name, game] of PLAN) {
    await p.evaluate(([t, g]) => { window.__lab.run(t); window.__lab.setView(!!g); }, [test, game]);
    // Se avanza a 30 fps para que la cámara y las animaciones lleguen igual que en una partida
    await p.evaluate((s) => { const l = window.__lab; while (l.lab.testTime < s - 1e-6) l.advance(1, 30); }, secs);
    await p.screenshot({ path: path.join(out, `${name}.png`) });
    const st = await p.evaluate(() => window.__lab.state());
    console.log(name, st.state, st.t, JSON.stringify(st.log.slice(-3)));
  }
  console.log('errores', errors.length, errors.slice(0, 5));
  await b.close();
})();
