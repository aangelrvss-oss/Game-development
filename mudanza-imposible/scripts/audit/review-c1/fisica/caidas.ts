// Caídas y recuperación: caer en la escalera y en la rampa (6 direcciones), soltar tirando con el sofá en alto
// (el extremo cae junto al caído), el grupo pasando con el sofá por encima de un caído, y volver a agarrar.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/caidas.ts
import { init, setup, near, play, inp, f2, f3, count, depth, overlapAny, SOFA, DT, NO_INPUT, OPEN, standY } from './comun';
import { CARRIER } from '../../../../src/sim/carrier';
import { STAIRS, RAMP, FLOOR2 } from '../../../../src/sim/level';
import type { Game } from '../../../../src/sim/game';
await init();
const h = SOFA.half;

function fallAt(g: Game, at: { x: number; y: number; z: number }, dir: { x: number; z: number }) {
  const c = g.carriers[0];
  c.teleport(at);
  play(g, 0.4);
  const p0 = { ...c.pos };
  c.knockDown(dir, CARRIER.fallTime, 'balance');
  let worst = 0, t = 0, upAt = -1, maxTilt = 0;
  while (t < 7) {
    g.step(DT, [NO_INPUT]); t += DT;
    worst = Math.max(worst, overlapAny(g, c.collider).worst);
    maxTilt = Math.max(maxTilt, c.tilt);
    if (upAt < 0 && !c.down && c.stunned === 0) { upAt = t; break; }
  }
  const p1 = c.pos;
  return { worst, upAt, slide: Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z), maxTilt, dy: p1.y - p0.y };
}

// 1) Escalera y rampa, 6 direcciones
for (const [name, at] of [
  ['escalera (mitad)', { x: 0, y: FLOOR2 / 2 + 0.75, z: (STAIRS.z0 + STAIRS.z1) / 2 }],
  ['rampa (mitad)', { x: (RAMP.x0 + RAMP.x1) / 2, y: FLOOR2 / 2 + 0.75, z: (RAMP.z0 + RAMP.z1) / 2 }],
] as const) {
  const res: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    // El sofá cerca (si no, a más de 22 m el juego devuelve al porteador junto al sofá)
    const g = setup(1, name.startsWith('escalera') ? { x: 0, z: -18 } : { x: 20, z: -37 });
    const r = fallAt(g, at, { x: Math.cos(a), z: Math.sin(a) });
    res.push(`${k * 60}°: solape ${f3(r.worst)} tumbado ${f2(r.maxTilt)} de pie a ${f2(r.upAt)} s, se desliza ${f2(r.slide)} m (dy ${f2(r.dy)})`);
    g.dispose();
  }
  console.log(`1) Caída en ${name}:\n   ${res.join('\n   ')}`);
}

// 2) Dos llevan el sofá; J2 suelta tirando: cae junto al extremo que cae. ¿Solape? ¿Cuándo puede volver a agarrar?
{
  const g = setup(2);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0);
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  play(g, 1.5, () => [inp({ mz: -1 }), inp({ mz: -1 })]);
  play(g, 0.5, () => [inp({ mx: -1 }), inp({ mx: 1 })]);
  g.step(DT, [inp({ mx: -1 }), inp({ mx: 1, grab: true })]);
  const j2 = g.carriers[1];
  let worst = 0, t = 0, regrab = -1, fell = false;
  for (; t < 8 && regrab < 0; t += DT) {
    // J2 intenta agarrar cada 0,25 s en cuanto puede andar, yendo hacia el sofá
    const s = g.sofaPos, dx = s.x - j2.pos.x, dz = s.z - j2.pos.z, l = Math.hypot(dx, dz) || 1;
    const tryGrab = t > 0.3 && !j2.holding && j2.stunned === 0 && Math.round(t / DT) % 15 === 0;
    g.step(DT, [NO_INPUT, inp({ mx: j2.stunned ? 0 : dx / l, mz: j2.stunned ? 0 : dz / l, grab: tryGrab })]);
    if (g.out.some((e) => e.type === 'fall' && e.carrier === 1)) fell = true;
    worst = Math.max(worst, depth([j2.collider], g.sofaColliders));
    if (j2.holding) regrab = t;
  }
  console.log(`2) J2 suelta tirando: se cae ${fell}; solape con el sofá máx ${f3(worst)} m; vuelve a agarrar a los ${f2(regrab)} s`);
  g.dispose();
}

// 3) Tres llevan el sofá y pasan por encima de un cuarto tumbado delante de ellos
{
  const g = setup(4);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0); near(g, 2, 0.5, -h.z, 0, -1);
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true }), inp({ grab: true }), NO_INPUT]);
  play(g, 0.6, () => g.carriers.map(() => NO_INPUT));
  const down = g.carriers[3];
  // Tumbado a 2 m delante del sofá (en +z), a lo largo del sofá
  down.teleport({ x: g.sofaPos.x - 0.6, y: standY, z: g.sofaPos.z + 2.2 });
  play(g, 0.1);
  down.knockDown({ x: 1, z: 0 }, 2.5, 'balance');
  let worst = 0, upMin = 1, wobble = 0, falls = 0, pushed = 0;
  const p0 = { ...down.pos };
  const ev = play(g, 5, () => [inp({ mz: 1 }), inp({ mz: 1 }), inp({ mz: 1 }), NO_INPUT], (g) => {
    worst = Math.max(worst, depth([down.collider], g.sofaColliders));
    upMin = Math.min(upMin, g.sofaUp);
    pushed = Math.max(pushed, Math.hypot(down.pos.x - p0.x, down.pos.z - p0.z));
  });
  wobble = count(ev, 'wobble'); falls = count(ev, 'fall');
  console.log(`3) Tres pasan con el sofá por encima de un caído: solape caído-sofá máx ${f3(worst)} m; sofaUp mín ${f2(upMin)}; tambaleos ${wobble}; caídas ${falls}; daño ${100 - g.integrity}; caído desplazado ${f2(pushed)} m; caído de pie al final ${!down.down}; siguen agarrando ${g.carriers.slice(0, 3).map((c) => c.holding)}`);
  g.dispose();
}
