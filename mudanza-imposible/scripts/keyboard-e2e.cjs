// Prueba de extremo a extremo con teclado real en Chromium: menú → agarrar → mover → girar → alzar → soltar → pausa → reinicio.
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const results = [];
const check = (name, ok, info) => { results.push({ name, ok, info }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name} ${info ?? ''}`); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(url);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.screenshot({ path: 'shots/k00-menu.png' });
  await p.click('#btn-start');
  await p.waitForFunction(() => window.__mudanza.game.phase === 'playing', null, { timeout: 15000 });
  const st = () => p.evaluate(() => { const g = window.__mudanza.game; const me = g.carriers[0]; const s = g.sofaPos; return { me: [me.pos.x, me.pos.z], holding: me.holding, sofa: [s.x, s.y, s.z], yaw: g.sofaYaw, phase: g.phase, t: g.time, screen: window.__mudanza.screen, holders: g.carriers.filter((c) => c.holding).length }; });
  // 1) Caminar hasta el extremo del sofá y agarrarlo
  let s = await st();
  for (let i = 0; i < 60 && !s.holding; i++) {
    const target = await p.evaluate(() => { const g = window.__mudanza.game; const s = g.sofaPos; return [s.x + 1.75, s.z]; });
    const dx = target[0] - s.me[0], dz = target[1] - s.me[1];
    const keys = [];
    if (dx > 0.2) keys.push('KeyD'); if (dx < -0.2) keys.push('KeyA');
    if (dz > 0.2) keys.push('KeyS'); if (dz < -0.2) keys.push('KeyW');
    if (keys.length) { for (const k of keys) await p.keyboard.down(k); await p.waitForTimeout(120); for (const k of keys) await p.keyboard.up(k); }
    else { await p.keyboard.press('Space'); await p.waitForTimeout(150); }
    s = await st();
  }
  check('J1 agarra el sofá con Espacio', s.holding);
  await p.waitForTimeout(1500);
  s = await st();
  check('Los ayudantes agarran asas libres', s.holders >= 3, `manos: ${s.holders}`);
  // 2) Avanzar con W
  const before = s.sofa;
  await p.keyboard.down('KeyW');
  for (let i = 0; i < 5; i++) {
    await p.waitForTimeout(500);
    console.log('   diag', JSON.stringify(await p.evaluate(() => { const g = window.__mudanza.game; return { lead: g.lead, stuck: +g.stuckTime.toFixed(2), sofa: [g.sofaPos.x, g.sofaPos.z].map((v) => +v.toFixed(2)), cs: g.carriers.map((c) => ({ h: c.holding, p: [c.pos.x, c.pos.z].map((v) => +v.toFixed(2)), st: +c.stunned.toFixed(1) })) }; })));
  }
  await p.keyboard.up('KeyW');
  s = await st();
  check('Con W el grupo lleva el sofá hacia la calle', before[2] - s.sofa[2] > 1.5, `Δz = ${(before[2] - s.sofa[2]).toFixed(2)} m`);
  check('El sofá va levantado del suelo', s.sofa[1] > 0.5, `y = ${s.sofa[1].toFixed(2)} m`);
  await p.screenshot({ path: 'shots/k01-cargando.png' });
  // 3) Pedir giro con Q
  const yaw0 = s.yaw;
  await p.keyboard.down('KeyQ'); await p.waitForTimeout(1500); await p.keyboard.up('KeyQ');
  s = await st();
  const dyaw = Math.abs(Math.atan2(Math.sin(s.yaw - yaw0), Math.cos(s.yaw - yaw0)));
  check('Con Q los ayudantes giran el sofá', dyaw > 0.3, `Δyaw = ${dyaw.toFixed(2)} rad`);
  // 4) Alzar con Mayús
  const y0 = s.sofa[1];
  await p.keyboard.down('ShiftLeft'); await p.waitForTimeout(1200);
  s = await st();
  check('Con Mayús se alza el sofá', s.sofa[1] - y0 > 0.2, `Δy = ${(s.sofa[1] - y0).toFixed(2)} m`);
  await p.screenshot({ path: 'shots/k02-alzando.png' });
  await p.keyboard.up('ShiftLeft');
  await p.waitForTimeout(800);
  // 5) Soltar
  await p.keyboard.press('Space'); await p.waitForTimeout(300);
  s = await st();
  check('Espacio suelta el sofá', !s.holding);
  // 6) Pausa con Esc
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const t1 = (await st()).t; await p.waitForTimeout(800); const t2 = (await st()).t;
  const pauseVisible = await p.evaluate(() => document.getElementById('pause').style.display === 'flex');
  check('Esc pausa la partida (el tiempo se detiene)', pauseVisible && Math.abs(t2 - t1) < 0.01);
  await p.screenshot({ path: 'shots/k03-pausa.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  // 7) Reiniciar con Retroceso
  await p.waitForTimeout(1000);
  const tBefore = (await st()).t;
  await p.keyboard.press('Backspace'); await p.waitForTimeout(400);
  s = await st();
  check('Retroceso reinicia la partida', s.phase === 'countdown' && s.t < 0.01 && tBefore > 0.5, `t antes ${tBefore.toFixed(1)}`);
  check('Sin errores en la consola', errors.length === 0, errors.slice(0, 3).join(' | '));
  const fps = await p.evaluate(() => window.__mudanza.fps());
  console.log('FPS (render por software en este contenedor):', fps.toFixed(1));
  await b.close();
  console.log(results.every((r) => r.ok) ? 'TODO OK' : `FALLAN ${results.filter((r) => !r.ok).length}`);
})();
