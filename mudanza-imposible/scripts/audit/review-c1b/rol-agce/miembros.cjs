// Revisor A+G+C+E (ciclo 1, segunda ronda): ¿siguen pegados al cuerpo brazos, manos, piernas y botas del muñeco en
// todo el recorrido, de pie, agarrando, cayendo, tumbado y levantándose, lejos del origen del mundo?
// Medido en el MUNDO (no en el espacio del grupo, para no repetir el cálculo del propio código):
//  - hombro: inicio del tubo del brazo frente al punto del hombro en el tronco (DIM.shoulderX, DIM.shoulderY);
//  - cadera: inicio del tubo de la pierna frente al punto de la cadera en el tronco (DIM.hipX, DIM.hipY − 0,03);
//  - tobillo: final del tubo de la pierna frente al tobillo de la bota (0, ankleH, 0,02 de la bota);
//  - mano: final del tubo del brazo frente a la manopla (0,06 del modelo por diseño);
//  - botas: distancia horizontal de cada bota al eje de la cápsula de pie (deberían quedar bajo el cuerpo);
//  - agarrando: distancia de cada manopla al punto agarrado.
// Partida a N con el piloto (modo captura) y, al final, J1 suelta tirando cerca del camión para forzar una caída.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/miembros.cjs [humanos]
const { launch, page, adv, shot, closeShot, screenBox, OUT, mkOut } = require('./comun.cjs');
const N = parseInt(process.argv[2] || '2', 10);

(async () => {
  mkOut();
  const b = await launch();
  const p = await page(b, { humans: N });
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game;
    return m.view.carriers.map((v, i) => {
      const rig = v.rig; if (!rig) return null;
      const c = g.carriers[i];
      rig.group.updateMatrixWorld(true);
      const V = rig.torso.position.constructor, GM = rig.group.matrixWorld;
      const W = (o, x, y, z) => o.localToWorld(new V(x, y, z));
      const tubeEnd = (t, last) => t.pts[last ? t.pts.length - 1 : 0].clone().applyMatrix4(GM);
      const d = (a, bb) => Math.hypot(a.x - bb.x, a.y - bb.y, a.z - bb.z);
      const sh = [-1, 1].map((s, k) => d(tubeEnd(rig.arms[k], false), W(rig.torso, s * 0.325, 0.83, 0)));
      const hip = [-1, 1].map((s, k) => d(tubeEnd(rig.legs[k], false), W(rig.torso, s * 0.13, 0.38, 0)));
      const ank = [0, 1].map((k) => d(tubeEnd(rig.legs[k], true), W(rig.boots[k], 0, 0.09, 0.02)));
      const hand = [0, 1].map((k) => d(tubeEnd(rig.arms[k], true), rig.hands[k].getWorldPosition(new V())));
      const k0 = c.collider.translation();
      const boot = [0, 1].map((k) => { const q = rig.boots[k].getWorldPosition(new V()); return Math.hypot(q.x - k0.x, q.z - k0.z); });
      const gw = c.grabWorld ? c.grabWorld() : null;
      const grab = gw ? [0, 1].map((k) => d(rig.hands[k].getWorldPosition(new V()), gw)) : null;
      return {
        t: +g.time.toFixed(2), r: +Math.hypot(c.pos.x, c.pos.z).toFixed(1), x: +c.pos.x.toFixed(1), z: +c.pos.z.toFixed(1),
        down: c.down || '', hold: c.holding, stage: g.stageLabel,
        sh: Math.max(...sh), hip: Math.max(...hip), ank: Math.max(...ank), hand: Math.max(...hand), boot: Math.max(...boot), grab: grab ? Math.max(...grab) : null,
      };
    });
  });
  const rows = [];
  let lastStage = '', shots = 0;
  for (let k = 0; k < 400; k++) {
    await adv(p, 6);
    const r = await measure();
    rows.push(...r.filter(Boolean));
    const st = await p.evaluate(() => ({ screen: window.__mudanza.screen, phase: window.__mudanza.game.phase, stage: window.__mudanza.game.stageLabel }));
    if (st.stage !== lastStage) {
      lastStage = st.stage;
      console.log(`t=${r[0].t} etapa ${st.stage}: ` + r.map((x, i) => `J${i + 1} a ${x.r} m del origen: hombro ${x.sh.toFixed(3)}, cadera ${x.hip.toFixed(3)}, tobillo ${x.ank.toFixed(3)}, mano ${x.hand.toFixed(3)}, bota-eje ${x.boot.toFixed(2)}${x.grab !== null ? `, mano-asa ${x.grab.toFixed(2)}` : ''}`).join(' | '));
      await shot(p, `mie-${N}j-${String(++shots).padStart(2, '0')}-${st.stage}.png`);
    }
    if (st.screen !== 'play' || st.phase !== 'playing') { console.log('fin:', JSON.stringify(st), 't', r[0].t); break; }
  }
  // Junto al camión: J1 suelta tirando (cae) — tumbado y levantándose, lejos del origen
  const ph = await p.evaluate(() => window.__mudanza.game.phase);
  if (ph === 'playing') {
    await adv(p, 1, 'const a = window.__mudanza.autoInputs(g); a[0] = { ...a[0], grab: g.carriers[0].holding }; return a;');
  }
  // Resumen
  const by = (f) => rows.filter(f);
  const mx = (arr, k) => arr.length ? Math.max(...arr.map((x) => x[k] ?? 0)) : NaN;
  const groups = { 'de pie': by((x) => !x.down), 'cayendo/tumbado': by((x) => x.down && x.down !== 'rising'), 'levantándose': by((x) => x.down === 'rising'), 'agarrando': by((x) => x.hold && !x.down) };
  for (const [name, arr] of Object.entries(groups)) {
    console.log(`${name} (n=${arr.length}, hasta ${mx(arr, 'r')} m del origen): hombro ≤ ${mx(arr, 'sh').toFixed(3)} m, cadera ≤ ${mx(arr, 'hip').toFixed(3)}, tobillo ≤ ${mx(arr, 'ank').toFixed(3)}, mano ≤ ${mx(arr, 'hand').toFixed(3)}, bota-eje ≤ ${mx(arr, 'boot').toFixed(2)}` + (name === 'agarrando' ? `, mano-asa ≤ ${mx(arr, 'grab').toFixed(2)}` : ''));
  }
  // Correlación con la distancia al origen (si quedara un error de escala, crecería con ella)
  const pts = rows.map((x) => [x.r, Math.max(x.sh, x.hip, x.ank)]);
  const n = pts.length, mxr = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n;
  const cov = pts.reduce((a, q) => a + (q[0] - mxr) * (q[1] - my), 0), vx = pts.reduce((a, q) => a + (q[0] - mxr) ** 2, 0), vy = pts.reduce((a, q) => a + (q[1] - my) ** 2, 0);
  console.log(`Correlación distancia al origen ↔ peor unión: ${(cov / Math.sqrt(vx * vy || 1)).toFixed(3)} (n=${n})`);
  console.log('Errores de página:', p.__errors.length ? p.__errors.slice(0, 3).join(' | ') : 'ninguno');
  await b.close();
})();
