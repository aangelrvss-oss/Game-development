// Revisión independiente C1, rol F (QA/fiabilidad). NO forma parte del juego.
// Partidas con n humanos que pulsan al azar (sesgado hacia el sofá): busca NaN, expulsiones, solapes del collider
// con el sofá y con lo fijo, porteadores que no se levantan, picos de tiempo por paso.
// Uso: npx vite-node scripts/audit/review-c1/rol-f-qa-b/monkey.ts [humanos] [partidas] [segundos]
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CARRIER } from '../../../../src/sim/carrier';
import { localToWorld, SLOTS } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});

const N = Number(process.argv[2] ?? 4), RUNS = Number(process.argv[3] ?? 12), SECS = Number(process.argv[4] ?? 40);
const DT = 1 / 60;

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function overlap(g: Game, ci: number, filter: (o: RAPIER.Collider) => boolean) {
  const c = g.carriers[ci];
  let worst = 0;
  g.world.intersectionsWithShape(c.collider.translation(), c.collider.rotation(), c.collider.shape, (o) => {
    if (!filter(o)) return true;
    const k = c.collider.contactCollider(o, 0);
    if (k && k.distance < 0) worst = Math.max(worst, -k.distance);
    return true;
  }, undefined, undefined, c.collider);
  return worst;
}

const all: number[] = []; const ONLY = Number(process.argv[5] ?? -1);
let totals = { nan: 0, eject: 0, sofaClamp: 0, downLong: 0, penSofa3: 0, penFixed3: 0, falls: 0, breaks: 0, respawnC: 0, respawnS: 0 };
for (let run = 0; run < RUNS; run++) { if (ONLY >= 0 && run !== ONLY) continue;
  const r = rng(1000 + run * 77);
  const g = new Game(RAPIER, { humans: N, carriers: N, botStyle: 'atentos', seed: run + 1 });
  const sofaCols = new Set(g.sofaColliders.map((c) => c.handle));
  const plan = g.carriers.map(() => ({ until: 0, inp: { ...NO_INPUT } as PlayerInput, pressGrab: false }));
  const downFor = g.carriers.map(() => 0);
  let maxDown = 0, maxV = 0, maxSofaV = 0, penSofa = 0, penFixed = 0, worstStep = 0, nanAt = -1;
  const steps: number[] = [];
  for (let i = 0; i < SECS * 60; i++) {
    const inputs: PlayerInput[] = g.carriers.map((c, k) => {
      const p = plan[k];
      if (g.time >= p.until) {
        p.until = g.time + 0.2 + r() * 1.3;
        const mode = r();
        if (mode < 0.45) {
          // Hacia un asa del sofá y agarrar
          const s = SLOTS[Math.floor(r() * SLOTS.length)], a = localToWorld(g.sofa, s.p), q = c.pos;
          const dx = a.x - q.x, dz = a.z - q.z, l = Math.hypot(dx, dz) || 1;
          p.inp = { ...NO_INPUT, mx: dx / l, mz: dz / l };
          p.pressGrab = r() < 0.6;
        } else if (mode < 0.85) {
          const ang = r() * Math.PI * 2;
          p.inp = { ...NO_INPUT, mx: Math.cos(ang), mz: Math.sin(ang), turn: r() < 0.1 ? 1 : 0 };
          p.pressGrab = r() < 0.15;
        } else {
          p.inp = { ...NO_INPUT };
          p.pressGrab = r() < 0.3;
        }
        return { ...p.inp, grab: p.pressGrab, right: r() < 0.05 };
      }
      return p.inp;
    });
    const t0 = performance.now();
    g.step(DT, inputs);
    const ms = performance.now() - t0;
    steps.push(ms); worstStep = Math.max(worstStep, ms);
    for (const e of g.out) {
      if (e.type === 'fall') totals.falls++;
      if (e.type === 'gripBreak') totals.breaks++;
      if (e.type === 'respawnSofa') totals.respawnS++;
    }
    const sp = g.sofaPos, sv = g.sofa.linvel();
    if (!Number.isFinite(sp.x + sp.y + sp.z) && nanAt < 0) nanAt = g.time;
    maxSofaV = Math.max(maxSofaV, Math.hypot(sv.x, sv.y, sv.z));
    g.carriers.forEach((c, k) => {
      const v = c.body.linvel(), p = c.pos;
      if (!Number.isFinite(p.x + p.y + p.z) && nanAt < 0) nanAt = g.time;
      maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
      downFor[k] = c.down ? downFor[k] + DT : 0;
      maxDown = Math.max(maxDown, downFor[k]);
      const ps = overlap(g, k, (o) => sofaCols.has(o.handle));
      const pf = overlap(g, k, (o) => !!o.parent()?.isFixed() && o.translation().y > 0.05);
      if (ps > 0.03 || pf > 0.03) {
        let what = '';
        g.world.intersectionsWithShape(c.collider.translation(), c.collider.rotation(), c.collider.shape, (o) => {
          const kk = c.collider.contactCollider(o, 0);
          if (kk && kk.distance < -0.03) { const t = o.translation(); what += ` [${sofaCols.has(o.handle) ? 'SOFA' : o.parent()?.isFixed() ? 'FIJO' : 'dyn'} t=(${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}) shape=${o.shapeType()} d=${(kk.distance*100).toFixed(1)}cm]`; }
          return true;
        }, undefined, undefined, c.collider);
        console.log(`  t=${g.time.toFixed(2)} J${k+1} pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=${Math.hypot(v.x,v.y,v.z).toFixed(2)} down=${c.down} tilt=${c.tilt.toFixed(2)} stun=${c.stunned.toFixed(2)} hold=${c.holding} wob=${c.wobbling} sofa=(${sp.x.toFixed(2)},${sp.y.toFixed(2)},${sp.z.toFixed(2)}) up=${g.sofaUp.toFixed(2)}${what}`);
      }
      penSofa = Math.max(penSofa, ps);
      penFixed = Math.max(penFixed, pf);
    });
    if (g.phase === 'won' || g.phase === 'lost') break;
  }
  steps.sort((a, b) => a - b);
  all.push(...steps);
  const p99 = steps[Math.floor(steps.length * 0.99)];
  const longDown = maxDown > CARRIER.stunTime + CARRIER.maxWaitRoom + CARRIER.riseTime + 0.2;
  if (nanAt >= 0) totals.nan++;
  if (maxV > 15) totals.eject++;
  if (maxSofaV > 10.9) totals.sofaClamp++;
  if (longDown) totals.downLong++;
  if (penSofa > 0.03) totals.penSofa3++;
  if (penFixed > 0.03) totals.penFixed3++;
  console.log(`run ${run}: t=${g.time.toFixed(1)} int=${g.integrity} vmax porteador=${maxV.toFixed(1)} sofa=${maxSofaV.toFixed(1)} m/s; en el suelo max ${maxDown.toFixed(2)} s; solape sofá ${(penSofa * 100).toFixed(1)} cm, fijo ${(penFixed * 100).toFixed(1)} cm; paso p99 ${p99.toFixed(2)} ms max ${worstStep.toFixed(2)} ms${nanAt >= 0 ? ' NaN@' + nanAt.toFixed(2) : ''}`);
  g.dispose();
}
all.sort((a, b) => a - b);
console.log(`TOTAL ${RUNS} partidas, ${N} humanos:`, JSON.stringify(totals));
console.log(`paso: p50 ${all[Math.floor(all.length * 0.5)].toFixed(3)} ms, p99 ${all[Math.floor(all.length * 0.99)].toFixed(3)} ms, p99.9 ${all[Math.floor(all.length * 0.999)].toFixed(3)} ms, max ${all[all.length - 1].toFixed(2)} ms`);
