// Revisor A+G (ciclo 1): ¿dónde se dibujan brazos, manos y piernas del muñeco respecto a su tronco, a lo largo del
// recorrido? Mide, en cada muñeco, la distancia entre el hombro de verdad (el del tronco) y el principio del brazo
// dibujado, y entre el tronco y cada mano cuando no agarra. Partida a 2 con el piloto, en modo captura.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-ag-producto/brazos-sueltos.cjs http://localhost:4175/
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4175/';
const OUT = '/tmp/claude-0/review-c1/ag';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url + '?capture=1');
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game;
    return m.view.carriers.map((dv, i) => {
      const rig = dv.rig; if (!rig) return null;
      const c = g.carriers[i];
      const grp = rig.group;
      grp.updateMatrixWorld(true);
      // Hombro de verdad: el punto del tronco; mano dibujada: la malla de la manopla (hija del grupo)
      const torso = rig.torso;
      const sh = torso.localToWorld(new (torso.position.constructor)(0.3, 0.85, 0));
      const hands = rig.hands.map((h) => h.getWorldPosition(new (torso.position.constructor)()));
      const body = torso.getWorldPosition(new (torso.position.constructor)());
      const dHand = hands.map((h) => Math.hypot(h.x - body.x, h.z - body.z));
      return { t: +g.time.toFixed(1), x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), r: +Math.hypot(c.pos.x, c.pos.z).toFixed(2), holding: c.holding, dHand: dHand.map((d) => +d.toFixed(2)) };
    });
  });
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  const rows = [];
  rows.push(await measure());
  for (let k = 0; k < 120; k++) {
    await p.evaluate(() => window.__mudanza.advance(15, 30, 'return window.__mudanza.autoInputs(g)'));
    const r = await measure();
    rows.push(r);
    const st = await p.evaluate(() => ({ screen: window.__mudanza.screen, phase: window.__mudanza.game.phase, stage: window.__mudanza.game.stageLabel }));
    if (k % 10 === 0) {
      console.log(`t=${r[0].t} etapa ${st.stage}: ` + r.map((x, i) => `J${i + 1} (${x.x}, ${x.z}) a ${x.r} m del origen, agarra ${x.holding}, manos a ${x.dHand.join(' / ')} m del tronco`).join(' | '));
      await p.screenshot({ path: `${OUT}/ruta-${String(k).padStart(3, '0')}.png` });
    }
    if (st.screen !== 'play' || st.phase !== 'playing') { console.log('fin:', JSON.stringify(st)); break; }
  }
  const free = rows.flat().filter((x) => x && !x.holding);
  const worst = free.reduce((a, x) => (Math.max(...x.dHand) > Math.max(...a.dHand) ? x : a), free[0]);
  console.log(`Sin agarrar, mano más lejos del tronco: ${Math.max(...worst.dHand)} m (J en (${worst.x}, ${worst.z}), a ${worst.r} m del origen)`);
  // Relación con la distancia al origen del mundo (si el error es de escala, crece con ella)
  const pts = free.map((x) => [x.r, Math.max(...x.dHand)]);
  const n = pts.length, mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n;
  const cov = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0), vx = pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0), vy = pts.reduce((a, q) => a + (q[1] - my) ** 2, 0);
  console.log(`Correlación distancia al origen ↔ mano suelta: ${(cov / Math.sqrt(vx * vy)).toFixed(3)} (n=${n}); pendiente ${(cov / vx).toFixed(3)} m/m`);
  await b.close();
})();
