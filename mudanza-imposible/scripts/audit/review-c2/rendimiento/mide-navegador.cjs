// Revisor independiente del ciclo 2 (rendimiento). Mide en Chromium (render por software) el reparto del fotograma
// entre piloto, física (Game.step), HUD y dibujo (view.render, más la espera del rasterizado), en reposo y en carga,
// y la memoria tras varias partidas seguidas. Funciona en 657fd30 y en 5cab122 (mismos ganchos de window.__mudanza).
// Uso: NODE_PATH=$(npm root -g) node mide-navegador.cjs <url> <etiqueta> <nivel calle|pruebas> <salida.json> [captura.jpg]
const { chromium } = require('playwright');
const fs = require('fs');
const [url, label, nivel, out, shotPath] = process.argv.slice(2);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (a) => q(a, 0.5);
const r3 = (x) => Math.round(x * 1000) / 1000;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const res = { label, nivel, url };
  const errors = [];
  const page = async (extra) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const u = new URL(url);
    for (const [k, v] of Object.entries({ humans: 4, carriers: 6, style: 'atentos', ...(nivel === 'pruebas' ? { nivel } : {}), ...extra })) u.searchParams.set(k, String(v));
    const t0 = Date.now();
    await p.goto(u.href);
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex', null, { timeout: 60000 });
    res.arranque_ms = res.arranque_ms ?? (Date.now() - t0);
    return p;
  };

  // 1) Menú en reposo (bucle real con rAF, escena quieta de fondo): intervalos de rAF y coste de view.render
  {
    const p = await page({});
    await p.waitForTimeout(2000);
    res.menu = await p.evaluate(() => new Promise((ok) => {
      const v = window.__mudanza.view, orig = v.render.bind(v), rs = [], fs = [];
      v.render = (...a) => { const t = performance.now(); orig(...a); rs.push(performance.now() - t); };
      let last = performance.now();
      const tick = (now) => { fs.push(now - last); last = now; if (fs.length < 40) requestAnimationFrame(tick); else { v.render = orig; ok({ frames: fs, render: rs }); } };
      requestAnimationFrame(tick);
    }));
    res.menu = { raf_ms_med: r3(med(res.menu.frames)), raf_ms_p90: r3(q(res.menu.frames, 0.9)), render_js_ms_med: r3(med(res.menu.render)), n: res.menu.frames.length };
    const loadInfo = await p.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resEntries = performance.getEntriesByType('resource').map((e) => ({ name: e.name.split('/').pop(), transfer: e.transferSize, decoded: e.decodedBodySize, dur: Math.round(e.duration) }));
      return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), loadEvent: Math.round(nav.loadEventEnd), resources: resEntries, heapMB: performance.memory.usedJSHeapSize / 1048576 };
    });
    res.carga_pagina = loadInfo;
    await p.close();
  }

  // 2) Partida controlada (capture=1: el juego solo avanza cuando lo pide el script). Cada «fotograma» es 1 paso de
  //    60 Hz con el piloto llevando a los 4 humanos (y 2 ayudantes), su HUD y su dibujo. Se envuelven g.step,
  //    view.render y autoInputs; después de cada fotograma se fuerza el rasterizado con readPixels de 1 píxel.
  const p = await page({ capture: 1 });
  await p.evaluate(() => window.__mudanza.start(false));
  const measure = (n) => p.evaluate((n) => {
    const m = window.__mudanza, g = m.game, v = m.view, gl = v.renderer.getContext();
    const px = new Uint8Array(4);
    const acc = { step: 0, render: 0, pilot: 0 };
    const oStep = g.step.bind(g), oRender = v.render.bind(v), oAuto = m.autoInputs.bind(m);
    g.step = (...a) => { const t = performance.now(); oStep(...a); acc.step += performance.now() - t; };
    v.render = (...a) => { const t = performance.now(); oRender(...a); acc.render += performance.now() - t; };
    m.autoInputs = (gg) => { const t = performance.now(); const r = oAuto(gg); acc.pilot += performance.now() - t; return r; };
    const rows = [];
    for (let i = 0; i < n && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      acc.step = acc.render = acc.pilot = 0;
      const t0 = performance.now();
      m.advance(1, 60, 'return window.__mudanza.autoInputs(g)');
      const t1 = performance.now();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t2 = performance.now();
      rows.push({ total: t1 - t0, step: acc.step, pilot: acc.pilot, render: acc.render, hud: t1 - t0 - acc.step - acc.pilot - acc.render, raster: t2 - t1 });
    }
    delete g.step; delete v.render; m.autoInputs = oAuto;
    const info = v.renderer.info;
    let objs = 0; v.scene.traverse(() => objs++);
    return { rows, t: g.time, phase: g.phase, calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length, objs };
  }, n);
  const sum = (r) => {
    const k = ['total', 'raster', 'step', 'pilot', 'hud', 'render'];
    const o = {}; for (const x of k) o[x + '_med'] = r3(med(r.rows.map((y) => y[x])));
    const tot = med(r.rows.map((y) => y.total + y.raster));
    o.fotograma_med = r3(tot); o.fotograma_p95 = r3(q(r.rows.map((y) => y.total + y.raster), 0.95));
    o.reparto_pct = { fisica: Math.round(100 * o.step_med / tot), piloto: Math.round(100 * o.pilot_med / tot), hud: Math.round(100 * o.hud_med / tot), dibujo_js: Math.round(100 * o.render_med / tot), rasterizado: Math.round(100 * o.raster_med / tot) };
    return { ...o, n: r.rows.length, t: r3(r.t), phase: r.phase, calls: r.calls, triangles: r.triangles, geometries: r.geometries, textures: r.textures, programs: r.programs, objetos_escena: r.objs };
  };
  await measure(10); // calentamiento (compilación de shaders)
  res.reposo_cuenta_atras = sum(await measure(60));
  // Avance rápido sin dibujar hasta t = 9 s: todos llevando cosas
  const ff = (t) => p.evaluate((t) => { const m = window.__mudanza, g = m.game; for (let i = 0; i < 60 * 300 && g.time < t && (g.phase === 'countdown' || g.phase === 'playing'); i++) g.step(1 / 60, m.autoInputs(g)); return g.time; }, t);
  await ff(9);
  res.carga_t9 = sum(await measure(90));
  await ff(22);
  res.carga_t22 = sum(await measure(90));
  if (shotPath) await p.screenshot({ path: shotPath, type: 'jpeg', quality: 80 });

  // 3) Memoria: 4 partidas seguidas en la misma página (start reinicia: dispose del Game y attach de la vista).
  const mem = [];
  for (let k = 0; k < 4; k++) {
    await p.evaluate(() => window.__mudanza.start(false));
    await ff(30);
    await p.evaluate(() => window.__mudanza.advance(10, 30, 'return window.__mudanza.autoInputs(window.__mudanza.game)'));
    const s = await p.evaluate(async () => {
      for (let i = 0; i < 3; i++) { window.gc(); await new Promise((r) => setTimeout(r, 50)); }
      const v = window.__mudanza.view, info = v.renderer.info, g = window.__mudanza.game;
      let objs = 0, mats = new Set(), geos = new Set();
      v.scene.traverse((o) => { objs++; if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid)); if (o.geometry) geos.add(o.geometry.uuid); });
      return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(2), geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length, objetos_escena: objs, materiales_escena: mats.size, geometrias_escena: geos.size, cuerpos: g.world.bodies.len(), colliders: g.world.colliders.len() };
    });
    mem.push(s);
  }
  res.memoria_por_partida = mem;
  res.errores = errors;
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
