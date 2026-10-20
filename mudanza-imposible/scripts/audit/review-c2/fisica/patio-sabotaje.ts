// Sabotaje con los objetos del catálogo (solo ciclo 2: en 657fd30 no existen). Porteadores guiados por el script.
// Uso: npx vite-node scripts/audit/review-c2/fisica/patio-sabotaje.ts   (ONLY=<prefijo> para un bloque)
import {
  ITEMS, PATIO, CENTER_Y, atHandle, count, evSummary, f2, flat, game, init, inp, itemOf, localToWorld, lowest, play, restHeight,
  rotate, speeds, teamInputs, NO_INPUT, type Game, type GameEvent, type Item, type ItemId, type PlayerInput,
} from './comun';

await init();
const ONLY = process.env.ONLY;
const want = (k: string) => !ONLY || k.startsWith(ONLY);
const sy = CENTER_Y + 0.05;

// ---------------------------------------------------------------------------------------------------------------
// 1. Tira y afloja en llano: equipo de minCarriers (sofá: 2) llevando hacia fuera del asa 0; el saboteador agarra la
//    siguiente asa libre y tira en contra o de lado. 6 s. Se compara con el mismo equipo sin saboteador.
// ---------------------------------------------------------------------------------------------------------------
function tug(id: ItemId, mode: 'nadie' | 'contra' | 'lado' | 'suelta-y-agarra') {
  const def = ITEMS[id], n = def.minCarriers, total = mode === 'nadie' ? n : n + 1;
  const { g, it } = flat(def, total);
  for (let i = 0; i < n; i++) atHandle(g, it, i, i);
  if (total > n) atHandle(g, it, n, n);
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
  const grabbed = g.carriers.filter((c) => c.heldBody === it.body).length;
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  const out = rotate(it.body.rotation(), def.handles[0].out), ol = Math.hypot(out.x, out.z);
  const dir = { x: out.x / ol, z: out.z / ol };
  const p0 = it.body.translation();
  let minLow = Infinity, maxW = 0, sabLost = NaN;
  const ev: GameEvent[] = [];
  for (let s = 0; s < 360; s++) {
    const t = s / 60;
    const inputs: PlayerInput[] = g.carriers.map((c, i) => {
      if (i < n) return inp({ mx: dir.x, mz: dir.z });
      if (mode === 'contra') return inp({ mx: -dir.x, mz: -dir.z });
      if (mode === 'lado') return inp({ mx: -dir.z, mz: dir.x });
      // suelta y vuelve a agarrar cada 0,5 s (tirones), tirando en contra mientras agarra
      if (mode === 'suelta-y-agarra') return inp({ grab: s % 30 === 0, mx: -dir.x, mz: -dir.z });
      return NO_INPUT;
    });
    g.step(1 / 60, inputs);
    ev.push(...g.out);
    if (total > n && Number.isNaN(sabLost) && g.carriers[n].heldBody !== it.body && mode !== 'suelta-y-agarra') sabLost = t;
    minLow = Math.min(minLow, lowest(it));
    maxW = Math.max(maxW, speeds(g).w);
  }
  const p1 = it.body.translation();
  const prog = (p1.x - p0.x) * dir.x + (p1.z - p0.z) * dir.z, lat = Math.abs(-(p1.x - p0.x) * dir.z + (p1.z - p0.z) * dir.x);
  const who = (t: GameEvent['type']) => g.carriers.map((c) => ev.filter((e) => e.type === t && 'carrier' in e && e.carrier === c.id).length).join('/');
  const r = `${def.name}, ${n}${total > n ? ' + saboteador ' + mode : ' sin saboteador'}: agarran ${grabbed}; avance ${f2(prog)} m en 6 s, desvío ${f2(lat)} m; base mín ${f2(minLow)} m; |w| máx ${f2(maxW)} rad/s; sueltas ${who('gripBreak')}, tambaleos ${who('wobble')}, caídas ${who('fall')}; integridad ${it.integrity}${Number.isNaN(sabLost) ? '' : `; el saboteador pierde el agarre a los ${f2(sabLost)} s`}${total > n ? `; equipo agarrando al final ${g.carriers.slice(0, n).filter((c) => c.heldBody === it.body).length}/${n}` : ''}`;
  g.dispose();
  return r;
}
if (want('tira')) {
  for (const id of ['mesa', 'nevera', 'sofa', 'piano'] as ItemId[]) for (const m of ['nadie', 'contra', 'lado', 'suelta-y-agarra'] as const) console.log('tira | ' + tug(id, m));
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Embestida con el cuerpo: el equipo lleva el objeto 6 s; el saboteador corre (5,2 m/s) contra su costado 3 veces.
// ---------------------------------------------------------------------------------------------------------------
function ram(id: ItemId, target: 'objeto' | 'porteador') {
  const def = ITEMS[id], n = def.minCarriers;
  const { g, it } = flat(def, n + 1);
  for (let i = 0; i < n; i++) atHandle(g, it, i, i);
  g.carriers[n].teleport({ x: it.body.translation().x, y: sy, z: it.body.translation().z + 8 });
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map((_, i) => inp({ grab: i < n })));
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  const out = rotate(it.body.rotation(), def.handles[0].out), ol = Math.hypot(out.x, out.z);
  const dir = { x: out.x / ol, z: out.z / ol }, side = { x: -dir.z, z: dir.x };
  const p0 = it.body.translation();
  const ev: GameEvent[] = [];
  let maxV = 0, minLow = Infinity;
  for (let s = 0; s < 6 * 60; s++) {
    const ph = s % 120;
    const goal = target === 'objeto' ? it.body.translation() : g.carriers[0].pos;
    const me = g.carriers[n];
    if (ph === 0) me.teleport({ x: goal.x + side.x * 3.5, y: sy, z: goal.z + side.z * 3.5 });
    const dx = goal.x - me.pos.x, dz = goal.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
    g.step(1 / 60, g.carriers.map((_, i) => (i < n ? inp({ mx: dir.x, mz: dir.z }) : ph < 70 ? inp({ mx: dx / l, mz: dz / l }) : NO_INPUT)));
    ev.push(...g.out);
    maxV = Math.max(maxV, speeds(g).v);
    minLow = Math.min(minLow, lowest(it));
  }
  const p1 = it.body.translation();
  const prog = (p1.x - p0.x) * dir.x + (p1.z - p0.z) * dir.z, lat = -(p1.x - p0.x) * dir.z + (p1.z - p0.z) * dir.x;
  const who = (t: GameEvent['type']) => g.carriers.map((c) => ev.filter((e) => e.type === t && 'carrier' in e && e.carrier === c.id).length).join('/');
  const r = `${def.name}, ${n} llevando, embestido 3 veces (${target}): avance ${f2(prog)} m, desvío ${f2(lat)} m; base mín ${f2(minLow)}; |v| máx objetos ${f2(maxV)}; sueltas ${who('gripBreak')}, tambaleos ${who('wobble')}, caídas ${who('fall')}, aturdidos ${who('stun')}; integridad ${it.integrity}; equipo agarrando al final ${g.carriers.slice(0, n).filter((c) => c.heldBody === it.body).length}/${n}`;
  g.dispose();
  return r;
}
if (want('embiste')) {
  for (const id of ['caja', 'lampara', 'mesa', 'nevera', 'sofa', 'piano'] as ItemId[]) for (const t of ['objeto', 'porteador'] as const) console.log('embiste | ' + ram(id, t));
}

// ---------------------------------------------------------------------------------------------------------------
// 3. La lámpara: quien la empuja andando a distintas velocidades, quien la suelta y lo rápido que se puede perder la
//    partida del patio desde la salida (la lámpara es obligatoria).
// ---------------------------------------------------------------------------------------------------------------
if (want('lampara')) {
  for (const speed of [0.3, 0.6, 1.0, 1.5]) {
    const { g, it } = flat(ITEMS.lampara, 1);
    const p = it.body.translation();
    g.carriers[0].teleport({ x: p.x + 2.5, y: sy, z: p.z });
    const ev = play(g, 5, () => [inp({ mx: -speed })]);
    const up = rotate(it.body.rotation(), { x: 0, y: 1, z: 0 }).y;
    console.log(`lampara | la empuja andando con el mando a ${speed} (≈${f2(speed * 5.2)} m/s): ${it.state}, integridad ${it.integrity}, de pie ${f2(up)}; ${evSummary(ev)}`);
    g.dispose();
  }
  // Partida del patio con 2 jugadores: uno corre directo a la lámpara desde su salida
  {
    const g = game(PATIO, 2, 2);
    g.phase = 'countdown'; g.countdown = 3;
    const lamp = itemOf(g, 'lampara');
    let lostAt = NaN;
    for (let s = 0; s < 60 * 20 && g.phase !== 'lost'; s++) {
      const me = g.carriers[0], q = lamp.body.translation();
      const dx = q.x - me.pos.x, dz = q.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
      g.step(1 / 60, [inp({ mx: dx / l, mz: dz / l }), NO_INPUT]);
      if (g.phase === 'lost') lostAt = g.time;
    }
    console.log(`lampara | patio, un jugador corre a la lámpara desde la salida: fase ${g.phase}${Number.isNaN(lostAt) ? '' : ` a los ${f2(lostAt)} s de juego`}, motivo ${g.loseReason}, lámpara ${lamp.state} (${lamp.integrity})`);
    g.dispose();
  }
  // Lanzar otro objeto contra la lámpara: una caja llevada a la carrera y soltada encima
  {
    const g = game(PATIO, 1, 1);
    const lamp = itemOf(g, 'lampara'), caja = itemOf(g, 'caja', 1);
    atHandle(g, caja, 0, 0);
    play(g, 0.3);
    g.step(1 / 60, [inp({ grab: true })]);
    const ev = play(g, 6, (g) => {
      const me = g.carriers[0], q = lamp.body.translation(), cp = caja.body.translation();
      const dx = q.x - cp.x, dz = q.z - cp.z, l = Math.hypot(dx, dz) || 1;
      return [inp({ mx: dx / l, mz: dz / l, grab: l < 0.9 && me.holding })];
    });
    console.log(`lampara | la caja llevada contra la lámpara: lámpara ${lamp.state} (${lamp.integrity}), fase ${g.phase}; ${evSummary(ev)}`);
    g.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Descargar: un objeto ya cargado en el camión del patio; el saboteador, solo, lo agarra y lo saca.
// ---------------------------------------------------------------------------------------------------------------
function unload(id: ItemId, n = 1) {
  const g = game(PATIO, n, n);
  const it = itemOf(g, id);
  // Los demás siguen siendo obligatorios (sin cargar) para que la partida siga en juego
  // Se coloca dentro, en su sitio de la ruta, y se espera a que quede cargado
  const route = g.level.items[it.index].route, last = route[route.length - 1];
  it.body.setTranslation({ x: last.x, y: 1.0 + restHeight(it.def) + 0.02, z: last.z }, true);
  for (const o of g.items) if (o !== it) { o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true); o.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); }
  g.carriers.forEach((c, i) => c.teleport({ x: 8 + i * 0.8, y: 1.0 + sy, z: 0 }));
  const ev0 = play(g, 3);
  const loaded0 = it.state;
  const won0 = g.phase;
  // Ahora lo hacemos obligatorio solo a él (si no, la partida ya estaría ganada): ver si se gana y luego sacarlo
  // Asas que miran hacia la salida del camión (−x) primero: quien saca el objeto tira andando de espaldas
  const exitOrder = it.def.handles.map((h, k) => ({ k, s: rotate(it.body.rotation(), h.out).x })).sort((a, b) => a.s - b.s).map((e) => e.k);
  for (let i = 0; i < n; i++) atHandle(g, it, i, exitOrder[i]);
  play(g, 0.2);
  g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
  const afterGrab = it.state, unloadedEv = count(g.out, 'itemUnloaded');
  const t0 = g.time;
  let outAt = NaN;
  const ev = play(g, 25, (g) => g.carriers.map((c) => {
    if (!Number.isNaN(outAt)) return c.holding ? inp({ grab: true }) : NO_INPUT;
    const q = it.body.translation(), goal = { x: -1.5, z: q.z };
    const dx = goal.x - q.x, dz = goal.z - q.z, l = Math.hypot(dx, dz) || 1;
    return c.heldBody === it.body ? inp({ mx: dx / l, mz: dz / l }) : inp({ grab: true });
  }), (g) => { if (Number.isNaN(outAt) && g.holdFraction(it) < 0.8 && it.body.translation().x < 5.5) outAt = g.time - t0; });
  const r = `${it.def.name}, ${n} saboteador(es): antes ${loaded0} (fase ${won0}; ${count(ev0, 'itemLoaded')} itemLoaded); al agarrarlo pasa a «${afterGrab}» con ${unloadedEv} itemUnloaded en ese mismo paso; fuera de la caja de carga a los ${f2(outAt)} s; posición final x ${f2(it.body.translation().x)}; integridad ${it.integrity}; ${evSummary(ev)}`;
  g.dispose();
  return r;
}
if (want('descarga')) {
  for (const [id, n] of [['caja', 1], ['silla', 1], ['lampara', 1], ['mesa', 1], ['nevera', 1], ['piano', 1], ['piano', 2]] as [ItemId, number][]) console.log('descarga | ' + unload(id, n));
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Retener: ganar exige que nadie agarre. En el patio, todo cargado menos la caja; el saboteador agarra la caja dentro
//    del camión y no la suelta. ¿Pueden los otros dos (que también están dentro) quitársela tirando?
// ---------------------------------------------------------------------------------------------------------------
if (want('retiene')) {
  for (const [counter, sabPull] of [['nada', false], ['tiran-de-ella', false], ['tiran-de-ella', true]] as [string, boolean][]) {
    const g = game(PATIO, 3, 3);
    for (const it of g.items) {
      const route = g.level.items[it.index].route, last = route[route.length - 1];
      it.body.setTranslation({ x: last.x, y: 1.0 + restHeight(it.def) + 0.05, z: last.z }, true);
    }
    for (const it of g.items) if (!it.required) it.body.setTranslation({ x: -12 + it.index, y: restHeight(it.def) + 0.01, z: -8 }, true);
    const caja = itemOf(g, 'caja', 0);
    g.carriers.forEach((c, i) => c.teleport({ x: -10, y: sy, z: -2 + i * 1.2 }));
    play(g, 0.1);
    atHandle(g, caja, 0, 0, 0.7);
    g.step(1 / 60, [inp({ grab: true }), NO_INPUT, NO_INPUT]);
    const holding = g.carriers[0].heldBody === caja.body;
    if (counter === 'tiran-de-ella') { atHandle(g, caja, 1, 1, 0.7); g.step(1 / 60, [NO_INPUT, inp({ grab: true }), NO_INPUT]); }
    const helper = g.carriers[1].heldBody === caja.body;
    let wonAt = NaN, lostGrip = NaN;
    const t0 = g.time;
    for (let s = 0; s < 60 * 30 && g.phase === 'playing'; s++) {
      const sab = g.carriers[0], me = g.carriers[1], p = caja.body.translation();
      if (Number.isNaN(lostGrip) && sab.heldBody !== caja.body) lostGrip = g.time - t0;
      // El saboteador: quieto o tirando hacia su lado (alejándose de la caja)
      let a = NO_INPUT;
      if (sab.heldBody === caja.body && sabPull) { const dx = sab.pos.x - p.x, dz = sab.pos.z - p.z, l = Math.hypot(dx, dz) || 1; a = inp({ mx: dx / l, mz: dz / l }); }
      // El compañero: tira hacia su lado mientras el saboteador la tenga; cuando la suelta, suelta él también
      let b = NO_INPUT;
      if (counter === 'tiran-de-ella' && me.heldBody === caja.body) {
        if (sab.heldBody === caja.body) { const dx = me.pos.x - p.x, dz = me.pos.z - p.z, l = Math.hypot(dx, dz) || 1; b = inp({ mx: dx / l, mz: dz / l }); }
        else b = inp({ grab: true });
      }
      g.step(1 / 60, [a, b, NO_INPUT]);
      if (g.phase === 'won') wonAt = g.time - t0;
    }
    console.log(`retiene | patio, todo cargado salvo la caja, que agarra el saboteador (agarra ${holding}, ${sabPull ? 'tirando hacia su lado' : 'quieto'}); contrajuego «${counter}» (agarra ${helper}): fase ${g.phase}${Number.isNaN(wonAt) ? ' tras 30 s' : ` (gana a los ${f2(wonAt)} s)`}; cargados ${g.loadedRequired}/${g.requiredCount}; el saboteador ${Number.isNaN(lostGrip) ? 'SIGUE agarrando' : `pierde la caja a los ${f2(lostGrip)} s`}; caja en x ${f2(caja.body.translation().x)}, z ${f2(caja.body.translation().z)}`);
    g.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Soltar de golpe en la rampa del camión del patio (mesa con 2, nevera con 2, piano con 3): uno suelta a media rampa.
//    ¿Se desliza el objeto, se rompe algo, se cae el compañero? Después el que soltó se queda quieto 3 s.
// ---------------------------------------------------------------------------------------------------------------
function rampDrop(id: ItemId, partner: 'sigue' | 'se-para') {
  const def = ITEMS[id], n = def.minCarriers;
  const g = game(PATIO, n, n);
  const it = itemOf(g, id);
  for (const o of g.items) if (o !== it) { o.required = false; o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true); }
  it.body.setTranslation({ x: 0, y: restHeight(def) + 0.01, z: 0 }, true);
  it.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  play(g, 0.3);
  // Asas: la primera mira a −x en mesa, nevera y piano: tirar hacia +x con quien agarra el asa 1 (+x) delante
  const order = def.handles.map((h, k) => ({ k, s: h.out.x })).sort((a, b) => b.s - a.s).map((e) => e.k);
  for (let i = 0; i < n; i++) atHandle(g, it, i, order[i]);
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  const ev: GameEvent[] = [];
  let dropT = NaN, xDrop = NaN, minX = Infinity, maxV = 0;
  const dropper = n - 1; // el último (detrás)
  const members = new Map(order.slice(0, n).map((h, i) => [i, h] as [number, number]));
  for (let s = 0; s < 60 * 30; s++) {
    const q = it.body.translation();
    if (Number.isNaN(dropT) && q.x > 3.5) { dropT = g.time; xDrop = q.x; }
    const recover = teamInputs(g, it, members, { x: 9, z: 0 }, s);
    const ins = g.carriers.map((c, i) => {
      if (!Number.isNaN(dropT) && g.time - dropT < 3) {
        if (i === dropper) return c.holding ? inp({ grab: true }) : NO_INPUT;
        return partner === 'sigue' ? inp({ mx: 1 }) : NO_INPUT;
      }
      return recover.get(i) ?? inp({ mx: 1 });
    });
    g.step(1 / 60, ins);
    ev.push(...g.out);
    if (!Number.isNaN(dropT) && g.time - dropT < 3) minX = Math.min(minX, q.x);
    maxV = Math.max(maxV, speeds(g).v);
    if (it.inHold && q.x > 8) break;
  }
  const who = (t: GameEvent['type']) => g.carriers.map((c) => ev.filter((e) => e.type === t && 'carrier' in e && e.carrier === c.id).length).join('/');
  const r = `${def.name}, ${n}, uno suelta a media rampa (x=${f2(xDrop)}), el resto ${partner}: x mínima en los 3 s ${f2(minX)} (retrocede ${f2(Math.max(0, xDrop - minX))} m), z final ${f2(it.body.translation().z)}; dentro al final ${it.inHold} (x ${f2(it.body.translation().x)}, ${f2(g.time - dropT)} s tras soltar); |v| máx ${f2(maxV)}; integridad ${it.integrity}; sueltas ${who('gripBreak')}, tambaleos ${who('wobble')}, caídas ${who('fall')}`;
  g.dispose();
  return r;
}
if (want('rampa')) {
  for (const id of ['mesa', 'nevera', 'piano'] as ItemId[]) for (const p of ['sigue', 'se-para'] as const) console.log('rampa | ' + rampDrop(id, p));
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Bloquear la rampa del camión del patio: el saboteador se planta en el centro de la rampa o en la abertura
//    (quieto o empujando hacia fuera) mientras dos suben la mesa por su carril.
// ---------------------------------------------------------------------------------------------------------------
function block(where: 'ninguno' | 'rampa' | 'abertura' | 'dentro', push: boolean) {
  const g = game(PATIO, 3, 3);
  const it = itemOf(g, 'mesa');
  for (const o of g.items) if (o !== it) { o.required = false; o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true); }
  play(g, 0.3);
  const lane = -0.95;
  const spot = where === 'rampa' ? { x: 4, z: lane } : where === 'abertura' ? { x: 6.6, z: lane } : where === 'dentro' ? { x: 9.8, z: lane } : { x: -10, z: 8 };
  const order = it.def.handles.map((h, k) => ({ k, s: h.out.x })).sort((a, b) => b.s - a.s).map((e) => e.k);
  for (let i = 0; i < 2; i++) atHandle(g, it, i, order[i]);
  g.carriers[2].teleport({ x: spot.x, y: (spot.x > 2 && spot.x < 6 ? (spot.x - 2) / 4 : spot.x >= 6 ? 1 : 0) + sy + 0.02, z: spot.z });
  play(g, 0.3);
  g.step(1 / 60, [inp({ grab: true }), inp({ grab: true }), NO_INPUT]);
  const route = [{ x: -1.5, z: lane }, { x: 1.2, z: lane }, { x: 9.8, z: lane, release: true }];
  let wp = 0, done = NaN, inside = 0;
  const ev: GameEvent[] = [];
  const t0 = g.time;
  const members = new Map([[0, order[0]], [1, order[1]]] as [number, number][]);
  for (let s = 0; s < 60 * 60; s++) {
    const q = it.body.translation(), w = route[wp];
    const dx = w.x - q.x, dz = w.z - q.z, d = Math.hypot(dx, dz);
    inside = it.inHold ? inside + 1 / 60 : 0;
    if (Number.isNaN(done) && (d < (w.release ? 0.35 : 0.7) || (w.release && inside > 1.5))) { if (w.release) done = g.time - t0; else wp++; }
    const me = g.carriers[2];
    const off = Math.hypot(me.pos.x - spot.x, me.pos.z - spot.z);
    const back = off > 0.4 ? inp({ mx: (spot.x - me.pos.x) / off, mz: (spot.z - me.pos.z) / off }) : NO_INPUT;
    // Empujando: hacia −x mientras no le hayan sacado más de 1 m de su sitio; si le sacan, vuelve a él
    const sab = push ? (off < 1 ? inp({ mx: -1 }) : back) : (s < 30 ? back : NO_INPUT);
    const ti = teamInputs(g, it, members, { x: q.x + dx, z: q.z + dz }, s);
    const team = (c: number) => (!Number.isNaN(done) ? (g.carriers[c].holding ? inp({ grab: true }) : NO_INPUT) : ti.get(c)!);
    g.step(1 / 60, [team(0), team(1), sab]);
    ev.push(...g.out);
    if (it.state === 'loaded') break;
  }
  const who = (t: GameEvent['type']) => g.carriers.map((c) => ev.filter((e) => e.type === t && 'carrier' in e && e.carrier === c.id).length).join('/');
  const r = `bloqueo ${where}${push ? ' empujando' : ' quieto'}: mesa ${it.state} (suelta a ${f2(done)} s; ${f2(g.time - t0)} s en total); saboteador acaba en x ${f2(g.carriers[2].pos.x)}, y ${f2(g.carriers[2].pos.y)}; integridad ${it.integrity}; sueltas ${who('gripBreak')}, tambaleos ${who('wobble')}, caídas ${who('fall')}`;
  g.dispose();
  return r;
}
if (want('bloqueo')) {
  for (const [w, p] of [['ninguno', false], ['rampa', false], ['rampa', true], ['abertura', false], ['abertura', true], ['dentro', false]] as ['ninguno' | 'rampa' | 'abertura' | 'dentro', boolean][]) console.log('bloqueo | ' + block(w, p));
}
void localToWorld; void lowest;
