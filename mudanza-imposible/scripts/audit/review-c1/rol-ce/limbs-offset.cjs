// Revisor C+E (ciclo 1): ¿los brazos, mangas, manos, piernas y botas del muñeco se dibujan unidos al cuerpo?
// Mide, para cada muñeco de jugador, la distancia (m, mundo) entre la manga dibujada y el hombro del tronco,
// entre el extremo de la pierna dibujada y la cadera, y entre la bota y el tobillo de la pierna, en varias
// posiciones del nivel. Uso: node limbs-offset.cjs <carpeta> [url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || '/tmp/claude-0/review-c1/ce/limbs');
const url = process.argv[3] || 'http://localhost:4176/';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, V = m.view;
    return V.carriers.filter((v) => v.rig).map((v) => {
      const rig = v.rig; rig.group.updateMatrixWorld(true);
      const V3 = rig.group.position.constructor;
      const w = (o, x, y, z) => o.localToWorld(new V3(x, y, z));
      const sh = [w(rig.torso, -0.325, 0.83, 0), w(rig.torso, 0.325, 0.83, 0)];
      const sl = rig.sleeves.map((s) => s.getWorldPosition(new V3()));
      const hands = rig.hands.map((h) => h.getWorldPosition(new V3()));
      const boots = rig.boots.map((bt) => bt.getWorldPosition(new V3()));
      // Extremos de la pierna dibujada: primer y último vértice de la malla del tubo, en el mundo
      const legMeshes = rig.group.children.filter((o) => o.isMesh && o.geometry === rig.legs[0].geometry || o.isMesh && o.geometry === rig.legs[1].geometry);
      const legEnds = legMeshes.map((lm) => { const pos = lm.geometry.attributes.position; const a = new V3().fromBufferAttribute(pos, 0).applyMatrix4(lm.matrixWorld); const z = new V3().fromBufferAttribute(pos, pos.count - 1).applyMatrix4(lm.matrixWorld); return [a, z]; });
      const hip = [w(rig.torso, -0.13, 0.38, 0), w(rig.torso, 0.13, 0.38, 0)];
      const c = v.carrier.pos;
      const grab = v.carrier.grabWorld();
      return {
        pos: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
        sleeveToShoulder: sl.map((s, i) => +s.distanceTo(sh[i]).toFixed(3)),
        handToGrab: grab ? hands.map((h) => +Math.hypot(h.x - grab.x, h.y - grab.y, h.z - grab.z).toFixed(3)) : null,
        legStartToHip: legEnds.map((e, i) => +Math.min(e[0].distanceTo(hip[i]), e[1].distanceTo(hip[i])).toFixed(3)),
        legEndToBoot: legEnds.map((e, i) => +Math.min(e[0].distanceTo(boots[i]), e[1].distanceTo(boots[i])).toFixed(3)),
        bootToBody: boots.map((bt) => +Math.hypot(bt.x - c.x, bt.z - c.z).toFixed(3)),
      };
    });
  });
  const close = (i, a, d = 2.6, h = 1.0) => p.evaluate(([i, a, d, h]) => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[i], cam = v.camera;
    const f = c.facing, yaw = Math.atan2(f.x, f.z) + a;
    cam.position.set(c.pos.x + Math.sin(yaw) * d, c.pos.y + h, c.pos.z + Math.cos(yaw) * d);
    cam.lookAt(c.pos.x, c.pos.y, c.pos.z); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  }, [i, a, d, h]);
  const shot = (n) => p.screenshot({ path: path.join(out, `${n}.png`) });
  const results = [];
  // Posiciones: salida, cerca del origen, lejos (descampado), escalera, terraza de arriba
  const spots = [['salida', null], ['origen', { x: 0.6, y: 0.75, z: 0.4 }], ['lejos', { x: -30, y: 0.75, z: 25 }], ['escalera', { x: 0.3, y: 1.6, z: -25.5 }], ['arriba', { x: 18, y: 3.4, z: -30.6 }]];
  for (const [name, at] of spots) {
    if (at) await p.evaluate((at) => { const g = window.__mudanza.game; g.carriers[0].teleport(at); g.carriers[1].teleport({ x: at.x + 1.5, y: at.y, z: at.z }); }, at);
    await p.evaluate(() => window.__mudanza.advance(20, 30));
    const r = await measure();
    results.push({ name, r });
    await close(0, 0.7); await shot(`${name}-J1`);
  }
  for (const x of results) console.log(x.name, JSON.stringify(x.r));
  console.log('errores', errors.length, errors.slice(0, 3));
  await b.close();
})();
