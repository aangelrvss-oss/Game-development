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
import { Game } from '../src/sim/game';
import { SOFA, yawQuat } from '../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../src/sim/types';

// El muñeco pinta su sombra y su etiqueta en un lienzo: en Node basta con un lienzo que no pinta nada
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { CharacterRig } = await import('../src/view/doll/dollRig');
const { DollView } = await import('../src/view/doll/dollView');

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
  const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
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
      let worst = 0;
      for (let i = 0; i < 150; i++) {
        g.step(DT, input(g, i));
        for (const [k, v] of vs.entries()) {
          const c = g.carriers[k], keep = { lean: c.lean, wob: c.wobbling };
          if (pose && k === 0) pose(g); // solo para el dibujo: se restaura antes del paso siguiente
          const gw = c.grabWorld();
          v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, i * DT, DT);
          c.lean = keep.lean; c.wobbling = keep.wob;
          if (i % 2 === 0) worst = Math.max(worst, drawnDepth(g, c, v));
        }
      }
      expect(worst, name).toBeLessThan(TOL);
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
