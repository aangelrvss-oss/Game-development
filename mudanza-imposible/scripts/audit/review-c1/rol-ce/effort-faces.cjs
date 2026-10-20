// Revisor C+E (ciclo 1): primer plano de la cara y la postura de J1 en tres momentos: agarrado quieto, arrastrando
// solo (debería verse el esfuerzo máximo) y llevándolo entre dos. Uso: node effort-faces.cjs <carpeta> [url]
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/claude-0/review-c1/ce/effort';
const url = process.argv[3] || 'http://localhost:4176/';
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  const I = (o) => JSON.stringify({ mx: 0, mz: 0, grab: false, turn: 0, right: false, ...o });
  const adv = (n, a = {}, b2 = {}) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, `return [${I(a)}, ${I(b2)}]`]);
  const face = async (name) => {
    const info = await p.evaluate(() => {
      const m = window.__mudanza, v = m.view, c = m.game.carriers[0], cam = v.camera, d = v.carriers[0];
      // Cámara delante-al-lado de J1 (mira hacia el sofá: -handDir es su espalda), a la altura de la cabeza
      const f = c.handDir, side = { x: -f.z, z: f.x };
      cam.position.set(c.pos.x + f.x * 0.9 + side.x * 1.6, c.pos.y + 0.7, c.pos.z + f.z * 0.9 + side.z * 1.6);
      cam.lookAt(c.pos.x, c.pos.y + 0.35, c.pos.z); cam.updateMatrixWorld();
      v.renderer.render(v.scene, cam);
      const rig = d.rig; rig.group.updateMatrixWorld(true);
      const e = rig.torso.matrixWorld.elements, l = Math.hypot(e[4], e[5], e[6]);
      return { effort: +d.effort.toFixed(2), strain: +c.strain.toFixed(2), state: d.src.state, torsoTiltDeg: +(Math.acos(e[5] / l) * 57.3).toFixed(1), headPitchDeg: +(rig.head.rotation.x * 57.3).toFixed(1), mouth: rig.mouth.visible, eyeY: +rig.eyes[0].scale.y.toFixed(3), fit: +d.leanFit.toFixed(2) };
    });
    await p.screenshot({ path: path.join(out, `${name}.png`) });
    console.log(name, JSON.stringify(info));
  };
  await face('0-de-pie');
  await adv(1, { grab: true }, {});
  await adv(30, {}, {});
  await face('1-agarrado-quieto');
  for (let k = 0; k < 60; k++) await adv(1, { mx: 1 }, {});
  await face('2-arrastra-solo');
  await p.evaluate(() => { const g = window.__mudanza.game, s = g.sofaPos; g.carriers[1].teleport({ x: s.x - 2.0, y: 0.75, z: s.z }); });
  await adv(8, { mx: 1 }, { mx: 1 });
  await adv(1, { mx: 1 }, { grab: true });
  for (let k = 0; k < 40; k++) await adv(1, { mx: 1 }, { mx: 1 });
  await face('3-llevan-dos');
  await b.close();
})();
