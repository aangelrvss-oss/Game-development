// Coherencia entre el dibujo y la física de los objetos y del camión (ciclo 2, T-view), sin navegador.
// - Cada objeto del catálogo se dibuja a partir de su `ItemDef` dentro de sus cajas de choque: nada de lo dibujado (sin
//   contar el contorno de dibujo animado) sale de ellas más de `DETAIL` (3 cm), y lo dibujado las llena (su caja
//   envolvente coincide con la de la forma a menos de 3 cm).
// - El camión (caja de carga abierta y rampa) se dibuja donde están sus colliders: cada pieza dibujada coincide con la
//   pieza de choque de `Game` a menos de 1 cm, esquina a esquina, en los dos niveles.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CALLE } from '../src/levels/calle';
import { PATIO } from '../src/levels/patio';
import { truckBoxes } from '../src/levels/truck';
import { Game } from '../src/sim/game';
import { ITEMS, shapeBounds, type ItemDef } from '../src/sim/items';
import { rotate } from '../src/sim/sofa';
import type { Vec3 } from '../src/sim/types';

// Las texturas y los rótulos se pintan en un lienzo: en Node basta con uno que no pinta nada
const gradient = () => ({ addColorStop() {} });
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? gradient : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { ItemView, DETAIL } = await import('../src/view/itemView');
const { SofaView } = await import('../src/view/sofaView');
const { buildLevel } = await import('../src/view/levelView');

beforeAll(async () => { await RAPIER.init(); });
/** Mediciones en la salida de Vitest (con el informe por defecto, `console.log` de una prueba que pasa no se ve). */
const report = (text: string) => (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`${text}\n`);

/** Vértices de lo dibujado (sin el contorno), en las coordenadas del objeto. */
function drawnPoints(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  const walk = (o: THREE.Object3D) => {
    if (o.userData.ink) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return pts;
}

/** Distancia de un punto a la forma del objeto (0 si está dentro de alguna de sus cajas). */
function outside(def: ItemDef, p: THREE.Vector3) {
  let best = Infinity;
  for (const b of def.shape) {
    const dx = Math.max(0, Math.abs(p.x - b.p.x) - b.h.x), dy = Math.max(0, Math.abs(p.y - b.p.y) - b.h.y), dz = Math.max(0, Math.abs(p.z - b.p.z) - b.h.z);
    best = Math.min(best, Math.hypot(dx, dy, dz));
  }
  return best;
}

describe('T-view: lo dibujado es lo que choca', () => {
  it('cada objeto del catálogo se dibuja dentro de sus cajas de choque (los detalles, a menos de 3 cm) y las llena', () => {
    for (const def of Object.values(ITEMS)) {
      const view = def.draw === 'sofa' ? new SofaView(def) : new ItemView(def);
      const pts = drawnPoints(view.group);
      expect(pts.length, def.id).toBeGreaterThan(100);
      let worst = 0, at = pts[0];
      for (const p of pts) { const d = outside(def, p); if (d > worst) { worst = d; at = p; } }
      expect(worst, `${def.id}: ${worst.toFixed(3)} m fuera en (${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)})`).toBeLessThanOrEqual(DETAIL + 1e-9);
      // Y la llena: la caja envolvente de lo dibujado es la de la forma (a menos de 3 cm por cada cara)
      const drawn = new THREE.Box3().setFromPoints(pts), { min, max } = shapeBounds(def);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(Math.abs(drawn.min[k] - min[k]), `${def.id} min ${k}`).toBeLessThanOrEqual(DETAIL);
        expect(Math.abs(drawn.max[k] - max[k]), `${def.id} max ${k}`).toBeLessThanOrEqual(DETAIL);
      }
    }
  });

  it('la caja de carga abierta y la rampa del camión se dibujan donde están sus colliders, a menos de 1 cm', () => {
    for (const level of [CALLE, PATIO]) {
      const view = buildLevel(level);
      const boxes = truckBoxes(level.truck);
      expect(view.truckParts.map((p) => p.kind), level.id).toEqual(boxes.map((b) => b.kind));
      // Esquinas de las piezas de choque fijas de la partida
      const g = new Game(RAPIER, { level, humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
      const fixed: Vec3[][] = [];
      g.world.forEachCollider((c) => {
        if (!c.parent()?.isFixed() || c.shape.type !== RAPIER.ShapeType.Cuboid) return;
        const h = (c.shape as RAPIER.Cuboid).halfExtents, t = c.translation(), q = c.rotation();
        const cs: Vec3[] = [];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          const r = rotate(q, { x: sx * h.x, y: sy * h.y, z: sz * h.z });
          cs.push({ x: t.x + r.x, y: t.y + r.y, z: t.z + r.z });
        }
        fixed.push(cs);
      });
      const far = (a: Vec3[], b: Vec3[]) => Math.max(...a.map((p) => Math.min(...b.map((q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)))));
      const errs = view.truckParts.map((part) => {
        // La pieza de choque que mejor casa con la dibujada: cada esquina dibujada, junto a una suya, y al revés
        let best = Infinity;
        for (const cs of fixed) best = Math.min(best, Math.max(far(part.corners, cs), far(cs, part.corners)));
        return best;
      });
      errs.forEach((e, i) => expect(e, `${level.id} ${view.truckParts[i].kind} ${i}: ${e.toFixed(4)} m`).toBeLessThan(0.01));
      report(`T-view, camión de «${level.name}»: ${errs.length} piezas, error máximo ${(Math.max(...errs) * 1000).toFixed(2)} mm`);
      g.dispose();
    }
  });
});
