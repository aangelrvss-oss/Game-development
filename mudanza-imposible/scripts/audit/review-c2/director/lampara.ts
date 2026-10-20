// ¿Se rompe la lámpara de pie (obligatoria en el patio) si un jugador choca con ella andando, sin agarrarla?
// Uso: ROOT=<árbol> npx vite-node lampara.ts
const RAPIER = (await import('@dimforge/rapier3d-compat')).default; await RAPIER.init({});
const ROOT = process.env.ROOT!;
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { PATIO } = await import(`${ROOT}/src/levels/patio.ts`);
const NO = { mx: 0, mz: 0, grab: false, right: false, turn: 0 };
for (const [name, dir] of [['de frente (D)', [1, 0]], ['en diagonal (D+S)', [Math.SQRT1_2, Math.SQRT1_2]], ['rozando (D, 0,4 m al lado)', [1, 0]]] as const) {
  const lamp = PATIO.items.findIndex((p: any) => p.id === 'lampara');
  const lp = PATIO.items[lamp].pos;
  // Un jugador que sale 4 m al oeste de la lámpara (en diagonal: al noroeste) y anda hacia ella sin agarrar nada
  const off = name.startsWith('rozando') ? 0.4 : 0;
  const sp = dir[1] ? { x: lp.x - 3, z: lp.z - 3, facing: { x: 1, z: 1 } } : { x: lp.x - 4, z: lp.z + off, facing: { x: 1, z: 0 } };
  const g = new Game(RAPIER, { level: { ...PATIO, spawns: [sp, ...PATIO.spawns] }, humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  const evs: string[] = [];
  let maxTilt = 0;
  for (let i = 0; i < 60 * 8 && g.phase !== 'lost'; i++) {
    const walking = g.phase === 'playing' && g.time < 3;
    g.step(1 / 60, [walking ? { ...NO, mx: dir[0], mz: dir[1] } : NO]);
    const it = g.items[lamp];
    const up = (await import(`${ROOT}/src/sim/sofa.ts`)).sofaUp(it.body);
    maxTilt = Math.max(maxTilt, Math.acos(Math.max(-1, Math.min(1, up))) * 180 / Math.PI);
    for (const e of g.out) if (['impact', 'itemBroken', 'lose'].includes(e.type) && (e.item === lamp || e.type === 'lose')) evs.push(`${g.time.toFixed(2)} ${e.type}${e.strength ? ' dv=' + e.strength.toFixed(2) : ''}`);
  }
  const it = g.items[lamp];
  console.log(`${name}: fase=${g.phase} lámpara=${it.state} integridad=${Math.round(it.integrity)} inclinación máx=${maxTilt.toFixed(0)}° sucesos: ${evs.join(', ') || 'ninguno'}`);
  g.dispose();
}
