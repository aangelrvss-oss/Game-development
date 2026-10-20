// ¿Gira la mesa que sujetan dos ayudantes (sin ningún humano) cuando un jugador con las manos vacías pulsa Q/E lejos?
// Revisión ciclo 2, IA. Uso: ROOT=$PWD npx vite-node giro-libre.ts
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { PATIO } = await import(`${ROOT}/src/levels/patio.ts`);
const { sofaYaw } = await import(`${ROOT}/src/sim/sofa.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const g = new Game(RAPIER, { level: PATIO, humans: 1, carriers: 3, botStyle: 'atentos', seed: 1 });
g.phase = 'playing'; g.countdown = 0;
const mesa = g.items[0];
for (let i = 0; i < 60 * 12; i++) g.step(1 / 60, [NO_INPUT]);
const holders = () => g.carriers.filter((c: any) => c.heldBody === mesa.body).map((c: any) => (c.human === null ? 'A' : 'J') + c.id).join(',');
const p0 = mesa.body.translation();
console.log(`t=${g.time.toFixed(1)} agarran la mesa: ${holders()} | J0 en (${g.carriers[0].pos.x.toFixed(1)},${g.carriers[0].pos.z.toFixed(1)}) sin nada; giro mesa ${sofaYaw(mesa.body).toFixed(2)} rad, pos (${p0.x.toFixed(2)},${p0.z.toFixed(2)})`);
for (let i = 0; i < 60 * 4; i++) g.step(1 / 60, [{ ...NO_INPUT, turn: 1 }]);
const p1 = mesa.body.translation();
console.log(`tras 4 s con J0 pulsando girar sin llevar nada: agarran ${holders()}; giro mesa ${sofaYaw(mesa.body).toFixed(2)} rad, pos (${p1.x.toFixed(2)},${p1.z.toFixed(2)}), integridad ${mesa.integrity}`);
