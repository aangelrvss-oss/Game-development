// Revisor C+E (ciclo 1): ¿el dibujo de los ayudantes (carrierView.ts) coincide con su cápsula física?
// Para cada ayudante, de pie y tumbado: cuánto sobresale su cuerpo dibujado (mallas del pivote, sin contornos ni
// brazos) de la cápsula del collider, y cuánto se mete bajo el suelo. Uso: node helpers-fit.cjs [url]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4176/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`${url}?capture=1&humans=1&carriers=6`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  // Cada ayudante, separado de los demás en el patio (llano), mirando hacia +x
  await p.evaluate(() => { const g = window.__mudanza.game; g.carriers.forEach((c, i) => { if (c.human === null) { c.teleport({ x: -6 + i * 2.5, y: 0.75, z: 13 }); c.facing = { x: 1, z: 0 }; } }); });
  await p.evaluate(() => window.__mudanza.advance(15, 30));
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, V = m.view;
    return V.carriers.filter((v) => !v.rig || !v.rig.debug).filter((v) => v.carrier.human === null).map((v) => {
      const c = v.carrier, rig = v.rig; v.group.updateMatrixWorld(true);
      const k = c.collider.translation(), q = c.collider.rotation();
      // Eje de la cápsula en el mundo
      const ax = { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
      const hh = c.collider.shape.halfHeight, r = c.collider.shape.radius;
      const feet = c.pos.y - (hh + r);
      let over = 0, below = 0, n = 0;
      const V3 = v.group.position.constructor, w = new V3();
      rig.pivot.traverse((o) => {
        if (!o.isMesh || o.userData.outline) return;
        let hidden = false; for (let a = o; a; a = a.parent) if (a.visible === false) hidden = true;
        if (hidden) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const dx = w.x - k.x, dy = w.y - k.y, dz = w.z - k.z;
          const t = Math.max(-hh, Math.min(hh, dx * ax.x + dy * ax.y + dz * ax.z));
          const d = Math.hypot(dx - ax.x * t, dy - ax.y * t, dz - ax.z * t) - r;
          over = Math.max(over, d); below = Math.max(below, feet - w.y); n++;
        }
      });
      return { cast: c.cast.cast, down: c.down, tilt: +c.tilt.toFixed(2), sobresale_cm: +(over * 100).toFixed(1), bajo_suelo_cm: +(below * 100).toFixed(1) };
    });
  });
  console.log('DE PIE', JSON.stringify(await measure()));
  // Caen hacia delante (hacia donde miran), luego hacia atrás
  for (const [name, sgn] of [['hacia delante', 1], ['hacia atras', -1]]) {
    await p.evaluate((sgn) => { for (const c of window.__mudanza.game.carriers) if (c.human === null) c.knockDown({ x: sgn * c.facing.x, z: sgn * c.facing.z }, 1.3, 'balance'); }, sgn);
    await p.evaluate(() => window.__mudanza.advance(14, 30));
    console.log(`TUMBADOS ${name}`, JSON.stringify(await measure()));
    await p.evaluate(() => window.__mudanza.advance(60, 30));
    await p.evaluate(() => { const g = window.__mudanza.game; g.carriers.forEach((c, i) => { if (c.human === null) { c.teleport({ x: -6 + i * 2.5, y: 0.75, z: 13 }); c.facing = { x: 1, z: 0 }; } }); });
    await p.evaluate(() => window.__mudanza.advance(15, 30));
  }
  await b.close();
})();
