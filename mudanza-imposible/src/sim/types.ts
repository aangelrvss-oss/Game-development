export interface Vec3 { x: number; y: number; z: number }

/** Mando de un jugador en un paso de simulación. Lo rellenan el teclado, el mando, la IA o el piloto automático. */
export interface PlayerInput {
  /** Movimiento en el suelo: x hacia la derecha, z hacia la cámara. Magnitud 0..1. */
  mx: number;
  mz: number;
  /** Pulsación de agarrar/soltar en este paso (flanco). Al agarrar, la mano sube sola a la altura de carga. */
  grab: boolean;
  /** Orden de giro a los ayudantes: +1 antihorario visto desde arriba, -1 horario. */
  turn: -1 | 0 | 1;
  /** Pulsación de enderezar el sofá (flanco). */
  right: boolean;
}

export const NO_INPUT: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };

export type GameEvent =
  | { type: 'grab'; carrier: number; pos: Vec3 }
  | { type: 'release'; carrier: number; pos: Vec3 }
  | { type: 'gripBreak'; carrier: number; pos: Vec3 }
  | { type: 'impact'; pos: Vec3; strength: number; damage: number }
  | { type: 'carHit'; pos: Vec3; target: 'sofa' | 'carrier'; carrier?: number }
  | { type: 'stun'; carrier: number; pos: Vec3 }
  | { type: 'wobble'; carrier: number; pos: Vec3 }
  | { type: 'fall'; carrier: number; pos: Vec3 }
  | { type: 'honk'; car: number; pos: Vec3 }
  | { type: 'light'; ped: 'green' | 'red' }
  | { type: 'stage'; index: number; label: string }
  | { type: 'righted'; pos: Vec3 }
  | { type: 'respawnSofa'; pos: Vec3 }
  | { type: 'win' }
  | { type: 'lose'; reason: 'broken' | 'time' };

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const lenXZ = (a: Vec3): number => Math.hypot(a.x, a.z);
