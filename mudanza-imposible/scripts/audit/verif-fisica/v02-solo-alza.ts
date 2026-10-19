// Verificación fisica-02: uno solo agarra un extremo (física cooperativa, J2 apartado) y anda 3 s, alzando o no.
// Mide distancia, altura del extremo libre, sofaUp y soloDrag. Variantes: masa 90/300/1000 kg (mutando SOFA.coopMass
// en memoria, no en disco) y contactos del agarre desactivados tras agarrar (prueba causal).
// Uso: npx vite-node scripts/audit/verif-fisica/v02-solo-alza.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { SOFA, localToWorld } from '../../../src/sim/sofa.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function run(opts: { lift: boolean; mass: number; dir: 'z' | 'x'; noContacts?: boolean; both?: boolean }) {
  (SOFA as any).coopMass = opts.mass;
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  if (!opts.both) g.carriers[1].teleport({ x: -6, y: 0.7, z: 14 });
  g.step(DT, [inp({ grab: true }), inp({ grab: !!opts.both })]);
  if (opts.noContacts) for (const c of g.carriers) c.joint?.setContactsEnabled(false);
  const s0 = g.sofaPos;
  let maxFree = -9, minUp = 1, maxSolo = 0; const ev: string[] = [];
  const mv = opts.dir === 'z' ? { mz: -1 } : { mx: 1 };
  for (let i = 0; i < 180; i++) {
    g.step(DT, [inp({ ...mv, lift: opts.lift }), opts.both ? inp({ ...mv, lift: opts.lift }) : NO_INPUT]);
    const a = localToWorld(g.sofa, { x: -1.1, y: -0.2, z: 0 }); // extremo opuesto al agarrado (J1 agarra x=+1.1), borde inferior
    maxFree = Math.max(maxFree, a.y); minUp = Math.min(minUp, g.sofaUp); maxSolo = Math.max(maxSolo, g.soloDrag);
    for (const e of g.out) if (['wobble', 'fall', 'gripBreak', 'impact'].includes(e.type)) ev.push(`${(i * DT).toFixed(1)}:${e.type}`);
  }
  const free = localToWorld(g.sofa, { x: -1.1, y: -0.2, z: 0 });
  const sp = g.sofa.linvel();
  console.log(`masa=${opts.mass} ${opts.both ? 'DOS' : 'UNO'} dir=${opts.dir} alza=${opts.lift} contactos=${opts.noContacts ? 'OFF' : 'ON'} gl=${g.carriers[0].grabLocal ? g.carriers[0].grabLocal.x.toFixed(2) + ',' + g.carriers[0].grabLocal.y.toFixed(2) : '-'}: dist3s=${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} m, centro y=${g.sofaPos.y.toFixed(2)}, extremoLibre(borde inf) y fin=${free.y.toFixed(2)} max=${maxFree.toFixed(2)}, up fin=${g.sofaUp.toFixed(2)} min=${minUp.toFixed(2)}, |v|=${Math.hypot(sp.x, sp.z).toFixed(2)} soloDrag fin=${g.soloDrag.toFixed(2)} max=${maxSolo.toFixed(2)} sujeta=${g.carriers[0].holding} integ=${g.integrity} masaReal=${g.sofa.mass().toFixed(1)}kg ev=${ev.join(',')}`);
  g.dispose();
}
for (const dir of ['z', 'x'] as const) for (const lift of [false, true]) run({ lift, mass: 90, dir });
console.log('--- dos juntos, 90 kg');
for (const lift of [false, true]) run({ lift, mass: 90, dir: 'z', both: true });
console.log('--- causal: contactos del agarre OFF');
for (const lift of [false, true]) run({ lift, mass: 90, dir: 'z', noContacts: true });
console.log('--- masa');
for (const m of [300, 1000]) for (const both of [false, true]) run({ lift: true, mass: m, dir: 'z', both });
