// Revisión independiente C1, rol F. T-coop-3/4 fuera de las 8 posiciones de la prueba: mismas reglas
// (sofaUp ≥ 0,7, 0 caídas, integridad 100, nadie se suelta) con más posiciones, más modos (diagonal, a medias,
// de lado en sentido contrario, giro horario) y más tiempo.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa-b/coop-wide.ts [desde] [hasta]
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05;
let OPEN = { x: -35, z: 25 };
const ONLY = process.argv[4] as Mode | undefined;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const FROM = Number(process.argv[2] ?? 8), TO = Number(process.argv[3] ?? 40);
type Mode = 'quietos' | 'largo' | 'lado' | 'girando' | 'diagonal' | 'lado+' | 'giroH' | 'mitad';
function play(g: Game, s: number, f: (g: Game) => PlayerInput[]) { const ev: string[] = []; for (let i = 0; i < s * 60; i++) { g.step(DT, f(g)); for (const e of g.out) ev.push(e.type); } return ev; }

function coop(n: number, layout: number, mode: Mode) {
  // +z: se sale del suelo (z = 40) en 6 s desde z = 25; se empieza más al sur, en la zona que recorre «lado»
  OPEN = mode === 'lado+' || mode === 'diagonal' ? { x: -35, z: 12 } : { x: -35, z: 25 };
  const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  play(g, RULES.countdown + 0.2, () => []);
  const s0 = g.sofaPos;
  for (const c of g.carriers) { const p = c.pos, f = { ...c.facing }; c.teleport({ x: p.x - s0.x + OPEN.x, y: p.y, z: p.z - s0.z + OPEN.z }); c.facing = f; }
  g.sofa.setTranslation({ x: OPEN.x, y: s0.y, z: OPEN.z }, true);
  let a = layout * 7919 + 17;
  const rnd = () => ((a = (a * 16807) % 2147483647), a / 2147483647);
  const used: { x: number; z: number }[] = [];
  for (const c of g.carriers) {
    for (let k = 0; k < 100; k++) {
      const end = rnd() < 0.4, sgn = rnd() < 0.5 ? -1 : 1;
      const along = (rnd() * 2 - 1) * (end ? SOFA.half.z : SOFA.half.x);
      const lp = end ? { x: sgn * (SOFA.half.x + 0.75), z: along } : { x: along, z: sgn * (SOFA.half.z + 0.75) };
      const w = localToWorld(g.sofa, { x: lp.x, y: 0, z: lp.z });
      if (used.some((u) => Math.hypot(u.x - w.x, u.z - w.z) < 0.8)) continue;
      used.push(w);
      const t = localToWorld(g.sofa, { x: end ? sgn * SOFA.half.x : along, y: 0, z: end ? along : sgn * SOFA.half.z });
      const l = Math.hypot(t.x - w.x, t.z - w.z);
      c.teleport({ x: w.x, y: standY, z: w.z }); c.facing = { x: (t.x - w.x) / l, z: (t.z - w.z) / l };
      break;
    }
  }
  play(g, 0.3, () => []);
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  const grabbed = g.carriers.every((c) => c.holding);
  let minUp = 1;
  const m = (k: number): PlayerInput =>
    mode === 'largo' ? inp({ mx: -1 }) : mode === 'lado' ? inp({ mz: -1 }) : mode === 'lado+' ? inp({ mz: 1 }) : mode === 'girando' ? inp({ turn: 1 })
      : mode === 'giroH' ? inp({ turn: -1 }) : mode === 'diagonal' ? inp({ mx: Math.SQRT1_2, mz: Math.SQRT1_2 }) : mode === 'mitad' ? (k % 2 ? inp({ mx: 1 }) : NO_INPUT) : NO_INPUT;
  const ev = play(g, 6, (g) => { minUp = Math.min(minUp, g.sofaUp); return g.carriers.map((_, k) => (g.time > 0.5 ? m(k) : NO_INPUT)); });
  const r = { grabbed, minUp, falls: ev.filter((e) => e === 'fall').length, lost: ev.filter((e) => e === 'gripBreak' || e === 'release').length, integrity: g.integrity, holding: g.carriers.every((c) => c.holding) };
  g.dispose();
  return r;
}

let cases = 0, bad = 0, notGrabbed = 0;
const fails: string[] = [];
for (const n of [3, 4]) for (let layout = FROM; layout < TO; layout++) for (const mode of (ONLY ? [ONLY] : ['quietos', 'largo', 'lado', 'lado+', 'diagonal', 'girando', 'giroH', 'mitad']) as Mode[]) {
  const r = coop(n, layout, mode);
  cases++;
  if (!r.grabbed) { notGrabbed++; continue; }
  const ok = r.minUp >= 0.7 && r.falls === 0 && r.integrity === 100 && r.lost === 0 && r.holding;
  if (!ok) { bad++; fails.push(`${n}h layout ${layout} ${mode}: up ${r.minUp.toFixed(2)} caídas ${r.falls} sueltas ${r.lost} int ${r.integrity} agarrados ${r.holding}`); }
}
console.log(fails.join('\n'));
console.log(`casos ${cases}, sin agarrar todos ${notGrabbed}, fallan ${bad} de ${cases - notGrabbed}`);
