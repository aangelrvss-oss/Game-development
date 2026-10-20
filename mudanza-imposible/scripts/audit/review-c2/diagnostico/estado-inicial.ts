// Diagnóstico ciclo 2: estado inicial de una partida a dos (como duo-e2e) en el árbol ROOT: sofá, porteadores y
// todos los colliders fijos/dinámicos en el patio (|x|<9, 2<z<16). Uso: ROOT=<árbol> npx vite-node estado-inicial.ts
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const f = (v: number) => v.toFixed(3);
console.log('countdown', RULES.countdown, 'phase', g.phase, 'items', c2 ? g.items.length : 1);
const s = g.sofaPos; console.log('sofa', f(s.x), f(s.y), f(s.z), 'yaw', f(g.sofaYaw), 'mass', g.sofa.mass().toFixed(3));
g.carriers.forEach((c: any, i: number) => console.log('J' + (i + 1), f(c.pos.x), f(c.pos.y), f(c.pos.z)));
const rows: string[] = [];
g.world.forEachCollider((co: any) => {
  const t = co.translation(), b = co.parent();
  if (Math.abs(t.x) < 9.5 && t.z > 1 && t.z < 16 && t.y > -0.5) rows.push(`${b?.isFixed() ? 'F' : b?.isDynamic() ? 'D' : 'K'} shape${co.shape.type} (${f(t.x)},${f(t.y)},${f(t.z)}) sensor=${co.isSensor()} fric=${co.friction().toFixed(2)} groups=${co.collisionGroups()}`);
});
rows.sort(); console.log(rows.join('\n'));
for (let i = 0; i < Math.round((RULES.countdown + 0.2) * 60); i++) g.step(1 / 60, [NO_INPUT, NO_INPUT]);
const s2 = g.sofaPos; console.log('tras cuenta atrás t', f(g.time), 'phase', g.phase, 'sofa', f(s2.x), f(s2.y), f(s2.z), 'yaw', f(g.sofaYaw));
g.carriers.forEach((c: any, i: number) => console.log('J' + (i + 1), f(c.pos.x), f(c.pos.y), f(c.pos.z)));
