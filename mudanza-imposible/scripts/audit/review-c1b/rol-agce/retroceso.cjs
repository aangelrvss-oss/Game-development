// Revisor A+G+C+E (ciclo 1, segunda ronda): Retroceso y pausa con teclas reales (modo normal, no captura).
//  1) En juego, Retroceso no reinicia y sale un recordatorio; 2) pulsado varias veces, el recordatorio no se repite
//  sin parar; 3) Esc pausa, la pausa dice cómo reiniciar, Retroceso reinicia; 4) Intro en los resultados recién
//  aparecidos (menor de la primera ronda); 5) J2 machacando Intro junto a Retroceso no pierde la partida.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/retroceso.cjs
const { launch, OUT, URL0, mkOut } = require('./comun.cjs');
const path = require('path');

(async () => {
  mkOut();
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__mudanza.game?.phase === 'playing', null, { timeout: 60000 });
  const id = () => p.evaluate(() => { const g = window.__mudanza.game; g.__tag ??= Math.random(); return { tag: g.__tag, t: +g.time.toFixed(2), screen: window.__mudanza.screen, paused: document.getElementById('pause').style.display === 'flex', toasts: [...document.querySelectorAll('#h-toasts .toast')].map((e) => e.textContent) }; });
  const a = await id();
  await p.keyboard.press('Backspace');
  await p.waitForTimeout(300);
  const b1 = await id();
  console.log(`1) Retroceso en juego: misma partida ${a.tag === b1.tag}, t ${a.t} → ${b1.t}; recordatorio: ${JSON.stringify(b1.toasts)}`);
  await p.screenshot({ path: path.join(OUT, 'ret-1-en-juego.png') });
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Backspace'); await p.waitForTimeout(80); }
  const b2 = await id();
  console.log(`2) 5 Retrocesos más: misma partida ${a.tag === b2.tag}; recordatorios en pantalla: ${b2.toasts.filter((x) => /reiniciar/i.test(x)).length}`);
  // 5) J2 machaca Intro (agarrar/soltar) con Retroceso de por medio
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Enter'); await p.keyboard.press('Backspace'); }
  const b3 = await id();
  console.log(`5) Intro y Retroceso alternados 6 veces: misma partida ${a.tag === b3.tag}, pantalla ${b3.screen}`);
  // 3) Pausa
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  const c1 = await id();
  const pauseText = await p.evaluate(() => document.getElementById('pause').innerText.replace(/\s+/g, ' '));
  console.log(`3) Esc: pausa visible ${c1.paused}; texto de la pausa: «${pauseText}»`);
  await p.screenshot({ path: path.join(OUT, 'ret-3-pausa.png') });
  const tp0 = c1.t; await p.waitForTimeout(500); const c2 = await id();
  console.log(`   en pausa el tiempo no corre: ${tp0} → ${c2.t}`);
  await p.keyboard.press('Backspace');
  await p.waitForTimeout(300);
  const c3 = await id();
  console.log(`   Retroceso en la pausa: partida nueva ${c3.tag !== a.tag}, pausa oculta ${!c3.paused}, t ${c3.t}`);
  // ¿Esc durante la cuenta atrás?
  const ph = await p.evaluate(() => window.__mudanza.game.phase);
  console.log(`   la partida nueva empieza en fase ${ph}`);
  // 4) Resultados: forzar la victoria rápida con el piloto (modo captura en otra página)
  const q = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await q.goto(URL0 + '?capture=1');
  await q.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  await q.evaluate(() => window.__mudanza.start(false, false));
  for (let i = 0; i < 300; i++) {
    await q.evaluate(() => window.__mudanza.advance(30, 30, 'return window.__mudanza.autoInputs(g)'));
    if (await q.evaluate(() => window.__mudanza.screen === 'results')) break;
  }
  const scr = await q.evaluate(() => window.__mudanza.screen);
  if (scr === 'results') {
    await q.keyboard.press('Enter');
    await q.waitForTimeout(100);
    console.log(`4) Intro justo al salir los resultados: pantalla ${await q.evaluate(() => window.__mudanza.screen)} (si es 'play', se los ha saltado)`);
  } else console.log('4) no se llegó a los resultados');
  console.log('Errores de página:', errors.length ? errors.slice(0, 3).join(' | ') : 'ninguno');
  await b.close();
})();
