// Graba la partida real fotograma a fotograma (?capture=1): cada fotograma son 1/30 s de juego,
// así que el vídeo va a velocidad real aunque el contenedor dibuje despacio (sin GPU).
// Toma A: J1 con el teclado (pulsaciones que envía Playwright al juego) cruza sin esperar al semáforo.
// Toma B: piloto automático del propio juego, de principio a fin.
// Salida: shots/video/<toma>/NNNNN.jpg, <toma>.wav (sonidos del juego) y <toma>.json (tiempos y sucesos).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = process.argv[2] || 'http://localhost:4173/';
const only = process.argv[3] || 'AB';
const OUT = path.resolve(__dirname, '../shots/video');
const FPS = 30;

async function take(b, name, run) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${url}?capture=1&humans=1&carriers=4`);
  await p.waitForFunction(() => window.__mudanza);
  let n = 0;
  const log = [];
  const state = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game, s = g.sofaPos, me = g.carriers[0];
    return { t: m.simTime, gt: g.time, phase: g.phase, screen: m.screen, stage: g.stageLabel, integ: g.integrity, light: g.light.ped, me: [me.pos.x, me.pos.z], holding: me.holding, holders: g.carriers.filter((c) => c.holding).length, stunned: g.carriers.filter((c) => c.stunned > 0).length, sofa: [s.x, s.y, s.z] };
  });
  /** Avanza un fotograma de juego, lo guarda y devuelve el estado. */
  const frame = async (save = true) => {
    await p.evaluate(() => window.__mudanza.advance(1, 30));
    const s = await state();
    if (save) { await p.screenshot({ path: path.join(dir, `${String(n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 }); log.push(s); n++; }
    return s;
  };
  const t0 = Date.now();
  const res = await run(p, frame, state);
  const st = await state();
  const first = log[0]?.t ?? 0;
  const wav = await p.evaluate(([a, z]) => window.__mudanza.sound(a, z), [first, first + n / FPS]);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.from(wav, 'base64'));
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ frames: n, first, res, errors, log }, null, 0));
  console.log(name, 'fotogramas', n, 'estado final', JSON.stringify(st), 'errores', errors.length, `(${((Date.now() - t0) / 1000).toFixed(0)} s reales)`);
  await p.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  if (only.includes('A')) await take(b, 'A-teclado', async (p, frame) => {
    await p.evaluate(() => window.__mudanza.start(false, false));
    let s;
    // Cuenta atrás: se graba solo el último segundo
    do { s = await frame(false); } while (s.phase === 'countdown' && s.gt === 0 && (await p.evaluate(() => window.__mudanza.game.countdown)) > 1);
    while (s.phase === 'countdown') s = await frame();
    // Ir al extremo del sofá con WASD y agarrar con Espacio (mismas teclas que un jugador)
    const held = new Set();
    const setKeys = async (want) => {
      for (const k of [...held]) if (!want.includes(k)) { await p.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await p.keyboard.down(k); held.add(k); }
    };
    for (let i = 0; i < 150 && !s.holding; i++) {
      const dx = s.sofa[0] + 1.75 - s.me[0], dz = s.sofa[2] - s.me[1];
      const keys = [];
      if (dx > 0.15) keys.push('KeyD'); if (dx < -0.15) keys.push('KeyA');
      if (dz > 0.15) keys.push('KeyS'); if (dz < -0.15) keys.push('KeyW');
      await setKeys(keys);
      if (!keys.length) { await p.keyboard.down('Space'); s = await frame(); await p.keyboard.up('Space'); }
      else s = await frame();
    }
    await setKeys([]);
    for (let i = 0; i < 25; i++) s = await frame();
    // ¡Adelante sin mirar el semáforo!
    await setKeys(['KeyW']);
    let accidentAt = null;
    for (let i = 0; i < 30 * 16; i++) {
      s = await frame();
      if (accidentAt === null && (s.integ < 100 || s.stunned > 0)) accidentAt = s.t;
      if (accidentAt !== null && s.t - accidentAt > 3.5) break;
      if (s.sofa[2] < -12.5) break;
    }
    await setKeys([]);
    for (let i = 0; i < 15; i++) s = await frame();
    return { accidentAt };
  });

  if (only.includes('B')) await take(b, 'B-auto', async (p, frame) => {
    await p.evaluate(() => window.__mudanza.start(true, false));
    let s;
    do { s = await frame(false); } while (s.phase === 'countdown' && (await p.evaluate(() => window.__mudanza.game.countdown)) > 0.5);
    for (let i = 0; i < 30 * 60; i++) {
      s = await frame();
      if (s.screen === 'results') { for (let j = 0; j < 45; j++) await frame(); break; }
    }
    return { end: s };
  });
  await b.close();
})();
