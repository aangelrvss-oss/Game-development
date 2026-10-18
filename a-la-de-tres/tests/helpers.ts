import { newGame, privateViews, resolveBeat, type GameState } from '../src/rules/engine';
import { LEVELS } from '../src/rules/levels';
import { seatDef } from '../src/rules/seats';
import type { Card, Dir, Sofa, TokenContent, Vec } from '../src/rules/types';

export const v = (x: number, y: number): Vec => ({ x, y });

/** Cartas por parte: misma carta para todos los asientos ocupados de esa parte. */
export function byPart(st: GameState, e2: Card, c: Card, e1: Card): Record<number, Card> {
  const out: Record<number, Card> = {};
  for (const s of st.seats) {
    const p = seatDef(s).part;
    out[s] = p === 'E1' ? e1 : p === 'C' ? c : e2;
  }
  return out;
}

export function setup(opts: {
  level?: 'A' | 'B';
  seats?: number[];
  E2: Vec;
  C: Vec;
  E1: Vec;
  red?: Dir;
  revealed?: Record<string, TokenContent>;
  damage?: number;
  beat?: number;
}): GameState {
  const st = newGame(LEVELS[opts.level ?? 'A'], opts.seats ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const sofa: Sofa = { E1: opts.E1, C: opts.C, E2: opts.E2, red: opts.red ?? 'E' };
  return { ...st, sofa, revealed: opts.revealed ?? {}, damage: opts.damage ?? 0, beat: opts.beat ?? 0 };
}

/** Papelitos de un compás en formato del kit: { O1: [9, 10] }. */
export function slips(st: GameState): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const p of privateViews(st)) (out[p.token] ??= []).push(p.seat);
  return out;
}

export const sofaStr = (s: Sofa): string => `(${s.E2.x},${s.E2.y}) · (${s.C.x},${s.C.y}) · (${s.E1.x},${s.E1.y})`;

export { resolveBeat };
