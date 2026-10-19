// reutilizable-01 (complemento): penetración cápsula-sofá en las 4 pruebas guionizadas del propio laboratorio
// (A-D, lab.ts), tal cual, para saber si el defecto se manifiesta dentro del laboratorio o solo al reutilizarlo.
import RAPIER from '@dimforge/rapier3d-compat';
import { Lab } from '../../../../mudanza-imposible-character-lab/src/sim/lab.ts';
await RAPIER.init();
for (const test of ['A', 'B', 'C', 'D'] as const) {
  const lab = new Lab(RAPIER as any);
  lab.reset(test);
  let pen = 0, penHeld = 0, held = 0;
  for (let i = 0; i < 60 * 12; i++) {
    lab.step();
    let p = 0;
    for (const s of lab.sofaColliders) { const k = lab.char.collider.contactCollider(s, 0); if (k && k.distance < 0) p = Math.max(p, -k.distance); }
    pen = Math.max(pen, p); if (lab.char.holding) { held++; penHeld = Math.max(penHeld, p); }
  }
  console.log(`prueba ${test}: penetración máx ${(pen * 100).toFixed(1)} cm (agarrando: ${(penHeld * 100).toFixed(1)} cm, ${held} fotogramas agarrado) | sucesos: ${lab.log.map(e => `${e.t}:${e.e}`).join(' ')}`);
  lab.dispose();
}
