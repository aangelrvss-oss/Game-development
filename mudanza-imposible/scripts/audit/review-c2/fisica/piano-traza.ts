// Traza del caso «piano, 3, uno suelta a media rampa, el resto sigue» de patio-sabotaje.ts: dónde acaba el piano.
import { ITEMS, PATIO, atHandle, f2, game, init, inp, itemOf, lowest, play, restHeight, NO_INPUT } from './comun';
await init();
const def = ITEMS.piano, n = 3;
const g = game(PATIO, n, n);
const it = itemOf(g, 'piano');
for (const o of g.items) if (o !== it) { o.required = false; o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true); }
it.body.setTranslation({ x: 0, y: restHeight(def) + 0.01, z: 0 }, true);
it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
play(g, 0.3);
const order = def.handles.map((h, k) => ({ k, s: h.out.x })).sort((a, b) => b.s - a.s).map((e) => e.k);
for (let i = 0; i < n; i++) atHandle(g, it, i, order[i]);
play(g, 0.3);
g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
let dropT = NaN;
for (let s = 0; s < 60 * 20; s++) {
  const q = it.body.translation();
  if (Number.isNaN(dropT) && q.x > 3.5) dropT = g.time;
  const ins = g.carriers.map((c, i) => {
    if (!Number.isNaN(dropT) && g.time - dropT < 3) return i === n - 1 ? (c.holding ? inp({ grab: true }) : NO_INPUT) : inp({ mx: 1 });
    if (!Number.isNaN(dropT) && i === n - 1 && !c.holding) return inp({ grab: s % 10 === 0, mx: 1 });
    return inp({ mx: 1 });
  });
  g.step(1 / 60, ins);
  if (s % 30 === 0) {
    const up = it.body.rotation();
    console.log(`t=${f2(g.time)} piano (${f2(q.x)}, ${f2(q.y)}, ${f2(q.z)}) base ${f2(lowest(it))} dentro ${it.inHold} agarran ${g.carriers.map((c) => (c.heldBody === it.body ? 'P' : '-')).join('')} porteadores ${g.carriers.map((c) => `(${f2(c.pos.x)},${f2(c.pos.y)},${f2(c.pos.z)})`).join(' ')}`);
  }
}
