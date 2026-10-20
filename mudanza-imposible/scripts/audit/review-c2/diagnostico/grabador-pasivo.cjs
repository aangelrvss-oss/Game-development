// Diagnóstico ciclo 2: precarga (node -r) que NO toca el guion de la prueba. Al abrir la página inyecta un grabador
// pasivo: guarda los últimos Math.random (candidatos a semilla), envuelve Game.step de cada partida nueva y manda por console.log, cada 30 pasos, las entradas y un estado
// compacto (sofá, giro, porteadores). La prueba no hace ninguna llamada extra al navegador. Escribe rec.jsonl (cwd).
const pw = require('playwright');
const fs = require('fs');
const RECORDER = () => {
  let cur = null, gid = 0, buf = [];
  // Últimos valores de Math.random (la semilla de la partida sale de uno de ellos en start())
  const R = Math.random, ring = []; Math.random = () => { const v = R(); ring.push(v); if (ring.length > 30) ring.shift(); return v; };
  const flush = () => { if (buf.length) { console.log('__REC ' + JSON.stringify(buf)); buf = []; } };
  setInterval(() => {
    const m = window.__mudanza, g = m && m.game;
    if (!g || g === cur) return;
    flush(); cur = g; const id = ++gid; let n = 0; const orig = g.step;
    console.log('__REC ' + JSON.stringify([[id, 0, performance.now(), 'seed', g.carriers.length, g.carriers.filter((c) => c.human !== null).length, ring.slice()]]));
    g.step = function (dt, inputs) {
      const w = performance.now();
      orig.call(this, dt, inputs); n++;
      const s = this.sofa.translation(), ev = this.out.filter((e) => ['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)).map((e) => e.type[0] + e.carrier);
      buf.push([id, n, +w.toFixed(1), this.phase[0], +this.time.toFixed(4), +this.countdown.toFixed(4), inputs.map((x) => [x.mx, x.mz, x.grab ? 1 : 0, x.turn, x.right ? 1 : 0]),
        +s.x.toFixed(4), +s.y.toFixed(4), +s.z.toFixed(4), +this.sofaYaw.toFixed(4),
        this.carriers.map((c) => [+c.pos.x.toFixed(3), +c.pos.z.toFixed(3), c.holding ? 1 : 0, +c.stunned.toFixed(2), c.wobbling ? 1 : 0, c.knock || '']), ev]);
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
