// Revisor C+E (ciclo 1): capturas y medidas de coherencia dibujo/física y de esfuerzo.
// Uso: node visual-review.cjs <carpeta> [url] [escenario...]
// Escenarios: solo (uno arrastra el sofá solo: esfuerzo y aviso), ruta (piloto hasta la escalera y arriba),
// caida (J1 cae en llano: muñeco frente a la cápsula tumbada), ayudantes (vista de los ayudantes con su cápsula).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || '/tmp/claude-0/review-c1/ce/review');
const url = process.argv[3] || 'http://localhost:4176/';
const which = process.argv.slice(4);
const want = (s) => which.length === 0 || which.includes(s);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function page(q = '') {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${url}?capture=1${q}`);
    await p.waitForFunction(() => window.__mudanza);
    await p.evaluate(() => window.__mudanza.start(false, false));
    await p.evaluate(() => window.__mudanza.advance(100, 30));
    // Capas de depuración: cápsula física de cada porteador en alambre (de las mallas que ya hay en escena)
    await p.evaluate(() => {
      const m = window.__mudanza, V = m.view;
      let Cyl = null, Sph = null, Mesh = null, Basic = null, Group = V.carriers[0].group.constructor;
      V.scene.traverse((o) => {
        if (!o.isMesh) return;
        if (!Cyl && o.geometry.type === 'CylinderGeometry') Cyl = o.geometry.constructor;
        if (!Sph && o.geometry.type === 'SphereGeometry') Sph = o.geometry.constructor;
        if (!Mesh && o.type === 'Mesh' && !o.isInstancedMesh) Mesh = o.constructor;
        if (!Basic && o.material && o.material.type === 'MeshBasicMaterial') Basic = o.material.constructor;
      });
      Mesh = V.carriers[0].ring.constructor;
      window.__dbg = { Cyl, Sph, Mesh, Basic, Group, caps: [] };
    });
    return p;
  }
  const capsOn = (p, on) => p.evaluate((on) => {
    const m = window.__mudanza, V = m.view, D = window.__dbg;
    for (const g of D.caps) V.scene.remove(g);
    D.caps = [];
    if (!on) return;
    for (const c of m.game.carriers) {
      const r = 0.32, hh = c.collider.shape.halfHeight;
      const mat = new D.Basic({ color: 0x00ff66, wireframe: true, transparent: true, opacity: 0.55, depthTest: false });
      const g = new D.Group();
      g.add(new D.Mesh(new D.Cyl(r, r, 2 * hh, 16, 2, true), mat));
      const s1 = new D.Mesh(new D.Sph(r, 16, 8), mat); s1.position.y = hh; g.add(s1);
      const s2 = new D.Mesh(new D.Sph(r, 16, 8), mat); s2.position.y = -hh; g.add(s2);
      const k = c.collider.translation(), q = c.collider.rotation();
      g.position.set(k.x, k.y, k.z); g.quaternion.set(q.x, q.y, q.z, q.w);
      g.renderOrder = 999;
      V.scene.add(g); D.caps.push(g);
    }
  }, on);
  const I = (o) => JSON.stringify({ mx: 0, mz: 0, grab: false, turn: 0, right: false, ...o });
  const adv = (p, n, a = {}, b2 = {}) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, `return [${I(a)}, ${I(b2)}]`]);
  const shot = (p, n) => p.screenshot({ path: path.join(out, `${n}.png`) });
  const close = (p, i, a, d = 2.6, h = 1.0, ty = 0) => p.evaluate(([i, a, d, h, ty]) => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[i], cam = v.camera;
    const k = c.collider.translation();
    const f = c.facing, yaw = Math.atan2(f.x, f.z) + a;
    cam.position.set(k.x + Math.sin(yaw) * d, k.y + h, k.z + Math.cos(yaw) * d);
    cam.lookAt(k.x, k.y + ty, k.z); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  }, [i, a, d, h, ty]);
  const state = (p) => p.evaluate(() => {
    const g = window.__mudanza.game;
    return {
      t: +g.time.toFixed(2), warn: document.getElementById('h-warn').textContent, heavy: !!g.heavyAlone,
      cs: g.carriers.map((c) => ({ id: c.id, pos: [c.pos.x, c.pos.y, c.pos.z].map((x) => +x.toFixed(2)), hold: c.holding, strain: +c.strain.toFixed(2), down: c.down, tilt: +c.tilt.toFixed(2), sep: +c.handSep.toFixed(2) })),
      dolls: window.__mudanza.view.carriers.filter((v) => v.rig).map((v) => ({ effort: +v.effort.toFixed(2), state: v.src.state, fit: +v.leanFit.toFixed(2) })),
      sofaY: +g.sofaPos.y.toFixed(2), sofaUp: +g.sofaUp.toFixed(2),
    };
  });

  if (want('solo')) {
    const p = await page();
    // J1 va al extremo derecho del sofá (ya está ahí en la salida), agarra solo y tira hacia +x; J2 quieto
    await adv(p, 1, { grab: true }, {});
    const log = [];
    for (let k = 0; k < 120; k++) {
      await adv(p, 1, { mx: 1 }, {});
      if (k % 10 === 0) log.push(await state(p));
      if (k === 15 || k === 60 || k === 110) { await shot(p, `solo-${k}-juego`); await close(p, 0, 0.9, 2.8, 0.9); await shot(p, `solo-${k}-cerca`); await capsOn(p, true); await close(p, 0, 0.9, 2.8, 0.9); await shot(p, `solo-${k}-cerca-capsula`); await capsOn(p, false); }
    }
    console.log('SOLO', JSON.stringify(log.map((s) => ({ t: s.t, warn: s.warn, j1: s.cs[0], doll: s.dolls[0], sofaY: s.sofaY }))));
    // Ahora J2 agarra el otro extremo y llevan juntos: ¿se ve menos esfuerzo?
    await p.evaluate(() => { const g = window.__mudanza.game, s = g.sofaPos; g.carriers[1].teleport({ x: s.x - 2.0, y: 0.75, z: s.z }); });
    await adv(p, 10, { mx: 1 }, { mx: 1 });
    await adv(p, 1, { mx: 1 }, { grab: true });
    const log2 = [];
    for (let k = 0; k < 60; k++) { await adv(p, 1, { mx: 1 }, { mx: 1 }); if (k % 10 === 0) log2.push(await state(p)); }
    await shot(p, 'pareja-juego'); await close(p, 0, 0.9, 2.8, 0.9); await shot(p, 'pareja-cerca');
    console.log('PAREJA', JSON.stringify(log2.map((s) => ({ t: s.t, warn: s.warn, j1: s.cs[0], j2: s.cs[1], dolls: s.dolls, sofaY: s.sofaY }))));
    await p.close();
  }

  if (want('caida')) {
    const p = await page();
    // J1 se suelta del sitio de salida y cae hacia +x (llano, sin nada)
    await p.evaluate(() => { const g = window.__mudanza.game, c = g.carriers[0]; c.teleport({ x: 3.5, y: 0.75, z: 10 }); });
    await adv(p, 10);
    await p.evaluate(() => { const c = window.__mudanza.game.carriers[0]; c.knockDown({ x: 1, z: 0 }, 1.3, 'balance'); });
    const log = [];
    for (let k = 0; k < 50; k++) {
      await adv(p, 1);
      log.push(await state(p));
      if ([4, 14, 30, 44].includes(k)) {
        await shot(p, `caida-${k}-juego`);
        await close(p, 0, Math.PI / 2, 2.6, 0.8); await shot(p, `caida-${k}-lado`);
        await capsOn(p, true); await close(p, 0, Math.PI / 2, 2.6, 0.8); await shot(p, `caida-${k}-lado-capsula`); await capsOn(p, false);
      }
    }
    console.log('CAIDA', JSON.stringify(log.filter((_, i) => i % 3 === 0).map((s) => ({ t: s.t, j1: s.cs[0], doll: s.dolls[0] }))));
    await p.close();
  }

  if (want('ayudantes')) {
    const p = await page('&humans=1&carriers=6');
    await adv(p, 20);
    await capsOn(p, true);
    const ids = await p.evaluate(() => window.__mudanza.game.carriers.map((c) => `${c.id}:${c.human === null ? c.cast.cast : 'J' + (c.human + 1)}`));
    console.log('AYUDANTES', ids.join(' '));
    for (let i = 0; i < 6; i++) { await close(p, i, Math.PI / 2, 2.4, 0.6); await shot(p, `ayud-${i}-lado-capsula`); }
    await capsOn(p, false);
    // Caída de cada ayudante hacia delante (hacia donde mira)
    await p.evaluate(() => { for (const c of window.__mudanza.game.carriers) if (c.human === null) c.knockDown({ ...c.facing }, 1.3, 'balance'); });
    await adv(p, 14);
    await capsOn(p, true);
    for (let i = 0; i < 6; i++) { await close(p, i, Math.PI / 2, 2.6, 0.8); await shot(p, `ayud-${i}-caido-capsula`); }
    await capsOn(p, false);
    await p.close();
  }

  if (want('ruta')) {
    const p = await page();
    let shots = 0;
    for (let k = 0; k < 1300; k++) {
      await p.evaluate(() => window.__mudanza.advance(4, 30, 'return window.__mudanza.autoInputs(g)'));
      const st = await p.evaluate(() => ({ s: window.__mudanza.game.stageLabel, scr: window.__mudanza.screen }));
      if ((st.s === 'Escalera' || st.s === 'Arriba' || st.s === 'Rampa') && k % 15 === 0 && shots < 6) {
        shots++;
        await shot(p, `ruta-${shots}-${st.s}-juego`);
        await close(p, 0, 0.9, 2.8, 1.4); await shot(p, `ruta-${shots}-${st.s}-cerca`);
      }
      if (st.scr === 'results') break;
    }
    await p.close();
  }
  console.log('errores', errors.length, errors.slice(0, 3));
  await b.close();
})();
