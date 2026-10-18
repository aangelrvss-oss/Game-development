import type RAPIER from '@dimforge/rapier3d-compat';
import { worldToLocal, localToWorld } from './sofa';
import type { PlayerInput, Vec3 } from './types';

type R = typeof RAPIER;

export const CARRIER = {
  radius: 0.32,
  halfHeight: 0.33,
  mass: 70,
  walkSpeed: 5.2,
  carrySpeed: 3.4,
  accel: 32,
  airAccel: 6,
  handForward: 0.42,
  handY: 0.22,
  liftY: 0.78,
  grabReach: 1.05,
  /** Velocidad a la que la mano lleva el punto agarrado a su altura (m/s). */
  handSpeed: 1.4,
  /** Si el punto de agarre se separa más que esto de la mano, se suelta. */
  gripBreak: 0.55,
  stunTime: 1.8,
  /** Cambio brusco de velocidad que tumba a un porteador (atropello, golpe fuerte). */
  stunDv: 9,
};

export const CENTER_Y = CARRIER.halfHeight + CARRIER.radius;

export type Cast = 'mono' | 'rulos' | 'gordo' | 'alien' | 'enano' | 'perro';
export const CAST: { cast: Cast; name: string; color: string }[] = [
  { cast: 'mono', name: 'Abuela Moño', color: '#8b5cf6' },
  { cast: 'gordo', name: 'Gordo', color: '#3b82f6' },
  { cast: 'rulos', name: 'Abuela Rulos', color: '#ec4899' },
  { cast: 'alien', name: 'Alien', color: '#22c55e' },
  { cast: 'enano', name: 'Enano', color: '#f97316' },
  { cast: 'perro', name: 'Salchicha', color: '#a16207' },
];

export class Carrier {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  joint: RAPIER.ImpulseJoint | null = null;
  /** Punto agarrado, en coordenadas locales del sofá. */
  grabLocal: Vec3 | null = null;
  /** Dirección horizontal mano→agarre en el momento de agarrar. */
  handDir = { x: 0, z: -1 };
  handLift = 0; // 0..1 suavizado
  /** Ancla actual de la mano (local al porteador). Se acerca poco a poco a la posición objetivo. */
  anchorCur: Vec3 = { x: 0, y: CARRIER.handY, z: 0 };
  stunned = 0;
  facing = { x: 0, z: -1 };
  prevVel: Vec3 = { x: 0, y: 0, z: 0 };
  grounded = true;
  /** Velocidad pedida en este paso (para que los ayudantes la imiten). */
  wantVel = { x: 0, z: 0 };
  /** Índice de jugador humano, o null si es un ayudante. */
  constructor(
    private R: R,
    private world: RAPIER.World,
    readonly id: number,
    readonly cast: (typeof CAST)[number],
    public human: number | null,
    pos: Vec3,
  ) {
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).lockRotations().setCcdEnabled(true),
    );
    const vol = Math.PI * CARRIER.radius ** 2 * (2 * CARRIER.halfHeight + (4 / 3) * CARRIER.radius);
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(CARRIER.halfHeight, CARRIER.radius)
        .setDensity(CARRIER.mass / vol)
        .setFriction(0)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
  }

  get pos(): Vec3 { return this.body.translation(); }
  get holding(): boolean { return this.joint !== null; }

  /** Mano en el espacio local del porteador (sin rotación: el cuerpo tiene la rotación bloqueada). */
  handAnchor(): Vec3 {
    const y = CARRIER.handY + (CARRIER.liftY - CARRIER.handY) * this.handLift;
    return { x: this.handDir.x * CARRIER.handForward, y, z: this.handDir.z * CARRIER.handForward };
  }

  handWorld(): Vec3 {
    const p = this.pos, a = this.joint ? this.anchorCur : this.handAnchor();
    return { x: p.x + a.x, y: p.y + a.y, z: p.z + a.z };
  }

  grabWorld(sofa: RAPIER.RigidBody): Vec3 | null {
    return this.grabLocal ? localToWorld(sofa, this.grabLocal) : null;
  }

  /** Busca el punto del sofá más cercano a la mano; si está al alcance, lo agarra. */
  tryGrab(sofa: RAPIER.RigidBody, colliders: RAPIER.Collider[], preferLocal?: Vec3): boolean {
    if (this.joint || this.stunned > 0) return false;
    const p = this.pos;
    let target: Vec3 | null = null;
    if (preferLocal) {
      target = localToWorld(sofa, preferLocal);
    } else {
      const probe = { x: p.x + this.facing.x * 0.35, y: p.y + CARRIER.handY, z: p.z + this.facing.z * 0.35 };
      let best = Infinity;
      for (const c of colliders) {
        const proj = c.projectPoint(probe, true);
        if (!proj) continue;
        const d = Math.hypot(proj.point.x - probe.x, proj.point.y - probe.y, proj.point.z - probe.z);
        if (d < best) { best = d; target = { x: proj.point.x, y: proj.point.y, z: proj.point.z }; }
      }
    }
    if (!target) return false;
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > CARRIER.grabReach + CARRIER.radius || Math.abs(target.y - p.y) > 1.3) return false;
    this.handDir = dist > 1e-3 ? { x: dx / dist, z: dz / dist } : { ...this.facing };
    this.grabLocal = worldToLocal(sofa, target);
    // La mano empieza justo en el punto agarrado y después sube a su altura: sin tirones.
    this.anchorCur = { x: target.x - p.x, y: target.y - p.y, z: target.z - p.z };
    const data = this.R.JointData.spherical(this.anchorCur, this.grabLocal);
    this.joint = this.world.createImpulseJoint(data, this.body, sofa, true);
    this.joint.setContactsEnabled(false);
    return true;
  }

  release() {
    if (this.joint) this.world.removeImpulseJoint(this.joint, true);
    this.joint = null;
    this.grabLocal = null;
  }

  /** Aplica el control de movimiento. Devuelve true si la mano se ha soltado por tirón. */
  control(input: PlayerInput, dt: number, sofa: RAPIER.RigidBody): boolean {
    const v = this.body.linvel();
    let mx = input.mx, mz = input.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    if (this.stunned > 0) { mx = 0; mz = 0; }
    const speed = this.joint ? CARRIER.carrySpeed : CARRIER.walkSpeed;
    const tx = mx * speed, tz = mz * speed;
    this.wantVel = { x: tx, z: tz };
    // Suelo debajo
    const ray = new this.R.Ray(this.pos, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, CENTER_Y + 0.12, true, undefined, undefined, undefined, this.body);
    this.grounded = hit !== null;
    const maxA = (this.grounded ? CARRIER.accel : CARRIER.airAccel) * (this.stunned > 0 ? 0.15 : 1);
    let ax = (tx - v.x) / dt, az = (tz - v.z) / dt;
    const a = Math.hypot(ax, az);
    if (a > maxA) { ax *= maxA / a; az *= maxA / a; }
    const mass = this.body.mass();
    this.body.applyImpulse({ x: ax * mass * dt, y: 0, z: az * mass * dt }, true);
    if (m > 0.15 && !this.joint) this.facing = { x: mx / Math.max(m, 1e-6), z: mz / Math.max(m, 1e-6) };
    // Alzar: sube la mano poco a poco
    const goal = input.lift && this.joint ? 1 : 0;
    this.handLift += Math.sign(goal - this.handLift) * Math.min(Math.abs(goal - this.handLift), dt * 3);
    if (this.joint) {
      const t = this.handAnchor(), c = this.anchorCur;
      const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
      const d = Math.hypot(dx, dy, dz), stepMax = CARRIER.handSpeed * dt;
      if (d > 1e-4) {
        const k = Math.min(1, stepMax / d);
        this.anchorCur = { x: c.x + dx * k, y: c.y + dy * k, z: c.z + dz * k };
        (this.joint as RAPIER.SphericalImpulseJoint).setAnchor1(this.anchorCur);
      }
      const g = this.grabWorld(sofa)!;
      this.facing = { ...this.handDir };
      const h = this.handWorld();
      if (Math.hypot(g.x - h.x, g.y - h.y, g.z - h.z) > CARRIER.gripBreak) { this.release(); return true; }
    }
    return false;
  }

  teleport(p: Vec3) {
    this.release();
    this.body.setTranslation(p, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel = { x: 0, y: 0, z: 0 };
  }
}
