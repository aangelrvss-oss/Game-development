// Ciclo 2b, etapa 0: ¿los textos que comprueban duo-e2e y keyboard-e2e están en pantalla y visibles con cada viewport?
// Abre la demo, empieza una partida a dos, fuerza en el HUD el aviso «Pesa mucho» por el camino normal (J1 agarra y
// arrastra solo con teclas reales) y mide la caja de #h-warn; luego la pausa (#pause) y, en modo captura, la pantalla
// de resultados (#r-title). Solo lee el DOM (getBoundingClientRect y estilo calculado).
// Uso: NODE_PATH=$(npm root -g) node hud-visible.cjs <url> <WxH>
const { chromium } = require('playwright');
const [url, vp] = [process.argv[2], process.argv[3] || '1280x720'];
const [W, H] = vp.split('x').map(Number);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const box = (sel) => p.evaluate((s) => {
    const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    let vis = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0;
    for (let a = e.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden') vis = false; }
    return { text: e.textContent.trim().slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      dentro: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, visible: vis, opacity: cs.opacity };
  }, sel);
  await p.goto(url);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.game?.phase === 'playing', null, { timeout: 60000 });
  // J1 agarra su extremo (J1 empieza junto al extremo +x) y arrastra solo hacia abajo hasta que sale «Pesa mucho»
  const res = {};
  for (let i = 0; i < 30 && !(await p.evaluate(() => window.__mudanza.game.carriers[0].holding)); i++) {
    const d = await p.evaluate(() => { const g = window.__mudanza.game, c = g.carriers[0], s = g.sofaPos; return [s.x + 1.75 - c.pos.x, s.z - c.pos.z]; });
    const keys = []; if (d[0] > 0.3) keys.push('KeyD'); if (d[0] < -0.3) keys.push('KeyA');
    if (!keys.length) { await p.keyboard.press('Space'); await p.waitForTimeout(600); continue; }
    for (const k of keys) await p.keyboard.down(k); await p.waitForTimeout(150); for (const k of keys) await p.keyboard.up(k);
  }
  await p.keyboard.down('KeyS');
  for (let i = 0; i < 150; i++) { await p.waitForTimeout(100); if (/Pesa mucho/.test(await p.evaluate(() => document.getElementById('h-warn').textContent))) break; }
  res.hWarn = await box('#h-warn');
  await p.keyboard.up('KeyS');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => document.getElementById('pause').style.display === 'flex', null, { timeout: 10000 });
  res.pause = await box('#pause');
  res.ocultosPorMediaQuery = await p.evaluate(() => ['#h-players', '#h-hint', '#h-load'].map((s) => { const e = document.querySelector(s); return e ? `${s}:${getComputedStyle(e).display}` : `${s}:no existe`; }));
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'capture=1');
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.evaluate(() => window.__mudanza.start(false));
  for (let i = 0; i < 400; i++) {
    const sc = await p.evaluate(() => { window.__mudanza.advance(15, 30, 'return window.__mudanza.autoInputs(g)'); return window.__mudanza.screen; });
    if (sc === 'results') break;
  }
  res.rTitle = await box('#r-title');
  console.log(JSON.stringify({ viewport: vp, ...res }));
  await b.close();
})();
