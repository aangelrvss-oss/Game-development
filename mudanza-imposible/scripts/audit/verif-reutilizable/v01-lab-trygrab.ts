// reutilizable-01: ¿el tryGrab del laboratorio (joint.setContactsEnabled(false), character.ts:193) deja que el
// sofá atraviese el cuerpo de quien lo agarra?
// Se ejecuta el Lab REAL del laboratorio (mudanza-imposible-character-lab/src/sim) con la RAPIER 0.19.3 del juego
// y se mide la penetración geométrica cápsula-sofá con contactCollider (no depende de que el solver genere
// contactos). Un segundo porteador se simula forzando la velocidad del sofá (girarlo / empujarlo hacia él),
// que es la situación que README.md:148-165 del juego describe. Variante «contacto ON»: tras agarrar se llama
// joint.setContactsEnabled(true), que es lo que hace el juego en coop (carrier.ts:196). Sin agarrar: control.
import RAPIER from '@dimforge/rapier3d-compat';
import { Lab } from '../../../../mudanza-imposible-character-lab/src/sim/lab.ts';
import { NO_INPUT } from '../../../../mudanza-imposible-character-lab/src/sim/types.ts';
await RAPIER.init();

type Force = (lab: Lab, t: number) => void;
/** Giro rígido del sofá alrededor del punto agarrado (como cuando el otro tira de lado desde el extremo opuesto). */
function aroundHand(lab: Lab, w: number) {
  const g = lab.char.grabWorld() ?? lab.char.handWorld(), c = lab.sofa.translation();
  const r = { x: g.x - c.x, z: g.z - c.z }, v = lab.sofa.linvel(), a = lab.sofa.angvel();
  lab.sofa.setAngvel({ x: a.x, y: w, z: a.z }, true);
  lab.sofa.setLinvel({ x: -w * r.z, y: v.y, z: w * r.x }, true);
}
const forces: Record<string, Force> = {
  'otro gira el sofá +0,8 rad/s': (lab) => { const w = lab.sofa.angvel(); lab.sofa.setAngvel({ x: w.x, y: 0.8, z: w.z }, true); },
  'otro gira el sofá -0,8 rad/s': (lab) => { const w = lab.sofa.angvel(); lab.sofa.setAngvel({ x: w.x, y: -0.8, z: w.z }, true); },
  'otro gira el sofá alrededor de la mano +0,8': (lab) => aroundHand(lab, 0.8),
  'otro gira el sofá alrededor de la mano -0,8': (lab) => aroundHand(lab, -0.8),
  'otro empuja el sofá hacia él 0,6 m/s': (lab) => { const v = lab.sofa.linvel(); lab.sofa.setLinvel({ x: v.x, y: v.y, z: 0.6 }, true); },
};

function run(name: string, force: Force, mode: 'lab' | 'on' | 'sin agarrar', x0: number) {
  const lab = new Lab(RAPIER as any);
  lab.reset('libre');
  const ch = lab.char;
  ch.place({ x: x0, y: ch.pos.y, z: -0.9 }, { x: 0, z: -1 });
  if (mode !== 'sin agarrar') for (let i = 0; i < 240 && !ch.holding; i++) lab.step({ ...NO_INPUT, mz: -0.5, grab: i % 4 === 0 });
  if (mode !== 'sin agarrar' && !ch.holding) { console.log(`${name}: no agarró`); return; }
  if (mode === 'on' && ch.joint) ch.joint.setContactsEnabled(true);
  let pen = 0, n = 0, n5 = 0, held = 0;
  for (let i = 0; i < 150; i++) {
    force(lab, i / 60);
    lab.step(NO_INPUT);
    if (ch.holding) held++;
    let p = 0;
    for (const s of lab.sofaColliders) { const k = ch.collider.contactCollider(s, 0); if (k && k.distance < 0) p = Math.max(p, -k.distance); }
    pen = Math.max(pen, p); n++; if (p > 0.05) n5++;
  }
  console.log(`${mode.padEnd(11)} | x0=${x0.toFixed(1)} | ${name.padEnd(36)} | penetración máx ${(pen * 100).toFixed(1).padStart(5)} cm | fotogramas >5 cm ${String(Math.round(100 * n5 / n)).padStart(3)} % | agarrado ${Math.round(100 * held / n)} % del tiempo | sucesos ${lab.log.map(e => e.e).join(',')}`);
  lab.dispose();
}

for (const [name, f] of Object.entries(forces)) for (const x of [0, 0.7]) for (const m of ['lab', 'on', 'sin agarrar'] as const) run(name, f, m, x);
