// Revisión del ciclo 2 (director de juego y UX): partidas en Node con el mismo «cerebro» de persona simulada que
// jugar.cjs (8 direcciones de teclado, retraso de reacción, dudas y errores, novato al empezar y al acabar), en el
// árbol que diga ROOT (657fd30 o 5cab122). Sirve para separar regresiones de código de lo que pasa en el navegador.
// Uso: ROOT=<árbol> npx vite-node humano.ts <calle2|patio2|cuatro|cuatro-calle> <semilla0> <nSemillas> [novatoEspera] [sinNovato]
// Salida: una línea JSON por partida y un resumen.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { makeBrain } = require('./cerebro.cjs');

const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const { localToWorld, rotate } = await import(`${ROOT}/src/sim/sofa.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const LV = c2 ? await import(`${ROOT}/src/levels/index.ts`) : null;
const SLOTS = c2 ? null : (await import(`${ROOT}/src/sim/sofa.ts`)).SLOTS;
const DT = 1 / 60;
const scen = process.argv[2] ?? 'calle2';
const seed0 = +(process.argv[3] ?? 1), nSeeds = +(process.argv[4] ?? 5);
const novatoEspera = +(process.argv[5] ?? 8);
const sinNovato = process.argv[6] === '1';
const cfg: Record<string, { level: string; humans: number; max: number }> = {
  calle2: { level: 'calle', humans: 2, max: 180 }, patio2: { level: 'pruebas', humans: 2, max: 240 },
  cuatro: { level: 'pruebas', humans: 4, max: 240 }, 'cuatro-calle': { level: 'calle', humans: 4, max: 180 },
};
const C = cfg[scen];

function items(g: any) {
  const list = c2 ? g.items : [{ def: { id: 'sofa', handles: SLOTS, minCarriers: 2 }, body: g.sofa, state: g.phase === 'won' ? 'loaded' : 'pending', required: true }];
  return list.map((it: any) => {
    const t = it.body.translation();
    return {
      id: it.def.id, st: it.state, req: it.required, inHold: c2 ? it.inHold : false, minCarriers: it.def.minCarriers, x: t.x, z: t.z,
      handles: it.def.handles.map((h: any) => { const a = localToWorld(it.body, h.p), o = rotate(it.body.rotation(), h.out); return { x: a.x, z: a.z, ox: o.x, oz: o.z }; }),
    };
  });
}
function state(g: any) {
  const hum = g.carriers.filter((c: any) => c.human !== null).sort((a: any, b: any) => a.human - b.human);
  const its = c2 ? g.items : [{ body: g.sofa }];
  return { t: g.time, hum: hum.map((c: any) => ({ x: c.pos.x, z: c.pos.z, hold: c.holding, held: c.heldBody ? its.findIndex((it: any) => it.body === c.heldBody) : -1 })), items: items(g) };
}

const rows: any[] = [];
for (let seed = seed0; seed < seed0 + nSeeds; seed++) {
  const level = c2 ? LV!.levelFromParam(C.level) : undefined;
  if (!c2 && C.level !== 'calle') { console.log('el árbol base no tiene patio'); break; }
  const g = new Game(RAPIER, { ...(c2 ? { level } : {}), humans: C.humans, carriers: C.humans, botStyle: 'atentos', seed });
  const pilots = Autopilot.team(g);
  const brain = makeBrain({ n: C.humans, scen, seed: seed * 7919, novatoEspera, sinNovato });
  let dec: { keys: Set<string>; press: string | null }[] = [];
  let acc: any[] | null = null;
  const ev: Record<string, number> = {};
  let warnGrabAfterRelease = 0, waitedHolding = 0, holdingInsideNoWin = 0;
  for (let i = 0; i < 60 * (C.max + 4) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    // Intención del piloto en cada paso (sus relojes avanzan como siempre); decisiones cada 6 pasos (0,1 s)
    const intents = pilots.map((a: any) => a.input(g, DT));
    if (!acc) acc = intents.map((x: any) => ({ ...x }));
    else intents.forEach((x: any, k: number) => { acc[k].grab ||= x.grab; acc[k].right ||= x.right; acc[k].mx = x.mx; acc[k].mz = x.mz; acc[k].turn = x.turn; });
    if (i % 6 === 0) { if (g.phase === 'playing') dec = brain.tick(state(g), acc); acc = null; }
    // SIMPLE_X: desde que el sofá pasa de x = SIMPLE_X («La calle»), los dos dejan la intención del piloto y empujan
    // como una persona: en línea recta hacia el pie de la rampa del camión (23,4; −30,25) y luego hacia dentro (30,8;
    // −30,25); si el aviso de atasco saldría (stuckTime > 1,5 s), hacen lo que dice: tirar en sentidos opuestos 0,8 s.
    if (process.env.SIMPLE_X && c2 && i % 6 === 0 && g.phase === 'playing' && g.sofaPos.x > +process.env.SIMPLE_X && !brain.st.finalHold) {
      const sp = g.sofaPos, tgt = sp.x < 23.4 && Math.abs(sp.z + 30.25) > 0.5 ? { x: 23.4, z: -30.25 } : { x: 30.8, z: -30.25 };
      const dx = tgt.x - sp.x, dz = tgt.z - sp.z, dd = Math.hypot(dx, dz) || 1;
      (g as any).__opp = g.stuckTime > 1.5 ? 0.8 : Math.max(0, ((g as any).__opp ?? 0) - 0.1);
      const it0 = g.items[0];
      const hum = g.carriers.filter((c: any) => c.human !== null).sort((a: any, b: any) => a.human - b.human);
      dec = dec.map((d: any, k: number) => {
        if (!hum[k].holding) return d; // suelto: vuelve a por el sofá (con la intención del piloto) y lo agarra
        const keys = new Set<string>();
        // Lo que dice el HUD con el sofá volcado: «¡Volcado! Enderezadlo: J1 con R…»
        if (g.sofaUp < 0.55) return { keys, press: k === 0 ? 'fix' : null };
        if ((g as any).__opp > 0) { keys.add(k === 0 ? 'up' : 'down'); return { keys, press: null }; }
        const v = it0.body.linvel();
        if (it0.inHold && Math.hypot(v.x, v.z) < 0.3 && sp.x > 29) { brain.st.finalHold ??= { since: g.time }; return { keys, press: null }; }
        if (dx / dd > 0.38) keys.add('right'); if (dx / dd < -0.38) keys.add('left'); if (dz / dd > 0.38) keys.add('down'); if (dz / dd < -0.38) keys.add('up');
        return { keys, press: null };
      });
      (g as any).__simple = ((g as any).__simple ?? 0) + 0.1;
    }
    const inputs = dec.length ? dec.map((d, k) => {
      let mx = (d.keys.has('right') ? 1 : 0) - (d.keys.has('left') ? 1 : 0), mz = (d.keys.has('down') ? 1 : 0) - (d.keys.has('up') ? 1 : 0);
      const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
      const press = i % 6 === 0 ? d.press : null;
      return { mx, mz, grab: press === 'grab', right: press === 'fix', turn: d.keys.has('ccw') ? 1 : d.keys.has('cw') ? -1 : 0 };
    }) : pilots.map(() => ({ mx: 0, mz: 0, grab: false, right: false, turn: 0 }));
    g.step(DT, inputs);
    for (const e of g.out) ev[e.type] = (ev[e.type] ?? 0) + 1;
    if (process.env.TRAZA && i % 300 === 0 && g.phase === 'playing') { const sp = g.sofaPos; console.log(`  t=${g.time.toFixed(0)} etapa=${g.stageLabel} sofá=(${sp.x.toFixed(1)},${sp.y.toFixed(2)},${sp.z.toFixed(1)}) up=${g.sofaUp.toFixed(2)} atasco=${g.stuckTime.toFixed(1)} jug=${g.carriers.filter((c: any) => c.human !== null).map((c: any) => `(${c.pos.x.toFixed(1)},${c.pos.z.toFixed(1)}${c.holding ? ' agarra' : ''}${c.stunned > 0 ? ' mareo' : ''})`).join(' ')} teclas=${dec.map((d) => [...d.keys].join('+') + (d.press ? '!' + d.press : '')).join(' | ')}`); }
    if (brain.st.finalHold && !brain.st.releasedAt) waitedHolding += DT;
    if (c2 && brain.st.releasedAt && g.phase === 'playing' && !g.carriers.some((c: any) => c.human !== null && (c.holding || c.stunned > 0))) warnGrabAfterRelease += DT;
  }
  const r = {
    tree: c2 ? 'c2' : 'base', scen, seed, phase: g.phase, t: +g.time.toFixed(2), integ: Math.round(g.integrity),
    firstGrab: brain.pl.map((p: any) => (p.firstGrab === null ? null : +p.firstGrab.toFixed(1))),
    waitHolding: +waitedHolding.toFixed(1), releasedAt: brain.st.releasedAt ? +brain.st.releasedAt.toFixed(1) : null,
    simple: +(((g as any).__simple ?? 0)).toFixed(1),
    hintAgarrarTrasSoltar: +warnGrabAfterRelease.toFixed(2),
    loaded: c2 ? `${g.loadedRequired}/${g.requiredCount}` : undefined, stage: g.stageLabel,
    fall: ev.fall ?? 0, stun: ev.stun ?? 0, gripBreak: ev.gripBreak ?? 0, wobble: ev.wobble ?? 0, carHit: ev.carHit ?? 0, itemUnloaded: ev.itemUnloaded ?? 0, itemBroken: ev.itemBroken ?? 0,
  };
  console.log(JSON.stringify(r));
  rows.push(r);
  g.dispose();
}
const won = rows.filter((r) => r.phase === 'won');
const ts = won.map((r) => r.t).sort((a, b) => a - b);
console.log(`RESUMEN ${rows[0]?.tree} ${scen} novatoEspera=${novatoEspera}${sinNovato ? ' sinNovato' : ''}: ganadas ${won.length}/${rows.length}; mediana ${ts.length ? ts[Math.floor(ts.length / 2)] : '-'} s; caídas ${rows.reduce((a, r) => a + r.fall, 0)}; escapes ${rows.reduce((a, r) => a + r.gripBreak, 0)}`);
