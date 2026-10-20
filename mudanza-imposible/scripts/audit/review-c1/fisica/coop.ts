// Cooperación con 2, 3 y 4 humanos más allá de las pruebas del ciclo: girar el sofá andando de verdad (cada uno en
// tangente, sin la ayuda de Q/E, que es opcional), y un barrido de entradas aleatorias (semillas) de 20 s con
// agarrar y soltar, para buscar vuelcos, explosiones (tope de clampLoads), solapes y caídas raras.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/coop.ts
import { init, play, inp, f2, f3, count, depth, DT, NO_INPUT, OPEN, RAPIER, Game } from './comun';
import { RULES } from '../../../../src/sim/game';
import type { PlayerInput } from '../../../../src/sim/types';
await init();


/** Partida desde la salida, en el descampado: se acercan y agarran. */
function start(n: number) {
  const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  play(g, RULES.countdown + 0.2);
  const s0 = g.sofaPos;
  for (const c of g.carriers) { const p = c.pos, f = { ...c.facing }; c.teleport({ x: p.x - s0.x + OPEN.x, y: p.y, z: p.z - s0.z + OPEN.z }); c.facing = f; }
  g.sofa.setTranslation({ x: OPEN.x, y: s0.y, z: OPEN.z }, true);
  play(g, 0.4, (g) => g.carriers.map((c) => inp({ mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  play(g, 0.6, (g) => g.carriers.map(() => NO_INPUT));
  return g;
}

// a) Girar andando en tangente (sin Q/E), 5 s, en los dos sentidos
for (const n of [2, 3, 4]) for (const sense of [1, -1]) {
  const g = start(n);
  const grabbed = g.carriers.every((c) => c.holding);
  const y0 = g.sofaYaw;
  let upMin = 1, turned = 0, prevYaw = y0, pen = 0;
  const ev = play(g, 5, (g) => g.carriers.map((c) => {
    const s = g.sofaPos, rx = c.pos.x - s.x, rz = c.pos.z - s.z, l = Math.hypot(rx, rz) || 1;
    return inp({ mx: (-rz / l) * sense, mz: (rx / l) * sense });
  }), (g) => {
    upMin = Math.min(upMin, g.sofaUp);
    let d = g.sofaYaw - prevYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += d; prevYaw = g.sofaYaw;
    pen = Math.max(pen, depth(g.carriers.map((c) => c.collider), g.sofaColliders));
  });
  console.log(`a) ${n} humanos giran andando en tangente (${sense > 0 ? 'antihorario' : 'horario'}) 5 s: agarran ${grabbed}; giro ${f2(Math.abs(turned))} rad; sofaUp mín ${f2(upMin)}; caídas ${count(ev, 'fall')}; tambaleos ${count(ev, 'wobble')}; sueltan ${count(ev, 'gripBreak')}; daño ${100 - g.integrity}; solape ${f3(pen)}`);
  g.dispose();
}

// b) Barrido de entradas aleatorias
function rng(seed: number) { let a = seed * 2654435761 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
for (const n of [2, 3, 4]) {
  let worstUp = 1, worstV = 0, worstW = 0, clamps = 0, falls = 0, breaks = 0, dmg = 0, pen = 0, nan = 0, flips = 0, rights = 0, worstPenSeed = -1;
  const per: string[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    const r = rng(seed);
    const g = start(n);
    const cur: PlayerInput[] = g.carriers.map(() => NO_INPUT);
    const next = g.carriers.map(() => 0);
    let up = 1, sp = 0, pn = 0, wmax = 0, clamp = 0;
    const ev = play(g, 20, (_g, i) => g.carriers.map((c, k) => {
      if (i >= next[k]) {
        next[k] = i + 20 + Math.floor(r() * 70);
        const a = r() * Math.PI * 2, m = r() < 0.2 ? 0 : 0.4 + 0.6 * r();
        cur[k] = inp({ mx: Math.cos(a) * m, mz: Math.sin(a) * m });
        // De vez en cuando suelta o vuelve a agarrar
        if (r() < 0.12 || (!c.holding && r() < 0.6)) return { ...cur[k], grab: true };
      }
      return cur[k];
    }), (g) => {
      up = Math.min(up, g.sofaUp);
      const v = g.sofa.linvel(), w = g.sofa.angvel();
      const sv = Math.hypot(v.x, v.y, v.z), sw = Math.hypot(w.x, w.y, w.z);
      sp = Math.max(sp, sv); wmax = Math.max(wmax, sw);
      if (sv > 10.9 || sw > 5.9) clamp++;
      pn = Math.max(pn, depth(g.carriers.map((c) => c.collider), g.sofaColliders));
      const p = g.sofaPos; if (!Number.isFinite(p.x + p.y + p.z)) nan++;
    });
    worstUp = Math.min(worstUp, up); worstV = Math.max(worstV, sp); worstW = Math.max(worstW, wmax); clamps += clamp;
    falls += count(ev, 'fall'); breaks += count(ev, 'gripBreak'); dmg += 100 - g.integrity; rights += count(ev, 'righted');
    if (pn > pen) { pen = pn; worstPenSeed = seed; }
    if (up < 0) flips++;
    per.push(`s${seed}:up${f2(up)}/v${f2(sp)}/ω${f2(wmax)}/c${count(ev, 'fall')}/r${count(ev, 'gripBreak')}/d${100 - g.integrity}/p${f3(pn)}`);
    g.dispose();
  }
  console.log(`b) ${n} humanos, 12 semillas × 20 s al azar: sofaUp mín ${f2(worstUp)} (volcado en ${flips}); |v| máx ${f2(worstV)}; |ω| máx ${f2(worstW)}; fotogramas en el tope ${clamps}; caídas ${falls}; «se escapa» ${breaks}; daño total ${dmg}; solape máx ${f3(pen)} (semilla ${worstPenSeed}); NaN ${nan}`);
  console.log('   ' + per.join(' '));
}
