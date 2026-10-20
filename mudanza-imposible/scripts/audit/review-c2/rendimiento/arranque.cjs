// Revisor (rendimiento): primer arranque (navegación → menú visible) en páginas nuevas, alternando árboles.
// Uso: NODE_PATH=$(npm root -g) node arranque.cjs <url1> <url2> [rondas]
const { chromium } = require('playwright');
const [u1, u2, R = '5'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = { [u1]: [], [u2]: [] };
  for (let r = 0; r < +R; r++) for (const u of [u1, u2]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); // contexto nuevo: sin caché
    const p = await ctx.newPage();
    const t0 = Date.now();
    await p.goto(u);
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex', null, { timeout: 60000, polling: 10 });
    const ms = Date.now() - t0;
    const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return Math.round(n.domContentLoadedEventEnd); });
    out[u].push({ menu_ms: ms, dcl_ms: nav });
    await ctx.close();
  }
  for (const [u, a] of Object.entries(out)) { const s = a.map((x) => x.menu_ms).sort((x, y) => x - y); console.log(u, 'menú visible (ms):', a.map((x) => x.menu_ms).join(', '), '| mediana', s[Math.floor(s.length / 2)], '| DCL', a.map((x) => x.dcl_ms).join(', ')); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
