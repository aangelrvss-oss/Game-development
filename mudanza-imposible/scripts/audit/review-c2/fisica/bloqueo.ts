// Bloqueo en la rampa y la abertura del camión del patio, con contrajuego. Equipo de 2 con la mesa (controlador que se
// recupera, `teamInputs`) y un saboteador. Casos:
//  - pasivo en la rampa, y el equipo lo rodea por el otro carril;
//  - activo: se pone delante de la mesa (sigue su z) en la rampa o en la abertura y empuja hacia fuera;
//  - contrajuego «apartarlo»: el equipo suelta la mesa y los dos empujan al saboteador fuera de la rampa (de lado).
// Uso: npx vite-node scripts/audit/review-c2/fisica/bloqueo.ts
import { CENTER_Y, PATIO, atHandle, f2, game, init, inp, itemOf, play, restHeight, teamInputs, NO_INPUT, type GameEvent } from './comun';

await init();
const sy = CENTER_Y + 0.05;
const onRamp = (x: number) => (x > 2 && x < 6 ? (x - 2) / 4 : x >= 6 ? 1 : 0);

function run(name: string, spot: { x: number; z: number } | null, sab: 'pasivo' | 'activo' | 'ninguno', laneTeam: number, counter: 'nada' | 'apartar') {
  const g = game(PATIO, 3, 3);
  const it = itemOf(g, 'mesa');
  for (const o of g.items) if (o !== it) { o.required = false; o.body.setTranslation({ x: -14 + o.index * 1.8, y: restHeight(o.def) + 0.01, z: -8.3 }, true); }
  play(g, 0.3);
  const order = it.def.handles.map((h, k) => ({ k, s: h.out.x })).sort((a, b) => b.s - a.s).map((e) => e.k);
  atHandle(g, it, 0, order[0]); atHandle(g, it, 1, order[1]);
  const me = g.carriers[2];
  if (spot) me.teleport({ x: spot.x, y: onRamp(spot.x) + sy + 0.02, z: spot.z }); else me.teleport({ x: -10, y: sy, z: 8 });
  play(g, 0.3);
  g.step(1 / 60, [inp({ grab: true }), inp({ grab: true }), NO_INPUT]);
  const route = [{ x: -1.5, z: laneTeam }, { x: 1.2, z: laneTeam }, { x: 9.8, z: laneTeam, release: true }];
  const members = new Map([[0, order[0]], [1, order[1]]] as [number, number][]);
  let wp = 0, done = NaN, inside = 0, cleared = NaN, mode: 'llevar' | 'apartar' = 'llevar', stall = 0;
  const ev: GameEvent[] = [];
  const t0 = g.time;
  for (let s = 0; s < 60 * 60; s++) {
    const q = it.body.translation(), w = route[wp];
    const dx = w.x - q.x, dz = w.z - q.z, d = Math.hypot(dx, dz);
    inside = it.inHold ? inside + 1 / 60 : 0;
    if (Number.isNaN(done) && (d < (w.release ? 0.35 : 0.7) || (w.release && inside > 1.5))) { if (w.release) done = g.time - t0; else wp++; }
    // Saboteador
    let a = NO_INPUT;
    if (sab !== 'ninguno' && spot) {
      const goal = sab === 'activo' ? { x: spot.x, z: q.z } : spot;
      const off = Math.hypot(me.pos.x - goal.x, me.pos.z - goal.z);
      if (sab === 'activo') a = off > 0.5 ? inp({ mx: (goal.x - me.pos.x) / off, mz: (goal.z - me.pos.z) / off }) : inp({ mx: -1 });
    }
    // Equipo
    const v = it.body.linvel();
    stall = Math.hypot(v.x, v.z) < 0.15 && Number.isNaN(done) && wp === 2 ? stall + 1 / 60 : 0;
    if (counter === 'apartar' && mode === 'llevar' && stall > 2) mode = 'apartar';
    let b0 = NO_INPUT, b1 = NO_INPUT;
    if (mode === 'apartar') {
      // Sueltan y empujan al saboteador hacia +z (fuera de la rampa por el costado)
      const pushIn = (i: number) => {
        const c = g.carriers[i];
        if (c.holding) return inp({ grab: true });
        const tx = me.pos.x + (i === 0 ? -0.3 : 0.3), tz = me.pos.z - 0.7, ddx = tx - c.pos.x, ddz = tz - c.pos.z, dd = Math.hypot(ddx, ddz);
        return dd > 0.25 ? inp({ mx: ddx / dd, mz: ddz / dd }) : inp({ mz: 1 });
      };
      b0 = pushIn(0); b1 = pushIn(1);
      if (Number.isNaN(cleared) && Math.abs(me.pos.z - q.z) > 1.6) { cleared = g.time - t0; mode = 'llevar'; }
    } else {
      const ti = teamInputs(g, it, members, { x: q.x + dx, z: q.z + dz }, s);
      b0 = !Number.isNaN(done) ? (g.carriers[0].holding ? inp({ grab: true }) : NO_INPUT) : ti.get(0)!;
      b1 = !Number.isNaN(done) ? (g.carriers[1].holding ? inp({ grab: true }) : NO_INPUT) : ti.get(1)!;
    }
    g.step(1 / 60, [b0, b1, a]);
    ev.push(...g.out);
    if (it.state === 'loaded') break;
  }
  const who = (t: GameEvent['type']) => g.carriers.map((c) => ev.filter((e) => e.type === t && 'carrier' in e && e.carrier === c.id).length).join('/');
  const r = `${name}: mesa ${it.state}${Number.isNaN(done) ? ' (no llegan a soltarla en 60 s)' : ` (suelta a ${f2(done)} s)`}; ${Number.isNaN(cleared) ? '' : `saboteador apartado a ${f2(cleared)} s; `}saboteador acaba en (${f2(me.pos.x)}, ${f2(me.pos.z)}); sueltas ${who('gripBreak')}, tambaleos ${who('wobble')}, caídas ${who('fall')}; integridad ${it.integrity}`;
  g.dispose();
  return r;
}

const N = -0.95;
console.log(run('sin saboteador (carril norte)', null, 'ninguno', N, 'nada'));
console.log(run('pasivo en la rampa, mismo carril', { x: 4, z: N }, 'pasivo', N, 'nada'));
console.log(run('pasivo en la rampa, el equipo va por z = +0,6 (lo rodea)', { x: 4, z: N }, 'pasivo', 0.6, 'nada'));
console.log(run('activo en la rampa (se pone delante y empuja)', { x: 4, z: N }, 'activo', N, 'nada'));
console.log(run('activo en la rampa; contrajuego: sueltan y lo apartan entre dos', { x: 4, z: N }, 'activo', N, 'apartar'));
console.log(run('activo en la abertura (se pone delante y empuja)', { x: 6.6, z: N }, 'activo', N, 'nada'));
console.log(run('activo en la abertura; contrajuego: sueltan y lo apartan entre dos', { x: 6.6, z: N }, 'activo', N, 'apartar'));
