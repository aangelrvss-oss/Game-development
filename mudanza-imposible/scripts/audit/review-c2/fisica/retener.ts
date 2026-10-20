// ¿Se le puede quitar el objeto a quien lo agarra sin mover el mando (retener)? En llano: el saboteador agarra un asa y
// no toca el mando; los demás agarran otras asas y tiran alejándose de él 10 s, o lo sacuden (ida y vuelta cada 0,5 s).
// Ganar exige que nadie agarre (Game.updateLoad), así que un retenedor imposible de soltar bloquea la victoria.
import { ITEMS, atHandle, f2, flat, init, inp, play, NO_INPUT, type ItemId } from './comun';
await init();
for (const id of ['caja', 'mesa', 'sofa', 'piano'] as ItemId[]) for (const style of ['tiran', 'sacuden'] as const) for (const k of [1, 2, 3]) {
  const def = ITEMS[id];
  if (k + 1 > def.handles.length) continue;
  const { g, it } = flat(def, k + 1);
  atHandle(g, it, 0, 0);
  for (let i = 1; i <= k; i++) atHandle(g, it, i, i);
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
  const held0 = g.carriers.map((c) => c.heldBody === it.body);
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  let lost = NaN;
  const p0 = g.carriers[0].pos;
  for (let s = 0; s < 600; s++) {
    const sab = g.carriers[0], q = it.body.translation();
    const dx = q.x - sab.pos.x, dz = q.z - sab.pos.z, l = Math.hypot(dx, dz) || 1;
    const sgn = style === 'sacuden' && Math.floor(s / 30) % 2 === 1 ? -1 : 1;
    g.step(1 / 60, g.carriers.map((c, i) => (i === 0 ? NO_INPUT : inp({ mx: (dx / l) * sgn, mz: (dz / l) * sgn }))));
    if (Number.isNaN(lost) && sab.heldBody !== it.body) lost = s / 60;
  }
  const p1 = g.carriers[0].pos;
  console.log(`${def.name}: retenedor quieto contra ${k} que ${style} 10 s (agarran ${held0.filter(Boolean).length}/${k + 1}): ${Number.isNaN(lost) ? 'NO lo suelta' : `lo suelta a los ${f2(lost)} s`}; al retenedor lo arrastran ${f2(Math.hypot(p1.x - p0.x, p1.z - p0.z))} m; tiradores agarrando al final ${g.carriers.slice(1).filter((c) => c.heldBody === it.body).length}/${k}`);
  g.dispose();
}
