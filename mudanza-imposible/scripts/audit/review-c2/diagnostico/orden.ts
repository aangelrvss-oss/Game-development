// Diagnóstico ciclo 2: orden de creación (handles) de cuerpos y colliders dinámicos y su configuración, en el árbol ROOT.
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
let nb = 0, nc = 0;
g.world.forEachRigidBody((b: any) => { nb++; if (!b.isFixed()) { const t = b.translation(); console.log(`cuerpo h=${b.handle} tipo=${b.bodyType()} (${t.x.toFixed(2)},${t.z.toFixed(2)}) masa=${b.mass().toFixed(4)} ccd=${b.isCcdEnabled()} damp=${b.linearDamping()}/${b.angularDamping()} dom=${b.dominanceGroup()} ncol=${b.numColliders()}`); } });
g.world.forEachCollider((c: any) => { nc++; const b = c.parent(); if (b && !b.isFixed()) console.log(`  collider h=${c.handle} de cuerpo ${b.handle} shape=${c.shape.type} fric=${c.friction()} rest=${c.restitution()} dens=${c.density().toFixed(4)} grupos=${c.collisionGroups()}/${c.solverGroups()} ev=${c.activeEvents()} hooks=${c.activeHooks()} combF=${c.frictionCombineRule()} ctf=${c.contactForceEventThreshold?.()}`); });
console.log('cuerpos', nb, 'colliders', nc);
const ip = g.world.integrationParameters; console.log('params', ip.dt, ip.numSolverIterations, ip.numAdditionalFrictionIterations ?? '', ip.numInternalPgsIterations ?? '', ip.contact_natural_frequency ?? '');
