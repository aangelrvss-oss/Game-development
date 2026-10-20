// Revisión ciclo 1 (rol A+G): ¿qué son los «palos» que salen del muñeco al arrastrar solo? Vista lateral con una
// copia de la cámara del juego (modo captura), y posiciones de hombros, codos y manos del muñeco.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/director-producto/brazos-vista-lateral.cjs [url]
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/review-c1/ag';
const base = new URL(process.argv[2] || 'http://localhost:4175/');
base.searchParams.set('capture', '1'); base.searchParams.set('humans', '2'); base.searchParams.set('carriers', '2');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(base.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.screen === 'play');
  const adv = (n) => p.evaluate((n) => window.__mudanza.advance(n, 30), n);
  await adv(95);
  await p.keyboard.press('Space'); await adv(1);
  await adv(20);
  await p.keyboard.down('KeyD'); await adv(45);
  const info = await p.evaluate(() => {
    const m = window.__mudanza, g = m.game, c = g.carriers[0], v = m.view.carriers[0];
    const h = c.handWorld ? c.handWorld() : null, gw = c.grabWorld();
    // Mallas del muñeco: posición de mundo de las manos y de las mangas (si existen)
    const rig = v.rig ?? v.doll ?? null;
    const pick = (arr) => (arr ?? []).map((o) => { const w = o.getWorldPosition(o.position.clone()); return [+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)]; });
    return {
      body: [c.pos.x, c.pos.y, c.pos.z].map((x) => +x.toFixed(2)),
      hand: h && [h.x, h.y, h.z].map((x) => +x.toFixed(2)),
      grab: gw && [gw.x, gw.y, gw.z].map((x) => +x.toFixed(2)),
      sep: h && gw ? +Math.hypot(h.x - gw.x, h.y - gw.y, h.z - gw.z).toFixed(2) : null,
      rigKeys: rig ? Object.keys(rig).slice(0, 40) : Object.keys(v).slice(0, 40),
      hands: rig ? pick(rig.hands) : null,
      sleeves: rig ? pick(rig.sleeves) : null,
    };
  });
  console.log(JSON.stringify(info));
  await p.screenshot({ path: `${OUT}/brazos-camara-juego.png` });
  // Vista lateral (desde el sur-oeste, a la altura de los ojos) con una copia de la cámara del juego
  for (const [name, dx, dy, dz] of [['lado', 0, 1.2, 4.0], ['frente', 4.0, 1.4, 0.5]]) {
    await p.evaluate(([dx, dy, dz]) => {
      const m = window.__mudanza, c = m.game.carriers[0].pos;
      const cam = m.view.camera.clone();
      cam.position.set(c.x + dx, c.y + dy, c.z + dz);
      cam.lookAt(c.x - 0.6, c.y + 0.2, c.z);
      cam.updateMatrixWorld();
      m.view.renderer.render(m.view.scene, cam);
    }, [dx, dy, dz]);
    await p.screenshot({ path: `${OUT}/brazos-${name}.png` });
  }
  await b.close();
})();
