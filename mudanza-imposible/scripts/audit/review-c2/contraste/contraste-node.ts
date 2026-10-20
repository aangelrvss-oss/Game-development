// Árbitro de contraste, ciclo 2. Comprobaciones cortas e independientes en Node de los puntos disputados.
// Solo lee el código del juego. Uso (desde mudanza-imposible/):
//   ROOT=$PWD PARTE=lampara|retener|patio npx vite-node scripts/audit/review-c2/contraste/contraste-node.ts
// PARTE=patio admite H=4 C=4,5,6 SEEDS=1-6 STYLES=atentos
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { PATIO } = await import(`${ROOT}/src/levels/patio.ts`);
const { CALLE } = await import(`${ROOT}/src/levels/calle.ts`);
const { CENTER_Y, CARRIER } = await import(`${ROOT}/src/sim/carrier.ts`);
const { restHeight } = await import(`${ROOT}/src/sim/items.ts`);
const { localToWorld, rotate } = await import(`${ROOT}/src/sim/sofa.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);

const DT = 1 / 60, SY = CENTER_Y + 0.05;
const f2 = (n: number) => n.toFixed(2);
const inp = (o: any) => ({ ...NO_INPUT, ...o });
const PARTE = process.env.PARTE ?? 'lampara';

function mk(level: any, humans: number, carriers = humans, style = 'atentos', seed = 1) {
  const g = new Game(RAPIER, { level, humans, carriers, botStyle: style, seed });
  g.phase = 'playing'; g.countdown = 0;
  return g;
}
function face(g: any, it: any, i: number, h: number, d = 0.72) {
  const hd = it.def.handles[h], a = localToWorld(it.body, hd.p), out = rotate(it.body.rotation(), hd.out);
  const l = Math.hypot(out.x, out.z) || 1;
  const c = g.carriers[i];
  c.teleport({ x: a.x + (out.x / l) * d, y: SY + Math.max(0, it.body.translation().y - restHeight(it.def) - 0.01), z: a.z + (out.z / l) * d });
  c.facing = { x: -out.x / l, z: -out.z / l };
}
function steps(g: any, sec: number, f: (g: any) => any[], ev: any[] = []) {
  for (let i = 0; i < Math.round(sec * 60) && g.phase === 'playing'; i++) { g.step(DT, f(g)); ev.push(...g.out); }
  return ev;
}

if (PARTE === 'lampara') {
  console.log(`CARRIER.walkSpeed=${CARRIER.walkSpeed} carrySpeed=${CARRIER.carrySpeed}`);
  // 1) Un jugador sin carga anda contra la lámpara (de pie) a distintas fracciones del mando, desde 3 m al oeste.
  for (const m of [0.4, 0.6, 0.8, 1]) {
    const g = mk(PATIO, 1);
    const lamp = g.items.find((it: any) => it.def.id === 'lampara');
    const p = lamp.body.translation();
    g.carriers[0].teleport({ x: p.x - 3, y: SY, z: p.z }); g.carriers[0].facing = { x: 1, z: 0 };
    steps(g, 0.2, () => [NO_INPUT]);
    let vmax = 0; const ev: any[] = [];
    steps(g, 2.5, (gg) => { const v = gg.carriers[0].body.linvel(); vmax = Math.max(vmax, Math.hypot(v.x, v.z)); return [inp({ mx: m })]; }, ev);
    steps(g, 1.5, () => [NO_INPUT], ev);
    const imp = ev.filter((e) => e.type === 'impact' && e.item === lamp.index).map((e) => f2(e.strength));
    console.log(`andar contra la lámpara, mando ${m}: v máx jugador ${f2(vmax)} m/s → lámpara ${lamp.state}, integridad ${f2(lamp.integrity ?? NaN)}, fase ${g.phase}${g.loseReason ? ' (' + g.loseReason + ')' : ''}; golpes dv [${imp.join(', ')}]`);
    g.dispose();
  }
  // 2) Llevar la lámpara andando y soltarla: (a) parado y quieto; (b) en marcha.
  for (const modo of ['parado', 'en marcha']) {
    const g = mk(PATIO, 1);
    const lamp = g.items.find((it: any) => it.def.id === 'lampara');
    face(g, lamp, 0, 0);
    steps(g, 0.3, () => [NO_INPUT]);
    g.step(DT, [inp({ grab: true })]);
    steps(g, 0.6, () => [NO_INPUT]);
    const held = g.carriers[0].heldBody === lamp.body;
    const ev: any[] = [];
    const dir = { x: 0, z: -1 }; // hacia el norte del patio, campo libre
    steps(g, 2.0, () => [inp({ mx: dir.x, mz: dir.z })], ev);
    if (modo === 'parado') { steps(g, 1.0, () => [NO_INPUT], ev); g.step(DT, [inp({ grab: true })]); steps(g, 3, () => [NO_INPUT], ev); }
    else { g.step(DT, [inp({ mx: dir.x, mz: dir.z, grab: true })]); steps(g, 3, () => [inp({ mx: dir.x, mz: dir.z })], ev); }
    const imp = ev.filter((e) => e.type === 'impact' && e.item === lamp.index).map((e) => f2(e.strength));
    console.log(`llevar la lámpara (agarrada ${held}) y soltarla ${modo}: lámpara ${lamp.state}, integridad ${f2(lamp.integrity ?? NaN)}, fase ${g.phase}; golpes dv [${imp.join(', ')}]`);
    g.dispose();
  }
}

if (PARTE === 'retener') {
  // Patio: todos los obligatorios en su sitio del camión salvo una caja, que se pone también dentro y que agarra J1.
  for (const suelta of [false, true]) {
    const g = mk(PATIO, 2, 2);
    for (const it of g.items) {
      const r = g.level.items[it.index].route, last = r[r.length - 1];
      if (it.required) it.body.setTranslation({ x: last.x, y: 1.0 + restHeight(it.def) + 0.05, z: last.z }, true);
      else it.body.setTranslation({ x: -12 + it.index * 1.5, y: restHeight(it.def) + 0.01, z: -8 }, true);
    }
    g.carriers.forEach((c: any, i: number) => c.teleport({ x: -10, y: SY, z: -2 + i * 1.5 }));
    steps(g, 0.2, () => [NO_INPUT, NO_INPUT]);
    const caja = g.items.find((it: any) => it.def.id === 'caja');
    face(g, caja, 0, 0, 0.7);
    g.step(DT, [inp({ grab: true }), NO_INPUT]);
    const agarra = g.carriers[0].heldBody === caja.body;
    const ev: any[] = [];
    steps(g, 20, () => [NO_INPUT, NO_INPUT], ev);
    const tras20 = `fase ${g.phase}, cargados ${g.loadedRequired}/${g.requiredCount}, caja ${caja.state} (inHold ${caja.inHold})`;
    let gana = 'no';
    if (suelta) {
      g.step(DT, [inp({ grab: true }), NO_INPUT]);
      const t0 = g.time;
      steps(g, 5, () => [NO_INPUT, NO_INPUT], ev);
      gana = g.phase === 'won' ? `sí, ${f2(g.time - t0)} s después de soltar` : `no (${g.phase})`;
    }
    console.log(`retener caja dentro del camión (J1 agarra ${agarra}) 20 s sin tocar el mando: ${tras20}; ${suelta ? 'J1 suelta → gana: ' + gana : 'sin soltar'}`);
    g.dispose();
  }
}

if (PARTE === 'patio') {
  const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
  const range = (s: string) => s.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(s.split('-').map(Number)) : s.split(',').map(Number);
  const LV = process.env.NIVEL === 'calle' ? CALLE : PATIO;
  for (const style of (process.env.STYLES ?? 'atentos').split(',')) for (const h of range(process.env.H ?? '4')) for (const c of range(process.env.C ?? '4,5,6')) {
    if (c < h) continue;
    const res: string[] = [];
    for (const seed of range(process.env.SEEDS ?? '1-6')) {
      const g = new Game(RAPIER, { level: LV, humans: h, carriers: c, botStyle: style, seed });
      const aps = Autopilot.team(g);
      let broke = '';
      for (let i = 0; i < 60 * 250 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
        g.step(DT, aps.map((a: any) => a.input(g, DT)));
        for (const e of g.out) if (e.type === 'itemBroken') broke += `${e.id}@${f2(g.time)} `;
      }
      res.push(`s${seed}:${g.phase}${g.loseReason ? '/' + g.loseReason : ''}@${f2(g.time)}(${g.loadedRequired}/${g.requiredCount}${broke ? ' rotos ' + broke.trim() : ''})`);
      g.dispose();
    }
    console.log(`${LV.id ?? LV.name} ${h}h/${c}c ${style}: ${res.join(' ')}`);
  }
}
