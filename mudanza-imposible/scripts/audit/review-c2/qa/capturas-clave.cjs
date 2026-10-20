// Revisión QA del ciclo 2: capturas CLAVE en JPEG (calidad 80, 1280×720), en modo captura (la partida avanza solo
// cuando lo pide el script, con la física y el dibujo del juego). Semilla fija: Math.random se sustituye SOLO durante
// la llamada a start() (main.ts saca de ahí la semilla de la partida: floor(random·1e9)).
// Uso: NODE_PATH=$(npm root -g) node capturas-clave.cjs <url c2> <url base> <carpeta>
const { chromium } = require('playwright');
const fs = require('fs');
const [, , urlC2, urlBase, out] = process.argv;
const withParams = (u, q) => { const x = new URL(u); for (const [k, v] of Object.entries(q)) x.searchParams.set(k, String(v)); return x.href; };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => p.evaluate(() => {
    const g = window.__mudanza.game, s = g.sofaPos;
    return { t: +g.time.toFixed(2), phase: g.phase, screen: window.__mudanza.screen, integ: g.integrity, stage: g.stageLabel, sofa: [s.x, s.y, s.z].map((v) => +v.toFixed(2)),
      cs: g.carriers.map((c) => ({ x: +c.pos.x.toFixed(1), z: +c.pos.z.toFixed(1), h: c.holding, down: c.down ?? null, falls: c.falls })) };
  });
  /** Partida con semilla fija (humanos llevados por el piloto con el reparto, como en las pruebas). */
  async function begin(url, seed) {
    await p.goto(url);
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    await p.evaluate((seed) => { const r = Math.random; Math.random = () => (seed + 0.5) / 1e9; try { window.__mudanza.start(false); } finally { Math.random = r; } }, seed);
  }
  /** Avanza sin dibujar hasta `t` s de juego (mismos pasos de 1/60 s y misma física). */
  const fastForward = (t) => p.evaluate((t) => {
    const m = window.__mudanza, g = m.game;
    for (let i = 0; i < 60 * 300 && g.time < t && (g.phase === 'countdown' || g.phase === 'playing'); i++) g.step(1 / 60, m.autoInputs(g));
  }, t);
  const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 80 }); console.log(name, JSON.stringify(await state())); };

  // 1-2. «La calle», 4 humanos + 2 ayudantes atentos, semilla 1: en 5cab122 tarda ~128 s (657fd30: ~32,5 s). Mismo
  // instante de juego en las dos builds, con la cámara algo más lejos.
  // La cámara sigue al grupo con suavizado: tras avanzar sin dibujar, se dibujan 4 s de juego (120 fotogramas) para que
  // llegue. Mismo instante de juego en las dos builds (t ≈ 32 s) y, en 5cab122, otra a t ≈ 60 s.
  for (const [name, url, shots] of [['c2', urlC2, [32, 60]], ['base', urlBase, [32]]]) {
    await begin(withParams(url, { humans: 4, carriers: 6, style: 'atentos', capture: 1 }), 1);
    for (const t of shots) {
      await fastForward(t - 4);
      for (let k = 0; k < 8; k++) await p.evaluate(() => window.__mudanza.advance(15, 30, 'return window.__mudanza.autoInputs(g)'));
      await shot(`calle-4j2a-semilla1-t${t}-${name}`);
    }
  }
  console.log(errors.length ? `ERRORES: ${errors.join(' | ')}` : 'sin errores de página ni de consola');
  await b.close();
})();
