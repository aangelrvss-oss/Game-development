// Diagnóstico ciclo 2: todos los colliders fijos con precisión completa (posición, rotación, medias medidas, rozamiento),
// en orden de creación, para comparar versiones. Uso: ROOT=<árbol> npx vite-node fijos.ts
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
g.world.forEachCollider((c: any) => {
  const b = c.parent(); if (!b?.isFixed()) return;
  const t = c.translation(), q = c.rotation(), sh = c.shape;
  const he = sh.halfExtents ? [sh.halfExtents.x, sh.halfExtents.y, sh.halfExtents.z] : [];
  console.log(JSON.stringify({ t: [t.x, t.y, t.z], q: [q.x, q.y, q.z, q.w], he, f: c.friction(), fr: c.frictionCombineRule(), r: c.restitution(), type: sh.type }));
});
