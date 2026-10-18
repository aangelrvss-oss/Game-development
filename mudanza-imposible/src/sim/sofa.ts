import type RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from './types';

type R = typeof RAPIER;

/**
 * Forma del sofá en coordenadas locales: largo en x, fondo en z, alto en y.
 * El respaldo va en el lado local -z (lado rojo); el asiento abre hacia +z (lado azul).
 */
export const SOFA = {
  half: { x: 1.1, y: 0.2, z: 0.45 },
  back: { p: { x: 0, y: 0.42, z: -0.36 }, h: { x: 1.1, y: 0.24, z: 0.09 } },
  arm: { h: { x: 0.11, y: 0.15, z: 0.45 }, y: 0.33 },
  mass: 45,
};

/** Asas donde se colocan los ayudantes: punto local en la superficie y dirección hacia fuera. */
export const SLOTS: { p: Vec3; out: Vec3; side: 'end' | 'red' | 'blue' }[] = [
  { p: { x: 1.1, y: 0.05, z: 0 }, out: { x: 1, y: 0, z: 0 }, side: 'end' },
  { p: { x: -1.1, y: 0.05, z: 0 }, out: { x: -1, y: 0, z: 0 }, side: 'end' },
  { p: { x: 0.55, y: 0.05, z: 0.45 }, out: { x: 0, y: 0, z: 1 }, side: 'blue' },
  { p: { x: -0.55, y: 0.05, z: -0.45 }, out: { x: 0, y: 0, z: -1 }, side: 'red' },
  { p: { x: -0.55, y: 0.05, z: 0.45 }, out: { x: 0, y: 0, z: 1 }, side: 'blue' },
  { p: { x: 0.55, y: 0.05, z: -0.45 }, out: { x: 0, y: 0, z: -1 }, side: 'red' },
];

export function createSofa(R: R, world: RAPIER.World, pos: Vec3, yaw: number) {
  const q = yawQuat(yaw);
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(q)
      .setLinearDamping(0.4)
      .setAngularDamping(1.6)
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(4),
  );
  const { half, back, arm } = SOFA;
  const vol = 8 * (half.x * half.y * half.z + back.h.x * back.h.y * back.h.z + 2 * arm.h.x * arm.h.y * arm.h.z);
  const density = SOFA.mass / vol;
  const colliders: RAPIER.Collider[] = [];
  const mk = (d: RAPIER.ColliderDesc) => colliders.push(world.createCollider(d.setDensity(density).setFriction(0.7).setRestitution(0.05), body));
  mk(R.ColliderDesc.roundCuboid(half.x - 0.05, half.y - 0.05, half.z - 0.05, 0.05));
  mk(R.ColliderDesc.cuboid(back.h.x, back.h.y, back.h.z).setTranslation(back.p.x, back.p.y, back.p.z));
  mk(R.ColliderDesc.cuboid(arm.h.x, arm.h.y, arm.h.z).setTranslation(half.x - arm.h.x, arm.y, 0));
  mk(R.ColliderDesc.cuboid(arm.h.x, arm.h.y, arm.h.z).setTranslation(-(half.x - arm.h.x), arm.y, 0));
  for (const c of colliders) c.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
  return { body, colliders };
}

export function yawQuat(yaw: number) {
  // Giro alrededor de +y. Con yaw = atan2(eje.z, eje.x), un giro positivo sobre y reduce yaw.
  const a = -yaw / 2;
  return { x: 0, y: Math.sin(a), z: 0, w: Math.cos(a) };
}

/** Rota v por el cuaternión q. */
export function rotate(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

export const conj = (q: { x: number; y: number; z: number; w: number }) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function localToWorld(body: RAPIER.RigidBody, p: Vec3): Vec3 {
  const r = rotate(body.rotation(), p);
  const t = body.translation();
  return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
}

export function worldToLocal(body: RAPIER.RigidBody, p: Vec3): Vec3 {
  const t = body.translation();
  return rotate(conj(body.rotation()), { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z });
}

/** Orientación del eje largo en el plano: atan2(z, x). */
export function sofaYaw(body: RAPIER.RigidBody): number {
  const ax = rotate(body.rotation(), { x: 1, y: 0, z: 0 });
  return Math.atan2(ax.z, ax.x);
}

/** Coseno del ángulo entre el «arriba» del sofá y el vertical (1 = derecho, -1 = boca abajo). */
export function sofaUp(body: RAPIER.RigidBody): number {
  return rotate(body.rotation(), { x: 0, y: 1, z: 0 }).y;
}
