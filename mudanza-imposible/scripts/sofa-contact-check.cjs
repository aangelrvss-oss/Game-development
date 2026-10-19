// Comprobación visual y numérica del contacto entre los muñecos y el sofá (partida a dos, modo captura).
// Uso: node scripts/sofa-contact-check.cjs <carpeta> [url] [ruta]   (demo servida en :4173)
// Mide, en cada fotograma, cuánto entra en el sofá:
// - la cápsula física de cada jugador (la que choca), y
// - el cuerpo DIBUJADO del muñeco: tronco y cabeza como esferas (las manos y antebrazos no cuentan: tocar
//   el mueble con ellas es agarrarlo).
// Escenarios: empujar el lateral sin agarrar, agarrar y girar a los dos lados, alzar y llevar girando,
// soltar y volver contra el sofá, soltar tirando (caída), caer contra el sofá (el mismo derribo que un coche)
// y, con `ruta`, el recorrido completo con el piloto automático. Guarda primeros planos de cada escenario.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'shots/contacto');
const url = process.argv[3] || 'http://localhost:4173/';
const withRoute = process.argv[4] === 'ruta';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  const I = (o) => JSON.stringify({ mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false, ...o });
  const adv = (n, a = {}, b2 = {}) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, `return [${I(a)}, ${I(b2)}]`]);
  const shot = (name) => p.screenshot({ path: path.join(out, `${name}.png`) });
  /** Primer plano: cámara a `d` m del punto medio entre el jugador i y el sofá, girada `a`. */
  const close = (i, a, d = 3, h = 1.6) => p.evaluate(([i, a, d, h]) => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[i], s = m.game.sofaPos, cam = v.camera;
    const cx = (c.pos.x + s.x) / 2, cz = (c.pos.z + s.z) / 2;
    const yaw = Math.atan2(c.pos.x - s.x, c.pos.z - s.z) + a;
    cam.position.set(cx + Math.sin(yaw) * d, c.pos.y + h, cz + Math.cos(yaw) * d);
    cam.lookAt(cx, c.pos.y - 0.1, cz); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  }, [i, a, d, h]);
  /** Solape con el sofá (cm, positivo = dentro): cápsula física y cuerpo dibujado, por jugador. */
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game, V = m.view;
    const T = V.carriers[0].group.constructor; // THREE.Group, para no importar three aquí
    const depth = (pt, r) => {
      let worst = -Infinity;
      for (const col of g.sofaColliders) {
        const pr = col.projectPoint(pt, false);
        if (!pr) continue;
        const d = Math.hypot(pr.point.x - pt.x, pr.point.y - pt.y, pr.point.z - pt.z);
        worst = Math.max(worst, pr.isInside ? r + d : r - d);
      }
      return worst;
    };
    return V.carriers.filter((v) => v.rig).map((v) => {
      const c = v.carrier;
      let cap = 0;
      for (const col of g.sofaColliders) { const k = c.collider.contactCollider(col, 0); if (k && k.distance < 0) cap = Math.max(cap, -k.distance); }
      // Tronco (y local, radio del modelo) y cabeza, con la escala real del muñeco
      const rig = v.rig, ws = rig.torso.getWorldScale(rig.torso.position.clone()).x;
      let body = -Infinity;
      for (const [y, r] of [[0.45, 0.33], [0.6, 0.355], [0.75, 0.335], [0.88, 0.27]]) {
        const w = rig.torso.localToWorld(rig.torso.position.clone().set(0, y, 0));
        body = Math.max(body, depth({ x: w.x, y: w.y, z: w.z }, r * ws));
      }
      const hw = rig.head.localToWorld(rig.head.position.clone().set(0, 0.25, 0));
      body = Math.max(body, depth({ x: hw.x, y: hw.y, z: hw.z }, 0.33 * ws));
      void T;
      return { cap: cap * 100, body: Math.max(0, body) * 100, holding: c.holding, down: c.stunned > 0 };
    });
  });
  const results = [];
  /** Avanza `n` fotogramas midiendo; devuelve el peor solape del cuerpo dibujado y de la cápsula. */
  async function scenario(name, frames, a, b2, opts = {}) {
    let cap = 0, body = 0, n = 0, bad = 0, worstAt = -1;
    for (let k = 0; k < frames; k++) {
      const ia = typeof a === 'function' ? a(k) : a, ib = typeof b2 === 'function' ? b2(k) : b2;
      await adv(1, ia, ib);
      const r = await measure();
      const fb = Math.max(...r.map((x) => x.body)), fc = Math.max(...r.map((x) => x.cap));
      if (fb > body) { body = fb; worstAt = k; }
      cap = Math.max(cap, fc); n++; if (fb > 3) bad++;
      if (opts.shotAt === k) { await shot(`${name}-juego`); await close(opts.who ?? 0, opts.angle ?? 0.9); await shot(`${name}-cerca`); }
    }
    results.push({ name, cap: +cap.toFixed(1), body: +body.toFixed(1), pctOver3cm: +((100 * bad) / n).toFixed(0), worstAt });
  }

  await adv(100); // cuenta atrás (J1 a la derecha del sofá, J2 a la izquierda)
  // 1. J1 rodea y empuja el lateral largo del sofá sin agarrarlo
  await p.evaluate(() => { const g = window.__mudanza.game; g.carriers[0].teleport({ x: 0.5, y: 0.7, z: g.sofaPos.z + 1.6 }); });
  await scenario('1-empuja-lateral', 45, { mz: -1, mx: -0.3 }, {}, { shotAt: 40, angle: 1.2 });
  await p.evaluate(() => { const g = window.__mudanza.game; g.carriers[0].teleport({ x: g.sofaPos.x + 2.2, y: 0.7, z: g.sofaPos.z }); });
  await adv(10);
  // 2. Agarran los extremos y lo giran a un lado y al otro
  await adv(1, { grab: true }, { grab: true });
  await scenario('2-giro-a', 50, { mz: -1 }, { mz: 1 }, { shotAt: 45, angle: 1.0 });
  await scenario('2-giro-b', 70, { mz: 1 }, { mz: -1 }, { shotAt: 65, angle: -1.0 });
  // 3. Alzan y lo llevan girando
  await scenario('3-alzan-llevan', 60, (k) => ({ mz: -1, mx: Math.sin(k / 8), lift: true }), (k) => ({ mz: -1, mx: -Math.sin(k / 8), lift: true }), { shotAt: 50, angle: 1.4 });
  // 4. J1 empuja hacia el sofá mientras lo sujeta y J2 empuja de lado
  await scenario('4-empuja-agarrado', 45, { mx: -1, lift: true }, { mz: 1 }, { shotAt: 40, angle: 1.1 });
  // 5. Sueltan y J1 se mete contra el extremo
  await adv(1, { grab: true }, { grab: true });
  await scenario('5-suelta-y-empuja', 45, () => ({}), {}, {});
  await p.evaluate(() => {});
  const toSofa = () => p.evaluate(() => { const g = window.__mudanza.game, c = g.carriers[0].pos, s = g.sofaPos, d = Math.hypot(s.x - c.x, s.z - c.z) || 1; return { mx: (s.x - c.x) / d, mz: (s.z - c.z) / d }; });
  const dir = await toSofa();
  await scenario('5-suelta-y-empuja', 40, dir, {}, { shotAt: 35, angle: 1.3 });
  // 6. Vuelven a agarrar y J2 suelta tirando: se tambalea y cae (lejos del sofá)
  await p.evaluate(() => { const g = window.__mudanza.game, s = g.sofaPos; g.carriers[0].teleport({ x: s.x + 2.3, y: 0.7, z: s.z }); g.carriers[1].teleport({ x: s.x - 2.3, y: 0.7, z: s.z }); });
  await adv(15);
  await p.evaluate(() => { const g = window.__mudanza.game, s = g.sofa; g.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true); void s; });
  await adv(1, { grab: true }, { grab: true });
  await scenario('6-soltar-tirando', 36, { mx: 1 }, { mx: -1 }, {});
  await adv(1, { mx: 1 }, { mx: -1, grab: true });
  await scenario('6-soltar-tirando', 60, { mx: 1 }, { mx: -1 }, { shotAt: 25, who: 1, angle: 1.2 });
  // 7. J2 corre hacia el sofá y le derriban en marcha (mismo derribo que un coche): cae hacia el sofá
  await adv(1, { grab: true }, {});
  await adv(40);
  await p.evaluate(() => { const g = window.__mudanza.game, s = g.sofaPos; g.carriers[1].teleport({ x: s.x - 2.2, y: 0.7, z: s.z + 0.1 }); });
  await adv(6);
  await scenario('7-cae-contra-sofa', 8, {}, { mx: 1 }, {});
  await p.evaluate(() => window.__mudanza.game.stun(window.__mudanza.game.carriers[1]));
  await scenario('7-cae-contra-sofa', 70, {}, {}, { shotAt: 22, who: 1, angle: 1.3 });
  console.log(JSON.stringify(results, null, 0).replace(/},{/g, '},\n {'));

  if (withRoute) {
    await p.evaluate(() => window.__mudanza.start(false, false));
    await p.waitForFunction(() => window.__mudanza.game.phase !== 'won');
    const byStage = {};
    let shots = 0;
    for (let k = 0; k < 1500; k++) {
      await p.evaluate(() => window.__mudanza.advance(2, 30, 'return window.__mudanza.autoInputs(g)'));
      const r = await measure();
      const st = await p.evaluate(() => ({ s: window.__mudanza.game.stageLabel, scr: window.__mudanza.screen, t: window.__mudanza.game.time }));
      const e = byStage[st.s] ?? (byStage[st.s] = { cap: 0, body: 0, n: 0, over3: 0 });
      const fb = Math.max(...r.map((x) => x.body));
      e.cap = Math.max(e.cap, ...r.map((x) => x.cap)); e.body = Math.max(e.body, fb); e.n++; if (fb > 3) e.over3++;
      if (k % 120 === 60 && shots < 8) { await shot(`ruta-${String(shots++).padStart(2, '0')}`); }
      if (st.scr === 'results') { console.log('ruta: fin', st.t.toFixed(1), 's'); break; }
    }
    for (const [s, e] of Object.entries(byStage)) console.log(`ruta ${s}: cápsula ${e.cap.toFixed(1)} cm, cuerpo dibujado ${e.body.toFixed(1)} cm, ${((100 * e.over3) / e.n).toFixed(0)} % > 3 cm`);
  }
  console.log('errores:', errors.filter((e) => !/deprecated parameters/.test(e)).length, errors.slice(0, 3).join(' | '));
  await b.close();
})();
