// Revisor C+E (ciclo 1): captura lateral del ayudante Salchicha (perro) y del Gordo, de pie y tumbados hacia delante,
// con su cápsula física en alambre verde. Uso: node dog-fall.cjs <carpeta> [url]
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/claude-0/review-c1/ce/dog';
const url = process.argv[3] || 'http://localhost:4176/';
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`${url}?capture=1&humans=1&carriers=6`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  await p.evaluate(() => { const g = window.__mudanza.game; g.carriers.forEach((c, i) => { if (c.human === null) { c.teleport({ x: -6 + i * 2.5, y: 0.75, z: 13 }); c.facing = { x: 1, z: 0 }; } }); });
  await p.evaluate(() => window.__mudanza.advance(15, 30));
  const snap = async (cast, name) => {
    await p.evaluate((cast) => {
      const m = window.__mudanza, V = m.view; let Cyl, Sph, Basic;
      V.scene.traverse((o) => { if (!o.isMesh) return; if (!Cyl && o.geometry.type === 'CylinderGeometry') Cyl = o.geometry.constructor; if (!Sph && o.geometry.type === 'SphereGeometry') Sph = o.geometry.constructor; if (!Basic && o.material && o.material.type === 'MeshBasicMaterial') Basic = o.material.constructor; });
      const view = V.carriers.find((v) => v.carrier.cast.cast === cast && v.carrier.human === null);
      const Mesh = view.ring.constructor, Group = view.group.constructor, c = view.carrier;
      if (window.__cap) V.scene.remove(window.__cap);
      const mat = new Basic({ color: 0x00ff66, wireframe: true, transparent: true, opacity: 0.6, depthTest: false });
      const g = new Group(), hh = c.collider.shape.halfHeight, r = 0.32;
      g.add(new Mesh(new Cyl(r, r, 2 * hh, 16, 2, true), mat));
      const s1 = new Mesh(new Sph(r, 16, 8), mat); s1.position.y = hh; g.add(s1);
      const s2 = new Mesh(new Sph(r, 16, 8), mat); s2.position.y = -hh; g.add(s2);
      const k = c.collider.translation(), q = c.collider.rotation();
      g.position.set(k.x, k.y, k.z); g.quaternion.set(q.x, q.y, q.z, q.w); g.renderOrder = 999;
      V.scene.add(g); window.__cap = g;
      const cam = V.camera;
      cam.position.set(k.x + 0.2, 0.9, k.z + 3.2); cam.lookAt(k.x, 0.55, k.z); cam.updateMatrixWorld();
      V.renderer.render(V.scene, cam);
    }, cast);
    await p.screenshot({ path: path.join(out, `${name}.png`) });
  };
  await snap('perro', 'perro-de-pie');
  await snap('gordo', 'gordo-de-pie');
  await p.evaluate(() => { for (const c of window.__mudanza.game.carriers) if (c.human === null) c.knockDown({ ...c.facing }, 1.3, 'balance'); });
  await p.evaluate(() => window.__mudanza.advance(14, 30));
  await snap('perro', 'perro-tumbado-delante');
  await snap('gordo', 'gordo-tumbado-delante');
  await b.close();
})();
