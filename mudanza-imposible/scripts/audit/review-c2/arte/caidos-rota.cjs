// Revisión ciclo 2, rol arte. Caídos dentro del camión y en la rampa (con la partida en juego) y la lámpara rota.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c2/arte/caidos-rota.cjs <url> <carpeta>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.argv[2] || 'http://localhost:4192/';
const out = path.resolve(process.argv[3] || '/tmp/claude-0/review-c2/arte/work');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => p.screenshot({ path: path.join(out, `${n}.jpg`), type: 'jpeg', quality: 70 });
  const I = (o) => ({ mx: 0, mz: 0, grab: false, turn: 0, right: false, ...o });
  const adv = (n, inputs) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, `return ${JSON.stringify(inputs)}`]);
  const close = (at, yaw, d, h) => p.evaluate(([at, yaw, d, h]) => { const v = window.__mudanza.view, cam = v.camera; cam.position.set(at.x + Math.sin(yaw) * d, at.y + h, at.z + Math.cos(yaw) * d); cam.lookAt(at.x, at.y, at.z); cam.updateMatrixWorld(); v.renderer.render(v.scene, cam); }, [at, yaw, d, h]);
  const body = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game, V = m.view, out = [];
    const own = new Map(); g.items.forEach((it) => it.colliders.forEach((c) => own.set(c.handle, it.def.id)));
    V.carriers.forEach((v, i) => {
      if (!v.rig) return;
      const c = g.carriers[i], rig = v.rig; rig.group.updateMatrixWorld(true);
      const pts = [];
      rig.torso.traverse((o) => { if (o.isMesh) { const pos = o.geometry.attributes.position; for (let k = 0; k < pos.count; k += 4) pts.push(o.localToWorld(o.position.clone().set(pos.getX(k), pos.getY(k), pos.getZ(k)))); } });
      // y las botas y manos (miembros): cuánto entran en el camión
      let worst = 0, what = '';
      g.world.forEachCollider((col) => {
        if (col.handle === c.collider.handle) return;
        const t = col.translation(), ct = c.collider.translation();
        if (Math.hypot(t.x - ct.x, t.z - ct.z) > 8) return;
        for (const pt of pts) { const pr = col.projectPoint(pt, false); if (pr && pr.isInside) { const d = Math.hypot(pr.point.x - pt.x, pr.point.y - pt.y, pr.point.z - pt.z); if (d > worst) { worst = d; what = own.get(col.handle) ?? (col.parent().isFixed() ? 'fijo' : 'otro'); } } }
      });
      out.push({ j: i + 1, down: c.down, cm: +(worst * 100).toFixed(1), what });
    });
    return out;
  });

  // 1) Caídos dentro del camión, contra la pared, junto a objetos cargados, y en la rampa
  await p.goto(`${base}?nivel=pruebas&humans=4&carriers=4&capture=1`);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.evaluate(() => window.__mudanza.start(false));
  await adv(100, [I(), I(), I(), I()]);
  await p.evaluate(() => {
    const g = window.__mudanza.game, it = g.items;
    const put = (k, x, y, z) => { it[k].body.setTranslation({ x, y, z }, true); it[k].body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); it[k].body.setLinvel({ x: 0, y: 0, z: 0 }, true); };
    put(5, 10.8, 1.45, -1.2); // nevera al fondo
    put(6, 10.8, 1.37, 1.0);  // piano al fondo
    put(1, 8.6, 1.27, -1.4);  // una caja
    g.carriers[0].teleport({ x: 9.6, y: 1.75, z: -0.2 }); g.carriers[0].facing = { x: 1, z: 0 };
    g.carriers[1].teleport({ x: 8.0, y: 1.75, z: 1.5 }); g.carriers[1].facing = { x: 0, z: 1 };
    g.carriers[2].teleport({ x: 4.0, y: 1.35, z: 0.5 }); g.carriers[2].facing = { x: 1, z: 0 };
    g.carriers[3].teleport({ x: 7.2, y: 1.75, z: -1.2 }); g.carriers[3].facing = { x: 0, z: -1 };
  });
  await adv(10, [I(), I(), I(), I()]);
  await adv(6, [I({ mx: 1 }), I({ mz: 1 }), I({ mx: 1 }), I({ mz: -1 })]);
  const phase = await p.evaluate(() => window.__mudanza.game.phase);
  await p.evaluate(() => { const g = window.__mudanza.game; for (const c of g.carriers) g.stun(c); });
  const worst = [];
  let lyingShot = false;
  for (let k = 0; k < 60; k++) {
    await adv(1, [I(), I(), I(), I()]);
    const r = await body();
    r.forEach((x) => { if (!worst[x.j - 1] || x.cm > worst[x.j - 1].cm) worst[x.j - 1] = { ...x, k }; });
    if (!lyingShot && r.every((x) => x.down === 'lying')) { lyingShot = true; await shot('caidos2-camion-juego'); await close({ x: 8.0, y: 1.2, z: 0 }, -1.5708 + 0.55, 5.0, 3.0); await shot('caidos2-camion-cerca'); }
    if (k === 40) { await close({ x: 8.0, y: 1.2, z: 0 }, -1.5708 + 0.55, 5.0, 3.0); await shot('caidos2-camion-levantandose'); }
  }
  console.log(`fase al derribar: ${phase}`);
  console.log(`CAIDOS dentro del camión y en la rampa (peor solape del tronco/cabeza dibujados, cm): ${JSON.stringify(worst)}`);

  // 2) La lámpara se rompe al caer desde 1,6 m: cómo se ve rota
  await p.goto(`${base}?nivel=pruebas&humans=2&carriers=2&capture=1`);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.evaluate(() => window.__mudanza.start(false));
  await adv(100, [I(), I()]);
  const lp = await p.evaluate(() => { const it = window.__mudanza.game.items[3], t = it.body.translation(); return { x: t.x, y: t.y, z: t.z }; });
  await close(lp, 0.6, 2.4, 1.6); await shot('lampara-antes');
  await p.evaluate(() => { const it = window.__mudanza.game.items[3]; const t = it.body.translation(); it.body.setTranslation({ x: t.x, y: 1.9, z: t.z }, true); it.body.setRotation({ x: 0, y: 0, z: Math.sin(0.5), w: Math.cos(0.5) }, true); });
  await adv(45, [I(), I()]);
  const st = await p.evaluate(() => { const it = window.__mudanza.game.items[3], t = it.body.translation(); return { state: it.state, integrity: it.integrity, p: { x: t.x, y: t.y, z: t.z }, phase: window.__mudanza.game.phase }; });
  await shot('lampara-rota-juego');
  await close(st.p, 0.6, 2.4, 1.6); await shot('lampara-rota-cerca');
  console.log(`LAMPARA tras caer: ${JSON.stringify(st)}`);
  console.log('errores de página:', errors.filter((e) => !/deprecated/.test(e)).length);
  await b.close();
})();
