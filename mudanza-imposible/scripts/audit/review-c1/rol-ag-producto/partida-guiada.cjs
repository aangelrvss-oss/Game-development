// Revisor A+G (ciclo 1): lo que ve un jugador nuevo en una partida a 2, 3 y 4, en modo captura (misma física y dibujo).
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1/rol-ag-producto/partida-guiada.cjs http://localhost:4175/ [humanos]
// 1) Cuenta atrás y primer aviso. 2) J1 agarra solo y tira (los demás quietos): aviso «Pesa mucho» y esfuerzo del
// muñeco. 3) J1 agarra y se queda quieto: ¿qué aviso ve el resto? 4) Todos agarran con el piloto: alzado.
// Capturas en /tmp/claude-0/review-c1/ag/
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://localhost:4175/';
const N = parseInt(process.argv[3] || '2', 10);
const OUT = '/tmp/claude-0/review-c1/ag';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.setDefaultTimeout(240000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url + '?capture=1');
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  // Elegir N humanos con el ratón, como un jugador; porteadores = N (sin ayudantes)
  await p.click(`#opt-humans button:nth-child(${N})`);
  const opts = await p.evaluate(() => ({ h: document.querySelector('#opt-humans .on').textContent, c: document.querySelector('#opt-carriers .on').textContent }));
  log(`Menú: humanos ${opts.h}, porteadores ${opts.c}`);
  await p.evaluate(() => window.__mudanza.start(false));
  const st = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game;
    return {
      t: g.time, phase: g.phase, cd: g.countdown,
      warn: document.getElementById('h-warn').style.display === 'none' ? '' : document.getElementById('h-warn').textContent,
      center: document.getElementById('h-center').textContent,
      players: [...document.querySelectorAll('#h-players .pl')].map((e) => e.textContent),
      sofa: { ...g.sofaPos }, up: g.sofaUp, solo: g.soloDrag,
      cs: g.carriers.map((c, i) => ({ h: c.holding, strain: +c.strain.toFixed(2), eff: +(m.view.carriers[i]?.effort ?? NaN).toFixed(2), x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), stun: c.stunned })),
    };
  });
  // Cuenta atrás
  await p.evaluate(() => window.__mudanza.advance(30, 30));
  let s = await st();
  log(`Cuenta atrás: centro «${s.center}», aviso «${s.warn}»`);
  await p.screenshot({ path: `${OUT}/p${N}-a-cuenta.png` });
  await p.evaluate(() => window.__mudanza.advance(75, 30));
  s = await st();
  log(`Al empezar (t=${s.t.toFixed(1)}): centro «${s.center}», aviso «${s.warn}»`);
  log('Panel de jugadores:', JSON.stringify(s.players));
  await p.screenshot({ path: `${OUT}/p${N}-b-empieza.png` });

  // J1 con el piloto, los demás quietos
  const soloScript = `const a = window.__mudanza.autoInputs(g); return a.map((x, i) => i === 0 ? x : { mx: 0, mz: 0, grab: false, turn: 0, right: false });`;
  let firstHold = null, sawHeavy = null, maxEff = 0, maxStrain = 0, warnAtHoldStill = null;
  for (let i = 0; i < 80; i++) {
    await p.evaluate((sc) => window.__mudanza.advance(3, 30, sc), soloScript);
    s = await st();
    if (s.cs[0].h && firstHold === null) { firstHold = s.t; log(`J1 agarra en t=${s.t.toFixed(2)}; aviso «${s.warn}»`); await p.screenshot({ path: `${OUT}/p${N}-c-j1-agarra.png` }); }
    if (firstHold !== null) { maxEff = Math.max(maxEff, s.cs[0].eff); maxStrain = Math.max(maxStrain, s.cs[0].strain); }
    if (/Pesa mucho/.test(s.warn) && sawHeavy === null) {
      sawHeavy = s.t; log(`Aviso «${s.warn}» en t=${s.t.toFixed(2)} (${(s.t - firstHold).toFixed(2)} s tras agarrar); esfuerzo muñeco ${s.cs[0].eff}, strain ${s.cs[0].strain}`);
      await p.evaluate(() => window.__mudanza.advance(10, 30, `const a = window.__mudanza.autoInputs(g); return a.map((x, i) => i === 0 ? x : { mx: 0, mz: 0, grab: false, turn: 0, right: false });`));
      await p.screenshot({ path: `${OUT}/p${N}-d-pesa-mucho.png` });
    }
    if (sawHeavy !== null && s.t - sawHeavy > 1.5) break;
  }
  const z0 = s.sofa;
  log(`J1 solo: esfuerzo máx ${maxEff}, strain máx ${maxStrain}; sofá en (${s.sofa.x.toFixed(2)}, ${s.sofa.y.toFixed(2)}, ${s.sofa.z.toFixed(2)})`);
  // J1 deja de moverse pero sigue agarrando: ¿qué aviso queda para los demás?
  await p.evaluate(() => window.__mudanza.advance(45, 30, `return g.carriers.filter(c=>c.human!==null).map(() => ({ mx: 0, mz: 0, grab: false, turn: 0, right: false }));`));
  s = await st();
  log(`J1 agarrado y quieto 1,5 s: aviso «${s.warn}» (J1 agarra: ${s.cs[0].h}; esfuerzo ${s.cs[0].eff})`);
  await p.screenshot({ path: `${OUT}/p${N}-e-j1-quieto.png` });

  // Todos con el piloto: alzado entre todos
  let allHold = null, minBase = Infinity, sAll;
  for (let i = 0; i < 120; i++) {
    await p.evaluate(() => window.__mudanza.advance(3, 30, 'return window.__mudanza.autoInputs(g)'));
    s = await st();
    if (s.cs.every((c) => c.h) && allHold === null) { allHold = s.t; log(`Todos agarran en t=${s.t.toFixed(2)}`); }
    if (allHold !== null && s.t - allHold > 1.0) { sAll = s; break; }
  }
  if (sAll) {
    log(`Entre todos, 1 s después: sofá y=${sAll.sofa.y.toFixed(2)}; aviso «${sAll.warn}»; esfuerzos ${sAll.cs.map((c) => c.eff).join(', ')}`);
    await p.screenshot({ path: `${OUT}/p${N}-f-entre-todos.png` });
    await p.evaluate(() => window.__mudanza.advance(45, 30, 'return window.__mudanza.autoInputs(g)'));
    s = await st();
    log(`Llevándolo 1,5 s más: sofá y=${s.sofa.y.toFixed(2)}, (x,z)=(${s.sofa.x.toFixed(2)}, ${s.sofa.z.toFixed(2)}); aviso «${s.warn}»; esfuerzos ${s.cs.map((c) => c.eff).join(', ')}`);
    await p.screenshot({ path: `${OUT}/p${N}-g-llevando.png` });
  } else log('No llegaron a agarrar todos');
  log('Errores de página:', errors.length ? errors.slice(0, 3).join(' | ') : 'ninguno');
  await b.close();
})();
