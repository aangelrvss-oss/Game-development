// Revisión ciclo 1, rol F: entradas aleatorias (agarrar a lo loco, correr, chocar) con 2-4 humanos y con ayudantes.
// Busca NaN, explosiones (sofá o porteadores a velocidades absurdas), porteadores que no se levantan nunca, solapes
// grandes del collider con el sofá y picos de coste por paso.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa/monkey.ts [partidas] [segundos]
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import type { PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const games = Number(process.argv[2] ?? 40), secs = Number(process.argv[3] ?? 60);
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let worst = { step: 0, sofaV: 0, carV: 0, downTime: 0, overlap: 0 };
let nanGames = 0, explode = 0, stuckDown = 0;
const log: string[] = [];
const hasDown = 'down' in (new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 }).carriers[0] as object);
for (let k = 0; k < games; k++) {
  const humans = 2 + (k % 3), carriers = k % 2 ? humans : Math.min(6, humans + 2);
  const g = new Game(RAPIER, { humans, carriers, botStyle: k % 4 < 2 ? 'atentos' : 'despistados', seed: k + 1 });
  const rnd = mulberry(k * 977 + 3);
  const cur: PlayerInput[] = Array.from({ length: humans }, () => ({ mx: 0, mz: 0, grab: false, turn: 0, right: false }));
  const downFor = new Array(carriers).fill(0);
  let nan = false;
  for (let i = 0; i < secs * 60 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    // Cada jugador cambia de intención cada ~0,3 s; agarrar/soltar al azar; a veces va directo al sofá y agarra
    const inputs = cur.map((c, h) => {
      if (rnd() < 0.05) {
        const toSofa = rnd() < 0.5;
        const me = g.carriers[h], s = g.sofaPos;
        if (toSofa) { const dx = s.x - me.pos.x, dz = s.z - me.pos.z, d = Math.hypot(dx, dz) || 1; c.mx = dx / d; c.mz = dz / d; }
        else { const a = rnd() * Math.PI * 2; c.mx = Math.cos(a); c.mz = Math.sin(a); }
        c.turn = rnd() < 0.2 ? (rnd() < 0.5 ? 1 : -1) : 0;
      }
      return { ...c, grab: rnd() < 0.03, right: rnd() < 0.01 };
    });
    const t0 = performance.now();
    g.step(1 / 60, inputs);
    worst.step = Math.max(worst.step, performance.now() - t0);
    const v = g.sofa.linvel();
    worst.sofaV = Math.max(worst.sofaV, Math.hypot(v.x, v.y, v.z));
    const p = g.sofaPos;
    if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
    g.carriers.forEach((c, j) => {
      const cv = c.body.linvel(), sp = Math.hypot(cv.x, cv.y, cv.z);
      if (sp > 15) log.push(`partida ${k} (${humans}h/${carriers}) t=${g.time.toFixed(2)} porteador ${j} v=${sp.toFixed(1)} en (${c.pos.x.toFixed(1)},${c.pos.y.toFixed(2)},${c.pos.z.toFixed(1)}) down=${(c as any).down} stun=${c.stunned.toFixed(2)} holding=${c.holding}`);
      worst.carV = Math.max(worst.carV, sp);
      if (!Number.isFinite(c.pos.x + c.pos.y + c.pos.z)) nan = true;
      const isDown = hasDown ? (c as any).down !== null : c.stunned > 0;
      downFor[j] = isDown ? downFor[j] + 1 / 60 : 0;
      worst.downTime = Math.max(worst.downTime, downFor[j]);
      // Solape del collider con el sofá
      for (const sc of g.sofaColliders) {
        const ct = c.collider.contactCollider(sc, 0);
        if (ct && ct.distance < 0) { if (-ct.distance > 0.08) log.push(`partida ${k} t=${g.time.toFixed(2)} porteador ${j} solape sofá ${(-ct.distance * 100).toFixed(1)} cm down=${(c as any).down} tilt=${((c as any).tilt ?? 0).toFixed(2)} stun=${c.stunned.toFixed(2)} holding=${c.holding} wob=${c.wobbling}`); worst.overlap = Math.max(worst.overlap, -ct.distance); }
      }
    });
  }
  if (nan) nanGames++;
  if (log.some((l) => l.startsWith(`partida ${k} `) && l.includes(' v='))) explode++;
  if (downFor.some((t) => t > 8)) stuckDown++;
  g.dispose();
}
const filt = process.argv[4] ? new RegExp(process.argv[4]) : null;
for (const l of (filt ? log.filter((x) => filt.test(x)) : log).slice(0, 60)) console.log(l);
console.log(`líneas de registro ${log.length}`);
console.log(`partidas ${games} × ${secs} s; NaN en ${nanGames}; explosiones ${explode}; tumbados > 8 s seguidos al final: ${stuckDown}`);
console.log(`peor paso ${worst.step.toFixed(2)} ms; sofá v máx ${worst.sofaV.toFixed(1)} m/s; porteador v máx ${worst.carV.toFixed(1)} m/s; tiempo seguido en el suelo máx ${worst.downTime.toFixed(2)} s; solape porteador-sofá máx ${(worst.overlap * 100).toFixed(1)} cm`);
