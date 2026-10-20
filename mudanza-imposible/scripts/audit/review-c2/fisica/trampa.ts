// «Hacer trampa»: ¿se puede meter en el camión, y dejar CARGADO, un objeto de 2 o 3 personas con menos gente?
// Controlador guiado por el script (no el piloto del juego): los porteadores agarran con el botón frente a las asas
// elegidas y todos piden ir hacia el siguiente punto de la ruta del objeto (la del nivel). En el último punto sueltan y
// se quedan quietos; se espera a que el objeto quede `loaded`. Se compara con el número de personas legítimo.
// Uso: npx vite-node scripts/audit/review-c2/fisica/trampa.ts
import { restHeight, CALLE, PATIO, atHandle, count, evSummary, f2, game, init, inp, itemOf, localToWorld, lowest, play, rotate, NO_INPUT, type Game, type Item, type ItemId, type LevelDef, type GameEvent } from './comun';

await init();

interface WP { x: number; z: number; release?: boolean }

/** Asas ordenadas por lo bien que miran hacia `dir` (tirar: el asa que mira hacia la meta; empujar: la contraria). */
function handlesToward(it: Item, dir: { x: number; z: number }, pull: boolean) {
  return it.def.handles.map((h, k) => {
    const o = rotate(it.body.rotation(), h.out);
    return { k, s: (o.x * dir.x + o.z * dir.z) * (pull ? 1 : -1) };
  }).sort((a, b) => b.s - a.s).map((e) => e.k);
}

function run(level: LevelDef, id: ItemId, n: number, pull: boolean, startAt?: { x: number; z: number; route: WP[] }) {
  const g = game(level, n, n);
  const it = itemOf(g, id);
  // Los demás objetos, apartados al fondo del patio para que no estorben (solo cuenta este)
  g.items.filter((o) => o !== it).forEach((o, k) => { o.required = false; o.body.setTranslation({ x: -14.5 + k * 1.9, y: restHeight(o.def) + 0.01, z: -8.3 }, true); });
  const route: WP[] = startAt ? startAt.route : level.items[it.index].route;
  if (startAt) { it.body.setTranslation({ x: startAt.x, y: 0.6, z: startAt.z }, true); }
  play(g, 0.5);
  const p = it.body.translation();
  const d0 = { x: route[0].x - p.x, z: route[0].z - p.z }, l0 = Math.hypot(d0.x, d0.z) || 1;
  const order = handlesToward(it, { x: d0.x / l0, z: d0.z / l0 }, pull);
  for (let i = 0; i < n; i++) atHandle(g, it, i, order[i]);
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
  const grabbed = g.carriers.filter((c) => c.heldBody === it.body).length;
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  let wp = 0, released = -1, t = 0;
  const ev: GameEvent[] = [];
  let minLow = Infinity, regrabs = 0, inside = 0;
  const trace: string[] | null = process.env.TRACE ? [] : null;
  const t0 = g.time;
  for (let s = 0; s < 60 * 90; s++) {
    const q = it.body.translation(), w = route[wp];
    const dx = w.x - q.x, dz = w.z - q.z, dist = Math.hypot(dx, dz);
    inside = it.inHold ? inside + 1 / 60 : 0;
    if (trace && Math.round(g.time * 60) % 60 === 0) trace.push(`${f2(g.time - t0)}s:(${f2(q.x)},${f2(q.y)},${f2(q.z)})`);
    if (released < 0 && (dist < (w.release ? 0.35 : 0.7) || (w.release && inside > 1.5))) {
      if (w.release) { released = g.time; g.step(1 / 60, g.carriers.map((c) => inp({ grab: c.heldBody === it.body }))); ev.push(...g.out); continue; }
      wp++;
      continue;
    }
    let inputs;
    if (released >= 0) inputs = g.carriers.map(() => NO_INPUT);
    else {
      // Quien ha soltado (se le escapó) vuelve a agarrar al momento: el jugador más tenaz
      inputs = g.carriers.map((c) => {
        if (c.heldBody !== it.body) { regrabs++; return inp({ grab: true }); }
        return inp({ mx: dx / dist, mz: dz / dist });
      });
    }
    g.step(1 / 60, inputs);
    ev.push(...g.out);
    if (released < 0) minLow = Math.min(minLow, lowest(it));
    if (it.state === 'loaded') break;
    if (released >= 0 && g.time - released > 6) break;
  }
  t = g.time - t0;
  if (trace) console.log(trace.join(' '));
  const r = { grabbed, state: it.state, inHold: it.inHold, t, released: released >= 0 ? released - t0 : NaN, ev, integrity: it.integrity, wp, regrabs };
  g.dispose();
  return r;
}

const CASES: { level: LevelDef; id: ItemId; ns: number[]; start?: { x: number; z: number; route: WP[] }; name: string }[] = [
  { level: PATIO, id: 'mesa', ns: [1, 2], name: 'Patio, mesa' },
  { level: PATIO, id: 'nevera', ns: [1, 2], name: 'Patio, nevera' },
  { level: PATIO, id: 'piano', ns: [1, 2, 3, 4], name: 'Patio, piano' },
  { level: PATIO, id: 'caja', ns: [1], name: 'Patio, caja (referencia)' },
  {
    level: CALLE, id: 'sofa', ns: [1, 2], name: 'La calle, sofá desde el llano entre rampas',
    start: { x: 23.4, z: -30.25, route: [{ x: 30.8, z: -30.25, release: true }] },
  },
];
for (const c of (process.env.ONLY ? CASES.filter((c) => c.name.includes(process.env.ONLY!)) : CASES)) {
  for (const n of c.ns) for (const pull of [true, false]) {
    const r = run(c.level, c.id, n, pull, c.start);
    const res = r.state === 'loaded' ? `CARGADO a los ${f2(r.t)} s (suelta a los ${f2(r.released)} s)` : `NO cargado (estado ${r.state}, dentro ${r.inHold}, punto ${r.wp}, ${f2(r.t)} s)`;
    console.log(`${c.name}, ${n} persona(s), ${pull ? 'tirando' : 'empujando'}: agarran ${r.grabbed}; ${res}; integridad ${r.integrity}; ${evSummary(r.ev)}; reagarres ${r.regrabs}`);
  }
}
