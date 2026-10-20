// Revisión independiente del ciclo 2 (rol arte técnico y animación). Solo lectura: capturas y medidas en Chromium.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c2/arte/arte-navegador.cjs <url> <carpeta> <escenas: patio,agarres,rampa,camion,caidos,calle,base,encuadre>
// - patio: vista de juego del patio en reposo (color y en gris), y primeros planos de cada objeto;
// - agarres: cada objeto agarrado por 1..N personas (las asas en orden), en el sitio y andando; mide la altura de la
//   base, el hueco de cada manopla a la superficie del objeto y el solape del cuerpo dibujado;
// - rampa / camion / caidos / encuadre: el piloto con 4, subiendo por la rampa, dentro del camión, apilado, caídos;
// - calle / base: el sofá en «La calle» (también vale para 657fd30, sin `items`).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.argv[2] || 'http://localhost:4192/';
const out = path.resolve(process.argv[3] || '/tmp/claude-0/review-c2/arte/work');
const scenes = (process.argv[4] || 'patio,agarres,rampa,camion,caidos,calle,encuadre').split(',');
const withParams = (u, q) => { const x = new URL(u); for (const [k, v] of Object.entries(q)) x.searchParams.set(k, String(v)); return x.href; };
const PILOT = 'return window.__mudanza.autoInputs(g)';
const log = (...a) => console.log(...a);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name) => { await p.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 70 }); };
  const gray = (on) => p.evaluate((on) => { document.querySelector('canvas').style.filter = on ? 'grayscale(1)' : ''; }, on);
  async function open(q) {
    await p.goto(withParams(base, { capture: 1, ...q }));
    await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
    await p.evaluate(() => window.__mudanza.start(false));
  }
  const I = (o) => ({ mx: 0, mz: 0, grab: false, turn: 0, right: false, ...o });
  /** Avanza n fotogramas (1/30 s) con las entradas fijas (lista por jugador). */
  const adv = (n, inputs) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, inputs ? `return ${JSON.stringify(inputs)}` : PILOT]);
  const fast = (t) => p.evaluate((t) => { const m = window.__mudanza, g = m.game; for (let i = 0; i < 60 * 300 && g.time < t && (g.phase === 'countdown' || g.phase === 'playing'); i++) g.step(1 / 60, m.autoInputs(g)); }, t);
  /** Primer plano: cámara a `d` m de `at`, desde el rumbo `yaw` y `h` m de alto, mirando a `at`. */
  const close = (at, yaw, d = 3, h = 1.8) => p.evaluate(([at, yaw, d, h]) => {
    const v = window.__mudanza.view, cam = v.camera;
    // Oculta el HUD para que se vea el primer plano
    document.body.classList.add('nohud');
    cam.position.set(at.x + Math.sin(yaw) * d, at.y + h, at.z + Math.cos(yaw) * d);
    cam.lookAt(at.x, at.y, at.z); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  }, [at, yaw, d, h]);

  // En la página: utilidades de medida (inyectadas una vez por carga)
  const inject = () => p.evaluate(() => {
    const m = window.__mudanza;
    m.__arte = {
      rot(q, v) { // gira v por el cuaternión q
        const { x, y, z, w } = q, ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
        return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
      },
      handleWorld(it, k) { const h = it.def.handles[k], q = it.body.rotation(), t = it.body.translation(), a = this.rot(q, h.p), o = this.rot(q, h.out); return { p: { x: t.x + a.x, y: t.y + a.y, z: t.z + a.z }, out: o }; },
      sd(pt, cols) { let best = Infinity; for (const col of cols) { const pr = col.projectPoint(pt, false); if (!pr) continue; const d = Math.hypot(pr.point.x - pt.x, pr.point.y - pt.y, pr.point.z - pt.z); best = Math.min(best, pr.isInside ? -d : d); } return best; },
      /** Base del objeto sobre el suelo (mínimo de las esquinas de sus cajas) */
      baseY(it) { const q = it.body.rotation(), t = it.body.translation(); let mn = Infinity; for (const b of it.def.shape) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const a = this.rot(q, { x: b.p.x + sx * b.h.x, y: b.p.y + sy * b.h.y, z: b.p.z + sz * b.h.z }); mn = Math.min(mn, t.y + a.y); } return mn; },
      /** Manoplas de los jugadores que agarran `it`: hueco a la superficie (cm, menos el radio de la palma) */
      hands(it) {
        const g = m.game, V = m.view, res = [];
        V.carriers.forEach((v, i) => {
          const c = g.carriers[i];
          if (!v.rig || c.heldBody !== it.body) return;
          v.rig.group.updateMatrixWorld(true);
          for (const h of v.rig.hands) { const w = h.getWorldPosition(h.position.clone()); res.push(+((this.sd(w, it.colliders) - 0.09 * 0.891) * 100).toFixed(1)); }
        });
        return res;
      },
      /** Solape (cm) del tronco y cabeza dibujados de cada jugador con cualquier collider ajeno (por clase). */
      body() {
        const g = m.game, V = m.view, out = [];
        const own = new Map(); (g.items ?? [{ def: { id: "sofa" }, colliders: g.sofaColliders }]).forEach((it) => it.colliders.forEach((c) => own.set(c.handle, it.def.id)));
        g.carriers.forEach((c) => own.set(c.collider.handle, 'muñeco'));
        V.carriers.forEach((v, i) => {
          if (!v.rig) return;
          const c = g.carriers[i], rig = v.rig; rig.group.updateMatrixWorld(true);
          const pts = [];
          rig.torso.traverse((o) => { if (o.isMesh) { const pos = o.geometry.attributes.position; for (let k = 0; k < pos.count; k += 4) pts.push(o.localToWorld(o.position.clone().set(pos.getX(k), pos.getY(k), pos.getZ(k)))); } });
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
      },
      /** Solape entre colliders de objetos (cm) */
      itemItem() {
        const g = m.game, res = [];
        for (const a of g.items) for (const b of g.items) { if (a.index >= b.index) continue; for (const ca of a.colliders) for (const cb of b.colliders) { const k = ca.contactCollider(cb, 0); if (k && k.distance < -0.005) res.push(`${a.def.id}#${a.index}/${b.def.id}#${b.index} ${(-k.distance * 100).toFixed(1)}`); } }
        return res;
      },
      /** Objetos frente a piezas fijas (camión): solape de colliders (cm) */
      itemFixed() {
        const g = m.game, res = [];
        for (const a of g.items) for (const ca of a.colliders) g.world.forEachCollider((cf) => { if (!cf.parent().isFixed()) return; const k = ca.contactCollider(cf, 0); if (k && k.distance < -0.01) res.push(`${a.def.id}#${a.index} ${(-k.distance * 100).toFixed(1)}`); });
        return res;
      },
    };
  });
  const css = () => p.addStyleTag({ content: 'body.nohud #hud, body.nohud .hud, body.nohud [id^="h-"], body.nohud #help, body.nohud #players { visibility: hidden !important; }' });

  // ---------------- PATIO EN REPOSO ----------------
  if (scenes.includes('patio')) {
    await open({ nivel: 'pruebas', humans: 4, carriers: 4 });
    await inject(); await css();
    await adv(100, [I(), I(), I(), I()]); // cuenta atrás, quietos
    await p.evaluate(() => { const g = window.__mudanza.game; g.carriers.forEach((c, i) => { c.teleport({ x: -11 + i * 1.3, y: 0.75, z: -1 }); c.facing = { x: 0, z: 1 }; }); });
    await adv(20, [I(), I(), I(), I()]);
    await p.evaluate(() => window.__mudanza.setZoom(1.35));
    await adv(30, [I(), I(), I(), I()]);
    await shot('patio-juego-reposo');
    await gray(true); await shot('patio-juego-reposo-gris'); await gray(false);
    // Cerca de los jugadores (¿se distinguen sin color?)
    await p.evaluate(() => window.__mudanza.setZoom(0.6));
    await adv(40, [I(), I(), I(), I()]);
    await gray(true); await shot('patio-jugadores-gris'); await gray(false);
    await p.evaluate(() => window.__mudanza.setZoom(null));
    const items = await p.evaluate(() => window.__mudanza.game.items.map((it) => ({ id: it.def.id, i: it.index, p: it.body.translation() })));
    for (const it of items) { await close(it.p, 0.6, 2.6, 1.9); await shot(`reposo-${it.id}${it.i}`); }
    log('patio reposo: objetos', JSON.stringify(items.map((x) => [x.id, +x.p.x.toFixed(2), +x.p.y.toFixed(2), +x.p.z.toFixed(2)])));
  }

  // ---------------- AGARRES 1..4 ----------------
  if (scenes.includes('agarres')) {
    for (const [id, idx] of [['caja', 1], ['silla', 4], ['lampara', 3], ['mesa', 0], ['nevera', 5], ['piano', 6]]) {
      const nH = await (async () => { await open({ nivel: 'pruebas', humans: 4, carriers: 4 }); await inject(); await css(); await adv(100, [I(), I(), I(), I()]); return p.evaluate((idx) => window.__mudanza.game.items[idx].def.handles.length, idx); })();
      for (let n = 1; n <= Math.min(4, nH); n++) {
        if (n > 1) { await open({ nivel: 'pruebas', humans: 4, carriers: 4 }); await inject(); await css(); await adv(100, [I(), I(), I(), I()]); }
        // El objeto al centro-oeste del patio, de pie y quieto; los demás apartados lejos
        await p.evaluate(([idx, n]) => {
          const m = window.__mudanza, g = m.game, A = m.__arte, it = g.items[idx];
          g.items.forEach((o, k) => { if (k !== idx) { o.body.setTranslation({ x: -14 + k * 0.1, y: o.body.translation().y, z: -8 + k * 2.2 }, true); o.body.setLinvel({ x: 0, y: 0, z: 0 }, true); } });
          const y0 = it.body.translation().y;
          it.body.setTranslation({ x: -7, y: y0 + 0.02, z: 0 }, true); it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
          it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          g.carriers.forEach((c, i) => {
            if (i < n) { const h = A.handleWorld(it, i); c.teleport({ x: h.p.x + h.out.x * 0.55, y: 0.75, z: h.p.z + h.out.z * 0.55 }); c.facing = { x: -h.out.x, z: -h.out.z }; }
            else c.teleport({ x: -13, y: 0.75, z: 6 + i });
          });
        }, [idx, n]);
        await adv(10, [I(), I(), I(), I()]);
        // Agarran los n primeros (cada uno su asa: la más cercana a su mano)
        await adv(1, [0, 1, 2, 3].map((i) => I({ grab: i < n })));
        await adv(40, [I(), I(), I(), I()]);
        const r0 = await p.evaluate((idx) => { const m = window.__mudanza, g = m.game, A = m.__arte, it = g.items[idx]; return { holders: g.carriers.filter((c) => c.heldBody === it.body).length, base: +(A.baseY(it) * 100).toFixed(1), hands: A.hands(it), body: A.body().filter((x) => x.cm > 0) }; }, idx);
        const at = await p.evaluate((idx) => window.__mudanza.game.items[idx].body.translation(), idx);
        await close(at, 0.7, 2.6 + (n > 2 ? 0.4 : 0), 1.7);
        await shot(`agarre-${id}-${n}-quietos`);
        // Andan juntos hacia el sur (hacia la cámara) 1,2 s
        let minBase = Infinity, maxGap = -Infinity;
        for (let k = 0; k < 6; k++) {
          await adv(6, [0, 1, 2, 3].map((i) => (i < n ? I({ mz: 0.8 }) : I())));
          const r = await p.evaluate((idx) => { const m = window.__mudanza, A = m.__arte, it = m.game.items[idx]; return { base: A.baseY(it), hands: A.hands(it) }; }, idx);
          minBase = Math.min(minBase, r.base); maxGap = Math.max(maxGap, ...r.hands, -Infinity);
        }
        const at2 = await p.evaluate((idx) => window.__mudanza.game.items[idx].body.translation(), idx);
        await close(at2, 0.7, 2.6 + (n > 2 ? 0.4 : 0), 1.7);
        await shot(`agarre-${id}-${n}-andando`);
        const rEnd = await p.evaluate((idx) => { const m = window.__mudanza, g = m.game, it = g.items[idx]; return { holders: g.carriers.filter((c) => c.heldBody === it.body).length, body: m.__arte.body().filter((x) => x.cm > 0), states: m.view.carriers.slice(0, 4).map((v) => v.src?.state) }; }, idx);
        log(`AGARRE ${id} n=${n}: agarran ${r0.holders} (al final ${rEnd.holders}); base en reposo ${r0.base} cm; manoplas hueco cm ${JSON.stringify(r0.hands)}; andando: base mínima ${(minBase * 100).toFixed(1)} cm, hueco máx manopla ${maxGap.toFixed(1)} cm; cuerpo solapa ${JSON.stringify(rEnd.body)}; estados ${rEnd.states}`);
      }
    }
  }

  // ---------------- RAMPA, CAMIÓN, APILADO, CAÍDOS, ENCUADRE (piloto con 4) ----------------
  if (scenes.some((s) => ['rampa', 'camion', 'caidos', 'encuadre'].includes(s))) {
    await open({ nivel: 'pruebas', humans: 4, carriers: 4 });
    await inject(); await css();
    // Encuadre: cuántos humanos quedan fuera de la imagen de la cámara de juego
    const offscreen = [];
    let shotRamp = 0;
    for (let k = 0; k < 400; k++) {
      await adv(3);
      const r = await p.evaluate(() => {
        const m = window.__mudanza, g = m.game, cam = m.view.camera, A = m.__arte;
        const outs = g.carriers.filter((c) => c.human !== null).map((c) => { const v = cam.position.clone().set(c.pos.x, c.pos.y + 0.6, c.pos.z).project(cam); return Math.abs(v.x) > 1 || Math.abs(v.y) > 1 ? `J${c.human + 1}` : null; }).filter(Boolean);
        const onRamp = g.items.filter((it) => { const t = it.body.translation(); return t.x > 2.2 && t.x < 5.8 && A.baseY(it) > 0.15 && g.carriers.some((c) => c.heldBody === it.body); }).map((it) => it.def.id);
        return { t: g.time, phase: g.phase, outs, onRamp };
      });
      if (r.phase === 'playing') offscreen.push(r.outs.length);
      if (scenes.includes('rampa') && r.onRamp.length && shotRamp < 2 && (shotRamp === 0 || r.t > 17)) {
        await shot(`rampa-juego-${shotRamp}`);
        const at = await p.evaluate((id) => window.__mudanza.game.items.find((it) => it.def.id === id).body.translation(), r.onRamp[0]);
        await close(at, -1.0, 3.2, 2.0); await shot(`rampa-cerca-${shotRamp}-${r.onRamp[0]}`);
        log(`RAMPA t=${r.t.toFixed(2)} ${r.onRamp.join(',')} cuerpo ${JSON.stringify(await p.evaluate(() => window.__mudanza.__arte.body().filter((x) => x.cm > 0)))}`);
        shotRamp++;
      }
      if (k % 40 === 20 && scenes.includes('encuadre')) { await shot(`encuadre-t${Math.round(r.t)}`); log(`ENCUADRE t=${r.t.toFixed(1)} fuera: ${r.outs.join(',') || 'ninguno'}`); }
      if (r.phase !== 'playing' && r.phase !== 'countdown') break;
    }
    const nOut = offscreen.filter((x) => x > 0).length;
    log(`ENCUADRE patio 4h: fotogramas con algún humano fuera de la imagen ${nOut}/${offscreen.length} (${((100 * nOut) / Math.max(1, offscreen.length)).toFixed(1)} %)`);
    // Dentro del camión al terminar
    if (scenes.includes('camion')) {
      const st = await p.evaluate(() => ({ phase: window.__mudanza.game.phase, ii: window.__mudanza.__arte.itemItem(), fx: window.__mudanza.__arte.itemFixed() }));
      log(`CAMION fin: fase ${st.phase}; objeto-objeto ${JSON.stringify(st.ii)}; objeto-fijo ${JSON.stringify(st.fx)}`);
      await close({ x: 8.8, y: 1.3, z: 0 }, -1.5708 + 0.5, 5.2, 3.2); await shot('camion-interior-fin');
      // Apilado: una caja encima de la mesa, la otra encima de esa caja y la silla junto (en el camión, ya ganada la partida
      // no se mueve nada: se reabre y se apila a mano antes de que termine)
    }
  }
  if (scenes.includes('camion') || scenes.includes('caidos')) {
    await open({ nivel: 'pruebas', humans: 4, carriers: 4 });
    await inject(); await css();
    await adv(100, [I(), I(), I(), I()]);
    // Todo dentro del camión: mesa al fondo, cajas apiladas encima de ella, nevera y piano delante (el piano, opcional)
    await p.evaluate(() => {
      const g = window.__mudanza.game, it = g.items, put = (k, x, y, z, yaw = 0) => { it[k].body.setTranslation({ x, y, z }, true); it[k].body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true); it[k].body.setLinvel({ x: 0, y: 0, z: 0 }, true); it[k].body.setAngvel({ x: 0, y: 0, z: 0 }, true); };
      put(0, 10.6, 1.0 + 0.48, -0.9);           // mesa
      put(1, 10.6, 1.0 + 0.52 + 0.27, -0.9);    // caja encima de la mesa
      put(2, 10.6, 1.0 + 0.52 + 0.54 + 0.27, -0.9); // caja encima de la caja
      put(3, 10.9, 1.0 + 0.49, 1.2);            // lámpara
      put(4, 9.2, 1.0 + 0.45, 1.0);             // silla
      put(5, 8.2, 1.0 + 0.44, -1.1);            // nevera
      put(6, 7.9, 1.0 + 0.36, 1.0, Math.PI / 2); // piano
      g.carriers.forEach((c, i) => c.teleport({ x: -12, y: 0.75, z: -6 + i * 1.5 }));
    });
    await adv(60, [I(), I(), I(), I()]);
    const st = await p.evaluate(() => ({ ii: window.__mudanza.__arte.itemItem(), fx: window.__mudanza.__arte.itemFixed(), states: window.__mudanza.game.items.map((it) => `${it.def.id}:${it.state}:${it.inHold}`) }));
    log(`APILADO: objeto-objeto ${JSON.stringify(st.ii)}; objeto-fijo ${JSON.stringify(st.fx)}; estados ${st.states.join(' ')}`);
    await close({ x: 9.2, y: 1.4, z: 0 }, -1.5708 + 0.45, 5.0, 3.0); await shot('camion-apilado-cerca');
    await p.evaluate(() => window.__mudanza.setZoom(0.9));
    await adv(30, [I(), I(), I(), I()]);
    if (scenes.includes('caidos')) {
      // Caídos: J1 y J2 dentro del camión junto a los objetos, J3 junto al piano... (lo mismo que un coche: stun)
      await p.evaluate(() => {
        const g = window.__mudanza.game;
        g.carriers[0].teleport({ x: 9.3, y: 1.75, z: -0.1 }); g.carriers[0].facing = { x: 1, z: 0 };
        g.carriers[1].teleport({ x: 7.0, y: 1.75, z: -1.0 }); g.carriers[1].facing = { x: 1, z: 0 };
        g.carriers[2].teleport({ x: 4.0, y: 1.3, z: 0.5 }); g.carriers[2].facing = { x: 1, z: 0 };
        g.carriers[3].teleport({ x: 8.0, y: 1.75, z: 1.9 }); g.carriers[3].facing = { x: 0, z: 1 };
      });
      await adv(8, [I({ mx: 1 }), I({ mx: 1 }), I({ mx: 1 }), I({ mz: 1 })]);
      await p.evaluate(() => { const g = window.__mudanza.game; for (const c of g.carriers) g.stun(c); });
      let worst = [];
      for (let k = 0; k < 45; k++) {
        await adv(1, [I(), I(), I(), I()]);
        const r = await p.evaluate(() => window.__mudanza.__arte.body());
        r.forEach((x) => { if (!worst[x.j - 1] || x.cm > worst[x.j - 1].cm) worst[x.j - 1] = { ...x, k }; });
        if (k === 14) { await shot('caidos-camion-juego'); await close({ x: 8.3, y: 1.2, z: 0 }, -1.5708 + 0.6, 4.6, 2.6); await shot('caidos-camion-cerca'); }
        if (k === 32) { await close({ x: 8.3, y: 1.2, z: 0 }, -1.5708 + 0.6, 4.6, 2.6); await shot('caidos-camion-levantandose'); }
      }
      log(`CAIDOS en el camión y la rampa (peor solape del cuerpo dibujado por jugador): ${JSON.stringify(worst)}`);
      // Caídos junto a objetos en el patio (piano y nevera)
      await open({ nivel: 'pruebas', humans: 4, carriers: 4 });
      await inject(); await css();
      await adv(100, [I(), I(), I(), I()]);
      await p.evaluate(() => {
        const g = window.__mudanza.game, pi = g.items[6].body.translation(), ne = g.items[5].body.translation();
        g.carriers[0].teleport({ x: pi.x - 1.4, y: 0.75, z: pi.z }); g.carriers[0].facing = { x: 1, z: 0 };
        g.carriers[1].teleport({ x: pi.x, y: 0.75, z: pi.z + 1.3 }); g.carriers[1].facing = { x: 0, z: -1 };
        g.carriers[2].teleport({ x: ne.x + 1.3, y: 0.75, z: ne.z }); g.carriers[2].facing = { x: -1, z: 0 };
        g.carriers[3].teleport({ x: ne.x, y: 0.75, z: ne.z - 1.3 }); g.carriers[3].facing = { x: 0, z: 1 };
      });
      await adv(6, [I({ mx: 1 }), I({ mz: -1 }), I({ mx: -1 }), I({ mz: 1 })]);
      await p.evaluate(() => { const g = window.__mudanza.game; for (const c of g.carriers) g.stun(c); });
      worst = [];
      for (let k = 0; k < 45; k++) {
        await adv(1, [I(), I(), I(), I()]);
        const r = await p.evaluate(() => window.__mudanza.__arte.body());
        r.forEach((x) => { if (!worst[x.j - 1] || x.cm > worst[x.j - 1].cm) worst[x.j - 1] = { ...x, k }; });
        if (k === 14) { const at = await p.evaluate(() => { const a = window.__mudanza.game.items[6].body.translation(), b2 = window.__mudanza.game.items[5].body.translation(); return { x: (a.x + b2.x) / 2, y: 0.4, z: (a.z + b2.z) / 2 }; }); await close(at, 0.5, 4.5, 2.6); await shot('caidos-objetos-cerca'); }
      }
      log(`CAIDOS junto al piano y la nevera: ${JSON.stringify(worst)}`);
    }
  }

  // ---------------- LA CALLE (sofá) ----------------
  for (const sc of ['calle', 'base']) {
    if (!scenes.includes(sc)) continue;
    for (const n of [1, 2, 3, 4]) {
      await open({ humans: 4, carriers: 4 });
      await inject(); await css();
      await adv(100, [I(), I(), I(), I()]);
      // Cada jugador frente a un asa del sofá (en la base no hay `items`: se usan SLOTS vía game.sofa y la misma tabla)
      await p.evaluate((n) => {
        const m = window.__mudanza, g = m.game, A = m.__arte;
        const handles = [[1.1, 0.05, 0, 1, 0, 0], [-1.1, 0.05, 0, -1, 0, 0], [0.55, 0.05, 0.45, 0, 0, 1], [-0.55, 0.05, -0.45, 0, 0, -1]];
        const body = g.sofa, q = body.rotation(), t = body.translation();
        g.carriers.forEach((c, i) => {
          if (i < n) { const [x, y, z, ox, oy, oz] = handles[i], a = A.rot(q, { x, y, z }), o = A.rot(q, { x: ox, y: oy, z: oz }); c.teleport({ x: t.x + a.x + o.x * 0.55, y: 0.75, z: t.z + a.z + o.z * 0.55 }); c.facing = { x: -o.x, z: -o.z }; }
          else c.teleport({ x: t.x + 4 + i, y: 0.75, z: t.z + 4 });
        });
      }, n);
      await adv(10, [I(), I(), I(), I()]);
      await adv(1, [0, 1, 2, 3].map((i) => I({ grab: i < n })));
      await adv(30, [I(), I(), I(), I()]);
      for (let k = 0; k < 4; k++) await adv(6, [0, 1, 2, 3].map((i) => (i < n ? I({ mz: -0.8 }) : I())));
      const r = await p.evaluate(() => { const m = window.__mudanza, g = m.game, A = m.__arte; const it = g.items ? g.items[0] : { body: g.sofa, colliders: g.sofaColliders }; return { holders: g.carriers.filter((c) => c.heldBody === g.sofa || c.held === g.sofa).length, hands: A.hands(it), body: A.body().filter((x) => x.cm > 0) }; });
      const at = await p.evaluate(() => window.__mudanza.game.sofaPos);
      await close(at, 0.75, 3.4, 1.9); await shot(`${sc}-sofa-${n}`);
      log(`${sc.toUpperCase()} sofá n=${n}: agarran ${r.holders}; manoplas ${JSON.stringify(r.hands)}; cuerpo ${JSON.stringify(r.body)}`);
    }
    // El sofá en reposo de cerca, la misma toma en las dos versiones
    await open({ humans: 2, carriers: 2 });
    await inject(); await css();
    await adv(100, [I(), I()]);
    await p.evaluate(() => { const g = window.__mudanza.game; g.carriers.forEach((c, i) => c.teleport({ x: g.sofaPos.x + 5 + i, y: 0.75, z: g.sofaPos.z + 5 })); });
    await adv(10, [I(), I()]);
    const at = await p.evaluate(() => window.__mudanza.game.sofaPos);
    await close(at, 0.5, 2.8, 1.5); await shot(`${sc}-sofa-reposo-cerca`);
    await close(at, 0.0, 1.2, 7.5); await shot(`${sc}-sofa-reposo-cenital`);
    if (sc === 'calle') {
      // El sofá subiendo la rampa del camión y dentro (piloto con 2)
      await open({ humans: 2, carriers: 2 });
      await inject(); await css();
      await fast(29);
      for (let k = 0; k < 80; k++) {
        await adv(3);
        const r = await p.evaluate(() => { const g = window.__mudanza.game; return { t: g.time, st: g.stageLabel, y: g.sofaPos.y, phase: g.phase, it: g.items[0].inHold }; });
        if (r.y > 0.75 && r.y < 1.3 && !r.it && k < 60) { await shot('calle-rampa-juego'); const at2 = await p.evaluate(() => window.__mudanza.game.sofaPos); await close(at2, -0.9, 3.6, 2.2); await shot('calle-rampa-cerca'); log(`CALLE rampa t=${r.t.toFixed(2)} cuerpo ${JSON.stringify(await p.evaluate(() => window.__mudanza.__arte.body().filter((x) => x.cm > 0)))}`); k = 60; }
        if (r.phase !== 'playing') break;
      }
    }
  }
  const real = errors.filter((e) => !/deprecated parameters/.test(e));
  log('errores de página:', real.length, real.slice(0, 3).join(' | '));
  await b.close();
})();
