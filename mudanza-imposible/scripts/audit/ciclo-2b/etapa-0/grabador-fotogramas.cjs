// Ciclo 2b, etapa 0: precarga (`node -r`) que NO toca el guion de la prueba. Es el grabador pasivo del diagnóstico del
// ciclo 2 (scripts/audit/review-c2/diagnostico/grabador-pasivo.cjs) con dos datos más:
//   - el número de fotograma (cada llamada de requestAnimationFrame) en que se da cada paso de física, para sacar los
//     pasos por fotograma y los FPS reales de la ejecución;
//   - la semilla de cada partida (`game.opts.seed`), leída en la página.
// La prueba no hace ninguna llamada extra al navegador: la página manda lo grabado por console.log y aquí se escribe en
// rec.jsonl (carpeta de trabajo). Filas: [partida, paso, ms de reloj, fotograma, fase, t, cuenta atrás, entradas,
// sofá x, y, z, giro, porteadores [x, z, agarra, aturdido, tambalea, knock, inclinación], sucesos].
const pw = require('playwright');
const fs = require('fs');
const RECORDER = () => {
  let cur = null, gid = 0, buf = [], frame = 0, lastT = -1;
  const raf = window.requestAnimationFrame.bind(window);
  // Varias llamadas en el mismo fotograma reciben la misma marca de tiempo: se cuenta un fotograma por marca distinta
  window.requestAnimationFrame = (cb) => raf((t) => { if (t !== lastT) { frame++; lastT = t; } cb(t); });
  const flush = () => { if (buf.length) { console.log('__REC ' + JSON.stringify(buf)); buf = []; } };
  setInterval(() => {
    const m = window.__mudanza, g = m && m.game;
    if (!g || g === cur) return;
    flush(); cur = g; const id = ++gid; let n = 0; const orig = g.step;
    console.log('__REC ' + JSON.stringify([[id, 0, performance.now(), frame, 'seed', g.carriers.length, g.carriers.filter((c) => c.human !== null).length, g.opts && g.opts.seed, innerWidth, innerHeight]]));
    g.step = function (dt, inputs) {
      const w = performance.now();
      orig.call(this, dt, inputs); n++;
      const s = this.sofa.translation(), ev = this.out.filter((e) => ['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)).map((e) => e.type[0] + e.carrier);
      buf.push([id, n, +w.toFixed(1), frame, this.phase[0], +this.time.toFixed(4), +this.countdown.toFixed(4), inputs.map((x) => [x.mx, x.mz, x.grab ? 1 : 0, x.turn, x.right ? 1 : 0]),
        +s.x.toFixed(4), +s.y.toFixed(4), +s.z.toFixed(4), +this.sofaYaw.toFixed(4),
        this.carriers.map((c) => [+c.pos.x.toFixed(3), +c.pos.z.toFixed(3), c.holding ? 1 : 0, +c.stunned.toFixed(2), c.wobbling ? 1 : 0, c.knock || '', +Math.hypot(c.lean.x, c.lean.z).toFixed(3), +Math.hypot(c.forceExp.x, c.forceExp.z).toFixed(0)]), ev]);
      if (buf.length >= 30) flush();
    };
  }, 5);
};
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await launch(...a);
  const newPage = b.newPage.bind(b);
  b.newPage = async (...x) => {
    const p = await newPage(...x);
    const out = fs.openSync('rec.jsonl', 'w');
    p.on('console', (m) => { const t = m.text(); if (t.startsWith('__REC ')) fs.writeSync(out, t.slice(6) + '\n'); });
    await p.addInitScript(RECORDER);
    return p;
  };
  return b;
};
