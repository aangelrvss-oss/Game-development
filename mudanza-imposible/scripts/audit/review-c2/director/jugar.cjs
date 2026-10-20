// Revisión independiente del ciclo 2, rol director de juego y UX: partidas en Chromium con TECLADO SIMULADO
// (page.keyboard: keydown/keyup reales que pasan por InputManager), no con el atajo de guion de `advance`.
//
// Cómo «juega»:
// - Fase de novato (mi propia lógica, guiada por lo que dice la pantalla): empieza con Intro, como dice el botón del
//   menú; cada jugador anda con sus 4 teclas (8 direcciones) hacia el mueble más cercano; J2 pulsa agarrar una vez
//   demasiado lejos (error típico); después agarra de cerca.
// - Llevar el objeto: la INTENCIÓN de dirección la da el piloto del juego (`autoInputs`), pero se ejecuta como una
//   persona: solo 8 direcciones de teclado, 0,2 s de retraso de reacción, dudas (soltar las teclas 0,4 s) y errores
//   (una dirección equivocada 0,3 s) aleatorios con semilla. NO es un humano real.
// - Final de «La calle»: al llegar dentro del camión, si el piloto quiere soltar, el «novato» NO suelta (nada en el HUD
//   le dice que lo haga) y espera NOVATO_ESPERA s registrando los avisos; luego prueba a pulsar agarrar (= soltar).
// Registra cada 0,1 s de juego: avisos (#h-warn), lista (#h-load), quién agarra, si algún jugador sale de la pantalla
// (proyección con la cámara de juego) y los sucesos de la simulación.
// Uso: NODE_PATH=$(npm root -g) node jugar.cjs <calle2|patio2|cuatro|patio-solo-mesa> [url] [semilla]
const { chromium } = require('playwright');
const fs = require('fs');
const scen = process.argv[2] || 'calle2';
const base = process.argv[3] || 'http://localhost:4191/';
const seed0 = +(process.argv[4] || 7);
const OUT = '/tmp/claude-0/review-c2/director';
const NOVATO_ESPERA = +(process.env.NOVATO_ESPERA || 8);
const SHOTS = (process.env.SHOTS || '').split(',').filter(Boolean); // nombres de capturas clave que se guardan
fs.mkdirSync(`${OUT}/clave`, { recursive: true });
fs.mkdirSync(`${OUT}/trabajo`, { recursive: true });

const CFG = {
  calle2: { q: { humans: 2, carriers: 2 }, max: 180 },
  patio2: { q: { nivel: 'pruebas', humans: 2, carriers: 2 }, max: 240 },
  cuatro: { q: { nivel: 'pruebas', humans: 4, carriers: 4 }, max: 240 },
  'cuatro-calle': { q: { humans: 4, carriers: 4 }, max: 180 },
  'patio-choque': { q: { nivel: 'pruebas', humans: 2, carriers: 2 }, max: 20 },
}[scen];
const KEYS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', grab: 'Space', fix: 'KeyR', ccw: 'KeyQ', cw: 'KeyE' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', grab: 'Enter', fix: 'Slash', ccw: 'Comma', cw: 'Period' },
  { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', grab: 'KeyU', fix: 'KeyO', ccw: 'KeyH', cw: 'Semicolon' },
  { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', grab: 'Numpad0', fix: 'NumpadAdd', ccw: 'Numpad7', cw: 'Numpad9' },
];
let rs = seed0 >>> 0;
const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);

(async () => {
  const url = new URL(base);
  for (const [k, v] of Object.entries({ ...CFG.q, capture: 1 })) url.searchParams.set(k, String(v));
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(url.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  const menu = await p.evaluate(() => ({ sub: document.getElementById('menu-sub').innerText, notes: [...document.querySelectorAll('#menu .note')].map((n) => n.innerText) }));
  console.log('MENÚ:', JSON.stringify(menu));
  const shot = async (name, info) => {
    const keep = SHOTS.includes(name);
    const file = `${OUT}/${keep ? 'clave' : 'trabajo'}/${scen}-${name}.jpg`;
    await p.screenshot({ path: file, type: 'jpeg', quality: 80 });
    console.log(`CAPTURA ${file} ${JSON.stringify(info ?? {})}`);
  };
  // Persona: empieza con Intro (el botón dice «¡A mover! (Intro o A)»)
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.screen === 'play');
  // Sucesos de la simulación (sin tocar el juego: se envuelve el `step` de esta instancia)
  await p.evaluate(() => {
    const g = window.__mudanza.game; const st = g.step.bind(g); window.__ev = [];
    g.step = (dt, inp) => { st(dt, inp); for (const e of g.out) window.__ev.push({ t: +g.time.toFixed(2), type: e.type, carrier: e.carrier, item: e.item }); };
    window.__pilots = null;
  });
  const n = CFG.q.humans;
  const state = () => p.evaluate((n) => {
    const m = window.__mudanza, g = m.game, cam = m.view.camera;
    const W = innerWidth, H = innerHeight;
    const proj = (v) => { const V = cam.position.clone(); V.set(v.x, v.y + 0.8, v.z); V.project(cam); return [(V.x + 1) / 2 * W, (1 - V.y) / 2 * H, V.z]; };
    const hum = g.carriers.filter((c) => c.human !== null).sort((a, b) => a.human - b.human);
    const rot = (q, v) => { const { x, y, z, w } = q; const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z; return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x }; };
    const items = g.items.map((it) => {
      const t = it.body.translation(), q = it.body.rotation();
      const handles = it.def.handles.map((h) => { const a = rot(q, h.p), o = rot(q, h.out); return { x: t.x + a.x, z: t.z + a.z, ox: o.x, oz: o.z }; });
      return { id: it.def.id, st: it.state, x: t.x, y: t.y, z: t.z, req: it.required, inHold: it.inHold, minCarriers: it.def.minCarriers, handles, holders: g.carriers.filter((c) => c.heldBody === it.body).length };
    });
    return {
      t: g.time, phase: g.phase, cd: g.countdown, screen: m.screen,
      warn: document.getElementById('h-warn').style.display === 'block' ? document.getElementById('h-warn').innerText : '',
      load: document.getElementById('h-load').innerText.replace(/\n+/g, ' · '),
      stage: g.stageLabel, integ: Math.round(g.integrity),
      hum: hum.map((c) => ({ x: c.pos.x, z: c.pos.z, hold: c.holding, held: c.heldBody ? g.items.findIndex((it) => it.body === c.heldBody) : -1, stun: c.stunned > 0, down: !!c.down, scr: proj(c.pos) })),
      items, main: g.items.indexOf(g.sofaItem),
      results: document.getElementById('results').style.display === 'flex' ? document.getElementById('r-title').innerText + ' | ' + document.getElementById('r-grid').innerText.replace(/\n+/g, ' ') : '',
    };
  }, n);
  // Intención del piloto (6 llamadas por tick de 0,1 s, para que sus relojes internos avancen como en 6 pasos)
  const intent = () => p.evaluate(() => {
    if (window.__mudanza.game.phase !== 'playing') return [];
    const m = window.__mudanza, g = m.game; let acc = null;
    for (let i = 0; i < 6; i++) {
      const r = m.autoInputs(g);
      if (!acc) acc = r.map((x) => ({ ...x }));
      else r.forEach((x, k) => { acc[k].grab ||= x.grab; acc[k].right ||= x.right; acc[k].mx = x.mx; acc[k].mz = x.mz; acc[k].turn = x.turn; });
    }
    return acc;
  });
  const down = Array.from({ length: n }, () => new Set());
  async function setKeys(k, want) {
    for (const key of [...down[k]]) if (!want.has(key)) { await p.keyboard.up(key); down[k].delete(key); }
    for (const key of want) if (!down[k].has(key)) { await p.keyboard.down(key); down[k].add(key); }
  }
  const dirKeys = (k, mx, mz, th = 0.38) => {
    const s = new Set(), K = KEYS[k];
    if (mx > th) s.add(K.right); if (mx < -th) s.add(K.left);
    if (mz > th) s.add(K.down); if (mz < -th) s.add(K.up);
    return s;
  };
  const log = [];
  const { makeBrain } = require('./cerebro.cjs');
  const brain = makeBrain({ n, scen, seed: seed0 * 7919, novatoEspera: NOVATO_ESPERA, sinNovato: process.env.SIN_NOVATO === '1' });
  let offscreenTicks = 0, ticks = 0, warnCount = {}, bothHold = null;
  // Choque: J1 anda hacia la lámpara de pie sin agarrarla (patio-choque)
  const choque = scen === 'patio-choque';
  let s = await state();
  await p.evaluate(() => window.__mudanza.advance(6, 10));
  s = await state();
  await shot('inicio', { warn: s.warn, load: s.load, cd: s.cd });
  while (s.phase === 'countdown') { await p.evaluate(() => window.__mudanza.advance(2, 10)); s = await state(); }
  const t0 = Date.now();
  while (s.phase === 'playing' && s.t < CFG.max) {
    ticks++;
    const it = await intent();
    const ss = { t: s.t, hum: s.hum, items: s.items };
    const dec = brain.tick(ss, it);
    for (let k = 0; k < n; k++) {
      const K = KEYS[k];
      let want = new Set([...dec[k].keys].map((x) => K[x]));
      let press = dec[k].press ? K[dec[k].press] : null;
      if (choque && k === 0) {
        const lamp = s.items.find((o) => o.id === 'lampara'), me = s.hum[0];
        want = dirKeys(k, lamp.x - me.x, lamp.z - me.z, 0.3); press = null;
      }
      await setKeys(k, want);
      if (press) await p.keyboard.press(press);
    }
    await p.evaluate(() => window.__mudanza.advance(1, 10));
    s = await state();
    if (bothHold === null && s.hum.filter((h) => h.hold).length >= Math.min(2, n)) bothHold = s.t;
    const off = s.hum.some((h) => h.scr[0] < 0 || h.scr[0] > 1280 || h.scr[1] < 0 || h.scr[1] > 720);
    if (off) offscreenTicks++;
    if (s.warn) warnCount[s.warn] = (warnCount[s.warn] ?? 0) + 1;
    log.push({ t: +s.t.toFixed(1), warn: s.warn, load: s.load, holders: s.hum.map((h) => (h.hold ? h.held : '-')).join(''), off, stage: s.stage, integ: s.integ });
    const fh = brain.st.finalHold, rel = brain.st.releasedAt;
    if (fh && !log.shotHold && s.t - fh.since > NOVATO_ESPERA - 0.5) { log.shotHold = 1; await shot('camion-sin-soltar', { warn: s.warn, load: s.load, t: s.t }); }
    if (rel && !log.shotRel && s.t - rel > 0.35) { log.shotRel = 1; await shot('camion-tras-soltar', { warn: s.warn, load: s.load, t: s.t }); }
    if (!log.shotMid && (scen === 'patio2' || scen === 'cuatro') && s.items.filter((o) => o.st === 'loaded').length >= 2) { log.shotMid = 1; await shot('mitad', { warn: s.warn, load: s.load, t: s.t }); }
    if (!log.shotEarly && s.t > 3 && scen !== 'calle2') { log.shotEarly = 1; await shot('3s', { warn: s.warn, load: s.load, t: s.t }); }
    if (ticks % 50 === 0) console.log(`[${s.t.toFixed(1)}] fase=${s.phase} etapa=${s.stage} integ=${s.integ} agarran=${log.at(-1).holders} aviso="${s.warn}" lista="${s.load}" fuera=${off} (${((Date.now() - t0) / 1000).toFixed(0)} s reales)`);
  }
  const firstGrab = brain.pl.map((q) => q.firstGrab), finalHold = brain.st.finalHold, releasedAt = brain.st.releasedAt;
  for (let k = 0; k < n; k++) await setKeys(k, new Set());
  // Resultados
  for (let i = 0; i < 30 && !s.results; i++) { await p.evaluate(() => window.__mudanza.advance(3, 10)); s = await state(); }
  await shot('final', { results: s.results });
  const ev = await p.evaluate(() => window.__ev);
  const count = (t) => ev.filter((e) => e.type === t).length;
  const summary = {
    scen, seed: seed0, fin: s.phase, t: +s.t.toFixed(2), results: s.results, integ: s.integ,
    primerAgarre: firstGrab.map((x) => (x === null ? null : +x.toFixed(2))), todosAgarran: bothHold === null ? null : +bothHold.toFixed(2),
    novatoEsperaDesde: finalHold ? +finalHold.since.toFixed(2) : null, soltoEn: releasedAt ? +releasedAt.toFixed(2) : null,
    sucesos: { grab: count('grab'), release: count('release'), fall: count('fall'), stun: count('stun'), wobble: count('wobble'), gripBreak: count('gripBreak'), impact: count('impact'), carHit: count('carHit'), righted: count('righted'), itemLoaded: count('itemLoaded'), itemUnloaded: count('itemUnloaded'), itemBroken: count('itemBroken'), respawn: count('respawnItem') },
    fueraDePantalla: `${offscreenTicks}/${ticks} ticks`,
    avisos: Object.fromEntries(Object.entries(warnCount).map(([k, v]) => [k, `${(v / 10).toFixed(1)} s`])),
    errores: errors, segundosReales: Math.round((Date.now() - t0) / 1000),
  };
  console.log('RESUMEN ' + JSON.stringify(summary));
  fs.writeFileSync(`${OUT}/${scen}-s${seed0}.json`, JSON.stringify({ summary, menu, log, ev }, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
