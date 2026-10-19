import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { STAIRS } from '../../../src/sim/level.ts';
await RAPIER.init();
const DT = 1/60;
const mode = process.argv[2] ?? 'nolift';
const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const aps = [new Autopilot(0), new Autopilot(1)];
let lastLog = -1;
const stairsCol: any[] = [];
// find colliders of fixed bodies that are rotated (stairs) by checking contact with sofa
function sofaContacts() {
  const out: string[] = [];
  for (const c of g.sofaColliders) {
    g.world.contactPairsWith(c, (o: any) => {
      g.world.contactPair(c, o, (m: any) => { if (m.numContacts() > 0) { const n = m.normal(); const p = o.parent(); out.push(`${p.isFixed() ? 'fixed' : 'dyn'}(n=${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)})`); } });
    });
  }
  return out;
}
let events: string[] = [];
for (let i = 0; i < 60 * 150 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  const inputs = aps.map((a, k) => {
    const inp = a.input(g, DT);
    if (mode === 'nolift') return { ...inp, lift: false };
    if (mode === 'always') return { ...inp, lift: g.carriers[k].holding };
    if (mode === 'moving') return { ...inp, lift: g.carriers[k].holding && Math.hypot(inp.mx, inp.mz) > 0.2 };
    return inp; // autopilot default (lift only on stairs waypoint)
  });
  g.step(DT, inputs);
  for (const e of g.out) if (['wobble','fall','gripBreak','impact','stage','carHit','stun','win','lose','righted','respawnSofa'].includes(e.type)) events.push(`${g.time.toFixed(1)} ${e.type} ${'carrier' in e ? e.carrier : ''} ${'damage' in e ? 'dmg=' + e.damage : ''} ${'label' in e ? e.label : ''}`);
  const sp = g.sofaPos;
  const near = sp.z < STAIRS.z0 + 3 && sp.z > STAIRS.z1 - 2 && Math.abs(sp.x) < 2;
  const every = near ? 0.5 : 5;
  if (Math.floor(g.time / every) !== lastLog && g.phase === 'playing') {
    lastLog = Math.floor(g.time / every);
    const cs = g.carriers.map(c => { const p = c.pos; const gw = c.grabWorld(g.sofa); const h = c.handWorld(); const st = gw ? Math.hypot(gw.x-h.x, gw.y-h.y, gw.z-h.z) : 0; return `[p=(${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)}) gr=${c.grounded?1:0} hold=${c.holding?1:0} lift=${c.handLift.toFixed(1)} stretch=${st.toFixed(2)} wob=${c.wobbling?1:0}]`; }).join(' ');
    const v = g.sofa.linvel();
    console.log(`t=${g.time.toFixed(1)} st=${g.stageLabel} sofa=(${sp.x.toFixed(2)},${sp.y.toFixed(2)},${sp.z.toFixed(2)}) v=${Math.hypot(v.x,v.z).toFixed(2)} up=${g.sofaUp.toFixed(2)} needLift=${g.needsLiftAtStairs?1:0} contacts=${sofaContacts().join(',')} ${cs}`);
  }
}
console.log(events.join('\n'));
console.log('FIN', mode, g.phase, g.loseReason, 'tiempo', g.time.toFixed(1), 'integridad', g.integrity, 'etapa', g.stageLabel, 'wobbles', g.carriers.map(c=>c.wobbles), 'falls', g.carriers.map(c=>c.falls));
