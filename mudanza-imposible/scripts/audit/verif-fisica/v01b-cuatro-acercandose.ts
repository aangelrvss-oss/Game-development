// Verificación fisica-01 (b): protocolo del auditor: los porteadores se acercan 25 pasos hacia el sofá y luego agarran.
// Registra la componente del giro (ω), sofaUp, integridad y sucesos. Compara contactos del agarre ON/OFF.
// Uso: npx vite-node scripts/audit/verif-fisica/v01b-cuatro-acercandose.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function run(n: number, approach: number, who: (i: number) => boolean, move: (i: number, t: number) => Partial<PlayerInput>, noContacts: boolean, verbose = false) {
  const g = new Game(RAPIER as any, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  for (let k = 0; k < approach; k++) g.step(DT, g.carriers.map((c) => inp({ mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, g.carriers.map((_, i) => inp({ grab: who(i) })));
  const held0 = g.carriers.map((c) => (c.holding ? 1 : 0)).join('');
  const gl = g.carriers.map((c) => (c.grabLocal ? `(${c.grabLocal.x.toFixed(2)},${c.grabLocal.y.toFixed(2)},${c.grabLocal.z.toFixed(2)})` : '-')).join(' ');
  if (noContacts) for (const c of g.carriers) c.joint?.setContactsEnabled(false);
  const s0 = g.sofaPos;
  let minUp = 1, maxW = 0, wAt = ''; const ev: string[] = [];
  for (let i = 0; i < 180; i++) {
    const t = i * DT;
    g.step(DT, g.carriers.map((_, j) => inp(move(j, t))));
    minUp = Math.min(minUp, g.sofaUp);
    const w = g.sofa.angvel(); const wm = Math.hypot(w.x, w.y, w.z);
    if (wm > maxW) { maxW = wm; wAt = `t=${t.toFixed(2)} ω=(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)})`; }
    for (const e of g.out) {
      if (e.type === 'impact') ev.push(`${t.toFixed(2)}:impact-${e.damage}`);
      if (['wobble', 'fall', 'gripBreak', 'stun'].includes(e.type)) ev.push(`${t.toFixed(2)}:${e.type}${(e as any).carrier}`);
    }
    if (verbose && i % 15 === 14) console.log(`   t=${(t + DT).toFixed(2)} up=${g.sofaUp.toFixed(2)} y=${g.sofaPos.y.toFixed(2)} ω=(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}) integ=${g.integrity}`);
  }
  console.log(`n=${n} acercan=${approach} contactos=${noContacts ? 'OFF' : 'ON'} agarranIni=${held0} grabLocal=${gl}\n   dist=${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} minUp=${minUp.toFixed(2)} maxω=${maxW.toFixed(2)} [${wAt}] integ=${g.integrity} agarranFin=${g.carriers.map((c) => (c.holding ? 1 : 0)).join('')} ev=${ev.join(',')}`);
  g.dispose();
}
const all = () => true, still = () => ({});
for (const n of [2, 3, 4]) { run(n, 25, all, still, false); run(n, 25, all, still, true); }
console.log('--- detalle n=4 quietos, contactos ON');
run(4, 25, all, still, false, true);
console.log('--- n=4 solo extremos / solo laterales');
run(4, 25, (i) => i < 2, still, false);
run(4, 25, (i) => i >= 2, still, false);
console.log('--- n=4 andando a lo largo, alzando, de lado');
run(4, 25, all, () => ({ mx: -1 }), false);
run(4, 25, all, () => ({ mx: -1 }), true);
run(4, 25, all, () => ({ lift: true }), false);
run(4, 25, all, () => ({ mz: -0.5 }), false);
run(3, 25, all, () => ({ mz: -0.5 }), false);
run(3, 25, all, () => ({ mz: -0.5 }), true);
console.log('--- sensibilidad: distinto acercamiento (0, 10, 40 pasos), n=4 quietos, contactos ON');
for (const a of [0, 10, 40]) run(4, a, all, still, false);
