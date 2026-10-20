// Revisor C+E (ciclo 1): ¿apoyan las botas en los peldaños DIBUJADOS de la escalera?
// La física de la escalera es una rampa (level.ts: slope de z=-22, y=0 a z=-29, y=2,6); el dibujo, 14 peldaños
// (levelView.ts addStairs: huella 0,5 m, tabica 0,186 m). Las botas se apoyan con un rayo contra la rampa.
// Mide, en el recorrido con el piloto, la altura de cada esquina de suela respecto a la huella dibujada que tiene debajo.
const { chromium } = require('playwright');
const path = require('path');
const url = process.argv[2] || 'http://localhost:4176/';
const out = process.argv[3] || '/tmp/claude-0/review-c1/ce/stairs';
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  const Z0 = -22, Z1 = -29, TOP = 2.6, N = 14, RUN = (Z0 - Z1) / N, RISE = TOP / N;
  let worst = 0, n = 0, buried = 0, floating = 0, shots = 0;
  for (let k = 0; k < 1600; k++) {
    const r = await p.evaluate(() => {
      const m = window.__mudanza; m.advance(1, 30, 'return window.__mudanza.autoInputs(g)');
      return { st: m.game.stageLabel, scr: m.screen, feet: m.view.carriers.filter((v) => v.rig && v.rig.debug && v.rig.debug.upright).map((v) => v.rig.debug.feet.map((f) => ({ sw: f.swinging, sole: f.sole }))) };
    });
    for (const doll of r.feet) for (const f of doll) {
      if (f.sw) continue;
      for (const [x, y, z] of f.sole) {
        if (z > Z0 || z < Z1 || Math.abs(x) > 1.4) continue;
        const i = Math.floor((Z0 - z) / RUN), tread = RISE * (i + 1);
        const d = y - tread; // <0: suela metida en el peldaño dibujado
        n++; worst = Math.min(worst, d); if (d < -0.03) buried++; if (d > 0.03) floating++;
      }
    }
    if (r.st === 'Escalera' && k % 25 === 0 && shots < 3) {
      shots++;
      await p.evaluate(() => {
        const m = window.__mudanza, v = m.view, c = m.game.carriers[0], cam = v.camera;
        cam.position.set(c.pos.x + 1.2, c.pos.y - 0.2, c.pos.z + 0.4); cam.lookAt(c.pos.x, c.pos.y - 0.6, c.pos.z); cam.updateMatrixWorld();
        v.renderer.render(v.scene, cam);
      });
      await p.screenshot({ path: path.join(out, `pies-escalera-${shots}.png`) });
    }
    if (r.scr === 'results') break;
  }
  console.log(`esquinas de suela apoyadas sobre la escalera: ${n}; metidas >3 cm en el peldaño dibujado: ${(100 * buried / n).toFixed(0)} %; flotando >3 cm: ${(100 * floating / n).toFixed(0)} %; peor: ${(worst * 100).toFixed(1)} cm`);
  await b.close();
})();
