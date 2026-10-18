// Casos de referencia tomados del kit v3: ejemplos resueltos, test de comprensión,
// recorridos ideales de los tableros A y B-espejo y escenarios S1–S8.
import { describe, expect, it } from 'vitest';
import { MAX_BEATS, newGame, outerCell, resolveBeat } from '../src/rules/engine';
import { LEVELS } from '../src/rules/levels';
import type { Card } from '../src/rules/types';
import { byPart, setup, slips, sofaStr, v } from './helpers';

describe('Ejemplos resueltos de la hoja de reglas', () => {
  it('1 · bulto delante: E2 alza y el resto juega N → avanza sin daño', () => {
    const st = setup({ E2: v(4, 12), C: v(4, 13), E1: v(4, 14) }); // U1 en (4,11)
    const { report } = resolveBeat(st, byPart(st, 'A', 'N', 'N'));
    expect(report.outcome).toBe('movimiento');
    expect(report.damage).toHaveLength(0);
  });
  it('1b · uno de E2 juega N: E2 inclinada, avanza +1', () => {
    const st = setup({ E2: v(4, 12), C: v(4, 13), E1: v(4, 14) });
    const cards = byPart(st, 'A', 'N', 'N');
    cards[7] = 'N';
    const { report, state } = resolveBeat(st, cards);
    expect(report.parts.E2.status).toBe('INCLINADA');
    expect(report.outcome).toBe('movimiento');
    expect(state.damage).toBe(1);
  });
  it('1c · nadie de E2 alza: tropiezo, no avanza, +1', () => {
    const st = setup({ E2: v(4, 12), C: v(4, 13), E1: v(4, 14) });
    const { report, state } = resolveBeat(st, byPart(st, 'N', 'N', 'N'));
    expect(report.outcome).toBe('tropiezo');
    expect(state.sofa).toEqual(st.sofa);
    expect(state.damage).toBe(1);
  });
  it('2 · giro bloqueado: centro O y N → forcejeo', () => {
    const st = setup({ E2: v(5, 3), C: v(5, 4), E1: v(5, 5), seats: [1, 3, 4, 5, 6, 7, 8, 9] });
    const cards = byPart(st, 'E', 'N', 'O');
    cards[6] = 'O';
    const { report, state } = resolveBeat(st, cards);
    expect(report.motion.kind).toBe('forcejeo');
    expect(state.damage).toBe(0);
  });
  it('3 · centro dividido (N y E) en pasillo: avanza sin daño; con ALZAR, +1', () => {
    const st = setup({ E2: v(4, 9), C: v(4, 10), E1: v(4, 11) });
    const cards = byPart(st, 'N', 'N', 'N');
    cards[6] = 'E';
    const r1 = resolveBeat(st, cards);
    expect(r1.report.parts.C.push).toBeNull();
    expect(r1.report.motion).toEqual({ kind: 'desplazamiento', dir: 'N' });
    cards[6] = 'A';
    const r2 = resolveBeat(st, cards);
    expect(r2.report.parts.C.status).toBe('INCLINADA');
    expect(r2.state.damage).toBe(1);
  });
});

describe('Test de comprensión', () => {
  const base = { E2: v(4, 9), C: v(4, 10), E1: v(4, 11), seats: [1, 3, 5, 6, 7, 9] };
  it('1 · C juega N y ALZAR → avanza con +1', () => {
    const st = setup(base);
    const cards = byPart(st, 'N', 'N', 'N');
    cards[6] = 'A';
    expect(resolveBeat(st, cards).state.damage).toBe(1);
  });
  it('2 · E1 al sur, C y E2 al norte → forcejeo (una parte empuja en contra, B9)', () => {
    const st = setup(base);
    const { report } = resolveBeat(st, byPart(st, 'N', 'N', 'S'));
    expect(report.motion).toEqual({ kind: 'forcejeo' });
  });
  it('3 · E1 E, C S, E2 O, 3×3 libre → gira y E1 queda al este', () => {
    const st = setup({ E2: v(5, 3), C: v(5, 4), E1: v(5, 5), seats: [1, 3, 5, 6, 7, 9] }); // 3×3 de (5,4) libre
    const { report, state } = resolveBeat(st, byPart(st, 'O', 'S', 'E'));
    expect(report.motion).toEqual({ kind: 'giro', e1: 'E', e2: 'O' });
    expect(state.sofa.E1).toEqual(v(6, 4));
    expect(state.sofa.E2).toEqual(v(4, 4));
  });
});

// Recorridos ideales del kit (cartas E2 / C / E1). «no costado» se juega como N.
const PATH_A: [Card, Card, Card, string, Record<string, number[]>][] = [
  ['N', 'N', 'N', '(4,12) · (4,13) · (4,14)', {}],
  ['A', 'N', 'N', '(4,11) · (4,12) · (4,13)', {}],
  ['N', 'A', 'N', '(4,10) · (4,11) · (4,12)', {}],
  ['N', 'N', 'A', '(4,9) · (4,10) · (4,11)', {}],
  ['A', 'N', 'N', '(4,8) · (4,9) · (4,10)', { O1: [9, 10] }],
  ['N', 'A', 'N', '(4,7) · (4,8) · (4,9)', { O2: [9, 10] }],
  ['N', 'N', 'A', '(4,6) · (4,7) · (4,8)', {}],
  ['N', 'N', 'N', '(4,5) · (4,6) · (4,7)', {}],
  ['N', 'N', 'N', '(4,4) · (4,5) · (4,6)', { O3: [7] }],
  ['N', 'N', 'N', '(4,3) · (4,4) · (4,5)', { O6: [8], O3: [5] }],
  ['E', 'E', 'A', '(5,3) · (5,4) · (5,5)', { O4: [7], O6: [6], O3: [3] }],
  ['E', 'N', 'O', '(6,4) · (5,4) · (4,4)', { O5: [5] }],
  ['O', 'O', 'A', '(5,4) · (4,4) · (3,4)', { O6: [1, 2] }],
  ['O', 'A', 'O', '(4,4) · (3,4) · (2,4)', {}],
  ['A', 'O', 'O', '(3,4) · (2,4) · (1,4)', {}],
  ['O', 'O', 'A', '(2,4) · (1,4) · (0,4)', { O7: [1, 2] }],
];
const PATH_B: [Card, Card, Card, string, Record<string, number[]>][] = [
  ['N', 'N', 'N', '(4,12) · (4,13) · (4,14)', {}],
  ['A', 'N', 'N', '(4,11) · (4,12) · (4,13)', {}],
  ['N', 'A', 'N', '(4,10) · (4,11) · (4,12)', {}],
  ['N', 'N', 'A', '(4,9) · (4,10) · (4,11)', {}],
  ['N', 'N', 'N', '(4,8) · (4,9) · (4,10)', { O1: [9, 10] }],
  ['A', 'N', 'N', '(4,7) · (4,8) · (4,9)', { O2: [9, 10] }],
  ['N', 'A', 'N', '(4,6) · (4,7) · (4,8)', {}],
  ['N', 'N', 'A', '(4,5) · (4,6) · (4,7)', {}],
  ['N', 'N', 'N', '(4,4) · (4,5) · (4,6)', { O3: [8] }],
  ['N', 'N', 'N', '(4,3) · (4,4) · (4,5)', { O6: [7], O3: [6] }],
  ['A', 'O', 'O', '(3,3) · (3,4) · (3,5)', { O4: [8], O6: [5], O3: [4] }],
  ['O', 'N', 'E', '(2,4) · (3,4) · (4,4)', { O5: [6] }],
  ['E', 'E', 'A', '(3,4) · (4,4) · (5,4)', { O6: [1, 2] }],
  ['E', 'A', 'E', '(4,4) · (5,4) · (6,4)', {}],
  ['A', 'E', 'E', '(5,4) · (6,4) · (7,4)', {}],
  ['E', 'E', 'E', '(6,4) · (7,4) · (8,4)', { O7: [1, 2] }],
];

describe.each([
  ['A', PATH_A],
  ['B', PATH_B],
] as const)('Recorrido ideal del tablero %s', (lvl, path) => {
  it('16 compases, 0 daños, papelitos del kit y meta', () => {
    let st = newGame(LEVELS[lvl], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    let total = 0;
    path.forEach(([e2, c, e1, pos, sl], i) => {
      expect(slips(st), `papelitos del compás ${i + 1}`).toEqual(sl);
      total += Object.keys(sl).length;
      const r = resolveBeat(st, byPart(st, e2, c, e1));
      expect(r.report.outcome, `compás ${i + 1}`).toBe('movimiento');
      expect(sofaStr(r.state.sofa), `posición tras el compás ${i + 1}`).toBe(pos);
      st = r.state;
    });
    expect(st.damage).toBe(0);
    expect(st.beat).toBe(16);
    expect(st.status).toBe('won');
    expect(total).toBe(11); // papelitos por ficha y compás, como en el kit
  });
});

describe('Escenarios S1–S8 de la prueba en seco', () => {
  const caseA = { seats: [1, 3, 4, 5, 6, 7, 8, 9], E2: v(5, 3), C: v(5, 4), E1: v(5, 5), revealed: { O1: 'BULTO', O2: 'NADA', O3: 'BULTO', O4: 'NADA' } as const };
  const caseB = { seats: [1, 3, 5, 6, 7, 9], E2: v(4, 12), C: v(4, 13), E1: v(4, 14) };
  const cardsA = (): Record<number, Card> => ({ 1: 'O', 3: 'O', 4: 'O', 5: 'N', 6: 'O', 7: 'E', 8: 'E', 9: 'E' });
  const cardsB = (): Record<number, Card> => ({ 1: 'N', 3: 'N', 5: 'N', 6: 'N', 7: 'A', 9: 'A' });

  it('S1 · forcejeo, papelito O5→5', () => {
    const st = setup(caseA);
    expect(slips(st)).toEqual({ O5: [5] });
    const { report, state } = resolveBeat(st, cardsA());
    expect(report.outcome).toBe('forcejeo');
    expect(state.damage).toBe(0);
  });
  it('S2 · 6 juega N: giro limpio, revela O5 NADA', () => {
    const st = setup(caseA);
    const { report, state } = resolveBeat(st, { ...cardsA(), 6: 'N' });
    expect(report.motion.kind).toBe('giro');
    expect(report.revealed).toEqual([{ token: 'O5', cell: v(6, 4), content: 'NADA' }]);
    expect(sofaStr(state.sofa)).toBe('(6,4) · (5,4) · (4,4)');
    expect(state.damage).toBe(0);
  });
  it('S3 · 7 juega N: E2 inclinada en U1, avanza +1', () => {
    const st = setup(caseB);
    const { report, state } = resolveBeat(st, { ...cardsB(), 7: 'N' });
    expect(report.motion).toEqual({ kind: 'desplazamiento', dir: 'N' });
    expect(state.damage).toBe(1);
    expect(report.damage[0]).toMatchObject({ reason: 'inclinada', part: 'E2', toward: [7] });
  });
  it('S4 · 7 y 9 juegan N: tropiezo', () => {
    const st = setup(caseB);
    const { report, state } = resolveBeat(st, { ...cardsB(), 7: 'N', 9: 'N' });
    expect(report.outcome).toBe('tropiezo');
    expect(state.damage).toBe(1);
    expect(state.sofa).toEqual(st.sofa);
  });
  it('S5 · 6 alza: C inclinada, avanza +1', () => {
    const st = setup(caseB);
    const { report, state } = resolveBeat(st, { ...cardsB(), 6: 'A' });
    expect(report.parts.C.status).toBe('INCLINADA');
    expect(report.outcome).toBe('movimiento');
    expect(state.damage).toBe(1);
  });
  it('S6 · giro temprano: golpe por muro en el 3×3', () => {
    const st = setup({ seats: caseA.seats, E2: v(4, 3), C: v(4, 4), E1: v(4, 5), revealed: { O1: 'BULTO', O2: 'NADA' } });
    expect(slips(st)).toEqual({ O4: [7], O6: [6], O3: [3] });
    const { report, state } = resolveBeat(st, { 1: 'O', 3: 'O', 4: 'O', 5: 'N', 6: 'N', 7: 'E', 8: 'E', 9: 'E' });
    expect(report.outcome).toBe('golpe');
    expect(state.damage).toBe(1);
  });
  it('S7 · tablero B: E2 alzada entra en O1 NADA: +1', () => {
    const st = setup({ level: 'B', seats: caseA.seats, E2: v(4, 9), C: v(4, 10), E1: v(4, 11) });
    expect(slips(st)).toEqual({ O1: [9] });
    const { report, state } = resolveBeat(st, { 1: 'N', 3: 'N', 4: 'N', 5: 'N', 6: 'N', 7: 'A', 8: 'A', 9: 'A' });
    expect(report.revealed[0]).toMatchObject({ token: 'O1', content: 'NADA' });
    expect(report.damage).toEqual([{ reason: 'alzada-sin-bulto', part: 'E2' }]);
    expect(state.damage).toBe(1);
  });
  it('S8 · el 6 no pone carta (NADA): centro sin empuje, forcejeo', () => {
    const st = setup({ seats: caseA.seats, E2: v(4, 9), C: v(4, 10), E1: v(4, 11) });
    const { report } = resolveBeat(st, { 1: 'N', 3: 'N', 4: 'N', 5: 'N', 7: 'A', 8: 'A', 9: 'A' });
    expect(report.nada).toEqual([6]);
    expect(report.parts.C.push).toBeNull();
    expect(report.outcome).toBe('forcejeo');
  });
});

describe('Información privada (B5)', () => {
  it('cada asiento ve solo su casilla exterior y la orientación sigue al lado rojo tras girar', () => {
    let st = setup({ E2: v(5, 3), C: v(5, 4), E1: v(5, 5), revealed: { O3: 'BULTO', O4: 'NADA' } });
    expect(outerCell(st.sofa, 5)).toEqual(v(6, 4)); // C rojo mira al este
    expect(outerCell(st.sofa, 6)).toEqual(v(4, 4));
    expect(outerCell(st.sofa, 9)).toEqual(v(5, 2)); // punta E2
    st = resolveBeat(st, byPart(st, 'E', 'N', 'O')).state; // gira: E2 al este
    expect(st.sofa.red).toBe('S');
    expect(outerCell(st.sofa, 1)).toEqual(v(3, 4)); // punta E1 ve O6
    expect(slips(st)).toEqual({ O6: [1, 2] });
  });
  it('los asientos vacíos no reciben papelito', () => {
    const st = setup({ seats: [1, 5, 6, 9], E2: v(4, 9), C: v(4, 10), E1: v(4, 11) });
    expect(slips(st)).toEqual({ O1: [9] });
  });
});

describe('Daños y final (B12, B17)', () => {
  it('golpe contra muro en desplazamiento', () => {
    const st = setup({ E2: v(4, 13), C: v(4, 14), E1: v(4, 15) });
    const { report, state } = resolveBeat(st, byPart(st, 'E', 'E', 'E'));
    expect(report.outcome).toBe('golpe');
    expect(state.damage).toBe(1);
  });
  it('se pierde al llegar a 6 daños', () => {
    const st = setup({ E2: v(4, 13), C: v(4, 14), E1: v(4, 15), damage: 5 });
    const { state } = resolveBeat(st, byPart(st, 'E', 'E', 'E'));
    expect(state.status).toBe('lost-damage');
  });
  it('se pierde al terminar el compás 40 sin meta', () => {
    const st = setup({ E2: v(4, 13), C: v(4, 14), E1: v(4, 15), beat: MAX_BEATS - 1 });
    const { state } = resolveBeat(st, byPart(st, 'N', 'S', 'N'));
    expect(state.beat).toBe(40);
    expect(state.status).toBe('lost-beats');
  });
  it('no se puede jugar tras el final', () => {
    const st = { ...setup({ E2: v(4, 13), C: v(4, 14), E1: v(4, 15) }), status: 'won' as const };
    expect(() => resolveBeat(st, {})).toThrow();
  });
  it('B4: cada parte necesita al menos un jugador', () => {
    expect(() => newGame(LEVELS.A, [1, 2, 3, 4])).toThrow();
  });
});
