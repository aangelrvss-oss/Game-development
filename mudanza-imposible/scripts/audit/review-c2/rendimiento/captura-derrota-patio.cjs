// Revisor (contenido): pantalla de resultados del «Patio de pruebas» cuando se rompe la lámpara (obligatoria). Se deja
// caer la lámpara desde 3 m (la física del juego decide si se rompe) y se avanza hasta la pantalla de resultados.
// Uso: NODE_PATH=$(npm root -g) node captura-derrota-patio.cjs <url> <salida.jpg>
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  const u = new URL(url); for (const [k, v] of Object.entries({ nivel: 'pruebas', humans: 2, carriers: 2, capture: 1 })) u.searchParams.set(k, String(v));
  await p.goto(u.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.evaluate(() => window.__mudanza.start(false));
  await p.evaluate(() => window.__mudanza.advance(100, 30)); // pasa la cuenta atrás
  const r = await p.evaluate(() => {
    const m = window.__mudanza, g = m.game;
    const lamp = g.items.find((it) => it.def.id === 'lampara');
    const t = lamp.body.translation();
    lamp.body.setTranslation({ x: t.x, y: 3, z: t.z }, true);
    lamp.body.setRotation({ x: 0.38, y: 0, z: 0, w: 0.92 }, true);
    for (let i = 0; i < 600 && m.screen === 'play'; i++) m.advance(1, 30);
    return { screen: m.screen, phase: g.phase, reason: g.loseReason, lamp: lamp.state, title: document.getElementById('r-title').innerText, sub: document.getElementById('r-sub').innerText };
  });
  await p.screenshot({ path: out, type: 'jpeg', quality: 80 });
  console.log(JSON.stringify({ ...r, errors }));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
