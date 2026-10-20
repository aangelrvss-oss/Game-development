// Revisor C+E (ciclo 1): ¿cuánto recorta fitTilt la inclinación dibujada y con qué saltos?
// Recorrido completo a dos con el piloto; por fotograma (30 fps) y muñeco: fracción que cabe (leanFit), inclinación
// pedida, inclinación dibujada del tronco (ángulo de su eje con la vertical), salto entre fotogramas, y si la parte de
// arriba del cuerpo SIN inclinar ya toca algo (y qué). Uso: node lean-fit.cjs [url]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4176/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  await p.evaluate(() => { window.__lf = { prev: [null, null], rows: [] }; });
  for (let k = 0; k < 1600; k++) {
    const r = await p.evaluate(() => {
      const m = window.__mudanza; m.advance(1, 30, 'return window.__mudanza.autoInputs(g)');
      const g = m.game, L = window.__lf;
      const out = m.view.carriers.filter((v) => v.rig).map((v, i) => {
        const rig = v.rig; rig.group.updateMatrixWorld(true);
        const e = rig.torso.matrixWorld.elements; // eje y del tronco
        const ux = e[4], uy = e[5], uz = e[6], l = Math.hypot(ux, uy, uz);
        const tilt = Math.acos(Math.max(-1, Math.min(1, uy / l)));
        const c = v.carrier;
        // ¿Toca algo la parte de arriba del cuerpo sin inclinar?
        const P = c.pos, cen = { x: P.x, y: P.y - (c.collider.shape.halfHeight + 0.32) + v.upperMid, z: P.z };
        const hits = [];
        v.world.intersectionsWithShape(cen, { x: 0, y: 0, z: 0, w: 1 }, v.upper, (o) => { const bd = o.parent(); hits.push(bd && bd.handle === g.sofa.handle ? 'sofa' : bd && bd.isFixed() ? 'fijo' : 'otro'); return true; }, undefined, undefined, c.collider);
        const want = Math.hypot(v.src.lean.x, v.src.lean.z);
        const jump = L.prev[i] === null ? 0 : Math.abs(tilt - L.prev[i]);
        L.prev[i] = c.down ? null : tilt;
        return { fit: v.leanFit, want, tilt, jump, hits: [...new Set(hits)], hold: c.holding, down: !!c.down };
      });
      return { st: g.stageLabel, scr: m.screen, out };
    });
    for (const [i, o] of r.out.entries()) if (!o.down) await p.evaluate((row) => window.__lf.rows.push(row), { i, st: r.st, ...o });
    if (r.scr === 'results') break;
  }
  const s = await p.evaluate(() => {
    const rows = window.__lf.rows, by = {};
    for (const x of rows) {
      const e = by[x.st] ?? (by[x.st] = { n: 0, fit0: 0, fitLow: 0, touchUpright: 0, touchSofa: 0, jumps5: 0, maxJump: 0, wantBig: 0, wantBigCut: 0 });
      e.n++;
      if (x.fit < 0.01) e.fit0++;
      if (x.fit < 0.5) e.fitLow++;
      if (x.hits.length) e.touchUpright++;
      if (x.hits.includes('sofa')) e.touchSofa++;
      if (x.jump > 0.087) e.jumps5++;
      e.maxJump = Math.max(e.maxJump, x.jump);
      if (x.want > 0.1) { e.wantBig++; if (x.fit < 0.3) e.wantBigCut++; }
    }
    return by;
  });
  for (const [k, e] of Object.entries(s)) console.log(`${k}: muestras ${e.n}; leanFit=0 ${(100 * e.fit0 / e.n).toFixed(0)} %; leanFit<0,5 ${(100 * e.fitLow / e.n).toFixed(0)} %; tronco sin inclinar ya toca algo ${(100 * e.touchUpright / e.n).toFixed(0)} % (sofá ${(100 * e.touchSofa / e.n).toFixed(0)} %); inclinación pedida >0,1 rad recortada a <30 %: ${e.wantBigCut}/${e.wantBig}; saltos >5° de un fotograma a otro: ${e.jumps5}; salto máx ${(e.maxJump * 57.3).toFixed(1)}°`);
  await b.close();
})();
