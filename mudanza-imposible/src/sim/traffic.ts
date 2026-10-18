import type RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from './types';

type R = typeof RAPIER;

export const CAR = { hx: 2.1, hy: 0.65, hz: 0.95, cruise: 10, slow: 3.2, brake: 7 };
export const LANES = [
  { z: -1.6, dir: 1, stopX: -4.2 },
  { z: -6.4, dir: -1, stopX: 4.2 },
];
export const X_LIMIT = 46;

/** Semáforo: los coches tienen verde, luego ámbar y después se para el tráfico para que crucen los peatones. */
export const LIGHT = { cars: 8, yellow: 1.6, allRed: 1.4, ped: 6 };
export const LIGHT_PERIOD = LIGHT.cars + LIGHT.yellow + LIGHT.allRed + LIGHT.ped;

export function lightAt(t: number): { cars: 'green' | 'yellow' | 'red'; ped: 'green' | 'red'; left: number } {
  const u = ((t % LIGHT_PERIOD) + LIGHT_PERIOD) % LIGHT_PERIOD;
  if (u < LIGHT.cars) return { cars: 'green', ped: 'red', left: LIGHT.cars + LIGHT.yellow - u };
  if (u < LIGHT.cars + LIGHT.yellow) return { cars: 'yellow', ped: 'red', left: LIGHT.cars + LIGHT.yellow - u };
  // Rojo para todos: deja salir a los coches que ya han pasado la línea antes de dar paso a los peatones.
  if (u < LIGHT.cars + LIGHT.yellow + LIGHT.allRed) return { cars: 'red', ped: 'red', left: LIGHT.cars + LIGHT.yellow + LIGHT.allRed - u };
  return { cars: 'red', ped: 'green', left: LIGHT_PERIOD - u };
}

export const CAR_COLORS = ['#ef4444', '#facc15', '#38bdf8', '#a3e635', '#fb923c', '#f472b6'];

export class Car {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  speed = CAR.cruise;
  honkCooldown = 0;
  /** Para que la vista sepa si frena. */
  braking = false;
  constructor(R: R, world: RAPIER.World, readonly id: number, readonly lane: number, public x: number, readonly color: string) {
    const l = LANES[lane];
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, CAR.hy + 0.15, l.z));
    this.collider = world.createCollider(
      R.ColliderDesc.roundCuboid(CAR.hx - 0.15, CAR.hy - 0.15, CAR.hz - 0.15, 0.15)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
        .setFriction(0.3),
      this.body,
    );
  }

  get z() { return LANES[this.lane].z; }
  get dir() { return LANES[this.lane].dir; }
}

/**
 * Avanza el tráfico. Los coches frenan ante el semáforo y ante obstáculos en su carril,
 * pero no se detienen del todo ante obstáculos: si algo sigue en la calzada, lo empujan.
 * Devuelve los coches que pitan en este paso.
 */
export function stepTraffic(cars: Car[], t: number, dt: number, obstacles: Vec3[]): Car[] {
  const light = lightAt(t);
  const honks: Car[] = [];
  for (const car of cars) {
    const lane = LANES[car.lane];
    let target = CAR.cruise;
    // Semáforo
    const toLine = lane.dir * (lane.stopX - car.x) - CAR.hx;
    if (light.cars !== 'green' && toLine > -0.5) {
      const stopV = Math.sqrt(Math.max(0, 2 * CAR.brake * Math.max(0, toLine - 0.3)));
      // En ámbar, si ya no da tiempo a frenar, pasa.
      if (!(light.cars === 'yellow' && toLine < 4)) target = Math.min(target, stopV);
    }
    // Coche de delante
    for (const o of cars) {
      if (o === car || o.lane !== car.lane) continue;
      const gap = lane.dir * (o.x - car.x);
      if (gap > 0 && gap < 12) target = Math.min(target, Math.max(0, (gap - 2 * CAR.hx - 1.2) * 1.5));
    }
    // Obstáculos (sofá, porteadores) en el carril: frena y pita
    let blocked = false;
    for (const p of obstacles) {
      if (Math.abs(p.z - lane.z) > CAR.hz + 0.9) continue;
      const ahead = lane.dir * (p.x - car.x);
      if (ahead > CAR.hx - 0.2 && ahead < CAR.hx + 7) { blocked = true; break; }
    }
    if (blocked) {
      target = Math.min(target, CAR.slow);
      if (car.honkCooldown <= 0) { honks.push(car); car.honkCooldown = 2.2; }
    }
    car.honkCooldown -= dt;
    const a = target < car.speed ? CAR.brake * 1.6 : 4;
    car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), a * dt);
    car.braking = target < car.speed - 0.5 || car.speed < 1;
    car.x += lane.dir * car.speed * dt;
    if (car.x * lane.dir > X_LIMIT) {
      // Vuelve a entrar por el otro extremo: teletransporte, para no barrer la escena a velocidad enorme.
      car.x -= lane.dir * 2 * X_LIMIT;
      car.body.setTranslation({ x: car.x, y: CAR.hy + 0.15, z: lane.z }, true);
    } else {
      car.body.setNextKinematicTranslation({ x: car.x, y: CAR.hy + 0.15, z: lane.z });
    }
  }
  return honks;
}
