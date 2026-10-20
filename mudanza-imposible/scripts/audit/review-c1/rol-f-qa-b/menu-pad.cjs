// Revisión independiente C1, rol F. Menú con mando simulado (navigator.getGamepads) en el juego de verdad:
// el botón que despierta al mando no empieza; luego A empieza; con 4 jugadores y 2 mandos, J3 y J4 van con mando y
// sus A agarran a J3/J4 (no a otros); Start del mando de J4 pausa.
// Uso: NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-f-qa-b/menu-pad.cjs http://localhost:4191/
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4191/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => {
    window.__pads = {};
    window.__frames = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => orig((t) => { window.__frames++; cb(t); });
    navigator.getGamepads = () => Object.entries(window.__pads).map(([i, btn]) => ({ index: +i, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, j) => ({ pressed: btn.includes(j), value: 0 })) }));
  });
  const frames = async (n) => { const t = (await p.evaluate(() => window.__frames)) + n; await p.waitForFunction((t) => window.__frames >= t, t, { timeout: 60000 }); };
  const set = async (pads) => { await p.evaluate((x) => { window.__pads = x; }, pads); await frames(3); };
  await p.goto(url + '?humans=4&carriers=4');
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  const res = [];
  const check = (name, ok, info = '') => { res.push(ok); console.log(ok ? 'OK   ' : 'FALLA', name, info); };
  // El mando 0 aparece con A pulsado: no empieza
  await set({ 0: [0] });
  check('el A que despierta al mando no empieza la partida', await p.evaluate(() => window.__mudanza.screen === 'menu'));
  await set({ 0: [] });
  await set({ 0: [], 1: [] });
  const note = await p.evaluate(() => document.getElementById('pads-note').textContent);
  check('la nota del menú reparte mando 1 → J3 y mando 2 → J4', /mando 1 → J3.*mando 2 → J4/.test(note), `«${note.slice(0, 80)}»`);
  await set({ 0: [0], 1: [] });
  check('A del mando empieza la partida', await p.evaluate(() => window.__mudanza.screen === 'play'));
  const n = await p.evaluate(() => window.__mudanza.game.carriers.filter((c) => c.human !== null).length);
  check('4 jugadores humanos', n === 4, `${n}`);
  await set({ 0: [], 1: [] });
  await p.evaluate(() => { window.__mudanza.game.countdown = 0.05; });
  await p.waitForFunction(() => window.__mudanza.game.phase === 'playing', null, { timeout: 120000 });
  await p.evaluate(() => {
    const g = window.__mudanza.game; window.__g = [0, 0, 0, 0];
    const orig = g.step.bind(g);
    g.step = (dt, inputs) => { inputs.forEach((x, i) => { if (x?.grab) window.__g[i]++; }); orig(dt, inputs); };
  });
  await set({ 0: [0], 1: [] }); await set({ 0: [], 1: [] });
  await set({ 0: [], 1: [0] }); await set({ 0: [], 1: [] });
  const g = await p.evaluate(() => window.__g);
  check('A del mando 1 agarra con J3 y A del mando 2 con J4, una vez cada uno', JSON.stringify(g) === '[0,0,1,1]', JSON.stringify(g));
  await set({ 0: [], 1: [9] }); await set({ 0: [], 1: [] });
  check('Start del mando de J4 pausa', await p.evaluate(() => document.getElementById('pause').style.display === 'flex'));
  await set({ 0: [9], 1: [] }); await set({ 0: [], 1: [] });
  check('Start del mando de J3 quita la pausa', await p.evaluate(() => document.getElementById('pause').style.display !== 'flex'));
  check('sin errores de consola', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  process.exit(res.every(Boolean) ? 0 : 1);
})();
