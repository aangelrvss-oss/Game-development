// Revisor (rendimiento): ¿qué texturas de WebGL se crean y no se borran entre partidas? Contra el servidor de
// desarrollo de Vite (módulos sin empaquetar: las pilas nombran los archivos de src/). Envuelve createTexture y
// deleteTexture y agrupa las vivas por la pila de creación (solo las líneas de /src/).
// Uso: NODE_PATH=$(npm root -g) node fuga-texturas.cjs <url del servidor de desarrollo> <nivel> <partidas>
const { chromium } = require('playwright');
const [url, nivel, N = '4'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.addInitScript(() => {
    Error.stackTraceLimit = 60;
    const live = new Map();
    window.__tex = live;
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
      const oc = C.prototype.createTexture, od = C.prototype.deleteTexture;
      C.prototype.createTexture = function () {
        const t = oc.call(this);
        const st = (new Error().stack || '').split('\n').filter((l) => l.includes('/src/')).slice(0, 4).map((l) => l.replace(/^.*\/src\//, 'src/').replace(/\?[^:]*/, '').replace(/\)$/, '')).join(' < ');
        live.set(t, { st, game: window.__partida || 0 });
        return t;
      };
      C.prototype.deleteTexture = function (t) { live.delete(t); return od.call(this, t); };
      const ob = C.prototype.bindTexture, oi = C.prototype.texImage2D, os = C.prototype.texStorage2D;
      C.prototype.bindTexture = function (tg, t) { this.__bound = t; return ob.call(this, tg, t); };
      C.prototype.texImage2D = function (...a) {
        const src = a.find((x) => x && typeof x === 'object' && ('width' in x) && !(x instanceof ArrayBuffer) && !ArrayBuffer.isView(x));
        const e = live.get(this.__bound);
        if (e && src && !e.img) { e.img = `${src.constructor.name} ${src.width}x${src.height}`; try { if (src.toDataURL) e.url = src.toDataURL(); } catch {} }
        return oi.apply(this, a);
      };
      C.prototype.texStorage2D = function (...a) { const e = live.get(this.__bound); if (e && !e.img) e.img = `storage ${a[3]}x${a[4]}`; return os.apply(this, a); };
    }
  });
  const u = new URL(url);
  for (const [k, v] of Object.entries({ humans: 4, carriers: 6, style: 'atentos', capture: 1, ...(nivel === 'pruebas' ? { nivel } : {}) })) u.searchParams.set(k, String(v));
  await p.goto(u.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex', null, { timeout: 120000 });
  for (let k = 1; k <= +N; k++) {
    await p.evaluate(async (k) => {
      window.__partida = k;
      const m = window.__mudanza;
      m.start(false);
      const g = m.game;
      for (let i = 0; i < 60 * 33 && (g.phase === 'countdown' || g.phase === 'playing'); i++) g.step(1 / 60, m.autoInputs(g));
      m.advance(10, 30, 'return window.__mudanza.autoInputs(g)');
    }, k);
  }
  const r = await p.evaluate(() => {
    const by = {};
    const muestras = {};
    for (const { st, game, img, url } of window.__tex.values()) { const k = (img || 'sin imagen') + ' @ ' + (st || '(sin pila de src)'); if (url && game >= 1) muestras[game] = (muestras[game] || []).concat([url]); by[k] = by[k] || {}; by[k][game] = (by[k][game] || 0) + 1; }
    window.__muestras = muestras;
    return { vivas: window.__tex.size, info: window.__mudanza.view.renderer.info.memory.textures, por_origen: by };
  });
  console.log(JSON.stringify(r, null, 1));
  // Guarda las imágenes de las texturas que siguen vivas, creadas en las partidas 1 y 2
  const ms = await p.evaluate(() => window.__muestras);
  const fs = require('fs'), dir = process.env.OUT || '/tmp/claude-0/review-c2/rendimiento/fuga';
  fs.mkdirSync(dir, { recursive: true });
  for (const [g, urls] of Object.entries(ms)) if (+g <= 2) urls.forEach((u, i) => fs.writeFileSync(`${dir}/partida${g}-${i}.png`, Buffer.from(u.split(',')[1], 'base64')));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
