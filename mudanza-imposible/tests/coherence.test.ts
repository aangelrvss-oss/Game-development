// Coherencia entre el dibujo y la física (ciclo 1, objetivos T-coh-1 y T-coh-2), sin navegador.
// - T-coh-1: el muñeco de cada jugador tiene las medidas de su cápsula física, y nada de su tronco ni de su cabeza
//   dibujados se mete más de 3 cm en el sofá, en las paredes, en otros porteadores ni en el suelo: empujando el sofá,
//   llevándolo, tambaleándose hacia él, contra una pared y tumbado. Ya no hay desplazamiento del dibujo que lo esconda.
// - T-coh-2: al caer, el collider se tumba de verdad hacia un sitio libre (6 direcciones junto al sofá, junto a una
//   pared y junto a otro porteador), no se solapa más de 3 cm con nada, el muñeco se dibuja con su pose y el porteador
//   se levanta; si no hay sitio para levantarse, espera y se aparta.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CARRIER, CENTER_Y, DOLL_HEIGHT, DOLL_MODEL, DOLL_SCALE, type Carrier } from '../src/sim/carrier';
import { CALLE } from '../src/levels/calle';
import { Game } from '../src/sim/game';
import { SOFA, yawQuat } from '../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../src/sim/types';

// El muñeco pinta su sombra y su etiqueta en un lienzo: en Node basta con un lienzo que no pinta nada
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { CharacterRig, DIM, LEG } = await import('../src/view/doll/dollRig');
const { DollView } = await import('../src/view/doll/dollView');
const { CarrierView, helperBodyMeshes } = await import('../src/view/carrierView');

const DT = 1 / 60;
const TOL = 0.03; // el margen de la prueba de penetración
/** Descampado sin nada alrededor (el mismo de `sim.test.ts`) y patio de salida, junto a la pared de la casa (z = 17). */
const OPEN = { x: -35, z: 25 };
const PATIO = { x: -4, z: 10 };
const standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
type V2 = { x: number; z: number };

beforeAll(async () => { await RAPIER.init(); });

/** Mallas del tronco y la cabeza (con la gorra) del muñeco: sin brazos, manos, piernas ni botas. */
function bodyMeshes(rig: object): THREE.Mesh[] {
  const torso = (rig as { torso: THREE.Object3D }).torso, out: THREE.Mesh[] = [];
  torso.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
}

/** Vértices (en el mundo) del tronco y la cabeza dibujados, uno de cada `every`. */
function bodyPoints(rig: object, root: THREE.Object3D, every = 2): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  for (const m of bodyMeshes(rig)) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += every) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  }
  return pts;
}

/** Cuánto se mete (m) el tronco o la cabeza dibujados en cualquier collider que no sea el suyo (sofá, paredes, suelo, otros). */
function drawnDepth(g: Game, c: Carrier, view: InstanceType<typeof DollView>, every = 3): number {
  const pts = bodyPoints((view as unknown as { rig: object }).rig, view.group, every);
  const near: RAPIER.Collider[] = [];
  const k = c.collider.translation();
  g.world.intersectionsWithShape(k, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(DOLL_HEIGHT), (o) => { near.push(o); return true; }, undefined, undefined, c.collider);
  let worst = 0;
  for (const col of near) for (const p of pts) {
    const pr = col.projectPoint(p, false);
    if (pr?.isInside) worst = Math.max(worst, Math.hypot(pr.point.x - p.x, pr.point.y - p.y, pr.point.z - p.z));
  }
  return worst;
}

/** Cuánto se solapa (m) el collider del porteador con cualquier otro (sofá, paredes, suelo, otros porteadores). */
function overlap(g: Game, c: Carrier): number {
  let worst = 0;
  g.world.intersectionsWithShape(c.collider.translation(), c.collider.rotation(), c.collider.shape, (o) => {
    const k = c.collider.contactCollider(o, 0);
    if (k && k.distance < 0) worst = Math.max(worst, -k.distance);
    return true;
  }, undefined, undefined, c.collider);
  return worst;
}

/** Eje de la cápsula en el mundo (de los pies a la cabeza). */
function axis(c: Carrier) {
  const q = c.collider.rotation();
  return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
}

/**
 * Partida en juego con n humanos, el sofá en reposo en `at` y los porteadores apartados. Quien se aleja más de 22 m
 * del sofá vuelve junto a él (`Game`): las pruebas junto a la pared de la casa ponen el sofá en el patio.
 */
function setup(n: number, at = OPEN) {
  const g = new Game(RAPIER, { level: CALLE, humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing';
  g.countdown = 0;
  g.sofa.setTranslation({ x: at.x, y: 0.25, z: at.z }, true);
  g.sofa.setRotation(yawQuat(0), true);
  g.carriers.forEach((c, i) => c.teleport({ x: at.x + 5 + i * 1.5, y: standY, z: at.z + 3 }));
  for (let i = 0; i < 30; i++) g.step(DT, []);
  return g;
}

/** Pone al porteador junto a un punto de la superficie, `gap` m fuera de él en la dirección `out`, mirando hacia él. */
function besides(c: Carrier, at: { x: number; z: number }, out: V2, gap: number) {
  c.teleport({ x: at.x + out.x * (CARRIER.radius + gap), y: standY, z: at.z + out.z * (CARRIER.radius + gap) });
  c.facing = { x: -out.x, z: -out.z };
}

const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
const views = (g: Game) => g.carriers.map((c) => new DollView(c, c.human ?? 0, g.world, camera));

/** Piezas del muñeco que se colocan cada fotograma (privadas de `CharacterRig`). */
type RigParts = {
  group: THREE.Object3D; root: THREE.Object3D; torso: THREE.Object3D;
  legs: { geometry: THREE.BufferGeometry }[]; arms: { geometry: THREE.BufferGeometry }[];
  boots: THREE.Object3D[]; hands: THREE.Object3D[]; sleeves: THREE.Object3D[];
};
const parts = (v: InstanceType<typeof DollView>) => (v as unknown as { rig: RigParts }).rig;

/** Extremos (en el mundo) del eje de un miembro de manguera: los centros de sus dos tapas (los dos últimos vértices). */
function tubeEnds(group: THREE.Object3D, tube: { geometry: THREE.BufferGeometry }): [THREE.Vector3, THREE.Vector3] {
  const mesh = group.children.find((o) => (o as THREE.Mesh).geometry === tube.geometry)!;
  const pos = tube.geometry.attributes.position, n = pos.count;
  return [new THREE.Vector3().fromBufferAttribute(pos, n - 2).applyMatrix4(mesh.matrixWorld), new THREE.Vector3().fromBufferAttribute(pos, n - 1).applyMatrix4(mesh.matrixWorld)];
}

/**
 * Cuánto se separan (m, en el mundo) los miembros dibujados de donde nacen en el cuerpo: cada pierna de su cadera y
 * de su bota, cada brazo de su hombro, la manga de su hombro y la manopla del final del brazo (las dos van un poco
 * desplazadas a lo largo del miembro: 0,035 y 0,06 del modelo). En el suelo (`down`), además, los miembros sueltos
 * no pasan de su largo (de pie, el brazo de goma sí se estira hasta el asa).
 */
function limbGap(v: InstanceType<typeof DollView>, down: Carrier['down']): number {
  const r = parts(v), S = DOLL_SCALE;
  r.group.updateMatrixWorld(true);
  const at = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z));
  const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  let worst = 0;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    const hip = at(r.torso, s * DIM.hipX, DIM.hipY - 0.03, 0), shoulder = at(r.torso, s * DIM.shoulderX, DIM.shoulderY, 0);
    const ankle = at(r.boots[i], 0, DIM.ankleH, 0.02);
    const [l0, l1] = tubeEnds(r.group, r.legs[i]), [a0, a1] = tubeEnds(r.group, r.arms[i]);
    worst = Math.max(worst, l0.distanceTo(hip), l1.distanceTo(ankle), a0.distanceTo(shoulder));
    worst = Math.max(worst, Math.abs(pos(r.sleeves[i]).distanceTo(shoulder) - 0.035 * S), Math.abs(pos(r.hands[i]).distanceTo(a1) - 0.06 * S));
    // En el suelo, tobillos y manos son partículas atadas a la cadera y al hombro (`stepLimbs`): nunca más lejos que eso.
    // Al levantarse, la mano se apoya en el suelo mientras el hombro sube y el brazo de goma se estira: ahí solo el pie.
    if (down) worst = Math.max(worst, ankle.distanceTo(hip) - (LEG + DIM.ankleH + 0.06) * S);
    if (down && down !== 'rising') worst = Math.max(worst, a1.distanceTo(shoulder) - (DIM.upperArm + DIM.foreArm + 0.08) * S);
  }
  return worst;
}

/**
 * Cuánto se aparta (m) el eje del muñeco dibujado del de su cápsula: los pies del muñeco (`root`, de donde se
 * inclina) en el extremo de abajo del eje del collider, de pie o tumbado. Un desplazamiento del dibujo lo delata.
 */
function axisOffset(c: Carrier, v: InstanceType<typeof DollView>): number {
  const r = parts(v);
  r.group.updateMatrixWorld(true);
  const k = c.collider.translation(), feet = new THREE.Vector3(k.x, k.y, k.z).addScaledVector(axis(c), -CENTER_Y);
  return r.root.getWorldPosition(new THREE.Vector3()).distanceTo(feet);
}

describe('T-coh-1: lo dibujado es el cuerpo físico', () => {
  it('el muñeco tiene las medidas de su cápsula: tronco del radio de la cápsula, misma altura y nada fuera más de 3 cm', () => {
    const rig = new CharacterRig();
    rig.group.updateMatrixWorld(true);
    const torso = (rig as unknown as { torso: THREE.Object3D }).torso;
    const r = CARRIER.radius, hh = CARRIER.halfHeight;
    let trunk = 0, top = 0, out = 0;
    const v = new THREE.Vector3();
    for (const m of bodyMeshes(rig)) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); // unidades del modelo, de pie en el origen
        top = Math.max(top, v.y);
        if (m.parent === torso && m.geometry.type === 'LatheGeometry') trunk = Math.max(trunk, Math.hypot(v.x, v.z));
        // Dibujado (a escala) frente a la cápsula de pie: distancia al segmento de su eje, menos su radio
        const w = v.clone().multiplyScalar(DOLL_SCALE), y = Math.max(r, Math.min(r + 2 * hh, w.y));
        out = Math.max(out, Math.hypot(w.x, w.y - y, w.z) - r);
      }
    }
    // Las medidas del modelo son las que usa la física
    expect(trunk).toBeCloseTo(DOLL_MODEL.trunkRadius, 3);
    expect(top).toBeCloseTo(DOLL_MODEL.height, 2);
    // Dibujado: el tronco tiene el radio de la cápsula y el muñeco su altura (el centro, a media altura)
    expect(trunk * DOLL_SCALE).toBeCloseTo(r, 3);
    expect(top * DOLL_SCALE).toBeCloseTo(2 * (hh + r), 2);
    expect(2 * CENTER_Y).toBeCloseTo(DOLL_HEIGHT, 6);
    // Nariz, tirantes, botones y visera sobresalen, pero menos que el margen de las pruebas
    expect(out).toBeLessThan(TOL);
  });

  it('el tronco y la cabeza dibujados no se meten más de 3 cm en nada: empujando el sofá, llevándolo, tambaleándose hacia él y junto a una pared', () => {
    const cases: [string, (g: Game) => void, (g: Game, i: number) => PlayerInput[], ((g: Game) => void)?][] = [
      // Empuja con el cuerpo el lateral del sofá (el del asiento, +z), sin agarrarlo
      ['empuja el sofá', (g) => besides(g.carriers[0], { x: OPEN.x, z: OPEN.z + SOFA.half.z }, { x: 0, z: 1 }, 0.3), () => [inp({ mz: -1 }), NO_INPUT]],
      // Los dos agarran los extremos, lo levantan y lo giran tirando en sentidos opuestos
      ['llevan el sofá y lo giran', (g) => {
        besides(g.carriers[0], { x: OPEN.x + SOFA.half.x, z: OPEN.z }, { x: 1, z: 0 }, 0.35);
        besides(g.carriers[1], { x: OPEN.x - SOFA.half.x, z: OPEN.z }, { x: -1, z: 0 }, 0.35);
      }, (_g, i) => (i === 0 ? [inp({ grab: true }), inp({ grab: true })] : i < 40 ? [NO_INPUT, NO_INPUT] : [inp({ mz: -1 }), inp({ mz: 1 })])],
      // Junto al respaldo, tambaleándose hacia el sofá con un desequilibrio de 0,7 rad (el dibujo se inclinaría 0,7 rad)
      ['se tambalea hacia el sofá', (g) => besides(g.carriers[0], { x: OPEN.x, z: OPEN.z - SOFA.half.z }, { x: 0, z: -1 }, 0.02), () => [NO_INPUT, NO_INPUT],
        (g) => { g.carriers[0].lean = { x: 0, z: 0.7 }; g.carriers[0].wobbling = true; }],
      // Contra la pared de la casa del patio (z = 17), andando hacia ella (en x = 0 no hay objetos de decoración)
      ['anda contra una pared', (g) => besides(g.carriers[0], { x: 0, z: 17 }, { x: 0, z: -1 }, 0.3), () => [inp({ mz: 1 }), NO_INPUT]],
      // A lo largo de la pared, arrimado a ella: el balanceo de la pelvis ladea el cuerpo hacia la pared a cada paso
      ['anda pegado a una pared', (g) => besides(g.carriers[0], { x: -2.5, z: 17 }, { x: 0, z: -1 }, 0.02), () => [inp({ mx: 0.35, mz: 0.15 }), NO_INPUT]],
    ];
    for (const [name, place, input, pose] of cases) {
      const g = setup(2, name.includes('pared') ? PATIO : OPEN);
      const vs = views(g);
      place(g);
      for (let i = 0; i < 10; i++) g.step(DT, []);
      let worst = 0, off = 0;
      for (let i = 0; i < 150; i++) {
        g.step(DT, input(g, i));
        for (const [k, v] of vs.entries()) {
          const c = g.carriers[k], keep = { lean: c.lean, wob: c.wobbling };
          if (pose && k === 0) pose(g); // solo para el dibujo: se restaura antes del paso siguiente
          const gw = c.grabWorld();
          v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, i * DT, DT);
          c.lean = keep.lean; c.wobbling = keep.wob;
          if (i % 2 === 0) worst = Math.max(worst, drawnDepth(g, c, v));
          // Sin trampa: alejar el dibujo de lo que toca también lo sacaría de dentro, pero el muñeco va con su cápsula
          off = Math.max(off, axisOffset(c, v));
        }
      }
      expect(worst, name).toBeLessThan(TOL);
      expect(off, `${name}: el muñeco se aparta de su cápsula`).toBeLessThan(0.01);
      g.dispose();
    }
  });

  it('lejos del origen, piernas, brazos, mangas y manos salen del cuerpo y el muñeco va con su cápsula: quieto, llevando el sofá, cayendo y levantándose', () => {
    // En el descampado, a 43 m del origen: si los miembros se escalaran dos veces quedarían a (1 − escala) × 43 ≈ 4,7 m.
    // Los dos agarran los extremos, lo llevan a lo largo y el 0 cae (sigue el 1 agarrando); se mide hasta que se levanta.
    const g = setup(2);
    const vs = views(g);
    besides(g.carriers[0], { x: OPEN.x + SOFA.half.x, z: OPEN.z }, { x: 1, z: 0 }, 0.35);
    besides(g.carriers[1], { x: OPEN.x - SOFA.half.x, z: OPEN.z }, { x: -1, z: 0 }, 0.35);
    const res = { up: { gap: 0, off: 0 }, down: { gap: 0, off: 0 } };
    let lying = 0, held = 0;
    const fallAt = 150, end = fallAt + Math.round((CARRIER.fallTime + 1) / DT);
    for (let i = 0; i < end; i++) {
      if (i === fallAt) g.carriers[0].knockDown({ x: 0, z: 1 }, CARRIER.fallTime, 'balance');
      const walk = i >= 30 && i < fallAt;
      g.step(DT, [inp({ grab: i === 20 || (i > 20 && !g.carriers[0].holding && !g.carriers[0].down), mx: walk ? -1 : 0 }), inp({ grab: i === 20, mx: walk ? -1 : 0 })]);
      for (const [k, v] of vs.entries()) {
        const c = g.carriers[k], gw = c.grabWorld();
        v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, i * DT, DT);
        const r = c.down ? res.down : res.up;
        r.gap = Math.max(r.gap, limbGap(v, c.down));
        r.off = Math.max(r.off, axisOffset(c, v));
        if (c.down === 'lying') lying++;
        if (c.holding) held++;
      }
    }
    // Ha pasado de verdad por cada pose: agarrando y tumbado
    expect(held).toBeGreaterThan(100);
    expect(lying).toBeGreaterThan(20);
    expect(g.carriers[0].down).toBe(null);
    // Los miembros salen de su sitio (2 cm) y el muñeco no se aparta de su cápsula (1 cm), de pie y en el suelo
    expect(res.up.gap, 'de pie: miembros separados del cuerpo').toBeLessThan(0.02);
    expect(res.down.gap, 'en el suelo: miembros separados del cuerpo').toBeLessThan(0.02);
    expect(res.up.off, 'de pie: el muñeco se aparta de su cápsula').toBeLessThan(0.01);
    expect(res.down.off, 'en el suelo: el muñeco se aparta de su cápsula').toBeLessThan(0.01);
    g.dispose();
  });
});

describe('T-auto-lift: el esfuerzo del muñeco se ve desde la cámara de juego', () => {
  it('arrastrando solo el sofá salen rayas de esfuerzo sobre la cabeza, la bola de agarre crece y enrojece, y se cuelga hacia atrás; en reposo, nada', () => {
    // Desde la cámara de juego (lejos y desde arriba) no se distinguían cejas, boca ni temblor
    const g = setup(2);
    const v = views(g)[0], c = g.carriers[0];
    type Parts = { marks: THREE.Sprite; grip: THREE.Mesh; effort: number };
    const pv = v as unknown as Parts;
    besides(c, { x: OPEN.x + SOFA.half.x, z: OPEN.z }, { x: 1, z: 0 }, 0.35);
    let t = 0;
    const run = (n: number, i: PlayerInput) => { for (let k = 0; k < n; k++) { g.step(DT, [i, NO_INPUT]); t += DT; const gw = c.grabWorld(); v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, t, DT); } };
    run(20, NO_INPUT);
    expect(pv.marks.visible).toBe(false);
    expect(pv.grip.visible).toBe(false);
    g.step(DT, [inp({ grab: true }), NO_INPUT]);
    expect(c.holding).toBe(true);
    let marks = 0, lean = 0;
    for (let k = 0; k < 90; k++) {
      run(1, inp({ mx: 1 }));
      if (pv.marks.visible) marks++;
      // Inclinación del tronco hacia atrás (alejándose del sofá, +x)
      const torso = (parts(v) as unknown as { torso: THREE.Object3D }).torso, up = new THREE.Vector3(0, 1, 0).transformDirection(torso.matrixWorld);
      lean = Math.max(lean, up.x);
    }
    expect(pv.effort).toBeGreaterThan(0.8);
    expect(marks).toBeGreaterThan(45);
    expect((pv.marks.material as THREE.SpriteMaterial).opacity).toBeGreaterThan(0.6);
    expect(pv.grip.scale.x).toBeGreaterThan(1.5);
    const col = (pv.grip.material as THREE.MeshBasicMaterial).color;
    expect(col.r).toBeGreaterThan(col.g * 1.5); // roja (el amarillo de J1 tiene r ≈ g)
    expect(lean).toBeGreaterThan(Math.sin(0.15));
    // Suelta y descansa: se va
    g.step(DT, [inp({ grab: true }), NO_INPUT]);
    run(90, NO_INPUT);
    expect(pv.marks.visible).toBe(false);
    expect(pv.grip.visible).toBe(false);
    g.dispose();
  });
});

describe('T-coh-1: los ayudantes, dentro de su cápsula', () => {
  type HelperView = InstanceType<typeof CarrierView>;
  /** Vértices (en el mundo) del cuerpo dibujado de un ayudante: tronco, cabeza y adornos (sin contornos ni piernas). */
  function helperPoints(v: HelperView): THREE.Vector3[] {
    v.group.updateMatrixWorld(true);
    const pts: THREE.Vector3[] = [];
    for (const m of helperBodyMeshes((v as unknown as { rig: { pivot: THREE.Object3D } }).rig.pivot)) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    }
    return pts;
  }
  /** Cuánto sale (m) el cuerpo dibujado de la cápsula del collider (de pie o tumbada) y cuánto se mete bajo los pies. */
  function outOfCapsule(c: Carrier, v: HelperView) {
    const k = c.collider.translation(), ax = axis(c), hh = CARRIER.halfHeight, r = CARRIER.radius, feet = c.pos.y - CENTER_Y;
    let out = 0, below = 0;
    for (const w of helperPoints(v)) {
      const dx = w.x - k.x, dy = w.y - k.y, dz = w.z - k.z;
      const t = Math.max(-hh, Math.min(hh, dx * ax.x + dy * ax.y + dz * ax.z));
      out = Math.max(out, Math.hypot(dx - ax.x * t, dy - ax.y * t, dz - ax.z * t) - r);
      below = Math.max(below, feet - w.y);
    }
    return { out, below };
  }

  it('cada ayudante cabe en su cápsula casi a su tamaño: de pie, cayendo y tumbado hacia delante y hacia atrás, no sale ni se mete bajo el suelo más de 3 cm', () => {
    // Todos los del reparto (sin humanos: también la abuela del moño, que sale en el fondo del menú), separados en el
    // descampado y sin cerebro. Antes: perro 67 cm fuera de pie y 61 cm bajo el suelo tumbado, alien 47, gordo 20
    const g = new Game(RAPIER, { level: CALLE, humans: 0, carriers: 6, botStyle: 'atentos', seed: 1 });
    g.bots.clear();
    g.phase = 'playing'; g.countdown = 0;
    g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z - 4 }, true);
    const place = () => g.carriers.forEach((c, i) => { c.teleport({ x: OPEN.x - 7 + i * 3, y: standY, z: OPEN.z + 3 }); c.facing = { x: 1, z: 0 }; });
    place();
    const vs = g.carriers.map((c) => new CarrierView(c, null, undefined, g.world));
    for (const v of vs) expect(v.fit, v.carrier.cast.cast).toBeGreaterThan(0.9);
    let t = 0;
    const worst = new Map<string, { out: number; below: number }>();
    const run = (n: number, at: string) => {
      for (let i = 0; i < n; i++) {
        g.step(DT, []); t += DT;
        vs.forEach((v) => {
          v.sync(null, t, DT);
          const r = outOfCapsule(v.carrier, v), key = `${v.carrier.cast.cast} ${at}`, w = worst.get(key) ?? { out: 0, below: 0 };
          worst.set(key, { out: Math.max(w.out, r.out), below: Math.max(w.below, r.below) });
        });
      }
    };
    run(40, 'de pie');
    for (const [at, sgn] of [['tumbado hacia delante', 1], ['tumbado hacia atrás', -1]] as const) {
      g.carriers.forEach((c) => c.knockDown({ x: sgn * c.facing.x, z: sgn * c.facing.z }, CARRIER.fallTime, 'balance'));
      run(Math.round((CARRIER.fallTime + 0.4) / DT), at);
      expect(g.carriers.every((c) => !c.down), at).toBe(true);
      place();
      run(20, 'de pie');
    }
    expect(worst.size).toBe(6 * 3);
    for (const [key, w] of worst) {
      expect(w.out, `${key}: sale de la cápsula`).toBeLessThan(TOL);
      expect(w.below, `${key}: bajo el suelo`).toBeLessThan(TOL);
    }
    g.dispose();
  });

  it('un ayudante que se tambalea hacia el sofá se inclina solo lo que cabe: su cuerpo dibujado no se mete en él', () => {
    for (const k of [1, 2, 3, 4, 5]) {
      const g = setup(6);
      g.bots.clear();
      const c = g.carriers[k], v = new CarrierView(c, null, undefined, g.world);
      // A 15 cm del respaldo, mirándolo, con un desequilibrio de 0,7 rad hacia él (el dibujo se inclinaría 0,7 rad)
      besides(c, { x: OPEN.x, z: OPEN.z - SOFA.half.z }, { x: 0, z: -1 }, 0.15);
      for (let i = 0; i < 10; i++) g.step(DT, []);
      let worst = 0, leaned = 0;
      for (let i = 0; i < 90; i++) {
        g.step(DT, []);
        const keep = { lean: c.lean, wob: c.wobbling };
        c.lean = { x: 0, z: 0.7 }; c.wobbling = true; // solo para el dibujo: se restaura antes del paso siguiente
        v.sync(null, i * DT, DT);
        c.lean = keep.lean; c.wobbling = keep.wob;
        const pivot = (v as unknown as { rig: { pivot: THREE.Object3D } }).rig.pivot;
        leaned = Math.max(leaned, Math.abs(pivot.rotation.x));
        const pts = helperPoints(v), near: RAPIER.Collider[] = [];
        g.world.intersectionsWithShape(c.collider.translation(), { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(DOLL_HEIGHT), (o) => { near.push(o); return true; }, undefined, undefined, c.collider);
        for (const col of near) for (const p of pts) {
          const pr = col.projectPoint(p, false);
          if (pr?.isInside) worst = Math.max(worst, Math.hypot(pr.point.x - p.x, pr.point.y - p.y, pr.point.z - p.z));
        }
      }
      expect(worst, c.cast.cast).toBeLessThan(TOL);
      // Sí se inclina algo (no se queda rígido): lo que cabe hasta tocar el sofá
      expect(leaned, c.cast.cast).toBeGreaterThan(0.05);
      g.dispose();
    }
  });
});

describe('T-coh-2: caída física', () => {
  /**
   * Derriba al porteador 0 hacia `dir` y sigue la caída hasta que se levanta (o se acaba `limit`). Mide el solape del
   * collider con todo, lo tumbado que llega a estar, si el muñeco se dibuja con la pose del collider y si se levanta.
   */
  function fall(g: Game, dir: V2, limit = CARRIER.fallTime + 1) {
    const c = g.carriers[0], vs = views(g);
    c.knockDown(dir, CARRIER.fallTime, 'balance');
    let worstOverlap = 0, maxTilt = 0, drawn = 0, axisErr = 0, t = 0, upAt = -1;
    for (; t < limit; t += DT) {
      g.step(DT, []);
      worstOverlap = Math.max(worstOverlap, overlap(g, c));
      maxTilt = Math.max(maxTilt, c.tilt);
      vs.forEach((v) => v.sync(null, t, DT));
      const rig = (vs[0] as unknown as { rig: { group: THREE.Object3D } }).rig;
      if (Math.round(t / DT) % 3 === 0) drawn = Math.max(drawn, drawnDepth(g, c, vs[0]));
      if (c.down) {
        // El tronco dibujado va a lo largo del eje del collider
        rig.group.updateMatrixWorld(true);
        const torso = (rig as unknown as { torso: THREE.Object3D }).torso;
        const up = new THREE.Vector3(0, 1, 0).transformDirection(torso.matrixWorld);
        axisErr = Math.max(axisErr, up.angleTo(axis(c)));
      }
      if (upAt < 0 && !c.down && c.stunned === 0) upAt = t;
    }
    const lie = { x: c.fallDir.x, z: c.fallDir.z };
    return { worstOverlap, maxTilt, drawn, axisErr, upAt, lie, local: c.collider.rotationWrtParent(), off: c.collider.translationWrtParent() };
  }

  const dirs = (toward: V2) => [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (k * Math.PI) / 3, cs = Math.cos(a), sn = Math.sin(a);
    return { x: toward.x * cs - toward.z * sn, z: toward.x * sn + toward.z * cs };
  });

  /** Comprueba una caída: sin solapes de más de 3 cm, tumbado de verdad (salvo `partial`), dibujado igual y de pie al final. */
  function check(r: ReturnType<typeof fall>, at: string, partial = false) {
    expect(r.worstOverlap, `${at}: solape del collider`).toBeLessThan(TOL);
    if (!partial) expect(r.maxTilt, `${at}: tumbado`).toBeGreaterThan(1.3);
    expect(r.drawn, `${at}: el muñeco dibujado se mete en algo`).toBeLessThan(TOL);
    expect(r.axisErr, `${at}: el muñeco no va con la pose del collider`).toBeLessThan(0.05);
    expect(r.upAt, `${at}: se levanta`).toBeGreaterThan(0);
    expect(r.local?.w ?? 0, `${at}: vuelve a la cápsula de pie`).toBeCloseTo(1, 6);
    expect(Math.hypot(r.off!.x, r.off!.y, r.off!.z), at).toBeLessThan(1e-6);
  }

  it('en 6 direcciones junto al sofá, el collider tumbado no se solapa más de 3 cm con nada y el porteador se levanta', () => {
    // Junto al respaldo (lado -z del sofá) y junto a un extremo
    for (const [side, at, out] of [
      ['respaldo', { x: OPEN.x + 0.3, z: OPEN.z - SOFA.half.z }, { x: 0, z: -1 }],
      ['extremo', { x: OPEN.x + SOFA.half.x, z: OPEN.z }, { x: 1, z: 0 }],
    ] as const) {
      for (const [k, d] of dirs({ x: -out.x, z: -out.z }).entries()) {
        const g = setup(1);
        besides(g.carriers[0], at, out, 0.03);
        for (let i = 0; i < 20; i++) g.step(DT, []);
        const r = fall(g, d);
        check(r, `sofá (${side}), dirección ${k * 60}°`);
        // No se tumba hacia el sofá: se tumba hacia el lado libre
        expect(r.lie.x * -out.x + r.lie.z * -out.z, `sofá (${side}), dirección ${k * 60}°`).toBeLessThan(0.3);
        g.dispose();
      }
    }
  });

  it('en 6 direcciones junto a una pared y junto a otro porteador, igual', () => {
    for (const k of [0, 1, 2, 3, 4, 5]) {
      // Pared de la casa del patio (z = 17), con el porteador de espaldas a ella
      const g = setup(1, PATIO);
      besides(g.carriers[0], { x: 0, z: 17 }, { x: 0, z: -1 }, 0.03);
      for (let i = 0; i < 20; i++) g.step(DT, []);
      const r = fall(g, dirs({ x: 0, z: 1 })[k]);
      check(r, `pared, dirección ${k * 60}°`);
      expect(r.lie.z, `pared, dirección ${k * 60}°`).toBeLessThan(0.3);
      g.dispose();
      // Otro porteador quieto al lado (el 1), a 5 cm
      const g2 = setup(2);
      g2.carriers[1].teleport({ x: OPEN.x + 4, y: standY, z: OPEN.z + 4 });
      besides(g2.carriers[0], { x: OPEN.x + 4 - CARRIER.radius, z: OPEN.z + 4 }, { x: -1, z: 0 }, 0.05);
      for (let i = 0; i < 20; i++) g2.step(DT, []);
      const r2 = fall(g2, dirs({ x: 1, z: 0 })[k]);
      check(r2, `otro porteador, dirección ${k * 60}°`);
      expect(r2.lie.x, `otro porteador, dirección ${k * 60}°`).toBeLessThan(0.3);
      g2.dispose();
    }
  });

  it('acorralado donde no cabe tumbado, queda recostado sin solaparse y se levanta; si no cabe de pie, espera y se aparta', () => {
    // Una celda de paredes de 1,1 × 1,1 m: cabe de pie, pero no tumbado en ninguna dirección
    for (const k of [0, 1, 2, 3, 4, 5]) {
      const g = setup(1);
      const cx = OPEN.x + 6, cz = OPEN.z + 6, w = g.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      for (const [x, z, hx, hz] of [[0.65, 0, 0.1, 0.75], [-0.65, 0, 0.1, 0.75], [0, 0.65, 0.75, 0.1], [0, -0.65, 0.75, 0.1]]) {
        g.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.6, hz).setTranslation(cx + x, 0.6, cz + z), w);
      }
      g.carriers[0].teleport({ x: cx, y: standY, z: cz });
      for (let i = 0; i < 20; i++) g.step(DT, []);
      const r = fall(g, dirs({ x: 1, z: 0 })[k]);
      check(r, `en la celda, dirección ${k * 60}°`, true);
      expect(r.maxTilt, `en la celda, dirección ${k * 60}°: recostado`).toBeGreaterThan(0.2);
      g.dispose();
    }

    // Tumbado, le ponen encima una balda a 1 m: no cabe de pie y espera; se aparta a rastras y se levanta al lado
    const g2 = setup(1);
    const c = g2.carriers[0];
    c.teleport({ x: OPEN.x + 3, y: standY, z: OPEN.z + 4 });
    for (let i = 0; i < 20; i++) g2.step(DT, []);
    c.knockDown({ x: 1, z: 0 }, CARRIER.fallTime, 'balance');
    for (let i = 0; i < 30; i++) g2.step(DT, []);
    expect(c.down).toBe('lying');
    const p = c.pos, b = g2.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y - CENTER_Y + 1.05, p.z));
    g2.world.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 0.05, 0.6), b);
    let waited = 0, worst = 0;
    for (let t = 0; t < 6 && c.down; t += DT) {
      g2.step(DT, []);
      if (c.stunned === CARRIER.riseTime && c.down === 'lying') waited += DT;
      worst = Math.max(worst, overlap(g2, c));
    }
    expect(waited).toBeGreaterThan(0.2);
    expect(waited).toBeLessThan(CARRIER.maxWaitRoom);
    expect(c.down).toBe(null);
    expect(worst).toBeLessThan(TOL);
    // Se ha levantado fuera de la balda
    const q = c.pos;
    expect(Math.max(Math.abs(q.x - p.x), Math.abs(q.z - p.z))).toBeGreaterThan(0.6 + CARRIER.radius - TOL);
    g2.dispose();
  });

  it('el porteador derribado por un coche se tumba y se levanta, y vuelve a andar', () => {
    const g = setup(1);
    const c = g.carriers[0];
    c.teleport({ x: OPEN.x, y: standY, z: OPEN.z + 4 });
    for (let i = 0; i < 10; i++) g.step(DT, []);
    c.knockDown({ x: 0, z: 1 }, CARRIER.stunTime, 'car');
    let maxTilt = 0;
    for (let t = 0; t < CARRIER.stunTime + 0.1; t += DT) { g.step(DT, []); maxTilt = Math.max(maxTilt, c.tilt); }
    expect(maxTilt).toBeGreaterThan(1.3);
    expect(c.down).toBe(null);
    const p0 = c.pos;
    for (let i = 0; i < 60; i++) g.step(DT, [inp({ mx: 1 })]);
    expect(c.pos.x - p0.x).toBeGreaterThan(2);
    g.dispose();
  });
});
