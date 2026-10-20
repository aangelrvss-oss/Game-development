// ¿Se puede meter un objeto debajo de la rampa del camión (hueco entre el suelo y la rampa, cerca de la abertura) y,
// si se mete, sacarlo? Un porteador empuja cada objeto de lado (−z) bajo la rampa a x = 5,3 y después intenta sacarlo.
import { ITEMS, PATIO, CENTER_Y, atHandle, f2, game, init, inp, itemOf, lowest, play, restHeight, NO_INPUT, type ItemId } from './comun';
await init();
const sy = CENTER_Y + 0.05;
for (const id of ['caja', 'silla', 'lampara', 'mesa', 'nevera', 'piano'] as ItemId[]) {
  const g = game(PATIO, 1, 1);
  for (const o of g.items) o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true);
  for (const o of g.items) o.required = false;
  const it = itemOf(g, id);
  it.body.setTranslation({ x: 5.3, y: restHeight(it.def) + 0.01, z: 3.2 }, true);
  it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  const me = g.carriers[0];
  me.teleport({ x: 5.3, y: sy, z: 4.6 });
  me.facing = { x: 0, z: -1 };
  // Empuja con el cuerpo 4 s hacia −z
  play(g, 4, () => [inp({ mz: -1 })]);
  const p = it.body.translation();
  const under = Math.abs(p.z) < 1.9 && p.x > 2 && p.x < 6 && p.y < (p.x - 2) / 4;
  // Ahora intenta sacarlo: agarra lo más cercano y tira hacia +z 4 s
  me.teleport({ x: p.x, y: sy, z: 2.6 }); me.facing = { x: 0, z: -1 };
  play(g, 0.2);
  g.step(1 / 60, [inp({ grab: true })]);
  const grabbed = me.heldBody === it.body;
  play(g, 4, () => [inp({ mz: 1 })]);
  const q = it.body.translation();
  console.log(`${it.def.name}: tras empujarlo, centro en (${f2(p.x)}, ${f2(p.y)}, ${f2(p.z)}) ${under ? 'DEBAJO DE LA RAMPA' : 'no está debajo'}; base ${f2(lowest(it))}; agarra para sacarlo: ${grabbed}; después en (${f2(q.x)}, ${f2(q.y)}, ${f2(q.z)})`);
  g.dispose();
}
