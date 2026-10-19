// reutilizable-06: coste por fotograma del muñeco (DollView + CharacterRig reales) con 1, 2 y 4 jugadores.
// Mide, sin navegador ni GPU (document/canvas simulados solo para poder construir texturas):
//   - rayos de Rapier (world.castRay) y consultas intersectionsWithShape por muñeco y fotograma;
//   - objetos THREE.Vector3 / Quaternion / Euler creados por muñeco y fotograma (contados con un setter en el
//     prototipo: el constructor de Vector3 asigna Vector3.prototype.isVector3 y los de Quaternion/Euler this.isX);
//   - si `rig.debug` es un objeto nuevo en cada fotograma;
//   - tiempo de CPU de DollView.sync frente al de Game.step.
// Uso (desde mudanza-imposible): npx vite-node scripts/audit/verif-reutilizable/v06-coste-muneco.ts
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
await RAPIER.init();

// --- DOM mínimo (solo para crear texturas de canvas) ---
const fakeCtx = () => {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 20 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'getImageData' || k === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
const G = globalThis as any;
G.document ??= { createElement: () => { const ctx = fakeCtx(); return { width: 300, height: 150, style: {}, getContext: () => ctx, addEventListener() {} }; } };
G.window ??= { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener() {}, performance: globalThis.performance };

// --- Contadores de asignaciones ---
const alloc = { v3: 0, q: 0, e: 0 };
Object.defineProperty(THREE.Vector3.prototype, 'isVector3', { configurable: true, get: () => true, set: () => { alloc.v3++; } });
Object.defineProperty(THREE.Quaternion.prototype, 'isQuaternion', { configurable: true, get: () => true, set: () => { alloc.q++; } });
Object.defineProperty(THREE.Euler.prototype, 'isEuler', { configurable: true, get: () => true, set: () => { alloc.e++; } });
// comprobación del contador
{ const a = alloc.v3; new THREE.Vector3(); new THREE.Vector3().clone(); if (alloc.v3 - a !== 3) throw new Error('contador de Vector3 no funciona'); }

const { Game, RULES } = await import('../../../src/sim/game.ts');
const { DollView } = await import('../../../src/view/doll/dollView.ts');
const { NO_INPUT } = await import('../../../src/sim/types.ts');
const DT = 1 / 60;
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
camera.position.set(0, 14, 20); camera.lookAt(0, 0, 8); camera.updateMatrixWorld();

for (const n of [1, 2, 4]) {
  const g = new Game(RAPIER as any, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  const views = g.carriers.map((c: any, i: number) => new DollView(c, i, g.world, camera, g.sofaColliders));
  let counting = false, rays = 0, shapes = 0;
  const w = g.world as any, cr = w.castRay.bind(w), iws = w.intersectionsWithShape.bind(w);
  w.castRay = (...a: any[]) => { if (counting) rays++; return cr(...a); };
  w.intersectionsWithShape = (...a: any[]) => { if (counting) shapes++; return iws(...a); };
  for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); for (const v of views) v.sync(null, 0, DT); }
  // Calentamiento JIT
  const inputs = (f: number) => g.carriers.map((_: any, i: number) => ({ ...NO_INPUT, mx: Math.cos(f / 50 + i), mz: Math.sin(f / 50 + i) * 0.8 }));
  for (let f = 0; f < 120; f++) { g.step(DT, inputs(f)); for (const v of views) v.sync(null, f * DT, DT); }
  const F = 600;
  let tStep = 0, tSync = 0, newDebug = 0, perFrameRays: number[] = [];
  const a0 = { ...alloc }; rays = 0; shapes = 0;
  for (let f = 0; f < F; f++) {
    let t0 = performance.now();
    g.step(DT, inputs(f + 120));
    tStep += performance.now() - t0;
    const dbg = views.map((v: any) => v.rig.debug);
    const r0 = rays;
    counting = true; t0 = performance.now();
    for (const v of views) v.sync(null, (f + 120) * DT, DT);
    tSync += performance.now() - t0; counting = false;
    perFrameRays.push((rays - r0) / n);
    views.forEach((v: any, i: number) => { if (v.rig.debug !== dbg[i]) newDebug++; });
  }
  // Excluir del recuento de asignaciones las del paso de física (Game.step también crea vectores): medir aparte
  const syncAlloc = { v3: alloc.v3 - a0.v3, q: alloc.q - a0.q, e: alloc.e - a0.e };
  // Asignaciones solo del step, medidas en otra pasada
  const a1 = { ...alloc };
  for (let f = 0; f < F; f++) g.step(DT, inputs(f + 720));
  const stepAlloc = { v3: alloc.v3 - a1.v3, q: alloc.q - a1.q, e: alloc.e - a1.e };
  const per = (x: number) => (x / F / n).toFixed(1);
  const upright = g.carriers.filter((c: any) => !c.stunned).length;
  console.log(`J=${n} | rayos castRay por muñeco y fotograma: media ${per(rays)}, mín ${Math.min(...perFrameRays)}, máx ${Math.max(...perFrameRays)} | intersectionsWithShape: ${per(shapes)}`);
  console.log(`      Vector3/fot·muñeco (sync, sin step): ${((syncAlloc.v3 - stepAlloc.v3) / F / n).toFixed(1)}  Quaternion: ${((syncAlloc.q - stepAlloc.q) / F / n).toFixed(1)}  Euler: ${((syncAlloc.e - stepAlloc.e) / F / n).toFixed(1)}   (step solo: V3 ${(stepAlloc.v3 / F).toFixed(1)}/fot)`);
  console.log(`      rig.debug nuevo en ${(100 * newDebug / (F * n)).toFixed(0)} % de los fotogramas | CPU: sync de ${n} muñecos ${(tSync / F).toFixed(3)} ms/fot (${(tSync / F / n).toFixed(3)} por muñeco), Game.step ${(tStep / F).toFixed(3)} ms/fot | de pie al final: ${upright}/${n}`);
  g.dispose?.();
}
// Coste de un rayo aislado en el mundo del juego
{
  const g = new Game(RAPIER as any, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  const ray = new RAPIER.Ray({ x: 0, y: 1.2, z: 5 }, { x: 0, y: -1, z: 0 });
  const N = 200000; const t0 = performance.now();
  for (let i = 0; i < N; i++) { ray.origin = { x: (i % 40) * 0.3 - 6, y: 1.2, z: (i % 97) * 0.3 }; g.world.castRay(ray, 3.5, true, RAPIER.QueryFilterFlags.ONLY_FIXED); }
  const us = (performance.now() - t0) / N * 1000;
  console.log(`Un castRay ONLY_FIXED en el nivel: ${us.toFixed(2)} µs → 124 rayos (4 muñecos) ≈ ${(us * 124 / 1000).toFixed(3)} ms por fotograma`);
}
