// Graba una partida a dos (física cooperativa) fotograma a fotograma (?capture=1): cada fotograma son
// 1/30 s de juego, así que el vídeo va a velocidad real aunque el contenedor dibuje despacio (sin GPU).
// Tramo 1: J1 (WASD + Espacio) y J2 (flechas + Intro) con pulsaciones que envía Playwright al teclado del
//          juego, sin salir del patio: agarran, tiran juntos, tiran a la contra (gira), cada uno tira hacia
//          su lado y J2 suelta sin dejar de tirar (se cae); J1 solo apenas lo mueve.
// Tramo 2: el piloto automático del juego lleva a J1 y a J2 hasta el camión. Las esperas al semáforo en
//          rojo se cortan (cada corte abre un tramo nuevo).
// Salida: shots/video-duo/<n>/NNNNN.jpg, <n>.wav (sonidos del juego), tramos.json y rótulos PNG.
// Después: scripts/make-video-duo.sh
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = process.argv[2] || 'http://localhost:4173/';
const OUT = path.resolve(__dirname, '../shots/video-duo');
const FPS = 30;

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));

  const segs = [];
  let seg = null;
  const open = (label) => { seg = { n: segs.length, label, first: null, frames: 0 }; segs.push(seg); fs.mkdirSync(path.join(OUT, String(seg.n)), { recursive: true }); };
  const state = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game, s = g.sofaPos, v = g.sofa.linvel();
    return {
      t: m.simTime, gt: g.time, phase: g.phase, screen: m.screen, cd: g.countdown, light: g.light.ped, stage: g.stageLabel,
      sofa: [s.x, s.z], yaw: g.sofaYaw, speed: Math.hypot(v.x, v.z),
      cs: g.carriers.map((c) => ({ x: c.pos.x, z: c.pos.z, h: c.holding, stun: c.stunned, wob: c.wobbling, knock: c.knock })),
    };
  });
  /** Avanza un fotograma (con el teclado del juego, o con el piloto si `auto`), lo guarda y devuelve el estado. */
  const frame = async (save = true, auto = false) => {
    await p.evaluate((a) => window.__mudanza.advance(1, 30, a ? 'return window.__mudanza.autoInputs(g)' : undefined), auto);
    const s = await state();
    if (save) {
      if (seg.first === null) seg.first = s.t - 1 / FPS;
      await p.screenshot({ path: path.join(OUT, String(seg.n), `${String(seg.frames).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
      seg.frames++;
    }
    return s;
  };
  const held = new Set();
  const keys = async (want) => {
    for (const k of [...held]) if (!want.includes(k)) { await p.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await p.keyboard.down(k); held.add(k); }
  };
  const tap = async (ks, also = []) => { await keys([...also, ...ks]); const s = await frame(); await keys(also); return s; };
  const run = async (sec, want) => { await keys(want); let s; for (let i = 0; i < Math.round(sec * FPS); i++) s = await frame(); return s; };
  const t0 = Date.now();

  // --- Tramo 1: teclado ---
  open('teclado');
  let s;
  do { s = await frame(false); } while (s.phase === 'countdown' && s.cd > 1);
  while (s.phase === 'countdown') s = await frame();
  s = await run(0.3, []);
  s = await tap(['Space', 'Enter']); // los dos agarran a la vez
  s = await run(0.6, []);
  s = await run(1.2, ['KeyA', 'ArrowLeft']); // juntos hacia la izquierda (sin salir del patio)
  s = await run(1.4, ['KeyW', 'ArrowDown']); // uno hacia arriba y otro hacia abajo: el sofá gira
  // Cada uno tira hacia su lado (hacia fuera del sofá) y J2 suelta sin dejar de tirar
  const outKeys = (s, i) => {
    const dx = s.cs[i].x - s.sofa[0], dz = s.cs[i].z - s.sofa[1];
    const k = i === 0 ? { r: 'KeyD', l: 'KeyA', d: 'KeyS', u: 'KeyW' } : { r: 'ArrowRight', l: 'ArrowLeft', d: 'ArrowDown', u: 'ArrowUp' };
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? k.r : k.l) : (dz > 0 ? k.d : k.u);
  };
  const out = [outKeys(s, 0), outKeys(s, 1)];
  s = await run(1.3, out);
  s = await tap(['Enter'], out);
  s = await run(2.2, out); // J2 se tambalea y cae; J1 tira solo: apenas lo mueve
  s = await run(1.0, []);
  const fell = s.cs[1].knock === 'balance';

  // --- Tramo 2: piloto automático para J1 y J2 (se cortan las esperas en rojo) ---
  await keys([]);
  open('piloto');
  let wait = 0, cut = false;
  for (let i = 0; i < FPS * 200; i++) {
    // Espera en la acera con el semáforo en rojo: se avanza sin guardar, dejando 1 s antes y después
    const waiting = s.phase === 'playing' && s.light === 'red' && s.speed < 0.15 && s.sofa[1] > 2 && s.sofa[1] < 7 && s.cs.every((c) => c.h);
    wait = waiting ? wait + 1 / FPS : 0;
    if (wait > 1 && !cut) { cut = true; }
    if (cut && !waiting) { cut = false; open('piloto'); for (let j = 0; j < FPS; j++) s = await frame(true, true); continue; }
    s = await frame(!cut, true);
    if (s.screen === 'results') { for (let j = 0; j < 60; j++) await frame(); break; }
  }

  // Sonido de cada tramo
  for (const g of segs) {
    if (!g.frames) continue;
    const wav = await p.evaluate(([a, z]) => window.__mudanza.sound(a, z), [g.first, g.first + g.frames / FPS]);
    fs.writeFileSync(path.join(OUT, `${g.n}.wav`), Buffer.from(wav, 'base64'));
  }
  const fin = await state();
  fs.writeFileSync(path.join(OUT, 'tramos.json'), JSON.stringify({ segs, fell, final: fin, errors }, null, 1));
  console.log('tramos', segs.map((g) => `${g.n}:${g.label}:${g.frames}`).join(' '), '| J2 cayó:', fell, '| final', fin.phase, fin.gt.toFixed(1), 's', '| errores', errors.length, `(${((Date.now() - t0) / 1000).toFixed(0)} s reales)`);

  // Rótulos
  const base = `<style>body{margin:0;width:1280px;height:720px;font-family:system-ui,sans-serif;overflow:hidden}
    .chip{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);background:rgba(31,26,46,.88);color:#fff;padding:10px 20px;border-radius:14px;font-weight:800;font-size:22px;white-space:nowrap;box-shadow:0 4px 0 rgba(0,0,0,.25)}
    .chip small{display:block;font-weight:600;font-size:15px;opacity:.8;margin-top:2px}</style>`;
  const cards = {
    titulo: `${base}<div style="position:absolute;inset:0;background:linear-gradient(160deg,#7c3aed,#db2777 55%,#f59e0b);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center">
      <div style="font-size:30px;font-weight:800;letter-spacing:.2em;opacity:.9">PARTIDA A DOS · MISMO TECLADO</div>
      <div style="font-size:96px;font-weight:900;line-height:1;margin:14px 0 18px;text-shadow:0 6px 0 rgba(0,0,0,.25)">La Mudanza<br>Imposible</div>
      <div style="font-size:24px;font-weight:700;max-width:1080px;line-height:1.35;background:rgba(0,0,0,.22);padding:12px 22px;border-radius:14px">
        Juego real (física Rapier), capturado fotograma a fotograma a velocidad real.<br>Las pulsaciones las envía un script, no dos personas. Solo se cortan esperas al semáforo.</div></div>`,
    'chip-teclado': `${base}<div class="chip">J1 (WASD + Espacio) y J2 (flechas + Intro): agarrar, tirar juntos, tirar a la contra, soltar tirando<small>Pulsaciones de teclado enviadas por un script de prueba</small></div>`,
    'chip-piloto': `${base}<div class="chip">El piloto automático del juego lleva a J1 y a J2 hasta el camión<small>Misma física cooperativa: sin ayudantes de la máquina</small></div>`,
    'chip-corte': `${base}<div class="chip">✂ Espera al semáforo en rojo, cortada</div>`,
  };
  for (const [name, html] of Object.entries(cards)) {
    await p.setContent(`<html><body style="background:transparent">${html}</body></html>`);
    await p.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: name !== 'titulo' });
  }
  await b.close();
})();
