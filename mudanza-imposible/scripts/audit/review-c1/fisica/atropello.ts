// Un coche (cuerpo cinemático) arrolla el sofá mientras dos lo llevan en su carril, y un porteador intenta subirse al
// sofá andando contra él. Mide solapes, velocidades, tope de clampLoads y si alguien acaba encima del sofá.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/atropello.ts
import { init, setup, near, play, inp, f2, f3, count, depth, SOFA, DT, NO_INPUT, OPEN, standY } from './comun';
await init();
const h = SOFA.half;

// 1) Llevan el sofá quietos en el carril de los coches (z = -1,6, va hacia +x) con el semáforo en verde para coches
for (const x0 of [-6, 0, 8]) {
  const g = setup(2, { x: x0, z: -1.6, yaw: Math.PI / 2 });
  g.clock = 0;
  near(g, 0, h.x, 0, 1, 0); near(g, 1, -h.x, 0, -1, 0);
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  let pen = 0, sv = 0, sw = 0, cv = 0, clamp = 0, hit = -1, t = 0;
  const ev = play(g, 10, () => [NO_INPUT, NO_INPUT], (g) => {
    t += DT;
    pen = Math.max(pen, depth(g.carriers.map((c) => c.collider), g.sofaColliders));
    const v = g.sofa.linvel(), w = g.sofa.angvel();
    sv = Math.max(sv, Math.hypot(v.x, v.y, v.z)); sw = Math.max(sw, Math.hypot(w.x, w.y, w.z));
    if (Math.hypot(v.x, v.y, v.z) > 10.9 || Math.hypot(w.x, w.y, w.z) > 5.9) clamp++;
    for (const c of g.carriers) { const q = c.body.linvel(); cv = Math.max(cv, Math.hypot(q.x, q.y, q.z)); }
    if (hit < 0 && g.out.some((e) => e.type === 'carHit')) hit = t;
  });
  console.log(`1) Sofá llevado en el carril (x=${x0}): golpe a los ${f2(hit)} s; solape porteador-sofá máx ${f3(pen)} m; |v sofá| máx ${f2(sv)}; |ω| máx ${f2(sw)}; fotogramas en el tope ${clamp}; |v porteador| máx ${f2(cv)}; atropellados ${count(ev, 'stun')}; daño ${100 - g.integrity}`);
  g.dispose();
}

// 2) ¿Puede un porteador subirse al sofá andando contra él (asiento, extremo, respaldo)?
for (const [name, lx, lz, ox, oz] of [['asiento', 0, h.z, 0, 1], ['extremo', h.x, 0, 1, 0], ['respaldo', 0, -h.z, 0, -1]] as const) {
  const g = setup(1);
  near(g, 0, lx, lz, ox, oz, 1.5);
  const c = g.carriers[0];
  let ymax = 0;
  play(g, 4, () => [inp({ mx: -ox, mz: -oz })], () => { ymax = Math.max(ymax, c.pos.y); });
  console.log(`2) Andando 4 s contra el ${name}: altura máx del centro del porteador ${f2(ymax)} m (de pie ${f2(standY)}); sofá movido a (${f2(g.sofaPos.x - OPEN.x)}, ${f2(g.sofaPos.z - OPEN.z)})`);
  g.dispose();
}
