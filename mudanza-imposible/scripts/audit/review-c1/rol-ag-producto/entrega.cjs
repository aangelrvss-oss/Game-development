// Revisor A+G (ciclo 1): el momento de la entrega, junto al camión (lejos del origen del mundo).
// 1) Coloca el sofá y a los dos jugadores junto a la zona verde y mide lo despegadas que se dibujan las mangas de cada
//    muñeco respecto a sus hombros; captura con la cámara del juego y de cerca.
// 2) Deja que gane, y en la pantalla de resultados pulsa Intro (la tecla de agarrar/soltar de J2) al instante.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-ag-producto/entrega.cjs http://localhost:4175/ [prefijo]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4175/';
const tag = process.argv[3] || 'c1';
const OUT = '/tmp/claude-0/review-c1/ag';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url + '?capture=1');
  await p.waitForFunction(() => window.__mudanza);
  await p.evaluate(() => window.__mudanza.start(false, false));
  await p.evaluate(() => window.__mudanza.advance(100, 30));
  // Sofá en el borde de la zona verde (aún fuera) y los dos a sus extremos
  await p.evaluate(() => {
    const g = window.__mudanza.game;
    g.sofa.setTranslation({ x: 21.5, y: 0.6, z: -30.25 }, true); g.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true); g.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
    g.sofa.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    g.carriers[0].teleport({ x: 23.6, y: 1.2, z: -30.25 });
    g.carriers[1].teleport({ x: 19.4, y: 1.2, z: -30.25 });
  });
  await p.evaluate(() => window.__mudanza.advance(20, 30));
  const sleeves = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game;
    return m.view.carriers.map((dv, i) => {
      const rig = dv.rig, torso = rig.torso, V = torso.position.constructor;
      rig.group.updateMatrixWorld(true);
      const real = [-1, 1].map((s) => torso.localToWorld(new V(s * 0.325, 0.83, 0)));
      const drawn = rig.sleeves.map((sl) => sl.getWorldPosition(new V()));
      const c = g.carriers[i];
      return { pos: [+c.pos.x.toFixed(2), +c.pos.z.toFixed(2)], r: +Math.hypot(c.pos.x, c.pos.y, c.pos.z).toFixed(2), off: drawn.map((d, k) => +Math.hypot(d.x - real[k].x, d.y - real[k].y, d.z - real[k].z).toFixed(2)) };
    });
  });
  console.log(tag, 'junto al camión, mangas respecto a su hombro:', JSON.stringify(await sleeves()));
  await p.screenshot({ path: `${OUT}/entrega-${tag}-juego.png` });
  // Primer plano de J1
  await p.evaluate(() => {
    const m = window.__mudanza, v = m.view, c = m.game.carriers[0], cam = v.camera;
    cam.position.set(c.pos.x + 0.2, c.pos.y + 1.2, c.pos.z + 4.5); cam.lookAt(c.pos.x - 1.5, c.pos.y, c.pos.z); cam.updateMatrixWorld();
    v.renderer.render(v.scene, cam);
  });
  await p.screenshot({ path: `${OUT}/entrega-${tag}-cerca.png` });
  // Los dos agarran y empujan el sofá a la zona; luego sueltan
  const I = (o) => JSON.stringify({ mx: 0, mz: 0, grab: false, turn: 0, right: false, ...o });
  await p.evaluate((s) => window.__mudanza.advance(1, 30, s), `return [${I({ grab: true })}, ${I({ grab: true })}]`);
  let res;
  for (let k = 0; k < 40; k++) {
    res = await p.evaluate((s) => { window.__mudanza.advance(6, 30, s); const g = window.__mudanza.game; return { screen: window.__mudanza.screen, phase: g.phase, x: g.sofaPos.x, h: g.carriers.map((c) => c.holding) }; }, `return [${I({ mx: 1 })}, ${I({ mx: 1 })}]`);
    if (res.phase !== 'playing') break;
  }
  console.log('tras empujar:', JSON.stringify(res));
  for (let k = 0; k < 30 && res.screen !== 'results'; k++) res = await p.evaluate(() => { window.__mudanza.advance(3, 30); return { screen: window.__mudanza.screen }; });
  console.log('pantalla:', res.screen);
  if (res.screen === 'results') {
    await p.screenshot({ path: `${OUT}/entrega-${tag}-resultados.png` });
    const t0 = Date.now();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(50);
    const after = await p.evaluate(() => ({ screen: window.__mudanza.screen, phase: window.__mudanza.game.phase, t: window.__mudanza.game.time }));
    console.log(`Intro (agarrar de J2) ${Date.now() - t0} ms después de aparecer los resultados →`, JSON.stringify(after));
  }
  await b.close();
})();
