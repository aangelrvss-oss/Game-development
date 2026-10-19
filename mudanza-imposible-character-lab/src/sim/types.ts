export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; z: number }

/** Mando en un paso: movimiento en el suelo (x, z en el mundo), correr y agarrar/soltar (flanco). */
export interface LabInput { mx: number; mz: number; run: boolean; grab: boolean }
export const NO_INPUT: LabInput = { mx: 0, mz: 0, run: false, grab: false };

export type CharState = 'idle' | 'walking' | 'grabbing' | 'pulling' | 'losingBalance' | 'falling' | 'recovering';

export const STATE_LABEL: Record<CharState, string> = {
  idle: 'Quieto',
  walking: 'Caminando',
  grabbing: 'Agarrando',
  pulling: 'Tirando',
  losingBalance: 'Perdiendo el equilibrio',
  falling: 'Cayendo',
  recovering: 'Levantándose',
};

export type TestId = 'A' | 'B' | 'C' | 'D' | 'libre';
