// Revisión QA del ciclo 2: el guion de la parte A de duo-e2e (sin navegador, con entradas fijas por paso de física) en el
// árbol que diga ROOT, para comparar 657fd30 y 5cab122 paso a paso. Si las trazas coinciden, la diferencia de tasa de
// fallo de duo-e2e en el navegador no viene de la física sino del reloj (FPS y troceo de pasos por fotograma).
// Uso: ROOT=$PWD npx vite-node <ruta>/duo-traza.ts
import { existsSync } from 'node:fs';

const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const DT = 1 / 60;
type In = typeof NO_INPUT;
const inp = (o: Partial<In>): In => ({ ...NO_INPUT, ...o });

const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const lines: string[] = [];
const log = (tag: string) => {
  const s = g.sofaPos, c = g.carriers;
  lines.push(`${tag} t=${g.time.toFixed(3)} sofa=(${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)}) yaw=${g.sofaYaw.toFixed(4)} ` +
    c.map((k: { pos: { x: number; z: number }; holding: boolean; wobbles: number; falls: number }, i: number) => `J${i + 1}(${k.pos.x.toFixed(3)},${k.pos.z.toFixed(3)} h=${k.holding ? 1 : 0} w=${k.wobbles} f=${k.falls})`).join(' '));
};
const steps = (sec: number, f: () => In[]) => { for (let i = 0; i < Math.round(sec * 60); i++) g.step(DT, f()); };
steps(RULES.countdown + 0.2, () => [NO_INPUT, NO_INPUT]);
log('inicio');
g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
steps(0.8, () => [NO_INPUT, NO_INPUT]);
log('agarran');
for (let k = 0; k < 5; k++) { steps(0.5, () => [inp({ mz: -1 }), inp({ mz: -1 })]); log(`juntos+${(k + 1) * 0.5}`); }
g.step(DT, [NO_INPUT, inp({ grab: true })]);
steps(0.6, () => [NO_INPUT, NO_INPUT]);
log('J2 suelta');
for (let k = 0; k < 5; k++) { steps(0.5, () => [inp({ mz: 1 }), NO_INPUT]); log(`solo+${(k + 1) * 0.5}`); }
// Tirar de través: J1 hacia +z y J2 hacia −z durante 1,5 s (J2 vuelve a agarrar donde esté, si llega)
g.step(DT, [NO_INPUT, inp({ grab: true })]);
for (let k = 0; k < 3; k++) { steps(0.5, () => [inp({ mz: 1 }), inp({ mz: -1 })]); log(`través+${(k + 1) * 0.5}`); }
console.log(lines.join('\n'));
g.dispose();
