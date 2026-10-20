// Revisión ciclo 1 (rol A+G): alzado automático, aviso «Pesa mucho» y esfuerzo del muñeco, con teclas reales en
// modo captura (la simulación avanza solo con advance(); las teclas entran por InputManager como en una partida).
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/director-producto/alzado-y-aviso.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/tmp/claude-0/review-c1/ag';
fs.mkdirSync(OUT, { recursive: true });
const base = new URL(process.argv[2] || 'http://localhost:4175/');
base.searchParams.set('capture', '1'); base.searchParams.set('humans', '2'); base.searchParams.set('carriers', '2');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.screen === 'play');
  const adv = (n) => p.evaluate((n) => window.__mudanza.advance(n, 30), n);
  const st = () => p.evaluate(() => {
    const g = window.__mudanza.game; const q = g.sofa.rotation();
    const ay = 2 * (q.x * q.y + q.w * q.z); // componente y del eje x local (a lo largo del sofá)
    return {
      t: +g.time.toFixed(2), phase: g.phase, sofaY: +g.sofaPos.y.toFixed(3), endDiff: +(2 * 1.1 * ay).toFixed(3), up: +g.sofaUp.toFixed(2),
      cs: g.carriers.map((c) => ({ h: c.holding, x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), strain: +c.strain.toFixed(2), stun: c.stunned > 0, wob: c.wobbling })),
      warn: document.getElementById('h-warn').style.display === 'none' ? '' : document.getElementById('h-warn').textContent,
      pl: [...document.querySelectorAll('#h-players .pl')].map((e) => e.textContent),
      sofaX: +g.sofaPos.x.toFixed(2), sofaZ: +g.sofaPos.z.toFixed(2),
    };
  });
  await adv(95); // cuenta atrás
  let s = await st();
  console.log('Al empezar:', JSON.stringify({ t: s.t, phase: s.phase, warn: s.warn, sofaY: s.sofaY, cs: s.cs.map((c) => [c.x, c.z]), sofa: [s.sofaX, s.sofaZ] }));
  await p.screenshot({ path: `${OUT}/2j-inicio.png` });
  // J1 pulsa Espacio desde su sitio de salida
  await p.keyboard.press('Space'); await adv(1);
  s = await st();
  console.log('J1 pulsa Espacio sin moverse → agarra:', s.cs[0].h);
  for (let i = 0; i < 40 && !s.cs[0].h; i++) {
    const dx = s.sofaX - s.cs[0].x;
    await p.keyboard.down(dx < 0 ? 'KeyA' : 'KeyD'); await adv(2); await p.keyboard.up(dx < 0 ? 'KeyA' : 'KeyD');
    await p.keyboard.press('Space'); await adv(1);
    s = await st();
  }
  console.log('J1 agarra:', s.cs[0].h, 'a los', s.t, 's');
  const y0 = s.sofaY;
  const samples = [];
  for (let k = 0; k < 6; k++) { await adv(3); s = await st(); samples.push(`${s.t}s: Δy ${(s.sofaY - y0).toFixed(3)} m, desnivel extremos ${s.endDiff} m, esfuerzo ${s.cs[0].strain}`); }
  console.log('Tras agarrar solo (quieto):\n  ' + samples.join('\n  '));
  console.log('Aviso quieto agarrando:', JSON.stringify(s.warn));
  await p.screenshot({ path: `${OUT}/2j-agarre-solo-quieto.png` });
  // J1 tira hacia fuera (a lo largo del sofá) 3 s
  const away = s.cs[0].x > s.sofaX ? 'KeyD' : 'KeyA';
  await p.keyboard.down(away);
  let first = null; const x0 = s.sofaX;
  for (let k = 0; k < 30; k++) {
    await adv(3); s = await st();
    if (!first && s.warn.startsWith('Pesa mucho')) first = s.t;
    if (k === 15) { await p.screenshot({ path: `${OUT}/2j-arrastre-solo.png` }); console.log('Durante el arrastre:', JSON.stringify({ t: s.t, warn: s.warn, endDiff: s.endDiff, strain: s.cs[0].strain, pl: s.pl })); }
  }
  await p.keyboard.up(away);
  console.log(`Aviso «Pesa mucho» aparece a ${first} s (agarró a ~${samples.length ? '' : ''}); sofá avanzó ${(s.sofaX - x0).toFixed(2)} m en 3 s; aviso final: ${JSON.stringify(s.warn)}`);
  // Zoom al porteador para ver el esfuerzo
  await p.keyboard.down(away); await adv(6);
  await p.evaluate(() => window.__mudanza.setZoom(0.45)); await adv(1);
  await p.screenshot({ path: `${OUT}/2j-esfuerzo-zoom.png` });
  await p.evaluate(() => window.__mudanza.setZoom(null));
  await p.keyboard.up(away); await adv(3);
  // J2 viene y agarra el otro extremo
  s = await st();
  for (let i = 0; i < 80 && !s.cs[1].h; i++) {
    const q = await p.evaluate(() => { const g = window.__mudanza.game; const r = g.sofa.rotation(); const ax = 1 - 2 * (r.y * r.y + r.z * r.z), az = 2 * (r.x * r.z - r.w * r.y); const o = g.carriers[0]; const side = Math.sign((o.pos.x - g.sofaPos.x) * ax + (o.pos.z - g.sofaPos.z) * az) || 1; return { tx: g.sofaPos.x - ax * 1.9 * side, tz: g.sofaPos.z - az * 1.9 * side }; });
    const dx = q.tx - s.cs[1].x, dz = q.tz - s.cs[1].z; const keys = [];
    if (Math.abs(dx) > 0.25) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(dz) > 0.25) keys.push(dz > 0 ? 'ArrowDown' : 'ArrowUp');
    if (keys.length) { for (const k of keys) await p.keyboard.down(k); await adv(2); for (const k of keys) await p.keyboard.up(k); }
    else { await p.keyboard.press('Enter'); await adv(1); }
    s = await st();
  }
  console.log('J2 agarra:', s.cs[1].h, 'a los', s.t, 's; aviso:', JSON.stringify(s.warn));
  await adv(15); s = await st();
  console.log('Entre dos, quietos 0,5 s:', JSON.stringify({ sofaY: s.sofaY, dy: +(s.sofaY - y0).toFixed(3), endDiff: s.endDiff, warn: s.warn }));
  await p.screenshot({ path: `${OUT}/2j-entre-dos.png` });
  await p.keyboard.down('KeyW'); await p.keyboard.down('ArrowUp');
  const z0 = s.sofaZ;
  await adv(45); s = await st();
  await p.screenshot({ path: `${OUT}/2j-entre-dos-andando.png` });
  await p.keyboard.up('KeyW'); await p.keyboard.up('ArrowUp');
  console.log(`Entre dos hacia arriba 1,5 s: Δz ${(s.sofaZ - z0).toFixed(2)} m, sofaY ${s.sofaY}, aviso ${JSON.stringify(s.warn)}`);
  console.log('Errores:', errors.length ? errors : 'ninguno');
  await b.close();
})();
