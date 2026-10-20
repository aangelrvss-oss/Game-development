// Revisor A+G+C+E (ciclo 1, segunda ronda): caída lejos del origen (donde el crítico de la primera ronda era peor).
// El piloto lleva el sofá hasta la etapa pedida; allí los dos tiran hacia fuera y J2 suelta sin dejar de tirar: se
// tambalea y cae. Se miden en el mundo las uniones de J2 (hombro, cadera, tobillo, mano) y cuánto se alejan manos y
// botas de su cápsula tumbada, cayendo, tumbado y levantándose. Capturas de cerca y con la cámara de juego.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/caida-lejos.cjs [etapa=Rampa]
const { launch, page, adv, shot, closeShot, screenBox, OUT, mkOut } = require('./comun.cjs');
const STAGE = process.argv[2] || 'Rampa';

(async () => {
  mkOut();
  const b = await launch();
  const p = await page(b, { humans: 2 });
  for (let k = 0; k < 200; k++) {
    await adv(p, 15);
    const st = await p.evaluate(() => window.__mudanza.game.stageLabel);
    if (st === STAGE) break;
  }
  await adv(p, 20);
  const where = await p.evaluate(() => { const g = window.__mudanza.game; return { st: g.stageLabel, c: g.carriers.map((c) => [+c.pos.x.toFixed(1), +c.pos.z.toFixed(1), c.holding]) }; });
  console.log('Etapa', where.st, 'porteadores', JSON.stringify(where.c));
  // Tiran hacia fuera (cada uno alejándose del centro del sofá) 1,2 s; luego J2 suelta tirando
  const outScript = (release) => `
    const s = g.sofaPos; return g.carriers.map((c, i) => { const dx = c.pos.x - s.x, dz = c.pos.z - s.z, l = Math.hypot(dx, dz) || 1;
      return { mx: dx / l, mz: dz / l, grab: ${release} && i === 1, turn: 0, right: false }; });`;
  await adv(p, 36, outScript(false));
  await adv(p, 1, outScript(true));
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game, i = 1, v = m.view.carriers[i], rig = v.rig, c = g.carriers[i];
    rig.group.updateMatrixWorld(true);
    const V = rig.torso.position.constructor, GM = rig.group.matrixWorld;
    const W = (o, x, y, z) => o.localToWorld(new V(x, y, z));
    const tubeEnd = (t, last) => t.pts[last ? t.pts.length - 1 : 0].clone().applyMatrix4(GM);
    const d = (a, bb) => Math.hypot(a.x - bb.x, a.y - bb.y, a.z - bb.z);
    const sh = Math.max(...[-1, 1].map((s, k) => d(tubeEnd(rig.arms[k], false), W(rig.torso, s * 0.325, 0.83, 0))));
    const hip = Math.max(...[-1, 1].map((s, k) => d(tubeEnd(rig.legs[k], false), W(rig.torso, s * 0.13, 0.38, 0))));
    const ank = Math.max(...[0, 1].map((k) => d(tubeEnd(rig.legs[k], true), W(rig.boots[k], 0, 0.09, 0.02))));
    const hand = Math.max(...[0, 1].map((k) => d(tubeEnd(rig.arms[k], true), rig.hands[k].getWorldPosition(new V()))));
    // Distancia de manos y botas a la superficie de su cápsula (positiva: fuera)
    const sh2 = c.collider.shape, k0 = c.collider.translation(), q = c.collider.rotation();
    const Q = rig.group.quaternion.constructor;
    const axis = new V(0, 1, 0).applyQuaternion(new Q(q.x, q.y, q.z, q.w));
    const outOf = (pt) => { const rel = new V(pt.x - k0.x, pt.y - k0.y, pt.z - k0.z); const t = Math.max(-sh2.halfHeight, Math.min(sh2.halfHeight, rel.dot(axis))); return rel.sub(axis.clone().multiplyScalar(t)).length() - sh2.radius; };
    const handsOut = Math.max(...rig.hands.map((h) => outOf(h.getWorldPosition(new V()))));
    const bootsOut = Math.max(...rig.boots.map((bt) => outOf(bt.getWorldPosition(new V()))));
    return { t: +g.time.toFixed(2), r: +Math.hypot(c.pos.x, c.pos.z).toFixed(1), down: c.down || '', stun: +c.stunned.toFixed(2), wob: c.wobbling, tilt: +c.tilt.toFixed(2), sh, hip, ank, hand, handsOut, bootsOut };
  });
  const rows = [];
  const shots = new Set();
  for (let k = 0; k < 120; k++) {
    await adv(p, 1, `return [{mx:0,mz:0,grab:false,turn:0,right:false},{mx:0,mz:0,grab:false,turn:0,right:false}]`);
    const r = await measure(); rows.push(r);
    const key = r.down || (r.wob ? 'tambaleo' : 'pie');
    if (!shots.has(key)) {
      shots.add(key);
      await closeShot(p, `caida-${STAGE}-${key}-cerca.png`, 1, { a: 1.4, d: 3.0, h: 1.4, ty: -0.2 });
      await shot(p, `caida-${STAGE}-${key}-juego.png`, await screenBox(p, 1, 160));
      console.log(`  ${key} en t=${r.t}: a ${r.r} m del origen; hombro ${r.sh.toFixed(3)}, cadera ${r.hip.toFixed(3)}, tobillo ${r.ank.toFixed(3)}, mano ${r.hand.toFixed(3)}; manos fuera de la cápsula ${r.handsOut.toFixed(2)} m, botas ${r.bootsOut.toFixed(2)} m`);
    }
    if (k > 20 && !r.down && !r.wob && shots.has('rising')) break;
  }
  const grp = {};
  for (const r of rows) (grp[r.down || (r.wob ? 'tambaleo' : 'pie')] ??= []).push(r);
  for (const [k, arr] of Object.entries(grp)) {
    const mx = (f) => Math.max(...arr.map((x) => x[f]));
    console.log(`${k} (n=${arr.length}): hombro ≤ ${mx('sh').toFixed(3)}, cadera ≤ ${mx('hip').toFixed(3)}, tobillo ≤ ${mx('ank').toFixed(3)}, mano ≤ ${mx('hand').toFixed(3)}; manos fuera ≤ ${mx('handsOut').toFixed(2)} m, botas fuera ≤ ${mx('bootsOut').toFixed(2)} m`);
  }
  console.log('Errores de página:', p.__errors.length ? p.__errors.slice(0, 3).join(' | ') : 'ninguno');
  await b.close();
})();
