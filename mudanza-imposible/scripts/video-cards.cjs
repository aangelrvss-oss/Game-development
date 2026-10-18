// Rótulos del vídeo (título y etiquetas de cada toma) como PNG de 1280×720, dibujados con HTML.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(__dirname, '../shots/video');

const base = `<style>
  body{margin:0;width:1280px;height:720px;font-family:system-ui,sans-serif;overflow:hidden}
  .chip{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);background:rgba(31,26,46,.88);color:#fff;
    padding:10px 20px;border-radius:14px;font-weight:800;font-size:22px;white-space:nowrap;box-shadow:0 4px 0 rgba(0,0,0,.25)}
  .chip small{display:block;font-weight:600;font-size:15px;opacity:.8;margin-top:2px}
</style>`;

const cards = {
  'titulo': `${base}<div style="position:absolute;inset:0;background:linear-gradient(160deg,#7c3aed,#db2777 55%,#f59e0b);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center">
    <div style="font-size:30px;font-weight:800;letter-spacing:.2em;opacity:.9">PARTIDA REAL</div>
    <div style="font-size:96px;font-weight:900;line-height:1;margin:14px 0 18px;text-shadow:0 6px 0 rgba(0,0,0,.25)">La Mudanza<br>Imposible</div>
    <div style="font-size:24px;font-weight:700;max-width:1060px;line-height:1.35;background:rgba(0,0,0,.22);padding:12px 22px;border-radius:14px">
      Física y controles del juego, capturados fotograma a fotograma a velocidad real.<br>Sin imágenes generadas. Solo se han cortado tiempos muertos.</div></div>`,
  'chip-teclado': `${base}<div class="chip">Toma 1 · J1 con teclado (W para avanzar, sin esperar al semáforo)<small>Las pulsaciones las envía un script de prueba, no una persona</small></div>`,
  'chip-auto': `${base}<div class="chip">Toma 2 · Piloto automático del juego, de la casa al camión<small>Misma física; el piloto controla a J1 y los ayudantes son la IA del juego</small></div>`,
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  for (const [name, html] of Object.entries(cards)) {
    await p.setContent(`<html><body style="background:transparent">${html}</body></html>`);
    await p.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: name !== 'titulo' });
  }
  await b.close();
  console.log('rótulos listos en', OUT);
})();
