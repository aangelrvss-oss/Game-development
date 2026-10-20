// Diagnóstico ciclo 2: en «La calle», ¿cuánto tiempo pasa el equipo de pilotos esperando a la entrada del carril del
// camión porque PilotPlan.mayEnter dice 'people'? ¿Y quién está en el carril (ayudantes sin agarrar, humanos)?
// Uso: ROOT=<árbol 23b8c66> CFG="4,6,atentos" SEEDS="1,...,8" npx vite-node espera-carril.ts
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { Autopilot } = await import(`${ROOT}/src/sim/autopilot.ts`);
const { CALLE } = await import(`${ROOT}/src/levels/calle.ts`);
const [H, C, style] = (process.env.CFG ?? '4,6,atentos').split(',');
for (const seed of (process.env.SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)) {
  const g = new Game(RAPIER, { level: CALLE, humans: +H, carriers: +C, botStyle: style, seed });
  const aps = Autopilot.team(g);
  let wait = 0, waitHeld = 0; const who = new Map<string, number>();
  for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(1 / 60, aps.map((a: any) => a.input(g, 1 / 60)));
    const cr = aps[0].crew;
    if (g.phase === 'playing' && cr?.gate && cr.gate(g) === 'people') {
      wait += 1 / 60;
      if (g.carriers.some((c: any) => c.heldBody === g.sofa && c.human !== null)) waitHeld += 1 / 60;
      // Quién no es del equipo ni agarra el sofá (los que mayEnter puede contar)
      for (const c of g.carriers) if (!cr.members.has(c.id) && c.heldBody !== g.sofa) {
        const k = c.human !== null ? 'humano-suelto' : 'ayudante-suelto'; who.set(k, (who.get(k) ?? 0) + 1 / 60);
      }
    }
  }
  console.log(`s${seed} ${g.phase} t=${g.time.toFixed(2)} espera 'people' ${wait.toFixed(2)} s (con humanos agarrando ${waitHeld.toFixed(2)} s); fuera del equipo y sin agarrar durante la espera: ${[...who].map(([k, v]) => `${k} ${v.toFixed(1)} s`).join(', ') || '-'}`);
  g.dispose();
}
