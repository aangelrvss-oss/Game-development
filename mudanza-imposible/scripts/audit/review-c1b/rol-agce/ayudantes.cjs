// Revisor A+G+C+E (ciclo 1, segunda ronda): los ayudantes después de la corrección (perro de pie, medidas nuevas,
// fitScale y TiltFit). 1 humano (piloto) + 5 ayudantes del estilo pedido:
//  1) en fila en el patio, de pie: cuánto sobresale el cuerpo dibujado (tronco, cabeza y adornos; aparte, piernas y
//     brazos) de su cápsula y cuánto se mete bajo el suelo; capturas de cerca y con la cámara de juego;
//  2) tumbados hacia delante y hacia atrás: lo mismo, con capturas;
//  3) recorrido con el piloto: el peor sobresalir en movimiento, cuánto recorta TiltFit la inclinación pedida
//     (expresividad) y capturas con la cámara de juego.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/ayudantes.cjs [atentos|despistados]
const { launch, page, adv, shot, closeShot, OUT, mkOut } = require('./comun.cjs');
const STYLE = process.argv[2] || 'atentos';

(async () => {
  mkOut();
  const b = await launch();
  const p = await page(b, { humans: 1, carriers: 6, style: STYLE });
  const info = await p.evaluate(() => { const g = window.__mudanza.game; return { n: g.carriers.length, casts: g.carriers.map((c) => c.cast.cast), fits: window.__mudanza.view.carriers.map((v) => v.fit ?? null) }; });
  console.log('Reparto:', JSON.stringify(info));
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, V = m.view;
    return V.carriers.filter((v) => v.carrier.human === null).map((v) => {
      const c = v.carrier, rig = v.rig; v.group.updateMatrixWorld(true);
      const k = c.collider.translation(), q = c.collider.rotation();
      const ax = { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
      const hh = c.collider.shape.halfHeight, r = c.collider.shape.radius;
      const res = { body: 0, legs: 0, arms: 0, below: 0 };
      const V3 = v.group.position.constructor, w = new V3();
      const feet = c.down ? -1e9 : c.pos.y - (hh + r);
      const gy = c.pos.y - (hh + r);
      const check = (o, key) => {
        if (!o.isMesh || o.userData.outline) return;
        for (let a = o; a; a = a.parent) if (a.visible === false) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const dx = w.x - k.x, dy = w.y - k.y, dz = w.z - k.z;
          const t = Math.max(-hh, Math.min(hh, dx * ax.x + dy * ax.y + dz * ax.z));
          const d = Math.hypot(dx - ax.x * t, dy - ax.y * t, dz - ax.z * t) - r;
          res[key] = Math.max(res[key], d);
          if (key === 'body') res.below = Math.max(res.below, (c.down ? gy : feet) - w.y);
        }
      };
      const walk = (o, limb) => { const l = limb || !!o.userData.limb; if (o.isMesh) check(o, l ? 'legs' : 'body'); for (const ch of o.children) walk(ch, l); };
      walk(rig.pivot, false);
      for (const a of v.arms) check(a, 'arms');
      for (const h of v.hands) check(h, 'arms');
      return { cast: c.cast.cast, down: c.down || '', body: +(res.body * 100).toFixed(1), legs: +(res.legs * 100).toFixed(1), arms: +(res.arms * 100).toFixed(1), below: +(res.below * 100).toFixed(1), tiltK: v.tilt ? +v.tilt.fit.toFixed(2) : null, pitch: +v.pitch.toFixed(2), roll: +v.roll.toFixed(2) };
    });
  });
  const line = (arr) => arr.map((x) => `${x.cast}: cuerpo ${x.body} cm, piernas ${x.legs}, brazos ${x.arms}, bajo suelo ${x.below}`).join(' | ');
  // 1) En fila, de pie, mirando a la cámara (−z hacia la cámara de juego, que mira hacia −z… se orientan hacia +z)
  const lineup = () => p.evaluate(() => { const g = window.__mudanza.game; g.carriers.forEach((c, i) => { c.teleport({ x: -6 + i * 2.2, y: 0.75, z: 12 }); c.facing = { x: 0, z: 1 }; }); });
  await lineup();
  await adv(p, 20, 'return [{mx:0,mz:0,grab:false,turn:0,right:false}]');
  const up = await measure();
  console.log('DE PIE (cm fuera de la cápsula):', line(up));
  await shot(p, `ayu-${STYLE}-fila-juego.png`);
  for (let i = 1; i < 6; i++) await closeShot(p, `ayu-${STYLE}-${i}-cerca.png`, i, { a: Math.PI, d: 2.4, h: 0.6, ty: 0.05 });
  // 2) Tumbados
  for (const [name, sgn] of [['delante', 1], ['atras', -1]]) {
    await p.evaluate((sgn) => { for (const c of window.__mudanza.game.carriers) if (c.human === null) c.knockDown({ x: sgn * c.facing.x, z: sgn * c.facing.z }, 1.3, 'balance'); }, sgn);
    await adv(p, 14, 'return [{mx:0,mz:0,grab:false,turn:0,right:false}]');
    const dn = await measure();
    console.log(`TUMBADOS hacia ${name}:`, line(dn));
    await shot(p, `ayu-${STYLE}-tumbados-${name}-juego.png`);
    await closeShot(p, `ayu-${STYLE}-perro-tumbado-${name}-cerca.png`, 5, { a: Math.PI / 2, d: 2.6, h: 1.0, ty: -0.4 });
    await adv(p, 70, 'return [{mx:0,mz:0,grab:false,turn:0,right:false}]');
    await lineup();
    await adv(p, 15, 'return [{mx:0,mz:0,grab:false,turn:0,right:false}]');
  }
  // 3) Recorrido: reinicia la partida (mismo reparto) y deja al piloto
  await p.evaluate(() => window.__mudanza.start(false));
  await adv(p, 100, 'return [{mx:0,mz:0,grab:false,turn:0,right:false}]');
  const worst = {}; const tiltK = []; let n = 0, shots = 0, lastStage = '';
  for (let k = 0; k < 260; k++) {
    await adv(p, 6);
    const arr = await measure(); n++;
    for (const x of arr) {
      const w = (worst[x.cast] ??= { body: 0, below: 0, legs: 0, arms: 0 });
      if (!x.down) { w.body = Math.max(w.body, x.body); w.below = Math.max(w.below, x.below); w.legs = Math.max(w.legs, x.legs); w.arms = Math.max(w.arms, x.arms); }
      if (x.tiltK !== null && !x.down && (Math.abs(x.pitch) + Math.abs(x.roll)) > 0.1) tiltK.push(x.tiltK);
    }
    const st = await p.evaluate(() => ({ screen: window.__mudanza.screen, phase: window.__mudanza.game.phase, stage: window.__mudanza.game.stageLabel, t: window.__mudanza.game.time }));
    if (st.stage !== lastStage) { lastStage = st.stage; await shot(p, `ayu-${STYLE}-ruta-${String(++shots).padStart(2, '0')}-${st.stage}.png`); }
    if (st.phase !== 'playing') { console.log('Fin del recorrido:', JSON.stringify(st)); break; }
  }
  console.log('RECORRIDO, de pie (peor, cm fuera de la cápsula):', Object.entries(worst).map(([k, w]) => `${k}: cuerpo ${w.body}, piernas ${w.legs}, brazos ${w.arms}, bajo suelo ${w.below}`).join(' | '));
  tiltK.sort((a, b) => a - b);
  const q = (f) => tiltK.length ? tiltK[Math.floor(f * (tiltK.length - 1))] : NaN;
  console.log(`TiltFit con inclinación pedida > 0,1 rad (n=${tiltK.length}): fracción que se dibuja p10 ${q(0.1)}, mediana ${q(0.5)}, p90 ${q(0.9)}; recortada a < 0,3 en ${(100 * tiltK.filter((x) => x < 0.3).length / (tiltK.length || 1)).toFixed(0)} %`);
  console.log('Errores de página:', p.__errors.length ? p.__errors.slice(0, 3).join(' | ') : 'ninguno');
  await b.close();
})();
