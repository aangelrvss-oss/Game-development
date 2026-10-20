// Capturas clave de la revisión independiente del ciclo 2 (IA auxiliar y modos), en Chromium 1280×720, modo captura.
// 1) Patio, 4 jugadores (piloto) + 1 ayudante atento: el ayudante suelta la mesa dentro del camión, se tambalea y
//    empuja la lámpara (obligatoria, frágil) ya cargada: se rompe y se pierde la partida.
// 2) Patio, 1 jugador (piloto) + 5 ayudantes atentos: con la mesa ya cargada, los ayudantes esperan aparcados mientras el
//    jugador lleva solo las cajas, la silla y la lámpara.
// Uso: NODE_PATH=$(npm root -g) node capturas-ia.cjs [url] [carpeta]
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:4197/';
const out = process.argv[3] || '/tmp/claude-0/review-c2/ia/clave';
const withParams = (u, q) => { const x = new URL(u); for (const [k, v] of Object.entries(q)) x.searchParams.set(k, String(v)); return x.href; };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => p.evaluate(() => {
    const g = window.__mudanza.game;
    const lamp = g.items.find((it) => it.def.id === 'lampara');
    return {
      t: +g.time.toFixed(2), phase: g.phase, loaded: `${g.loadedRequired}/${g.requiredCount}`,
      items: g.items.map((it) => `${it.def.id}:${it.state}:${it.integrity}`).join(' '),
      lamp: lamp ? [lamp.body.translation().x.toFixed(2), lamp.body.translation().z.toFixed(2)] : null,
      carriers: g.carriers.map((c) => `${c.human === null ? 'A' : 'J'}${c.id}(${c.pos.x.toFixed(1)},${c.pos.z.toFixed(1)})${c.heldBody ? '*' : ''}${c.wobbling ? '~' : ''}`).join(' '),
    };
  });
  async function fastForward(t) {
    await p.evaluate((t) => {
      const m = window.__mudanza, g = m.game;
      for (let i = 0; i < 60 * 300 && g.time < t && (g.phase === 'countdown' || g.phase === 'playing'); i++) g.step(1 / 60, m.autoInputs(g));
    }, t);
    return state();
  }
  const advance = (frames) => p.evaluate((n) => window.__mudanza.advance(n, 30, 'return window.__mudanza.autoInputs(g)'), frames);
  async function shot(name) {
    const file = `${out}/${name}.jpg`;
    await p.screenshot({ path: file, type: 'jpeg', quality: 80 });
    const hud = await p.evaluate(() => document.getElementById('h-load')?.innerText.replace(/\n+/g, ' · ') ?? '');
    console.log(`${file}: ${JSON.stringify(await state())} | HUD: ${hud}`);
  }
  // `seed`: fija la semilla de la partida (main.ts usa Math.floor(Math.random() * 1e9)) con un Math.random de un solo uso
  async function open(q, seed = null) {
    await p.goto(withParams(base, { nivel: 'pruebas', capture: 1, ...q }));
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    await p.evaluate((seed) => {
      if (seed !== null) { const orig = Math.random; Math.random = () => { Math.random = orig; return (seed + 0.5) / 1e9; }; }
      window.__mudanza.start(false);
    }, seed);
    console.log('semilla de la partida:', await p.evaluate(() => window.__mudanza.game.opts.seed));
  }

  // 1) 4 jugadores + 1 ayudante atento
  await open({ humans: 4, carriers: 5, style: 'atentos' }, 1);
  console.log('avance rápido:', JSON.stringify(await fastForward(133.4)));
  await advance(12); // ~0,4 s: suelta y empieza a tambalearse
  await advance(15);
  await shot('1-patio-4j1a-ayudante-empuja-lampara');
  for (let k = 0; k < 8; k++) { await advance(15); const s = await state(); if (s.phase !== 'playing') break; }
  await advance(30);
  await shot('2-patio-4j1a-derrota-lampara-rota');

  // 2) 1 jugador + 5 ayudantes atentos
  await open({ humans: 1, carriers: 6, style: 'atentos' }, 1);
  console.log('avance rápido:', JSON.stringify(await fastForward(30)));
  await advance(15);
  await shot('3-patio-1j5a-ayudantes-aparcados');

  console.log(errors.length ? `ERRORES: ${errors.join(' | ')}` : 'sin errores de página ni de consola');
  await b.close();
})();
