// Revisión ciclo 1 (rol A+G): distancia entre el cuerpo del muñeco y sus hombros/caderas/manos dibujados a lo largo
// del recorrido (2 humanos con el piloto de pruebas, modo captura), con capturas desde la cámara del juego.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/director-producto/miembros-recorrido.cjs [url]
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/review-c1/ag';
const base = new URL(process.argv[2] || 'http://localhost:4175/');
base.searchParams.set('capture', '1'); base.searchParams.set('humans', '2'); base.searchParams.set('carriers', '2');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(base.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.screen === 'play');
  const measure = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game;
    return g.carriers.map((c, i) => {
      const v = m.view.carriers[i], rig = v.rig;
      const w = (o) => o.getWorldPosition(o.position.clone().set(0, 0, 0));
      const k = c.collider.translation();
      const d = (o) => { const p = w(o); return Math.hypot(p.x - k.x, p.z - k.z); };
      // legs/arms son FlexTube: miramos el primer vértice de su geometría pasado al mundo
      const tubeRoot = (t) => { const a = t.geometry.attributes.position; const pt = { x: a.getX(0), y: a.getY(0), z: a.getZ(0) }; const e = rig.group.matrixWorld.elements; const x = e[0] * pt.x + e[4] * pt.y + e[8] * pt.z + e[12], z = e[2] * pt.x + e[6] * pt.y + e[10] * pt.z + e[14]; return Math.hypot(x - k.x, z - k.z); };
      return { j: `J${i + 1}`, pos: [k.x, k.z].map((x) => +x.toFixed(1)), sleeve: +Math.max(...rig.sleeves.map(d)).toFixed(2), hand: +Math.max(...rig.hands.map(d)).toFixed(2), boot: +Math.max(...rig.boots.map(d)).toFixed(2), armRoot: +Math.max(...rig.arms.map(tubeRoot)).toFixed(2), legRoot: +Math.max(...rig.legs.map(tubeRoot)).toFixed(2) };
    });
  });
  await p.evaluate(() => window.__mudanza.advance(95, 30));
  console.log('t=0 (salida):', JSON.stringify(await measure()));
  await p.screenshot({ path: `${OUT}/miembros-salida.png` });
  const shots = { Calle: 'calle', Escalera: 'escalera', Rampa: 'rampa' };
  let last = '';
  for (let i = 0; i < 200; i++) {
    const r = await p.evaluate(() => { window.__mudanza.advance(10, 30, 'return window.__mudanza.autoInputs(g)'); const g = window.__mudanza.game; return { st: g.stageLabel, t: g.time, ph: g.phase, scr: window.__mudanza.screen }; });
    if (r.st !== last) {
      last = r.st;
      console.log(`${r.st} t=${r.t.toFixed(1)}:`, JSON.stringify(await measure()));
      if (shots[r.st]) await p.screenshot({ path: `${OUT}/miembros-${shots[r.st]}.png` });
    }
    if (r.ph !== 'playing') { console.log('fin', r.ph, r.t.toFixed(1), r.scr); break; }
  }
  await b.close();
})();
