// Capturas del ciclo 2 en Chromium a 1280×720 (T-hud, T-level-3, T-view y la parte de navegador de T-level-2), en
// modo captura (la partida solo avanza cuando lo pide el script, con la física y el dibujo del juego):
// - «Patio de pruebas»: los siete objetos en su sitio (cuenta atrás) y, con 2 y 4 jugadores llevados por el piloto
//   (reparto en equipos), la lista de la mudanza en el HUD, objetos y camión, con los objetos de camino y, más tarde,
//   con varios ya cargados;
// - «La calle»: el sofá entregado dentro del camión (rampa y caja de carga).
// Uso: NODE_PATH=$(npm root -g) node scripts/capturas-c2.cjs [url] [carpeta]   (por defecto, :4174 y /tmp/claude-0/c2-capturas)
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:4174/';
const out = process.argv[3] || '/tmp/claude-0/c2-capturas';
const withParams = (u, q) => { const x = new URL(u); for (const [k, v] of Object.entries(q)) x.searchParams.set(k, String(v)); return x.href; };
const PILOT = 'return window.__mudanza.autoInputs(g)';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => p.evaluate(() => {
    const g = window.__mudanza.game;
    return { t: +g.time.toFixed(2), phase: g.phase, items: g.items.map((it) => `${it.def.id}:${it.state}`), loaded: `${g.loadedRequired}/${g.requiredCount}` };
  });
  /** Avanza la partida con el piloto hasta `until(estado)` o `max` s de juego (fotogramas de 1/30 s). */
  async function advanceUntil(until, max) {
    for (let i = 0; i < max * 30; i += 15) {
      await p.evaluate((s) => window.__mudanza.advance(15, 30, s), PILOT);
      const s = await state();
      if (until(s)) return s;
    }
    return state();
  }
  /**
   * Avanza la partida con el piloto hasta `t` s de juego sin dibujar (el render por software es lento): mismos pasos de
   * 1/60 s y la misma física; los sucesos de esos pasos no llegan a la interfaz.
   */
  async function fastForward(t) {
    await p.evaluate((t) => {
      const m = window.__mudanza, g = m.game;
      for (let i = 0; i < 60 * 300 && g.time < t && (g.phase === 'countdown' || g.phase === 'playing'); i++) g.step(1 / 60, m.autoInputs(g));
    }, t);
    return state();
  }
  async function shot(name, info) {
    const file = `${out}/${name}.png`;
    await p.screenshot({ path: file });
    const hud = await p.evaluate(() => document.getElementById('h-load')?.innerText.replace(/\n+/g, ' · ') ?? '');
    console.log(`${file}: ${JSON.stringify(info)} | HUD: ${hud}`);
  }

  for (const n of [2, 4]) {
    await p.goto(withParams(base, { nivel: 'pruebas', humans: n, carriers: n, capture: 1 }));
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    if (n === 2) await shot('patio-menu', { menu: await p.evaluate(() => document.getElementById('menu-sub').innerText) });
    await p.evaluate(() => window.__mudanza.start(false));
    if (n === 2) {
      // Los siete objetos en su sitio, durante la cuenta atrás, con la cámara de juego algo más lejos
      await p.evaluate(() => window.__mudanza.setZoom(1.75));
      await p.evaluate(() => window.__mudanza.advance(75, 30));
      await shot('patio-objetos', await state());
    }
    // Un poco más lejos que la cámara de juego para que quepan los objetos que faltan y el camión
    await p.evaluate(() => window.__mudanza.setZoom(1.55));
    await fastForward(n === 2 ? 4.5 : 5.5);
    let s = await advanceUntil((x) => x.phase === 'playing' && x.t >= (n === 2 ? 6 : 7), 30);
    await shot(`patio-${n}j-de-camino`, s);
    await fastForward(n === 2 ? 25.5 : 20.5);
    s = await advanceUntil((x) => x.phase !== 'playing' || x.t >= (n === 2 ? 27 : 22), 60);
    await shot(`patio-${n}j-cargando`, s);
  }

  // «La calle»: dos jugadores con el piloto hasta que el sofá queda cargado dentro del camión
  await p.goto(withParams(base, { humans: 2, carriers: 2, capture: 1 }));
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.evaluate(() => window.__mudanza.start(false));
  await fastForward(31);
  let s = await advanceUntil((x) => x.phase !== 'playing' || x.t > 34.5, 10);
  await shot('calle-sofa-en-el-camion', s);
  s = await advanceUntil((x) => x.items[0] === 'sofa:loaded' || x.phase !== 'playing', 15);
  const sofa = await p.evaluate(() => { const g = window.__mudanza.game, q = g.sofaPos; return { pos: [q.x, q.y, q.z].map((v) => +v.toFixed(2)), hold: +g.holdFraction(g.sofaItem).toFixed(2) }; });
  await shot('calle-sofa-entregado', { ...s, ...sofa });
  console.log(errors.length ? `ERRORES: ${errors.join(' | ')}` : 'sin errores de página ni de consola');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
