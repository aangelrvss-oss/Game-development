// Revisor (rendimiento/contenido): resultado del «Patio de pruebas» con ayudantes, por número de humanos (piloto),
// porteadores, estilo y semilla. Una línea JSON por partida. Uso (cwd = árbol): npx vite-node <ruta>/matriz-patio.ts
import RAPIER from '@dimforge/rapier3d-compat';
const root = process.cwd();
const { PATIO } = await import(root + '/src/levels/patio.ts');
const { Game } = await import(root + '/src/sim/game.ts');
const { Autopilot } = await import(root + '/src/sim/autopilot.ts');
await RAPIER.init({});
const cfgs: [number, number][] = [[1, 2], [1, 4], [1, 6], [2, 2], [2, 4], [2, 6], [3, 3], [3, 6], [4, 4], [4, 6]];
for (const style of ['atentos', 'despistados'] as const) for (const [h, c] of cfgs) for (const seed of [1, 2, 3]) {
  if (h === c && style === 'despistados') continue; // sin ayudantes el estilo no cuenta
  const g = new Game(RAPIER, { level: PATIO, humans: h, carriers: c, botStyle: style, seed });
  const aps = h === 1 ? [Autopilot.team(g)[0]] : Autopilot.team(g); // como la demo de main.ts con varios objetos
  let falls = 0; const loaded: string[] = [];
  for (let i = 0; i < 60 * 250 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(1 / 60, aps.map((a: { input: (g: unknown, dt: number) => unknown }) => a.input(g, 1 / 60)));
    for (const e of g.out as { type: string; id?: string }[]) { if (e.type === 'fall') falls++; if (e.type === 'itemLoaded') loaded.push(e.id!); }
  }
  console.log(JSON.stringify({ style, h, c, seed, fase: g.phase, motivo: g.loseReason ?? null, t: +g.time.toFixed(2), caidas: falls,
    rotos: g.items.filter((it: { state: string }) => it.state === 'broken').map((it: { def: { id: string } }) => it.def.id), cargados: loaded.length }));
  g.dispose();
}
