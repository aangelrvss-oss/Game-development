// Revisión QA del ciclo 2: ¿qué giro tiene el sofá cuando duo-e2e elige las teclas del paso 4c («tirar en sentidos
// opuestos»)? duo-e2e elige KeyA+ArrowRight si |sen(giro)| > |cos(giro)| (giro > π/4 ≈ 0,785) y KeyS+ArrowUp si no.
// Se barre lo que dura «uno solo» (J1 con S) y la espera tras soltar J2, con el guion de duo-traza.ts.
// Uso: ROOT=$PWD npx vite-node <ruta>/duo-filo.ts
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const DT = 1 / 60;
const inp = (o: object) => ({ ...NO_INPUT, ...o });
const out: string[] = [];
for (const wait of [0.6, 0.7, 0.8, 0.9]) {
  const row: string[] = [];
  for (const solo of [2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0]) {
    const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    const steps = (sec: number, f: () => unknown[]) => { for (let i = 0; i < Math.round(sec * 60); i++) g.step(DT, f()); };
    steps(RULES.countdown + 0.2, () => [NO_INPUT, NO_INPUT]);
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    steps(0.8, () => [NO_INPUT, NO_INPUT]);
    steps(2.5, () => [inp({ mz: -1 }), inp({ mz: -1 })]);
    g.step(DT, [NO_INPUT, inp({ grab: true })]);
    steps(wait, () => [NO_INPUT, NO_INPUT]);
    steps(solo, () => [inp({ mz: 1 }), NO_INPUT]);
    steps(1.0, () => [NO_INPUT, NO_INPUT]);
    const y = g.sofaYaw;
    row.push(`${y.toFixed(3)}${Math.abs(Math.sin(y)) > Math.abs(Math.cos(y)) ? 'A' : 'S'}`);
    g.dispose();
  }
  out.push(`espera ${wait} s | solo 2,4…3,0 s: ${row.join(' ')}`);
}
console.log(out.join('\n'));
