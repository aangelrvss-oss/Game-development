// Mide el apoyo de los pies dibujados fotograma a fotograma (60 por segundo de simulación) y guarda tiras
// de fotogramas consecutivos. Uso: node scripts/feet-check.cjs <carpeta> [url]
// Métricas por tramo: deslizamiento en apoyo, hundimiento, pies flotando, piernas cruzadas, saltos de rodilla
// y longitud de paso frente a velocidad.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'shots/pies');
const url = process.argv[3] || 'http://localhost:4174/';
// [nombre, prueba, desde, hasta, tira de fotogramas (desde, n, cada k pasos)]
const WINDOWS = [
  ['caminar-y-parar', 'A', 0.3, 7.0, [1.6, 8, 4]],
  ['tirar-del-sofa', 'B', 0.5, 4.6, [1.5, 8, 4]],
  ['tropezar-y-caer', 'C', 0.8, 3.4, [1.35, 8, 5]],
  ['levantarse', 'C', 3.3, 5.6, [3.4, 8, 6]],
  ['rampa', 'D', 1.8, 6.0, [2.0, 8, 5]],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${url}?capture=1`);
  await p.waitForFunction(() => window.__lab);
  await p.evaluate(() => window.__lab.panel(false));
  const report = {};
  for (const [name, test, from, to, [sFrom, sN, sK]] of WINDOWS) {
    await p.evaluate((t) => { window.__lab.run(t); window.__lab.setView(false); }, test);
    await p.evaluate((s) => { const l = window.__lab; while (l.lab.testTime < s - 1e-6) l.advance(1, 60); }, from);
    const frames = [];
    let shot = 0;
    const stripDir = path.join(out, name);
    fs.mkdirSync(stripDir, { recursive: true });
    while (true) {
      const f = await p.evaluate(() => {
        const l = window.__lab; l.advance(1, 60);
        const d = l.rig.debug, lab = l.lab, v = lab.char.body.linvel();
        const feet = d.feet.map((ft) => ({ sw: ft.swinging, sole: ft.sole, gnd: ft.sole.map((c) => lab.heightAt(c[0], c[2])), knee: ft.knee, hip: ft.hip, ankle: ft.ankle }));
        return { t: lab.testTime, up: d.upright, state: lab.char.state, yaw: d.yaw, speed: Math.hypot(v.x, v.z), feet };
      });
      frames.push(f);
      const k = Math.round((f.t - sFrom) * 60);
      if (f.t >= sFrom - 1e-6 && k % sK === 0 && shot < sN) { await p.screenshot({ path: path.join(stripDir, `${shot++}.png`) }); }
      if (f.t >= to - 1e-6) break;
    }
    // Métricas
    let slide = 0, slideMax = 0, stanceFrames = 0, pen = 0, penMax = 0, flt = 0, cross = 0, kneeFlip = 0, n = 0;
    const flipAt = [];
    const steps = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], c = frames[i];
      if (!c.up || !a.up) continue;
      n++;
      const right = [Math.cos(c.yaw), -Math.sin(c.yaw)];
      const centers = c.feet.map((ft) => [ft.sole.reduce((s, q) => s + q[0], 0) / 4, ft.sole.reduce((s, q) => s + q[2], 0) / 4]);
      // Cruce: el pie izquierdo (0) a la derecha del derecho (1), en el marco del cuerpo
      if ((centers[0][0] - centers[1][0]) * right[0] + (centers[0][1] - centers[1][1]) * right[1] > -0.02) cross++;
      for (let j = 0; j < 2; j++) {
        const fa = a.feet[j], fc = c.feet[j];
        const lowest = Math.min(...fc.sole.map((q, m) => q[1] - fc.gnd[m]));
        if (lowest < -0.012) { pen++; penMax = Math.max(penMax, -lowest); }
        if (!fa.sw && !fc.sw) {
          stanceFrames++;
          const ca = [fa.sole.reduce((s, q) => s + q[0], 0) / 4, fa.sole.reduce((s, q) => s + q[2], 0) / 4];
          const d = Math.hypot(centers[j][0] - ca[0], centers[j][1] - ca[1]);
          slide += d; slideMax = Math.max(slideMax, d);
          const lowestPlanted = lowest;
          if (lowestPlanted > 0.03) flt++;
        }
        if (fa.sw && !fc.sw) steps.push({ t: c.t, speed: c.speed });
        if (!fa.sw && fc.sw) steps.push({ t: c.t, start: true, pos: centers[j] });
        // Salto de rodilla: la dirección de la rodilla respecto al eje cadera-tobillo gira > 60° en un fotograma
        const kd = (ft) => { const h = ft.hip, k = ft.knee, an = ft.ankle || [ft.sole.reduce((s, q) => s + q[0], 0) / 4, 0, ft.sole.reduce((s, q) => s + q[2], 0) / 4]; const ax = [an[0] - h[0], an[1] - h[1], an[2] - h[2]]; const kv = [k[0] - h[0], k[1] - h[1], k[2] - h[2]]; const al = Math.hypot(...ax) || 1; const dot = (kv[0] * ax[0] + kv[1] * ax[1] + kv[2] * ax[2]) / al; return [kv[0] - ax[0] / al * dot, kv[1] - ax[1] / al * dot, kv[2] - ax[2] / al * dot]; };
        const k1 = kd(fa), k2 = kd(fc), l1 = Math.hypot(...k1), l2 = Math.hypot(...k2);
        if (l1 > 0.03 && l2 > 0.03 && (k1[0] * k2[0] + k1[1] * k2[1] + k1[2] * k2[2]) / (l1 * l2) < 0.5) { kneeFlip++; flipAt.push(`${c.t.toFixed(2)}${j ? 'D' : 'I'}${c.state[0]}`); }
      }
    }
    const starts = steps.filter((s) => s.start).length;
    const dur = frames[frames.length - 1].t - frames[0].t;
    const meanSpeed = frames.reduce((s, f) => s + (f.up ? f.speed : 0), 0) / frames.length;
    report[name] = {
      fotogramas: frames.length,
      deslizamientoApoyo_cm_por_s: +((slide / Math.max(1, stanceFrames)) * 60 * 100).toFixed(1),
      deslizamientoMax_cm_fotograma: +(slideMax * 100).toFixed(2),
      hundimiento_pct: +((pen / Math.max(1, 2 * n)) * 100).toFixed(1), hundimientoMax_cm: +(penMax * 100).toFixed(1),
      flotando_pct: +((flt / Math.max(1, stanceFrames)) * 100).toFixed(1),
      cruces_pct: +((cross / Math.max(1, n)) * 100).toFixed(1),
      saltosRodilla: kneeFlip, saltosRodilla_t: flipAt.join(' '),
      pasos_por_s: +(starts / dur).toFixed(2), velocidadMedia: +meanSpeed.toFixed(2),
      zancada_m: starts ? +((meanSpeed * dur) / starts * 2).toFixed(2) : 0,
    };
    console.log(name, JSON.stringify(report[name]));
  }
  fs.writeFileSync(path.join(out, 'metricas.json'), JSON.stringify(report, null, 2));
  console.log('errores', errors.length, errors.slice(0, 3));
  await b.close();
})();
