// Revisor A+G+C+E (ciclo 1, segunda ronda): ancho de la ayuda de abajo a la derecha (#h-hint) con el texto de antes
// de la corrección y con el de ahora, a 1280×720 con 4 jugadores: ¿la corrección de Retroceso agrava el solape con J4?
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/hint-ancho.cjs
const { launch, page } = require('./comun.cjs');
(async () => {
  const b = await launch();
  const p = await page(b, { humans: 4, skip: 0 });
  const r = await p.evaluate(() => {
    const h = document.getElementById('h-hint');
    const now = h.getBoundingClientRect().left;
    const cur = h.innerHTML;
    h.innerHTML = '<kbd>Esc</kbd> o Start pausa · <kbd>Retroceso</kbd> reiniciar · <kbd>M</kbd> sonido';
    const old = h.getBoundingClientRect().left;
    h.innerHTML = cur;
    const j4 = [...document.querySelectorAll('#h-players > *')].pop().getBoundingClientRect().right;
    return { now: Math.round(now), old: Math.round(old), j4: Math.round(j4) };
  });
  console.log(`Borde izquierdo de la ayuda: antes ${r.old} px, ahora ${r.now} px; borde derecho de J4 en reposo ${r.j4} px → hueco antes ${r.old - r.j4} px, ahora ${r.now - r.j4} px`);
  await b.close();
})();
