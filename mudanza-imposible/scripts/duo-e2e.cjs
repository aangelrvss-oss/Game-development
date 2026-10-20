// Partida a dos en Chromium, de principio a fin. Con la demo servida en :4173:
//   NODE_PATH=$(npm root -g) node scripts/duo-e2e.cjs
// Parte A (modo normal, teclas reales de Playwright, que entran por el mismo teclado que un jugador):
//   menú → Intro → los dos se mueven a la vez → agarran a la vez → tiran juntos, en sentidos opuestos
//   y uno solo → soltar tirando (se tambalea y cae) → se recupera y vuelve a agarrar → pared → Retroceso (en juego
//   no reinicia; en la pausa, sí).
// Parte B (modo captura, misma física y dibujo): el piloto automático lleva a J1 y a J2 hasta el camión;
//   victoria, pantalla de resultados e Intro real para volver a jugar.
// Los tiempos se miden en tiempo de juego: con render por software el navegador va lento.
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://localhost:4173/';
/** La url con estos parámetros añadidos o cambiados (la url puede traer ya los suyos). */
const withParams = (u, q) => { const x = new URL(u); for (const [k, v] of Object.entries(q)) x.searchParams.set(k, v); return x.href; };
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
      t: g.time, helpers: g.bots.size, phase: g.phase, sofa: [g.sofaPos.x, g.sofaPos.y, g.sofaPos.z], yaw: g.sofaYaw,
      cs: g.carriers.map((c) => ({ h: c.holding, gl: c.grabLocal, x: c.pos.x, z: c.pos.z, wob: c.wobbling, stun: c.stunned, knock: c.knock, down: c.down, human: c.human, nw: c.wobbles, nf: c.falls })),
      solo: g.soloDrag,
      warn: document.getElementById('h-warn').textContent,
    };
  });
  // Diagnóstico: registra los sucesos de agarre de cada paso de física (agarra, suelta, se le escapa)
  await p.evaluate(([riseTime, fitTol]) => {
    const g = window.__mudanza.game; window.__ev = [];
    const orig = g.step.bind(g);
    /**
     * ¿Cabe de pie donde está y en todo el giro desde el suelo? Lo mide la prueba por su cuenta, con datos públicos
     * del porteador (posición, dirección e inclinación de la caída) y consultas de forma contra el mundo: la cápsula,
     * menos el margen de las pruebas, de pie y a 0,35 y 0,7 de su inclinación (la regla de «levantarse cuando hay
     * sitio»). Antes la prueba aceptaba la espera que el propio juego decía haber hecho (un campo privado).
     */
    const roomToStand = (c) => {
      const sh = c.collider.shape, probe = new sh.constructor(sh.halfHeight, sh.radius - fitTol), p = c.pos, d = c.fallDir;
      for (const k of [0.7, 0.35, 0]) {
        const a = c.tilt * k, h = Math.sin(a / 2), s = Math.sin(a) * sh.halfHeight;
        const at = { x: p.x + d.x * s, y: p.y + (Math.cos(a) - 1) * sh.halfHeight, z: p.z + d.z * s };
        let hit = false;
        g.world.intersectionsWithShape(at, { x: d.z * h, y: 0, z: -d.x * h, w: Math.cos(a / 2) }, probe, () => { hit = true; return false; }, undefined, undefined, c.collider);
        if (hit) return false;
      }
      return true;
    };
    // También cuándo se levanta cada uno del suelo y cuánto esperó tumbado sin sitio para ponerse de pie (según la prueba)
    const down = g.carriers.map((c) => c.stunned > 0), blocked = g.carriers.map(() => 0);
    g.step = (dt, inputs) => {
      orig(dt, inputs);
      for (const e of g.out) if (['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)) window.__ev.push(`${g.time.toFixed(2)} ${e.type} J${e.carrier + 1}`);
      g.carriers.forEach((c, i) => {
        // Tumbado con el tiempo en el suelo cumplido (le toca levantarse) y sin sitio para hacerlo
        if (c.down === 'lying' && c.stunned <= riseTime + 1e-6 && !roomToStand(c)) blocked[i] += dt;
        if (down[i] && c.stunned <= 0) { window.__ev.push(`${g.time.toFixed(2)} up J${i + 1} ${blocked[i].toFixed(2)}`); blocked[i] = 0; }
        down[i] = c.stunned > 0;
      });
    };
  }, [0.6, 0.03]); // `CARRIER.riseTime` y `CARRIER.fitTol` de carrier.ts
  const evSince = async (t) => (await p.evaluate(() => window.__ev)).filter((e) => parseFloat(e) >= t - 1e-6).join(', ');
  let s = await st();
  ok(s.helpers === 0 && s.cs.length === 2 && s.cs.every((c) => c.human !== null), 'partida a dos, sin ayudantes');
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
  await hold(['KeyS'], 2.5, async (n) => { maxSolo = Math.max(maxSolo, n.solo); if (/Pesa mucho/.test(n.warn)) sawSolo = true; });
  s = await st();
  const solo = Math.hypot(s.sofa[0] - ph.sofa[0], s.sofa[2] - z0);
  ok(solo < together * 0.5, 'uno solo lo arrastra a menos de la mitad de velocidad', `${solo.toFixed(2)} m en 2,5 s (juntos: ${together.toFixed(2)} m en 2,5 s) ${bal(ph, s)}`);
  ok(sawSolo, 'aviso en pantalla: «Pesa mucho: falta alguien en el otro extremo»', `(contador ${maxSolo.toFixed(2)} s; sucesos: ${await evSince(tSolo)})`);
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

  // 5. Se levanta solo y vuelve a agarrar.
  // Desde el ciclo 1 (paso 3) la caída es física: a los 1,3 s en el suelo (`CARRIER.fallTime`) se levanta si cabe de pie;
  // si no, espera tumbado y se aparta a rastras hasta que cabe (como mucho `CARRIER.maxWaitRoom`, 4 s; después se
  // levanta igualmente). Antes se miraba un solo instante, 1,5 s después de la ventana, sin dejar rastro: en la línea
  // base falló así una vez y no se ha podido reproducir (ver el commit). Ahora se espera, sin pulsar nada, como mucho lo
  // que permiten esas reglas y se mide con el registro de pasos: cuánto estuvo en el suelo, si esperó a tener sitio y
  // si se volvió a caer al levantarse. El límite es el estricto (`fallTime` + 0,05 s) más solo el tiempo que la propia
  // prueba ha comprobado, con sus consultas de forma, que no cabía de pie (`roomToStand`).
  // `CARRIER.fallTime`, `stunTime` (derribado: atropello o golpe fuerte), `maxWaitRoom` y `riseTime` de carrier.ts
  const FALL_TIME = 1.3, STUN_TIME = 1.8, MAX_WAIT_ROOM = 4, RISE_TIME = 0.6;
  const evJ2 = async () => (await p.evaluate(() => window.__ev)).filter((e) => parseFloat(e) >= t1 - 1e-6 && / J2/.test(e)).map((e) => { const [t, type, , w] = e.split(' '); return { t: parseFloat(t), type, w: w === undefined ? 0 : parseFloat(w) }; });
  const fallEv = (await evJ2()).find((e) => e.type === 'fall' || e.type === 'stun');
  if (!fallEv) ok(true, 'J2 se levanta solo', '(no llegó a caer)');
  else {
    const base = fallEv.type === 'stun' ? STUN_TIME : FALL_TIME;
    let up = null;
    for (;;) {
      await hold([], 0.2);
      up = (await evJ2()).find((e) => e.type === 'up' && e.t > fallEv.t);
      if (up || (await st()).t > fallEv.t + base + MAX_WAIT_ROOM + RISE_TIME + 0.5) break;
    }
    // Medio segundo más: ¿se vuelve a caer nada más levantarse?
    if (up) await hold([], 0.5);
    const after = (await evJ2()).filter((e) => (e.type === 'fall' || e.type === 'stun') && up && e.t >= up.t);
    const onFloor = up ? up.t - fallEv.t : null;
    const riseOk = up !== null && onFloor <= base + Math.min(up.w, MAX_WAIT_ROOM) + 0.05;
    s = await st();
    ok(riseOk && after.length === 0, 'J2 se levanta solo',
      (up ? `en el suelo ${onFloor.toFixed(2)} s${up.w > 0 ? `, de ellos ${up.w.toFixed(2)} sin sitio para ponerse de pie (medido por la prueba)` : ''}${after.length ? `; se vuelve a caer a los ${(after[0].t - up.t).toFixed(2)} s de levantarse` : ''}`
        : `(sigue en el suelo ${(s.t - fallEv.t).toFixed(2)} s después de caer)`)
      + (riseOk && !after.length ? '' : ` (sucesos desde que suelta: ${await evSince(t1)}; J2 ${s.cs[1].down ?? 'de pie'} en (${s.cs[1].x.toFixed(2)}, ${s.cs[1].z.toFixed(2)}); sofá (${s.sofa[0].toFixed(2)}, ${s.sofa[2].toFixed(2)}) yaw ${s.yaw.toFixed(2)}; J1 (${s.cs[0].x.toFixed(2)}, ${s.cs[0].z.toFixed(2)}))`));
  }
  ok(await grabBoth(), 'tras levantarse, J2 vuelve a agarrar');

  // 6. Chocar con una pared (J1 suelta y corre hacia el este hasta la valla): frena, no se cae.
  // Soltar con el sofá en tensión puede hacer tambalearse (es la mecánica): se deja pasar 1 s antes de correr,
  // para que la comprobación sea solo la del choque con la valla
  await p.keyboard.press('Space');
  let releaseWob = false;
  await hold([], 1.0, async (n) => { if (n.cs[0].wob || n.cs[0].stun > 0) releaseWob = true; });
  for (let i = 0; i < 60 && ((await st()).cs[0].wob || (await st()).cs[0].stun > 0); i++) await p.waitForTimeout(100);
  // Corre hacia el lado contrario al sofá (para que el sofá no le corte el paso) hasta que algo fijo le para: la
  // valla del patio (x ±7,8), el seto junto a la salida (desde x ±8,2, z 3,6–4,4), un objeto fijo de decoración (la
  // carretilla de (-6,3, 5,3), el cartel de (-5,0, 4,7)…) o, en la acera, el límite de la calle (x ±18). Antes solo
  // valían la valla, el seto y el límite por su posición, y J1 parado contra la carretilla contaba como fallo. Ahora
  // decide el propio juego: choque de lado contra algo fijo (`touchesWall`, lo mismo que usa el equilibrio para que
  // una pared frene y no tumbe). Si se para sin tocar nada fijo, la prueba no vale y se anota qué tenía cerca.
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
  // Con la tecla aún pulsada: ¿contra qué fijo empuja? (centro de su caja de choque)
  const wall = await p.evaluate(() => {
    const g = window.__mudanza.game, c = g.carriers[0];
    if (!g.touchesWall(c)) return null;
    let at = null;
    g.world.contactPairsWith(c.collider, (o) => { if (!at && o.parent()?.isFixed() && o.translation().y > 0) { const t = o.translation(); at = [t.x, t.z]; } });
    return at ?? [NaN, NaN];
  });
  await p.keyboard.up(runKey);
  s = await st();
  const wx = s.cs[0].x, wz = s.cs[0].z;
  const near = `sofá (${s.sofa[0].toFixed(2)}, ${s.sofa[2].toFixed(2)}), J2 (${s.cs[1].x.toFixed(2)}, ${s.cs[1].z.toFixed(2)})`;
  ok(free && wall && !wallFall, 'correr contra la pared frena sin tumbar',
    `J1 corre con ${runKey} y se para en x=${wx.toFixed(2)}, z=${wz.toFixed(2)}${wall ? `, contra lo fijo de (${wall[0].toFixed(2)}, ${wall[1].toFixed(2)})` : ''}${free ? '' : ' (J1 seguía agarrado)'}${wall ? '' : ` (no llegó a nada fijo; ${near})`}${releaseWob ? ' (al soltar antes de correr se tambaleó: tensión del sofá)' : ''}`);

  // 7. Retroceso: en juego no reinicia (en el teclado español está encima de Intro, la tecla de agarrar de J2: un
  // manotazo tiraba la partida); en la pausa, sí
  const tBack = (await st()).t;
  await p.keyboard.press('Backspace');
  await hold([], 0.3);
  s = await st();
  ok(s.phase === 'playing' && s.t > tBack, 'Retroceso en juego no reinicia la partida', `t ${tBack.toFixed(2)} → ${s.t.toFixed(2)}`);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => document.getElementById('pause').style.display === 'flex', null, { timeout: 10000 });
  await p.keyboard.press('Backspace');
  await p.waitForFunction(() => window.__mudanza.game.phase === 'countdown' && window.__mudanza.game.time === 0, null, { timeout: 10000 });
  s = await st();
  ok(s.cs.every((c) => !c.h) && Math.abs(s.sofa[2] - 10) < 0.3, 'en la pausa, Retroceso reinicia la partida (sofá en la salida, nadie agarra)');

  // ---------- Parte B: partida completa hasta el camión ----------
  await p.goto(withParams(url, { capture: '1' }));
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
