// Revisión visual del muñeco de los jugadores en el juego (modo captura, misma física y dibujo).
// Uso: node scripts/doll-check.cjs <carpeta> [url]   (demo servida en :4173)
// Guarda: vista de juego al empezar, primeros planos de J1 y J2 (frente, tres cuartos, lado, espalda),
// llevando el sofá, cayendo y levantándose; y mide pies (suela bajo el suelo) en cada fotograma.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'shots/doll');
const url = process.argv[3] || 'http://localhost:4173/';
/** `ruta`: solo el recorrido completo desde una partida nueva (sin la caída provocada antes). */
const onlyRoute = process.argv[4] === 'ruta';
/** `sin-ruta`: vistas, transporte y caída, sin el recorrido completo (más rápido). */
const noRoute = process.argv[4] === 'sin-ruta';
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
  const adv = (n, script) => p.evaluate(([n, s]) => window.__mudanza.advance(n, 30, s), [n, script ?? null]);
  const shot = (name) => p.screenshot({ path: path.join(out, `${name}.png`) });
  /** Primer plano: cámara a `d` m del jugador i, girada `a` respecto a hacia donde mira. */
  const close = (i, a, d = 2.4, h = 0.9) => p.evaluate(([i, a, d, h]) => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[i], cam = v.camera;
    const f = c.facing, yaw = Math.atan2(f.x, f.z) + a;
    cam.position.set(c.pos.x + Math.sin(yaw) * d, c.pos.y + h, c.pos.z + Math.cos(yaw) * d);
    cam.lookAt(c.pos.x, c.pos.y + 0.15, c.pos.z); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  }, [i, a, d, h]);
  // Pies: ¿alguna esquina de suela por debajo del suelo fijo? (diagnóstico del muñeco)
  const feet = () => p.evaluate(() => {
    const m = window.__mudanza;
    return m.view.carriers.filter((v) => v.rig).map((v) => {
      const d = v.rig.debug; if (!d || !d.upright) return null;
      let worst = 0;
      for (const f of d.feet) for (const q of f.sole) worst = Math.min(worst, q[1] - v.heightAt(q[0], q[2]));
      return worst;
    });
  });
  await adv(100); // cuenta atrás
  await shot('00-juego-inicio');
  if (!onlyRoute) {
  for (const i of [0, 1]) for (const [k, a] of [['frente', 0], ['tres-cuartos', 0.8], ['lado', Math.PI / 2], ['espalda', Math.PI]]) { await close(i, a); await shot(`0${i + 1}-J${i + 1}-${k}`); }
  // Agarran y llevan el sofá hacia arriba (teclas del juego simuladas por script de entrada)
  const I = (o) => JSON.stringify(o);
  await adv(1, `return [${I({ mx: 0, mz: 0, grab: true, lift: false, turn: 0, right: false })}, ${I({ mx: 0, mz: 0, grab: true, lift: false, turn: 0, right: false })}]`);
  let worst = 0;
  for (let k = 0; k < 45; k++) {
    await adv(1, `return [${I({ mx: 0, mz: -1, grab: false, lift: false, turn: 0, right: false })}, ${I({ mx: 0, mz: -1, grab: false, lift: false, turn: 0, right: false })}]`);
    const f = await feet(); worst = Math.min(worst, ...f.filter((x) => x !== null));
    if (k === 30) await shot('10-llevan-juego');
  }
  await close(0, 1.2, 3.2, 1.4); await shot('11-llevan-cerca');
  // Cada uno hacia su lado y J2 suelta tirando: cae
  await adv(42, `return [${I({ mx: 1, mz: 0, grab: false, lift: false, turn: 0, right: false })}, ${I({ mx: -1, mz: 0, grab: false, lift: false, turn: 0, right: false })}]`);
  await adv(1, `return [${I({ mx: 1, mz: 0, grab: false, lift: false, turn: 0, right: false })}, ${I({ mx: -1, mz: 0, grab: true, lift: false, turn: 0, right: false })}]`);
  const states = [];
  for (let k = 0; k < 60; k++) {
    await adv(1, `return [${I({ mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false })}, ${I({ mx: -1, mz: 0, grab: false, lift: false, turn: 0, right: false })}]`);
    const st = await p.evaluate(() => { const c = window.__mudanza.game.carriers[1]; return { w: c.wobbling, s: +c.stunned.toFixed(2) }; });
    states.push(st);
    if (k === 8 || k === 20 || k === 34 || k === 50) { await shot(`2${String(k).padStart(2, '0')}-J2-caida-juego`); await close(1, 0.6, 2.6, 2.4); await shot(`2${String(k).padStart(2, '0')}-J2-caida-cerca`); }
  }
  console.log('J2 durante la caída:', states.filter((s, i) => i % 6 === 0).map((s) => (s.s > 0 ? `suelo${s.s}` : s.w ? 'tambalea' : 'pie')).join(' '));
  console.log('pie más hundido mientras llevan el sofá:', (worst * 100).toFixed(1), 'cm');
  }
  // Recorrido completo con el piloto automático llevando a los dos: pies por tramo y capturas
  const byStage = {};
  if (!noRoute) {
  let shots = 0;
  for (let k = 0; k < 1200; k++) {
    await adv(4, 'return window.__mudanza.autoInputs(g)');
    const r = await p.evaluate(() => ({ st: window.__mudanza.game.stageLabel, scr: window.__mudanza.screen, t: window.__mudanza.game.time }));
    const f = await feet();
    const w = Math.min(0, ...f.filter((x) => x !== null));
    byStage[r.st] = Math.min(byStage[r.st] ?? 0, w);
    if ((r.st === 'Escalera' || r.st === 'Rampa') && shots < 6 && k % 20 === 0) { shots++; await shot(`3${shots}-${r.st}-juego`); await close(0, 0.9, 2.8, 1.8); await shot(`3${shots}-${r.st}-cerca`); }
    if (r.scr === 'results') { console.log('recorrido: fin', r.t.toFixed(1), 's'); await shot('40-resultados'); break; }
  }
  console.log('pie más hundido por tramo (cm):', JSON.stringify(Object.fromEntries(Object.entries(byStage).map(([k, v]) => [k, +(v * 100).toFixed(1)]))));
  }
  console.log('errores', errors.length, errors.slice(0, 3));
  await b.close();
})();
