// Revisor A+G+C+E (ciclo 1, segunda ronda): HUD con 4 jugadores locales. ¿Se solapan las pastillas de los jugadores
// con la ayuda de abajo a la derecha (#h-hint), que la corrección ha alargado («en la pausa, Retroceso reinicia»)?
// A 1280×720, 1366×768 y 1920×1080, en reposo y con los 4 agarrando (« · agarrando»). Capturas.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/hud4.cjs
const { launch, page, adv, shot, OUT, mkOut } = require('./comun.cjs');

(async () => {
  mkOut();
  const b = await launch();
  for (const [vw, vh] of [[1280, 720], [1366, 768], [1920, 1080]]) {
    const p = await page(b, { humans: 4, vw, vh });
    const rects = () => p.evaluate(() => {
      const r = (e) => { const x = e.getBoundingClientRect(); return { l: Math.round(x.left), r: Math.round(x.right), t: Math.round(x.top), b: Math.round(x.bottom) }; };
      const hint = r(document.getElementById('h-hint'));
      const pls = [...document.querySelectorAll('#h-players > *')].map((e) => ({ ...r(e), txt: e.textContent.trim().slice(0, 40) }));
      const over = pls.map((q) => Math.max(0, Math.min(q.r, hint.r) - Math.max(q.l, hint.l)) * (Math.max(0, Math.min(q.b, hint.b) - Math.max(q.t, hint.t)) > 0 ? 1 : 0));
      const gap = pls.length ? hint.l - Math.max(...pls.map((q) => q.r)) : null;
      return { hint, pls, over, gap, sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    let a = await rects();
    console.log(`${vw}×${vh} en reposo: ayuda [${a.hint.l}–${a.hint.r}], pastillas ${a.pls.map((q) => `[${q.l}–${q.r}, ${q.t}–${q.b}]`).join(' ')}; hueco ayuda−última pastilla ${a.gap} px; solape ${JSON.stringify(a.over)}`);
    await shot(p, `hud4-${vw}-reposo.png`);
    // Los cuatro con el piloto hasta que agarran todos
    for (let i = 0; i < 40; i++) {
      await adv(p, 6);
      if (await p.evaluate(() => window.__mudanza.game.carriers.every((c) => c.holding))) break;
    }
    await adv(p, 6);
    a = await rects();
    console.log(`${vw}×${vh} agarrando: pastillas ${a.pls.map((q) => `«${q.txt}» [${q.l}–${q.r}, ${q.t}–${q.b}]`).join(' ')}; hueco ${a.gap} px; solape ${JSON.stringify(a.over)}; scroll horizontal ${a.sw > a.iw}`);
    await shot(p, `hud4-${vw}-agarrando.png`);
    await p.close();
  }
  await b.close();
})();
