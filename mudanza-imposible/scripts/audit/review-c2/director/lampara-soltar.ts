// ¿Qué pasa si un jugador agarra la lámpara de pie (obligatoria, frágil) y la suelta (pulsando otra vez agarrar), parado
// o andando? Uso: ROOT=<árbol> npx vite-node lampara-soltar.ts
const RAPIER = (await import('@dimforge/rapier3d-compat')).default; await RAPIER.init({});
const ROOT = process.env.ROOT!;
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { PATIO } = await import(`${ROOT}/src/levels/patio.ts`);
const { sofaUp } = await import(`${ROOT}/src/sim/sofa.ts`);
const NO = { mx: 0, mz: 0, grab: false, right: false, turn: 0 };
const lamp = PATIO.items.findIndex((p: any) => p.id === 'lampara');
const lp = PATIO.items[lamp].pos;
for (const [name, walk, holdFor] of [['agarrar, esperar 1 s parado y soltar', 0, 1], ['agarrar, andar 1,5 s y soltar andando', 1, 1.5], ['agarrar, andar 1,5 s, parar 1 s y soltar', 2, 1.5]] as const) {
  // Al oeste de la lámpara, de cara a ella (su asa mira al oeste)
  const g = new Game(RAPIER, { level: { ...PATIO, spawns: [{ x: lp.x - 0.75, z: lp.z, facing: { x: 1, z: 0 } }, ...PATIO.spawns] }, humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  let t0 = -1, rel = -1, held = false; const evs: string[] = [];
  for (let i = 0; i < 60 * 9 && g.phase !== 'lost'; i++) {
    let inp = { ...NO };
    if (g.phase === 'playing') {
      const me = g.carriers[0];
      if (!held && !me.holding && i % 10 === 0) inp.grab = true;
      if (me.holding && !held) { held = true; t0 = g.time; }
      if (held && rel < 0) {
        const dt = g.time - t0;
        if (walk && dt < holdFor) inp.mz = -1;
        const releaseAt = walk === 2 ? holdFor + 1 : holdFor;
        if (dt >= releaseAt) { inp.grab = true; rel = g.time; }
      }
    }
    g.step(1 / 60, [inp]);
    for (const e of g.out) if (['grab', 'release', 'itemBroken', 'impact', 'lose'].includes(e.type)) evs.push(`${g.time.toFixed(2)} ${e.type}${e.strength ? ' dv=' + e.strength.toFixed(2) : ''}`);
  }
  const it = g.items[lamp];
  console.log(`${name}: fase=${g.phase} lámpara=${it.state} integridad=${Math.round(it.integrity)} de pie=${sofaUp(it.body).toFixed(2)} | ${evs.join(', ')}`);
  g.dispose();
}
