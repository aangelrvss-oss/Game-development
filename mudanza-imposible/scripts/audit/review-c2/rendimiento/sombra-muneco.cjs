// Revisor (rendimiento): ¿se libera la textura de la sombra de cada muñeco (dollRig.ts:279) al reiniciar? Marca las
// texturas de las sombras de la partida 1, reinicia y mira si recibieron 'dispose'. Uso: node sombra-muneco.cjs <url> <nivel>
const { chromium } = require('playwright');
const [url, nivel] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const u = new URL(url);
  for (const [k, v] of Object.entries({ humans: 4, carriers: 6, capture: 1, ...(nivel === 'pruebas' ? { nivel } : {}) })) u.searchParams.set(k, String(v));
  await p.goto(u.href);
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex', null, { timeout: 120000 });
  const r = await p.evaluate(() => {
    const m = window.__mudanza; m.start(false); m.advance(5, 30);
    const before = m.view.renderer.info.memory.textures;
    const maps = m.view.carriers.filter((v) => v.rig && v.rig.shadow).map((v) => v.rig.shadow.material.map);
    const flags = maps.map(() => false);
    maps.forEach((t, i) => t.addEventListener('dispose', () => { flags[i] = true; }));
    const visibles = m.view.carriers.filter((v) => v.rig && v.rig.shadow).map((v) => v.rig.shadow.visible);
    m.start(false); m.advance(5, 30);
    return { sombras_muneco: maps.length, visibles, liberadas: flags, texturas_antes: before, texturas_despues: m.view.renderer.info.memory.textures };
  });
  console.log(JSON.stringify(r));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
