// COPIA INSTRUMENTADA de scripts/keyboard-e2e.cjs (diagnóstico ciclo 2). Registra la semilla (Math.random en start),
// las entradas por paso, los sucesos de agarre y cada pulsación de Espacio del bucle de agarre; vuelca teclado-instr.json.
// Se detiene tras «Con W» (STOP=0 para seguir).
const fs = require('fs');
// Prueba de extremo a extremo con teclado real en Chromium: menú → agarrar (el sofá se levanta solo entre varios, sin
// tecla de alzar) → mover → girar → soltar → pausa → Retroceso en juego no reinicia; en la pausa, sí.
// Uso: NODE_PATH=$(npm root -g) node scripts/keyboard-e2e.cjs [url]   (demo servida en :4173)
// Escenario: 1 jugador y 3 ayudantes. Los parámetros que ya traiga la url (p. ej. `?carriers=4`) se respetan; los que
// falten se completan (antes se añadía `?humans=1&carriers=4` al final y una url con `?` quedaba mal formada).
// Las esperas se miden en tiempo de juego, como en duo-e2e y two-players-e2e: con render por software y la máquina
// cargada, un fotograma puede durar 0,3 s y el juego avanza como mucho 5 pasos (0,083 s) por fotograma, así que 2,5 s
// de reloj podían ser 0,7 s de juego. Sale con código 1 si falla alguna comprobación.
const { chromium } = require('playwright');
const url = new URL(process.argv[2] || 'http://localhost:4173/');
for (const [k, v] of [['humans', '1'], ['carriers', '4']]) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
const results = [];
const check = (name, ok, info) => { results.push({ name, ok, info }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name} ${info ?? ''}`); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Escenario de 1 jugador con 3 ayudantes (el menú propone ahora 2 jugadores sin ayudantes)
  console.log('url:', url.href);
  await p.addInitScript(() => { const R = Math.random; window.__rnd = []; Math.random = () => { const v = R(); if (window.__recRnd) window.__rnd.push(v); return v; }; });
  await p.goto(url.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.screenshot({ path: 'shots/k00-menu.png' });
  await p.evaluate(() => { window.__recRnd = true; });
  await p.click('#btn-start');
  await p.evaluate(() => {
    window.__recRnd = false;
    const g = window.__mudanza.game; window.__in = []; window.__ev = []; window.__fr = [];
    window.__at = { countdown: g.countdown, phase: g.phase, t: g.time, seedRnd: window.__rnd.slice(0, 5) };
    const orig = g.step.bind(g); let lastW = -1;
    g.step = (dt, inputs) => {
      const w = performance.now(); if (w - lastW > 4) window.__fr.push([window.__in.length, +w.toFixed(1)]); lastW = w;
      window.__in.push(inputs.map((x) => [x.mx, x.mz, x.grab ? 1 : 0, x.turn, x.right ? 1 : 0]));
      orig(dt, inputs);
      for (const e of g.out) if (['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)) window.__ev.push(`${window.__in.length} ${g.time.toFixed(2)} ${e.type} ${e.carrier}`);
    };
  });
  const presses = [];
  const dump = async (tag) => { const d = await p.evaluate(() => ({ at: window.__at, inputs: window.__in, ev: window.__ev, frames: window.__fr })); fs.writeFileSync('teclado-instr.json', JSON.stringify({ url: url.href, tag, presses, ...d })); };
  const st = () => p.evaluate(() => { const g = window.__mudanza.game; const me = g.carriers[0]; const s = g.sofaPos; return { me: [me.pos.x, me.pos.z], holding: me.holding, sofa: [s.x, s.y, s.z], yaw: g.sofaYaw, phase: g.phase, t: g.time, screen: window.__mudanza.screen, holders: g.carriers.filter((c) => c.holding).length, humans: g.carriers.filter((c) => c.human !== null).length, n: g.carriers.length }; });
  /** Mantiene teclas durante `sec` segundos de tiempo de juego (con la partida en marcha); `each(t)` mientras tanto. */
  async function hold(keys, sec, each) {
    const t0 = (await st()).t;
    for (const k of keys) await p.keyboard.down(k);
    for (let t = 0; t < sec; t = (await st()).t - t0) { if (each) await each(t); await p.waitForTimeout(50); }
    for (const k of keys) await p.keyboard.up(k);
  }
  // Altura del sofá en reposo: al final de la cuenta atrás, cuando nadie puede agarrar todavía
  await p.waitForFunction(() => window.__mudanza.game.phase === 'countdown' && window.__mudanza.game.countdown < 0.6, null, { timeout: 15000 });
  const rest = await st();
  check('Partida de 1 jugador con 3 ayudantes', rest.humans === 1 && rest.n === 4, `${rest.humans} jugador(es), ${rest.n} porteadores`);
  await p.waitForFunction(() => window.__mudanza.game.phase === 'playing', null, { timeout: 15000 });
  // 1) Caminar hasta el extremo del sofá y agarrarlo
  let s = await st();
  for (let i = 0; i < 60 && !s.holding; i++) {
    const target = await p.evaluate(() => { const g = window.__mudanza.game; const s = g.sofaPos; return [s.x + 1.75, s.z]; });
    const dx = target[0] - s.me[0], dz = target[1] - s.me[1];
    const keys = [];
    if (dx > 0.2) keys.push('KeyD'); if (dx < -0.2) keys.push('KeyA');
    if (dz > 0.2) keys.push('KeyS'); if (dz < -0.2) keys.push('KeyW');
    if (keys.length) { for (const k of keys) await p.keyboard.down(k); await p.waitForTimeout(120); for (const k of keys) await p.keyboard.up(k); }
    else { const a = await p.evaluate(() => [window.__in.length, window.__mudanza.game.time]); await p.keyboard.press('Space'); await p.waitForTimeout(150); const b2 = await p.evaluate(() => [window.__in.length, window.__mudanza.game.time, window.__mudanza.game.carriers[0].holding]); presses.push({ i, antes: a, despues: b2 }); console.log('   ESPACIO', i, JSON.stringify(a), '->', JSON.stringify(b2)); }
    s = await st();
  }
  check('J1 agarra el sofá con Espacio', s.holding);
  console.log('   EV tras agarrar', JSON.stringify(await p.evaluate(() => window.__ev)));
  await hold([], 1.5);
  s = await st();
  check('Los ayudantes agarran asas libres', s.holders >= 3, `manos: ${s.holders}`);
  // Sin tecla de alzar: al agarrar entre varios, las manos suben solas a la altura de carga (antes, Mayús). Sustituye a
  // la comprobación «Con Mayús se alza el sofá», con el mismo umbral (más de 0,2 m), medido desde el reposo
  check('Al agarrar entre varios, el sofá se levanta solo (sin tecla de alzar)', s.holders >= 2 && s.sofa[1] - rest.sofa[1] > 0.2,
    `Δy = ${(s.sofa[1] - rest.sofa[1]).toFixed(2)} m (de ${rest.sofa[1].toFixed(2)} a ${s.sofa[1].toFixed(2)} m), manos: ${s.holders}`);
  await p.screenshot({ path: 'shots/k02-alzado-solo.png' });
  // 2) Avanzar con W (2,5 s de juego), desde el estado de justo ahora (la captura de pantalla también gasta tiempo de juego)
  s = await st();
  const before = s.sofa, real0 = Date.now(), game0 = s.t;
  let nextDiag = 0.5;
  await hold(['KeyW'], 2.5, async (t) => {
    if (t < nextDiag) return;
    nextDiag += 0.5;
    console.log('   diag', JSON.stringify(await p.evaluate(() => { const g = window.__mudanza.game; return { t: +g.time.toFixed(2), lead: g.lead, stuck: +g.stuckTime.toFixed(2), sofa: [g.sofaPos.x, g.sofaPos.z].map((v) => +v.toFixed(2)), cs: g.carriers.map((c) => ({ h: c.holding, p: [c.pos.x, c.pos.z].map((v) => +v.toFixed(2)), st: +c.stunned.toFixed(1) })) }; })));
  });
  s = await st();
  const pace = (s.t - game0) / ((Date.now() - real0) / 1000);
  console.log('   EV', JSON.stringify(await p.evaluate(() => window.__ev)));
  await dump('conW');
  check('Con W el grupo lleva el sofá hacia la calle', before[2] - s.sofa[2] > 1.5, `Δz = ${(before[2] - s.sofa[2]).toFixed(2)} m en ${(s.t - game0).toFixed(2)} s de juego`);
  if (process.env.STOP !== '0') { await b.close(); const failed = results.filter((r) => !r.ok).length; console.log(failed ? `FALLAN ${failed} (parada tras Con W)` : 'TODO OK (parada tras Con W)'); process.exit(failed ? 1 : 0); }
  check('El sofá va levantado del suelo', s.sofa[1] > 0.5, `y = ${s.sofa[1].toFixed(2)} m`);
  await p.screenshot({ path: 'shots/k01-cargando.png' });
  // 3) Pedir giro con Q
  const yaw0 = s.yaw;
  await hold(['KeyQ'], 1.5);
  s = await st();
  const dyaw = Math.abs(Math.atan2(Math.sin(s.yaw - yaw0), Math.cos(s.yaw - yaw0)));
  check('Con Q los ayudantes giran el sofá', dyaw > 0.3, `Δyaw = ${dyaw.toFixed(2)} rad en 1,5 s de juego`);
  await hold([], 0.8);
  // 4) Soltar
  await p.keyboard.press('Space'); await hold([], 0.2);
  s = await st();
  check('Espacio suelta el sofá', !s.holding);
  // 5) Pausa con Esc
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const t1 = (await st()).t; await p.waitForTimeout(800); const t2 = (await st()).t;
  const pauseVisible = await p.evaluate(() => document.getElementById('pause').style.display === 'flex');
  check('Esc pausa la partida (el tiempo se detiene)', pauseVisible && Math.abs(t2 - t1) < 0.01);
  await p.screenshot({ path: 'shots/k03-pausa.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  // 6) Retroceso: en juego no reinicia (está encima de Intro, la tecla de agarrar de J2); en la pausa, sí
  await p.waitForTimeout(1000);
  const tBefore = (await st()).t;
  await p.keyboard.press('Backspace'); await hold([], 0.3);
  s = await st();
  check('Retroceso en juego no reinicia', s.phase === 'playing' && s.t > tBefore, `t ${tBefore.toFixed(2)} → ${s.t.toFixed(2)}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.keyboard.press('Backspace'); await p.waitForTimeout(400);
  s = await st();
  check('En la pausa, Retroceso reinicia la partida', s.phase === 'countdown' && s.t < 0.01 && tBefore > 0.5, `t antes ${tBefore.toFixed(1)}`);
  check('Sin errores en la consola', errors.length === 0, errors.slice(0, 3).join(' | '));
  const fps = await p.evaluate(() => window.__mudanza.fps());
  // La cifra de FPS no baja de 10 (cada fotograma cuenta como mucho 0,1 s); el ritmo del juego dice cuánto avanzó de verdad
  console.log('FPS (render por software en este contenedor):', fps.toFixed(1), `· ritmo del juego al llevar el sofá: ${pace.toFixed(2)} s de juego por s de reloj`);
  await b.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `FALLAN ${failed}` : 'TODO OK');
  process.exit(failed ? 1 : 0);
})();
