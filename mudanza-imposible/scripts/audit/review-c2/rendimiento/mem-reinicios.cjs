// Revisor (rendimiento): memoria tras N partidas seguidas en la misma página (start → 30 s de juego con el piloto →
// 10 fotogramas dibujados → gc). Imprime texturas, geometrías, programas y montón de JS por partida.
// Uso: NODE_PATH=$(npm root -g) node mem-reinicios.cjs <url> <nivel calle|pruebas> <N>
const { chromium } = require('playwright');
const [url, nivel, N = '10'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const u = new URL(url);
  for (const [k, v] of Object.entries({ humans: 4, carriers: 6, style: 'atentos', capture: 1, ...(nivel === 'pruebas' ? { nivel } : {}) })) u.searchParams.set(k, String(v));
  await p.goto(u.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  for (let k = 0; k < +N; k++) {
    const s = await p.evaluate(async () => {
      const m = window.__mudanza;
      m.start(false);
      const g = m.game;
      for (let i = 0; i < 60 * 33 && (g.phase === 'countdown' || g.phase === 'playing'); i++) g.step(1 / 60, m.autoInputs(g));
      m.advance(10, 30, 'return window.__mudanza.autoInputs(g)');
      for (let i = 0; i < 3; i++) { window.gc(); await new Promise((r) => setTimeout(r, 30)); }
      const info = m.view.renderer.info;
      return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(2), geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length, t: +g.time.toFixed(1), fase: g.phase };
    });
    console.log(JSON.stringify({ partida: k + 1, ...s }));
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
