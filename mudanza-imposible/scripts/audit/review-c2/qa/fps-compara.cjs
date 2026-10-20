// Revisión QA del ciclo 2: FPS internos y ritmo del juego (s de juego por s de reloj) en la partida a dos de duo-e2e,
// sin pulsar nada, en las dos builds (alternadas para repartir el ruido). Con render por software, menos FPS = más pasos
// de física por fotograma y pulsaciones más gruesas en los e2e de teclado.
// Uso: NODE_PATH=$(npm root -g) node fps-compara.cjs <url base> <url c2> [rondas]
const { chromium } = require('playwright');
const [, , urlA, urlB, roundsArg] = process.argv;
const rounds = Number(roundsArg || 2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const res = { base: [], c2: [] };
  for (let r = 0; r < rounds; r++) {
    for (const [name, url] of [['base', urlA], ['c2', urlB]]) {
      const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
      await p.goto(url);
      await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => window.__mudanza.game?.phase === 'playing', null, { timeout: 60000 });
      await p.waitForTimeout(2000);
      await p.evaluate(() => { window.__qaFrames = 0; const f = () => { window.__qaFrames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const g0 = await p.evaluate(() => window.__mudanza.game.time), t0 = Date.now();
      await p.waitForTimeout(15000);
      const g1 = await p.evaluate(() => window.__mudanza.game.time), t1 = Date.now();
      const fps = await p.evaluate(() => window.__mudanza.fps());
      const frames = await p.evaluate(() => window.__qaFrames);
      const info = await p.evaluate(() => window.__mudanza.renderInfo());
      const pace = (g1 - g0) / ((t1 - t0) / 1000);
      res[name].push({ fps: +fps.toFixed(2), realFps: +(frames / ((t1 - t0) / 1000)).toFixed(2), pace: +pace.toFixed(3), calls: info.calls, tris: info.triangles });
      console.log(name, `ronda ${r + 1}`, JSON.stringify(res[name][res[name].length - 1]));
      await p.close();
    }
  }
  for (const k of ['base', 'c2']) {
    const m = (f) => (res[k].reduce((s, x) => s + x[f], 0) / res[k].length).toFixed(3);
    console.log(`MEDIA ${k}: fps internos ${m('fps')}, fotogramas reales/s ${m('realFps')}, ritmo ${m('pace')} s/s, llamadas ${m('calls')}, triángulos ${m('tris')}`);
  }
  await b.close();
})();
