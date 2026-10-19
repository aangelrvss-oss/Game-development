// Partida a dos en Chromium, de principio a fin. Con la demo servida en :4173:
//   NODE_PATH=$(npm root -g) node scripts/duo-e2e.cjs
// Parte A (modo normal, teclas reales de Playwright, que entran por el mismo teclado que un jugador):
//   menú → Intro → los dos se mueven a la vez → agarran a la vez → tiran juntos, en sentidos opuestos
//   y uno solo → soltar tirando (se tambalea y cae) → se recupera y vuelve a agarrar → pared → Retroceso.
// Parte B (modo captura, misma física y dibujo): el piloto automático lleva a J1 y a J2 hasta el camión;
//   victoria, pantalla de resultados e Intro real para volver a jugar.
// Los tiempos se miden en tiempo de juego: con render por software el navegador va lento.
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://localhost:4173/';
let fails = 0;
const ok = (cond, msg, extra = '') => { if (!cond) fails++; console.log(cond ? 'OK   ' : 'FALLA', msg, extra); };
/** Tambaleos y caídas de cada jugador entre dos estados (diagnóstico). */
const bal = (a, b) => `[tambaleos J1 ${b.cs[0].nw - a.cs[0].nw}, J2 ${b.cs[1].nw - a.cs[1].nw}; agarran ${b.cs.map((c) => (c.h ? 'sí' : 'no')).join('/')}]`;

(async () => {
  fs.mkdirSync('shots/duo', { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // ---------- Parte A: teclas reales ----------
  await p.goto(url);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  const defaults = await p.evaluate(() => [...document.querySelectorAll('#opt-humans .on, #opt-carriers .on')].map((e) => e.textContent));
  ok(defaults[0] === '2' && defaults[1] === '2', 'el menú propone 2 jugadores y 2 porteadores (sin ayudantes)', JSON.stringify(defaults));
  await p.screenshot({ path: 'shots/duo/a0-menu.png' });
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.game?.phase === 'playing', null, { timeout: 30000 });
  const st = () => p.evaluate(() => {
    const g = window.__mudanza.game;
    return {
      t: g.time, coop: g.coop, phase: g.phase, sofa: [g.sofaPos.x, g.sofaPos.y, g.sofaPos.z], yaw: g.sofaYaw,
      cs: g.carriers.map((c) => ({ h: c.holding, gl: c.grabLocal, x: c.pos.x, z: c.pos.z, wob: c.wobbling, stun: c.stunned, knock: c.knock, human: c.human, nw: c.wobbles, nf: c.falls })),
      solo: g.soloDrag,
      warn: document.getElementById('h-warn').textContent,
    };
  });
  // Diagnóstico: registra los sucesos de agarre de cada paso de física (agarra, suelta, se le escapa)
  await p.evaluate(() => {
    const g = window.__mudanza.game; window.__ev = [];
    const orig = g.step.bind(g);
    g.step = (dt, inputs) => { orig(dt, inputs); for (const e of g.out) if (['grab', 'release', 'gripBreak', 'fall', 'stun'].includes(e.type)) window.__ev.push(`${g.time.toFixed(2)} ${e.type} J${e.carrier + 1}`); };
  });
  const evSince = async (t) => (await p.evaluate(() => window.__ev)).filter((e) => parseFloat(e) >= t - 1e-6).join(', ');
  let s = await st();
  ok(s.coop && s.cs.length === 2 && s.cs.every((c) => c.human !== null), 'partida a dos con física cooperativa');
  /** Mantiene teclas durante `sec` segundos de juego (y llama a `each` mientras tanto). */
  async function hold(keys, sec, each) {
    const t0 = (await st()).t;
    for (const k of keys) await p.keyboard.down(k);
    for (;;) {
      await p.waitForTimeout(60);
      const now = await st();
      if (each) await each(now);
      if (now.t - t0 >= sec) break;
    }
    for (const k of keys) await p.keyboard.up(k);
  }
  /**
   * Espera a que el juego avance al menos 0,1 s (6 pasos de física). Con render por software un fotograma
   * dura más de 100 ms: una pulsación de 90 ms de reloj podía caer entre dos fotogramas y perderse.
   */
  async function tick() {
    const t0 = (await st()).t;
    for (let i = 0; i < 100 && (await st()).t - t0 < 0.1; i++) await p.waitForTimeout(20);
  }
  const keys = [{ l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', g: 'Space' }, { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', g: 'Enter' }];

  // 2. Los dos a la vez: J1 hacia arriba (W) y J2 hacia abajo (flecha abajo)
  const before = s.cs;
  await hold(['KeyW', 'ArrowDown'], 0.4);
  s = await st();
  ok(s.cs[0].z < before[0].z - 0.3 && s.cs[1].z > before[1].z + 0.3, 'los dos se mueven a la vez con teclas distintas',
    `J1 Δz ${(s.cs[0].z - before[0].z).toFixed(2)}, J2 Δz ${(s.cs[1].z - before[1].z).toFixed(2)}`);

  // 3. Cada uno a un extremo del sofá y agarran (pulsando Espacio e Intro a la vez cuando llegan los dos)
  // Si alguien no se acerca a su extremo en ~0,8 s (el sofá le corta el paso en línea recta), rodea el sofá
  // por fuera durante ~0,6 s, como haría una persona. Cada rodeo queda anotado en `detours`.
  const detours = [];
  async function grabBoth() {
    const best = [Infinity, Infinity], stall = [0, 0], detour = [0, 0];
    for (let it = 0; it < 120; it++) {
      s = await st();
      if (s.cs.every((c) => c.h)) return true;
      const down = [];
      let ready = 0;
      for (let i = 0; i < 2; i++) {
        const c = s.cs[i];
        if (c.h || c.stun > 0) { ready++; continue; }
        // Extremo libre del sofá según su orientación real: el contrario al que agarra el otro
        const ax = Math.cos(s.yaw), az = Math.sin(s.yaw), o = s.cs[1 - i];
        let side = o.h && o.gl ? -Math.sign(o.gl.x) : 0;
        if (!side) {
          const near0 = (s.cs[0].x - s.sofa[0]) * ax + (s.cs[0].z - s.sofa[2]) * az >= 0 ? 1 : -1;
          side = i === 0 ? near0 : -near0;
        }
        const tx = s.sofa[0] + ax * 1.75 * side, tz = s.sofa[2] + az * 1.75 * side;
        const dx = tx - c.x, dz = tz - c.z, dist = Math.hypot(dx, dz);
        const k = keys[i];
        if (dist < best[i] - 0.05) { best[i] = dist; stall[i] = 0; } else stall[i]++;
        if (stall[i] >= 8 && !detour[i] && dist > 0.3) {
          detour[i] = 6;
          detours.push(`J${i + 1} bloqueado en (${c.x.toFixed(2)}, ${c.z.toFixed(2)}) hacia (${tx.toFixed(2)}, ${tz.toFixed(2)}); sofá (${s.sofa[0].toFixed(2)}, ${s.sofa[2].toFixed(2)}) yaw ${s.yaw.toFixed(2)}`);
        }
        if (detour[i] > 0) {
          // Perpendicular a la dirección del objetivo, por el lado de fuera del sofá
          let qx = -dz / dist, qz = dx / dist;
          if (qx * (c.x - s.sofa[0]) + qz * (c.z - s.sofa[2]) < 0) { qx = -qx; qz = -qz; }
          if (Math.abs(qx) > 0.3) down.push(qx > 0 ? k.r : k.l);
          if (Math.abs(qz) > 0.3) down.push(qz > 0 ? k.d : k.u);
          if (--detour[i] === 0) { best[i] = Infinity; stall[i] = 0; }
          continue;
        }
        if (Math.abs(dx) > 0.2) down.push(dx > 0 ? k.r : k.l);
        if (Math.abs(dz) > 0.2) down.push(dz > 0 ? k.d : k.u);
        if (Math.abs(dx) <= 0.2 && Math.abs(dz) <= 0.2) ready++;
      }
      if (ready === 2) {
        // A la vez: las dos teclas de agarrar en el mismo fotograma
        const g = s.cs.map((c, i) => (c.h ? null : keys[i].g)).filter(Boolean);
        for (const k of g) await p.keyboard.down(k);
        await tick();
        for (const k of g) await p.keyboard.up(k);
        continue;
      }
      for (const k of down) await p.keyboard.down(k);
      await tick();
      for (const k of down) await p.keyboard.up(k);
    }
    return false;
  }
  ok(await grabBoth(), 'los dos agarran el sofá (Espacio e Intro a la vez)');
  await hold([], 0.8);

  // 4a. Juntos hacia arriba
  s = await st();
  let z0 = s.sofa[2], ph = s;
  // Juntos y solo se miden igual: 2,5 s de juego desde parados (antes se comparaban 1,5 s juntos, aún
  // acelerando, con 2,5 s solo)
  await hold(['KeyW', 'ArrowUp'], 2.5);
  s = await st();
  const together = z0 - s.sofa[2];
  ok(together > 2.5, 'tirando juntos hacia arriba, el sofá avanza', `${together.toFixed(2)} m en 2,5 s ${bal(ph, s)}`);
  await p.screenshot({ path: 'shots/duo/a1-juntos.png' });

  // 4b. Uno solo: J2 suelta; J1 tira (de vuelta hacia el patio) y lo arrastra mucho más despacio; aparece el aviso
  await p.keyboard.press('Enter');
  await hold([], 0.6);
  s = await st();
  z0 = s.sofa[2]; ph = s;
  const tSolo = (await st()).t - 0.7;
  let sawSolo = false, maxSolo = 0;
  await hold(['KeyS'], 2.5, async (n) => { maxSolo = Math.max(maxSolo, n.solo); if (/Uno solo/.test(n.warn)) sawSolo = true; });
  s = await st();
  const solo = Math.hypot(s.sofa[0] - ph.sofa[0], s.sofa[2] - z0);
  ok(solo < together * 0.5, 'uno solo lo arrastra a menos de la mitad de velocidad', `${solo.toFixed(2)} m en 2,5 s (juntos: ${together.toFixed(2)} m en 2,5 s) ${bal(ph, s)}`);
  ok(sawSolo, 'aviso en pantalla: «¡Uno solo apenas puede con él!»', `(contador ${maxSolo.toFixed(2)} s; sucesos: ${await evSince(tSolo)})`);
  await p.screenshot({ path: 'shots/duo/a2-uno-solo.png' });

  // 4c. Vuelven a agarrar los dos y tiran en sentidos opuestos, de través al sofá (según su orientación real)
  const tRegrab = (await st()).t;
  const regrabbed = await grabBoth();
  ok(regrabbed, 'J2 vuelve a agarrar', regrabbed ? '' : `(sucesos: ${await evSince(tRegrab)}; sofá ${JSON.stringify(s.sofa.map((v) => +v.toFixed(2)))} yaw ${s.yaw.toFixed(2)}; estado ${JSON.stringify((await st()).cs.map((c) => ({ h: c.h, x: +c.x.toFixed(2), z: +c.z.toFixed(2), stun: +c.stun.toFixed(2), wob: c.wob })))})`);
  await hold([], 0.5);
  s = await st();
  const yaw0 = s.yaw;
  // Perpendicular al eje largo; cada uno empuja su extremo hacia un lado distinto
  const px = -Math.sin(yaw0), pz = Math.cos(yaw0);
  const keyFor = (i, sx, sz) => (Math.abs(sx) > Math.abs(sz) ? (sx > 0 ? keys[i].r : keys[i].l) : (sz > 0 ? keys[i].d : keys[i].u));
  const twist = [keyFor(0, px, pz), keyFor(1, -px, -pz)];
  if (process.env.DEBUG) console.log('antes del giro', JSON.stringify({ sofa: s.sofa, yaw: s.yaw, cs: s.cs }));
  ph = s;
  await hold(twist, 1.5);
  s = await st();
  const dyaw = Math.abs(Math.atan2(Math.sin(s.yaw - yaw0), Math.cos(s.yaw - yaw0)));
  ok(dyaw > 0.4, 'tirar en sentidos opuestos hace girar el sofá', `${dyaw.toFixed(2)} rad con ${twist.join(' + ')} ${bal(ph, s)}`);
  await p.screenshot({ path: 'shots/duo/a3-giro.png' });

  // 4d. Tiran hacia fuera (cada uno hacia su lado) y J2 suelta sin dejar de tirar: se tambalea y cae
  if (!(await st()).cs.every((c) => c.h)) await grabBoth();
  const out = (await st()).cs.map((c) => c.x > s.sofa[0] ? 1 : -1);
  const outKey = (i) => (out[i] > 0 ? keys[i].r : keys[i].l);
  await hold([outKey(0), outKey(1)], 1.2);
  let wob = false, fell = false, shot = false;
  await p.keyboard.down(outKey(0)); await p.keyboard.down(outKey(1));
  await p.keyboard.press('Enter');
  const t1 = (await st()).t;
  for (;;) {
    const n = await st();
    if (n.cs[1].wob) wob = true;
    if (n.cs[1].stun > 0 && n.cs[1].knock === 'balance') {
      fell = true;
      if (!shot) { shot = true; await p.screenshot({ path: 'shots/duo/a4-cae.png' }); }
    }
    if (n.t - t1 > 1.5) break;
    await p.waitForTimeout(40);
  }
  await p.keyboard.up(outKey(0)); await p.keyboard.up(outKey(1));
  ok(wob && fell, 'soltar mientras tira: J2 se tambalea y cae', `tambaleo ${wob}, caída ${fell}`);

  // 5. Se recupera y vuelve a agarrar
  await hold([], 1.5);
  s = await st();
  ok(s.cs[1].stun === 0, 'J2 se levanta solo');
  ok(await grabBoth(), 'tras levantarse, J2 vuelve a agarrar');

  // 6. Chocar con una pared (J1 suelta y corre hacia el este hasta la valla): frena, no se cae.
  // Soltar con el sofá en tensión puede hacer tambalearse (es la mecánica): se deja pasar 1 s antes de correr,
  // para que la comprobación sea solo la del choque con la valla
  await p.keyboard.press('Space');
  let releaseWob = false;
  await hold([], 1.0, async (n) => { if (n.cs[0].wob || n.cs[0].stun > 0) releaseWob = true; });
  for (let i = 0; i < 60 && ((await st()).cs[0].wob || (await st()).cs[0].stun > 0); i++) await p.waitForTimeout(100);
  // Corre hacia el lado contrario al sofá (para que el sofá no le corte el paso) hasta que algo fijo le para: la
  // valla del patio (x ±7,8), el seto junto a la salida (desde x ±8,2, z 3,6–4,4) o, en la acera, el límite de la
  // calle (x ±18). Si se queda antes, la prueba no vale y se anota qué tenía cerca.
  const s0 = await st();
  const free = !s0.cs[0].h;
  const dir = s0.cs[0].x >= s0.sofa[0] ? 1 : -1;
  const runKey = dir > 0 ? 'KeyD' : 'KeyA';
  let wallFall = false, lastX = null, still = 0;
  const tWall = s0.t;
  await p.keyboard.down(runKey);
  for (;;) {
    await tick();
    const n = await st();
    if (n.cs[0].stun > 0 || n.cs[0].wob) wallFall = true;
    still = lastX !== null && (n.cs[0].x - lastX) * dir < 0.02 ? still + 1 : 0;
    lastX = n.cs[0].x;
    if (still >= 5 || n.t - tWall > 6) break;
  }
  await p.keyboard.up(runKey);
  s = await st();
  const wx = s.cs[0].x, wz = s.cs[0].z, ax = Math.abs(wx);
  const atWall = (wz > 3.3 && wz < 17 && Math.abs(ax - 7.8) < 0.6) || Math.abs(ax - 18) < 0.6;
  const near = `sofá (${s.sofa[0].toFixed(2)}, ${s.sofa[2].toFixed(2)}), J2 (${s.cs[1].x.toFixed(2)}, ${s.cs[1].z.toFixed(2)})`;
  ok(free && atWall && !wallFall, 'correr contra la pared frena sin tumbar',
    `J1 corre con ${runKey} y se para en x=${wx.toFixed(2)}, z=${wz.toFixed(2)}${free ? '' : ' (J1 seguía agarrado)'}${atWall ? '' : ` (no llegó a una pared; ${near})`}${releaseWob ? ' (al soltar antes de correr se tambaleó: tensión del sofá)' : ''}`);

  // 7. Reiniciar con Retroceso
  await p.keyboard.press('Backspace');
  await p.waitForFunction(() => window.__mudanza.game.phase === 'countdown' && window.__mudanza.game.time === 0, null, { timeout: 10000 });
  s = await st();
  ok(s.cs.every((c) => !c.h) && Math.abs(s.sofa[2] - 10) < 0.3, 'Retroceso reinicia la partida (sofá en la salida, nadie agarra)');

  // ---------- Parte B: partida completa hasta el camión ----------
  await p.goto(url + '?capture=1');
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.evaluate(() => window.__mudanza.start(false));
  let res;
  for (let i = 0; i < 400; i++) {
    res = await p.evaluate(() => {
      const m = window.__mudanza;
      m.advance(15, 30, 'return window.__mudanza.autoInputs(g)');
      const g = m.game, v = g.sofa.linvel(), sp = g.sofaPos;
      return { screen: m.screen, phase: g.phase, t: g.time, integ: g.integrity, stage: g.stageLabel, nan: [sp.x, sp.y, sp.z, v.x, v.y, v.z].some((x) => !Number.isFinite(x)), speed: Math.hypot(v.x, v.y, v.z) };
    });
    if (res.nan || res.screen === 'results') break;
  }
  ok(!res.nan, 'sin valores no numéricos en la física durante toda la partida');
  ok(res.phase === 'won', 'el sofá llega al camión: victoria', `${res.t.toFixed(1)} s, sofá ${Math.round(res.integ)} %, etapa ${res.stage}`);
  ok(res.screen === 'results', 'aparece la pantalla de resultados');
  const title = await p.evaluate(() => document.getElementById('r-title').textContent);
  ok(/entregado/i.test(title), 'el título de resultados anuncia la entrega', `«${title}»`);
  await p.screenshot({ path: 'shots/duo/b1-resultados.png' });
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.screen === 'play', null, { timeout: 10000 });
  const again = await p.evaluate(() => ({ phase: window.__mudanza.game.phase, t: window.__mudanza.game.time, z: window.__mudanza.game.sofaPos.z }));
  ok(again.phase === 'countdown' && again.t === 0 && Math.abs(again.z - 10) < 0.3, 'Intro en resultados empieza otra partida desde cero');

  const real = errors.filter((e) => !/deprecated parameters/.test(e));
  ok(real.length === 0, 'sin errores de página ni de consola', real.slice(0, 3).join(' | '));
  if (detours.length) console.log(`Rodeos del piloto de prueba al agarrar: ${detours.length}\n  ${detours.join("\n  ")}`);
  console.log(fails ? `${fails} comprobaciones fallidas` : 'Todas las comprobaciones pasan');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
