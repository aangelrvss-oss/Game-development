// Capturas clave del revisor de física (máx. 4, JPEG 80, 1280×720), en modo captura, en el «Patio de pruebas»:
//  1. el piano llevado a rastras por SOLO 2 personas sube la rampa del camión (trampa);
//  2. el mismo piano, CARGADO por 2 personas (HUD);
//  3. un jugador corre contra la lámpara al empezar: lámpara rota y partida perdida;
//  4. todo cargado salvo la caja, que un saboteador agarra dentro del camión y no suelta (Cargados 4/5).
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c2/fisica/capturas.cjs [url] [carpeta]
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:4195/';
const out = process.argv[3] || '/tmp/claude-0/review-c2/fisica/clave';
const withParams = (u, q) => { const x = new URL(u); for (const [k, v] of Object.entries(q)) x.searchParams.set(k, String(v)); return x.href; };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => p.evaluate(() => {
    const g = window.__mudanza.game;
    return { t: +g.time.toFixed(2), phase: g.phase, lose: g.loseReason, items: g.items.map((it) => `${it.def.id}:${it.state}:${it.integrity}`), loaded: `${g.loadedRequired}/${g.requiredCount}` };
  });
  async function shot(name, info) {
    const file = `${out}/${name}.jpg`;
    await p.screenshot({ path: file, type: 'jpeg', quality: 80 });
    const hud = await p.evaluate(() => document.getElementById('h-load')?.innerText.replace(/\n+/g, ' · ') ?? '');
    console.log(`${file}: ${JSON.stringify(info)} | HUD: ${hud}`);
  }
  async function open(q) {
    await p.goto(withParams(base, { nivel: 'pruebas', capture: 1, ...q }));
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    await p.evaluate(() => window.__mudanza.start(false));
    // Fin de la cuenta atrás sin dibujar
    await p.evaluate(() => { const g = window.__mudanza.game; for (let i = 0; i < 60 * 3.2; i++) g.step(1 / 60, []); });
  }

  // --- 1 y 2: piano con 2 personas ---
  await open({ humans: 2, carriers: 2 });
  await p.evaluate(() => {
    const g = window.__mudanza.game;
    const piano = g.items.find((it) => it.def.id === 'piano');
    // Los demás objetos, apartados en fila al fondo del patio, y opcionales
    const rest = { mesa: 0.45, caja: 0.25, lampara: 0.48, silla: 0.43, nevera: 0.43, piano: 0.35 };
    g.items.filter((it) => it !== piano).forEach((it, k) => { it.required = false; it.body.setTranslation({ x: -14 + k * 1.8, y: rest[it.def.id] + 0.01, z: -8.3 }, true); it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); });
    piano.required = true;
    // Solo para la captura: la cámara sigue a `game.sofa` (el objeto principal, la mesa en el patio); se apunta al piano
    g.sofa = piano.body; g.sofaItem = piano;
    piano.body.setTranslation({ x: -2, y: 0.36, z: 0 }, true);
    piano.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    // Asas que miran a +x (por delante) y a −x... el piano tiene −x (asa 0) y dos de fondo: tiran por la −z y la +z
    const H = piano.def.handles;
    const place = (c, h) => { const a = { x: -2 + h.p.x, z: h.p.z }; c.teleport({ x: a.x + h.out.x * 0.75, y: 0.74, z: a.z + h.out.z * 0.75 }); c.facing = { x: -h.out.x, z: -h.out.z }; };
    place(g.carriers[0], H[1]); place(g.carriers[1], H[2]);
    for (let i = 0; i < 20; i++) g.step(1 / 60, []);
    g.step(1 / 60, [{ mx: 0, mz: 0, grab: true, turn: 0, right: false }, { mx: 0, mz: 0, grab: true, turn: 0, right: false }]);
    window.__pianoCtl = { wp: 0, done: false };
  });
  const CTL = `
    const piano = g.items.find((it) => it.def.id === 'piano'), s = window.__pianoCtl;
    const route = [{ x: 1.2, z: 0 }, { x: 8.6, z: 0 }];
    const q = piano.body.translation(), w = route[s.wp], dx = w.x - q.x, dz = w.z - q.z, d = Math.hypot(dx, dz);
    if (!s.done && d < 0.5) { if (s.wp < route.length - 1) s.wp++; else s.done = true; }
    if (!s.done && piano.inHold && q.x > 7.6) s.done = true;
    return g.carriers.map((c) => s.done ? { mx: 0, mz: 0, grab: c.heldBody === piano.body, turn: 0, right: false }
      : c.heldBody === piano.body ? { mx: dx / d, mz: dz / d, grab: false, turn: 0, right: false } : { mx: 0, mz: 0, grab: true, turn: 0, right: false });`;
  await p.evaluate(() => window.__mudanza.setZoom(1.45));
  let s;
  for (let i = 0; i < 40 * 30; i += 15) {
    await p.evaluate((c) => window.__mudanza.advance(15, 30, c), CTL);
    s = await p.evaluate(() => { const g = window.__mudanza.game, it = g.items.find((x) => x.def.id === 'piano'); const q = it.body.translation(); return { x: q.x, y: q.y, st: it.state, held: g.carriers.filter((c) => c.heldBody === it.body).length }; });
    if (s.x > 3.6) break;
  }
  await shot('1-piano-2-personas-rampa', { ...(await state()), piano: s });
  for (let i = 0; i < 40 * 30; i += 15) {
    await p.evaluate((c) => window.__mudanza.advance(15, 30, c), CTL);
    s = await p.evaluate(() => { const g = window.__mudanza.game, it = g.items.find((x) => x.def.id === 'piano'); const q = it.body.translation(); return { x: q.x, y: q.y, st: it.state, held: g.carriers.filter((c) => c.heldBody === it.body).length }; });
    if (s.st === 'loaded') break;
  }
  await p.evaluate((c) => window.__mudanza.advance(10, 30, c), CTL);
  await shot('2-piano-cargado-por-2', { ...(await state()), piano: s });

  // --- 3: lámpara arrollada al empezar ---
  await open({ humans: 2, carriers: 2 });
  await p.evaluate(() => window.__mudanza.setZoom(1.3));
  const RUN = `
    const lamp = g.items.find((it) => it.def.id === 'lampara'), me = g.carriers[0], q = lamp.body.translation();
    const dx = q.x - me.pos.x, dz = q.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
    return [{ mx: dx / l, mz: dz / l, grab: false, turn: 0, right: false }, { mx: 0, mz: 0, grab: false, turn: 0, right: false }];`;
  for (let i = 0; i < 6 * 30; i += 3) {
    await p.evaluate((c) => window.__mudanza.advance(3, 30, c), RUN);
    const st = await state();
    if (st.phase !== 'playing') break;
  }
  await p.evaluate((c) => window.__mudanza.advance(8, 30, c), RUN);
  await shot('3-lampara-arrollada', await state());

  // --- 4: el saboteador retiene la caja dentro del camión ---
  await open({ humans: 3, carriers: 3 });
  await p.evaluate(() => {
    const g = window.__mudanza.game;
    const rest = { mesa: 0.45, caja: 0.25, lampara: 0.48, silla: 0.43, nevera: 0.43, piano: 0.35 };
    for (const it of g.items) {
      const route = g.level.items[it.index].route, last = route[route.length - 1];
      if (it.required) it.body.setTranslation({ x: last.x, y: 1.06 + rest[it.def.id], z: last.z }, true);
      else it.body.setTranslation({ x: -12 + it.index * 1.5, y: rest[it.def.id] + 0.02, z: -8 }, true);
      it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    }
    const caja = g.items.find((it) => it.def.id === 'caja');
    const cp = caja.body.translation();
    const h = caja.def.handles[0];
    g.carriers[0].teleport({ x: cp.x + h.p.x + h.out.x * 0.7, y: 1.74, z: cp.z + h.p.z });
    g.carriers[0].facing = { x: -h.out.x, z: -h.out.z };
    g.carriers[1].teleport({ x: 3, y: 0.74 + 0.25, z: 1.2 });
    g.carriers[2].teleport({ x: 3, y: 0.74 + 0.25, z: -2.6 });
    g.step(1 / 60, []);
    g.step(1 / 60, [{ mx: 0, mz: 0, grab: true, turn: 0, right: false }]);
  });
  await p.evaluate(() => window.__mudanza.setZoom(1.35));
  await p.evaluate(() => window.__mudanza.advance(90, 30, 'return []'));
  await shot('4-retiene-la-caja', { ...(await state()), sabAgarra: await p.evaluate(() => { const g = window.__mudanza.game; return g.carriers[0].heldBody === g.items.find((it) => it.def.id === 'caja').body; }) });

  console.log(errors.length ? `ERRORES: ${errors.join(' | ')}` : 'sin errores de página ni de consola');
  await b.close();
})();
