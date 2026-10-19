// Verificación fisica-01: 3 y 4 humanos (física cooperativa) agarrando el sofá, quietos o andando.
// Variantes: contactos del agarre tal cual (coop => activos) y desactivados a mano tras agarrar (prueba causal).
// Uso: npx vite-node scripts/audit/verif-fisica/v01-cuatro.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function run(n: number, who: (i: number) => boolean, move: (i: number) => Partial<PlayerInput>, noContacts: boolean, seed = 1) {
  const g = new Game(RAPIER as any, { humans: n, carriers: n, botStyle: 'atentos', seed });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  // Agarran desde la posición de salida (sin acercarse); quien no llegue, se acerca hasta 1 s.
  for (let k = 0; k < 60; k++) {
    g.step(DT, g.carriers.map((c, i) => inp(who(i) && !c.holding ? (k % 2 === 0 ? { grab: true } : { mx: c.facing.x * 0.5, mz: c.facing.z * 0.5 }) : {})));
    if (g.carriers.every((c, i) => !who(i) || c.holding)) break;
  }
  const held0 = g.carriers.map((c) => (c.holding ? 1 : 0)).join('');
  const gl = g.carriers.map((c) => (c.grabLocal ? `(${c.grabLocal.x.toFixed(2)},${c.grabLocal.y.toFixed(2)},${c.grabLocal.z.toFixed(2)})` : '-')).join(' ');
  if (noContacts) for (const c of g.carriers) c.joint?.setContactsEnabled(false);
  const integ0 = g.integrity, s0 = g.sofaPos;
  let minUp = 1, maxW = 0; const imp: string[] = []; let falls = 0, wob = 0;
  for (let i = 0; i < 180; i++) {
    g.step(DT, g.carriers.map((_, j) => inp(move(j))));
    // si alguien vuelve a agarrar (no lo hacen aquí), mantener la variante
    if (noContacts) for (const c of g.carriers) c.joint?.setContactsEnabled(false);
    minUp = Math.min(minUp, g.sofaUp);
    const w = g.sofa.angvel(); maxW = Math.max(maxW, Math.hypot(w.x, w.y, w.z));
    for (const e of g.out) {
      if (e.type === 'impact') imp.push(`${(i * DT).toFixed(2)}s:-${e.damage}(dv=${e.strength.toFixed(1)})`);
      if (e.type === 'fall') falls++;
      if (e.type === 'wobble') wob++;
    }
  }
  const res = `n=${n} coop=${g.coop} contactosAgarre=${noContacts ? 'OFF' : 'ON'} agarranIni=${held0} grabLocal=${gl}\n   dist=${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} minUp=${minUp.toFixed(2)} maxω=${maxW.toFixed(2)} integ ${integ0}->${g.integrity} wobbles=${wob} falls=${falls} agarranFin=${g.carriers.map((c) => (c.holding ? 1 : 0)).join('')} impactos=[${imp.join(' ')}]`;
  g.dispose();
  return res;
}
const all = () => true;
const still = () => ({});
for (const n of [2, 3, 4]) {
  console.log('--- quietos, todos agarran');
  console.log(run(n, all, still, false));
  console.log(run(n, all, still, true));
}
console.log('--- 4 jugadores: solo extremos (0,1) agarran, quietos');
console.log(run(4, (i) => i < 2, still, false));
console.log('--- 4 jugadores: solo laterales (2,3) agarran, quietos');
console.log(run(4, (i) => i >= 2, still, false));
console.log('--- 4 jugadores, todos andan a lo largo (mx=-1)');
console.log(run(4, all, () => ({ mx: -1 }), false));
console.log(run(4, all, () => ({ mx: -1 }), true));
console.log('--- 4 jugadores, todos alzan quietos');
console.log(run(4, all, () => ({ lift: true }), false));
console.log('--- 3 jugadores, de lado (mz=-0.5)');
console.log(run(3, all, () => ({ mz: -0.5 }), false));
console.log(run(3, all, () => ({ mz: -0.5 }), true));
console.log('--- semillas distintas, 4 quietos (contactos ON)');
for (const s of [2, 3, 7]) console.log(run(4, all, still, false, s));
