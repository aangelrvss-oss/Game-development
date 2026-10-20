// Sabotaje en «La calle» con el sofá: el mismo guion contra el código del ciclo 2 y contra 657fd30 (ciclo 1 corregido).
// Dos jugadores llevados por el piloto del juego (Autopilot con un PilotCrew compartido, sin PilotPlan: así se
// construye igual en las dos versiones) y, si hace falta, un tercer jugador saboteador movido por este script.
// Uso:
//   SRC=src npx vite-node scripts/audit/review-c2/fisica/calle-sabotaje.ts            (ciclo 2)
//   SRC=/tmp/claude-0/review-c2/fisica/base/mudanza-imposible/src npx vite-node ...    (657fd30)
// Opcional: ONLY=<nombre de escenario>.
import RAPIER from '@dimforge/rapier3d-compat';
import path from 'node:path';

const SRC = path.resolve(process.env.SRC ?? 'src');
const { Game } = await import(`${SRC}/sim/game`);
const { Autopilot, PilotCrew } = await import(`${SRC}/sim/autopilot`);
const { CENTER_Y } = await import(`${SRC}/sim/carrier`);
const { SLOTS, localToWorld, rotate } = await import(`${SRC}/sim/sofa`);
let level: unknown = undefined;
try { level = (await import(`${SRC}/levels/calle`)).CALLE; } catch { /* 657fd30: sin niveles */ }
const NEW = level !== undefined;
await RAPIER.init({});
const DT = 1 / 60;
const NO = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
type In = typeof NO;
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : String(n));

interface Ctx { g: any; t: number; sab: any | null; state: Record<string, any> }
interface Scenario {
  name: string;
  /** Número de porteadores (todos humanos): 2 pilotos y, con 3, un saboteador (el porteador 2). */
  n: 2 | 3;
  /** Mando del saboteador (o null: el piloto). `who`: porteador 1 (piloto saboteado) o 2 (saboteador aparte). */
  sab?: (c: Ctx, who: number) => In | null;
  setup?: (g: any) => void;
}

const sofaHeld = (g: any, c: any) => c.heldBody === g.sofa;
const toward = (from: any, to: { x: number; z: number }, k = 1) => {
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
  return { ...NO, mx: (dx / l) * k, mz: (dz / l) * k };
};

/** Saboteador que va a un sitio y se queda; `push`: empuja hacia `dir` sin parar al llegar. */
function stand(at: { x: number; z: number }, push?: { x: number; z: number }) {
  return (c: Ctx, who: number): In => {
    const me = c.g.carriers[who], d = Math.hypot(me.pos.x - at.x, me.pos.z - at.z);
    if (d > 0.25 && !c.state.arrived) return toward(me.pos, at);
    c.state.arrived = true;
    return push ? { ...NO, mx: push.x, mz: push.z } : NO;
  };
}

/** Piloto 1 suelta de golpe cuando se cumple `when` y no hace nada `idle` s; luego vuelve a ser piloto. */
function dropWhen(when: (g: any) => boolean, idle = 3) {
  return (c: Ctx, who: number): In | null => {
    const g = c.g, me = g.carriers[who];
    if (c.state.t0 === undefined) {
      if (!when(g) || !sofaHeld(g, me)) return null;
      c.state.t0 = g.time; c.state.p0 = { ...g.sofaPos };
      c.state.minY = g.sofaPos.y;
      return { ...NO, grab: true };
    }
    c.state.minY = Math.min(c.state.minY, g.sofaPos.y);
    if (g.time - c.state.t0 < idle) { if (sofaHeld(g, me)) return { ...NO, grab: true }; return NO; }
    if (c.state.pAfter === undefined) c.state.pAfter = { ...g.sofaPos };
    return null;
  };
}

/** El saboteador agarra el sofá por el asa libre más cercana cuando `when` y tira hacia `dir(g)` durante `dur` s. */
function tugWhen(when: (g: any) => boolean, dir: (g: any) => { x: number; z: number }, dur = 5) {
  return (c: Ctx, who: number): In => {
    const g = c.g, me = g.carriers[who];
    if (c.state.t0 === undefined) {
      if (!when(g)) return toward(me.pos, g.sofaPos, 0); // espera quieto
      c.state.t0 = g.time;
      // Asa más alejada de los pilotos (sin ocupar)
      let best = -1, bd = -Infinity;
      SLOTS.forEach((s: any, k: number) => {
        const a = localToWorld(g.sofa, s.p);
        const d = Math.min(...[0, 1].map((i) => Math.hypot(g.carriers[i].pos.x - a.x, g.carriers[i].pos.z - a.z)));
        if (d > bd) { bd = d; best = k; }
      });
      const s = SLOTS[best], a = localToWorld(g.sofa, s.p), out = rotate(g.sofa.rotation(), s.out);
      me.teleport({ x: a.x + out.x * 0.7, y: Math.max(0, g.sofaPos.y - 0.7) + CENTER_Y + 0.05, z: a.z + out.z * 0.7 });
      me.facing = { x: -out.x, z: -out.z };
      c.state.slot = best;
      return NO;
    }
    const el = g.time - c.state.t0;
    if (el < 0.1) return { ...NO, grab: !me.holding };
    if (el < 0.1 + dur) {
      if (!me.holding) { c.state.lost = c.state.lost ?? el; return NO; }
      const d = dir(g); return { ...NO, mx: d.x, mz: d.z };
    }
    if (me.holding) return { ...NO, grab: true };
    return NO;
  };
}

/** Embiste el sofá con el cuerpo, a la carrera, desde `side` (vector unitario hacia fuera), cada `every` s. */
function ramWhen(when: (g: any) => boolean, side: (g: any) => { x: number; z: number }, times = 4, every = 2) {
  return (c: Ctx, who: number): In => {
    const g = c.g, me = g.carriers[who];
    if (c.state.t0 === undefined) { if (!when(g)) return NO; c.state.t0 = g.time; c.state.k = 0; }
    const el = g.time - c.state.t0, k = Math.floor(el / every);
    if (k >= times) return NO;
    const ph = el - k * every;
    const s = side(g), sp = g.sofaPos;
    if (ph < 0.05) { me.teleport({ x: sp.x + s.x * 3.2, y: CENTER_Y + 0.05 + Math.max(0, sp.y - 0.7), z: sp.z + s.z * 3.2 }); return NO; }
    if (ph < 1.3) return toward(me.pos, sp);
    return toward(sp, me.pos);
  };
}

const SCEN: Scenario[] = [
  { name: 'base2', n: 2 },
  { name: 'base3-quieto', n: 3, sab: stand({ x: -6, z: 14 }) },
  // Suelta de golpe en la escalera (piloto 1), a media subida
  { name: 'suelta-escalera', n: 2, sab: dropWhen((g) => g.sofaPos.z < -24.5 && g.sofaPos.y > 1.0) },
  // Suelta de golpe en la rampa de chapa de la terraza (bajando)
  { name: 'suelta-rampa-terraza', n: 2, sab: dropWhen((g) => g.sofaPos.x > 16.5 && g.sofaPos.x < 20 && g.sofaPos.y > 0.8) },
  // Suelta de golpe en la rampa del camión (solo existe en el ciclo 2; en 657fd30, el mismo tramo es la zona de entrega)
  { name: 'suelta-rampa-camion', n: 2, sab: dropWhen((g) => g.sofaPos.x > 25 && g.sofaPos.x < 27.5 && g.sofaPos.y > 0.55) },
  // Tercer jugador tira en sentido contrario en el pasillo de arriba (5 s)
  { name: 'tira-contra-pasillo', n: 3, sab: tugWhen((g) => g.sofaPos.x > 3 && g.sofaPos.y > 2.4, () => ({ x: -1, z: 0 })) },
  // Tira en contra en el patio de salida (llano y ancho), justo al empezar a moverse
  { name: 'tira-contra-patio', n: 3, sab: tugWhen((g) => g.time > 3 && g.sofaPos.z < 8.5, () => ({ x: 0, z: 1 })) },
  // Tira hacia un lado en el patio
  { name: 'tira-lado-patio', n: 3, sab: tugWhen((g) => g.time > 3 && g.sofaPos.z < 8.5, () => ({ x: 1, z: 0 })) },
  // Embiste el sofá con el cuerpo 4 veces desde el costado en el patio de salida
  { name: 'embiste-patio', n: 3, sab: ramWhen((g) => g.time > 2.5 && g.sofaPos.z < 9, () => ({ x: 1, z: 0 })) },
  // Embiste 4 veces de frente en el pasillo de arriba
  { name: 'embiste-pasillo', n: 3, sab: ramWhen((g) => g.sofaPos.x > 3 && g.sofaPos.y > 2.4, () => ({ x: 1, z: 0 })) },
  // Se planta en la puerta (quieto) o empuja contra el sofá
  { name: 'planta-puerta-quieto', n: 3, sab: stand({ x: 0, z: -13.5 }) },
  { name: 'planta-puerta-empuja', n: 3, sab: stand({ x: 0, z: -13.9 }, { x: 0, z: 1 }) },
  // Se planta al pie de la escalera / en la escalera empujando hacia abajo
  { name: 'planta-escalera-empuja', n: 3, sab: stand({ x: 0, z: -25 }, { x: 0, z: 1 }) },
  // Se planta en la abertura del camión (ciclo 2) / en la zona de entrega (657fd30), quieto o empujando hacia fuera
  { name: 'planta-camion-quieto', n: 3, sab: stand({ x: NEW ? 28.4 : 25.5, z: -30.25 }) },
  { name: 'planta-camion-empuja', n: 3, sab: stand({ x: NEW ? 28.8 : 27.0, z: -30.25 }, { x: -1, z: 0 }) },
  // Espera dentro del camión (o en la zona) y, cuando llega el sofá, lo agarra y no lo suelta (sin mover el mando)
  {
    name: 'agarra-y-retiene', n: 3,
    sab: (c, who) => {
      const g = c.g, me = g.carriers[who];
      const at = { x: NEW ? 32.5 : 26.5, z: -31.6 };
      if (!c.state.armed) {
        if (Math.hypot(me.pos.x - at.x, me.pos.z - at.z) > 0.3 && !c.state.there) return toward(me.pos, at);
        c.state.there = true;
        const near = Math.hypot(g.sofaPos.x - me.pos.x, g.sofaPos.z - me.pos.z) < 1.9;
        if (!near) return NO;
        c.state.armed = true; c.state.ta = g.time;
      }
      if (!me.holding) { c.state.tries = (c.state.tries ?? 0) + 1; return { ...NO, grab: (c.state.tries % 2) === 0 }; }
      c.state.heldTime = (c.state.heldTime ?? 0) + DT;
      return NO;
    },
  },
];

function runScenario(sc: Scenario) {
  const opts: any = { humans: sc.n, carriers: sc.n, botStyle: 'atentos', seed: 1 };
  if (NEW) opts.level = level;
  const g = new Game(RAPIER, opts);
  const crew = new PilotCrew();
  const pilots = [new Autopilot(0, crew), new Autopilot(1, crew)];
  const ctx: Ctx = { g, t: 0, sab: null, state: {} };
  const counts: Record<string, number[]> = {};
  const add = (t: string, who: number) => { (counts[t] ??= [0, 0, 0])[who] = ((counts[t] ??= [0, 0, 0])[who] ?? 0) + 1; };
  let maxV = 0;
  for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    const inputs: In[] = [];
    for (let k = 0; k < sc.n; k++) {
      let v: In | null = null;
      if (sc.sab && ((sc.n === 3 && k === 2) || (sc.n === 2 && k === 1))) v = g.phase === 'playing' ? sc.sab(ctx, k) : NO;
      inputs.push(v ?? (k < 2 ? pilots[k].input(g, DT) : NO));
    }
    g.step(DT, inputs);
    for (const e of g.out) if ('carrier' in e && typeof (e as any).carrier === 'number') add(e.type, (e as any).carrier); else add(e.type, 0);
    const v = g.sofa.linvel(); maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
    if (process.env.TRACE && i % (60 * 5) === 0) {
      const sp = g.sofaPos;
      console.log(`  t=${f2(g.time)} sofá (${f2(sp.x)}, ${f2(sp.y)}, ${f2(sp.z)}) arriba ${f2(g.sofaUp)} wp ${crew.wp} agarran [${g.carriers.map((c: any) => (c.heldBody === g.sofa ? 'S' : '-') + (c.stunned > 0 ? '*' : '')).join('')}] pos ${g.carriers.map((c: any) => `(${f2(c.pos.x)},${f2(c.pos.z)})`).join(' ')} integ ${g.integrity} luz ${g.light?.ped}`);
    }
  }
  const ev = (t: string) => (counts[t] ?? [0, 0, 0]).slice(0, sc.n).join('/');
  const st = ctx.state;
  const extra = [
    st.t0 !== undefined ? `sabotaje a los ${f2(st.t0)} s` : 'sabotaje NO disparado',
    st.p0 && st.minY !== undefined ? `sofá baja ${f2(st.p0.y - st.minY)} m tras soltar` : '',
    st.p0 && st.pAfter ? `se desplaza ${f2(Math.hypot(st.pAfter.x - st.p0.x, st.pAfter.y - st.p0.y, st.pAfter.z - st.p0.z))} m en la pausa` : '',
    st.lost !== undefined ? `el saboteador pierde el agarre a los ${f2(st.lost)} s de tirar` : '',
    st.heldTime !== undefined ? `retiene ${f2(st.heldTime)} s` : '',
  ].filter(Boolean).join('; ');
  const line = `${sc.name}: ${g.phase} a ${f2(g.time)} s, integridad ${g.integrity}, etapa ${g.stage}; sueltas ${ev('gripBreak')}, tambaleos ${ev('wobble')}, caídas ${ev('fall')}, aturdidos ${ev('stun')}, golpes ${counts.impact ? counts.impact.reduce((a, b) => a + b, 0) : 0}, reapariciones ${counts.respawnItem?.[0] ?? counts.respawnSofa?.[0] ?? 0}; |v| máx del sofá ${f2(maxV)} m/s; ${extra}`;
  g.dispose();
  return line;
}

console.log(`Código: ${SRC} (${NEW ? 'ciclo 2' : '657fd30'})`);
if (process.env.BATCH) {
  // Variantes del tirón de lado y de la embestida en el patio de salida: inicio y duración distintos
  const res: Record<string, string[]> = { lado: [], embiste: [] };
  for (const t of [2.6, 3.0, 3.4, 3.8, 4.2]) for (const d of [2, 4, 6]) {
    res.lado.push(runScenario({ name: `lado t${t} d${d}`, n: 3, sab: tugWhen((g) => g.time > t && g.sofaPos.z < 8.5, () => ({ x: 1, z: 0 }), d) }));
    res.embiste.push(runScenario({ name: `embiste t${t} x${d}`, n: 3, sab: ramWhen((g) => g.time > t && g.sofaPos.z < 9, () => ({ x: 1, z: 0 }), d) }));
  }
  for (const [k, lines] of Object.entries(res)) {
    for (const l of lines) console.log(l);
    const won = lines.filter((l) => l.includes(': won')).length;
    const times = lines.filter((l) => l.includes(': won')).map((l) => Number(/won a ([\d.]+)/.exec(l)![1])).sort((a, b) => a - b);
    console.log(`RESUMEN ${k}: ganadas ${won}/${lines.length}; mediana de las ganadas ${times.length ? times[Math.floor(times.length / 2)] : '-'} s`);
  }
  process.exit(0);
}
for (const sc of SCEN.filter((s) => !process.env.ONLY || s.name.includes(process.env.ONLY))) console.log(runScenario(sc));
