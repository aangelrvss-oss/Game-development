// Motor de reglas v3. Funciones puras: estado + cartas → nuevo estado + informe.
// Cada paso cita la regla B1–B17 que aplica.
import { isGoal, rawAt, type Level } from './levels';
import { SEATS, seatDef } from './seats';
import {
  DIR_NAME,
  DIRS,
  DV,
  OPP,
  PARTS,
  add,
  axisOf,
  dirOf,
  isSideways,
  key,
  rotCCW,
  rotCW,
  sub,
  type Card,
  type Dir,
  type PartId,
  type PartStatus,
  type Sofa,
  type TokenContent,
  type Vec,
} from './types';

export const MAX_DAMAGE = 6;
export const MAX_BEATS = 40;

export type EndState = 'playing' | 'won' | 'lost-damage' | 'lost-beats';

export interface GameState {
  level: Level;
  /** Asas ocupadas (B4). */
  seats: number[];
  sofa: Sofa;
  /** Fichas reveladas: id → contenido (B2). Las NADA se retiran, las BULTO quedan. */
  revealed: Record<string, TokenContent>;
  damage: number;
  /** Último compás jugado (0 antes del primero). */
  beat: number;
  status: EndState;
}

export function newGame(level: Level, seats: number[]): GameState {
  for (const p of PARTS) {
    if (!seats.some((s) => seatDef(s).part === p)) throw new Error(`B4: la parte ${p} necesita al menos un jugador`);
  }
  const { E1, C, E2, red } = level.start;
  return {
    level,
    seats: [...seats].sort((a, b) => a - b),
    sofa: { E1: { ...E1 }, C: { ...C }, E2: { ...E2 }, red },
    revealed: {},
    damage: 0,
    beat: 0,
    status: 'playing',
  };
}

// ---------- Casillas (B1, B2) ----------

export interface CellInfo {
  wall: boolean;
  goal: boolean;
  /** Bulto conocido por todos: visible (U) o ficha revelada BULTO. */
  bulto: boolean;
  /** Ficha oculta sin revelar en la casilla, si la hay. */
  hiddenToken: string | null;
  /** Id de la ficha en la casilla (revelada o no). */
  token: string | null;
}

export function cellInfo(st: GameState, v: Vec): CellInfo {
  const ch = rawAt(st.level, v);
  const token = /\d/.test(ch) ? `O${ch}` : null;
  const revealed = token ? st.revealed[token] : undefined;
  return {
    wall: ch === '#',
    goal: isGoal(st.level, v),
    bulto: ch === 'U' || revealed === 'BULTO',
    hiddenToken: token && !revealed ? token : null,
    token,
  };
}

/** Contenido real de una ficha (solo lo usa el motor al revelar y la visión privada). */
export function tokenContent(st: GameState, token: string): TokenContent {
  return st.level.contents[token];
}

// ---------- Visión (B5) ----------

/** Casilla exterior pegada al asa de un asiento. */
export function outerCell(sofa: Sofa, seat: number): Vec {
  const d = seatDef(seat);
  const p = sofa[d.part];
  if (d.handle.startsWith('punta')) return add(p, sub(p, sofa.C));
  const side = d.handle === 'rojo' ? sofa.red : OPP[sofa.red];
  return add(p, DV[side]);
}

export interface PrivateView {
  seat: number;
  cell: Vec;
  token: string;
  content: TokenContent;
}

/**
 * Lo que cada asiento ocupado ve en privado este compás: solo si su casilla exterior tiene
 * una ficha oculta sin revelar. La parte pública es «quién mira qué ficha»; el contenido es privado.
 */
export function privateViews(st: GameState): PrivateView[] {
  const out: PrivateView[] = [];
  for (const seat of st.seats) {
    const cell = outerCell(st.sofa, seat);
    const info = cellInfo(st, cell);
    if (info.hiddenToken) out.push({ seat, cell, token: info.hiddenToken, content: tokenContent(st, info.hiddenToken) });
  }
  return out;
}

// ---------- Resolución de un compás (B7–B17) ----------

export interface PartReport {
  part: PartId;
  seats: number[];
  cards: Card[];
  status: PartStatus;
  /** Dirección de empuje, o null si no empuja («dividida» o toda alzada). */
  push: Dir | null;
}

export type Motion =
  | { kind: 'desplazamiento'; dir: Dir }
  | { kind: 'giro'; e1: Dir; e2: Dir }
  | { kind: 'forcejeo' };

export type Outcome = 'forcejeo' | 'golpe' | 'tropiezo' | 'movimiento';

export interface DamageItem {
  reason: 'golpe' | 'tropiezo' | 'inclinada' | 'alzada-sin-bulto';
  part?: PartId;
  /** Asientos que no alzaron en una parte inclinada (hacia ese lado cae la carga, B16). */
  toward?: number[];
}

export interface Reveal {
  token: string;
  cell: Vec;
  content: TokenContent;
}

export interface BeatReport {
  beat: number;
  cards: Record<number, Card>;
  parts: Record<PartId, PartReport>;
  motion: Motion;
  outcome: Outcome;
  /** Casillas que causaron golpe. */
  hits: Vec[];
  revealed: Reveal[];
  /** Partes que tropezaron. */
  stumbles: PartId[];
  /** Partes que entran en una casilla (B14). */
  entering: PartId[];
  damage: DamageItem[];
  from: Sofa;
  to: Sofa;
  /** Asientos que jugaron NADA. */
  nada: number[];
  status: EndState;
  /** Narración paso a paso con referencia a la regla. */
  steps: string[];
}

function partReport(st: GameState, part: PartId, cards: Record<number, Card>): PartReport {
  const seats = st.seats.filter((s) => seatDef(s).part === part);
  const cs = seats.map((s) => cards[s] ?? null);
  const lifts = cs.filter((c) => c === 'A').length;
  // B7
  const status: PartStatus = lifts === cs.length ? 'ALZADA' : lifts === 0 ? 'PLANA' : 'INCLINADA';
  // B8: empuja hacia X si al menos uno no alzó y todos los que no alzaron jugaron X. NADA rompe el empuje.
  const nonLift = cs.filter((c): c is Dir | null => c !== 'A');
  let push: Dir | null = null;
  if (nonLift.length > 0) {
    const first = nonLift[0];
    if (first !== null && nonLift.every((c) => c === first)) push = first;
  }
  return { part, seats, cards: cs, status, push };
}

const cardName = (c: Card): string => (c === null ? 'NADA' : c === 'A' ? 'ALZAR' : DIR_NAME[c]);

export function resolveBeat(st: GameState, cardsIn: Record<number, Card>): { state: GameState; report: BeatReport } {
  if (st.status !== 'playing') throw new Error('La partida ya ha terminado');
  const beat = st.beat + 1;
  const cards: Record<number, Card> = {};
  for (const s of st.seats) cards[s] = cardsIn[s] ?? null;
  const steps: string[] = [];
  const parts = Object.fromEntries(PARTS.map((p) => [p, partReport(st, p, cards)])) as Record<PartId, PartReport>;

  steps.push(
    'B7–B8 · Estado y empuje: ' +
      PARTS.map((p) => {
        const r = parts[p];
        return `${p} ${r.status}${r.push ? `, empuja ${DIR_NAME[r.push]}` : r.status === 'ALZADA' ? ', no empuja' : ', dividida'}`;
      }).join(' · '),
  );

  const sofa = st.sofa;
  const pushes = PARTS.map((p) => parts[p].push);

  // B9: desplazamiento
  let motion: Motion = { kind: 'forcejeo' };
  for (const X of DIRS) {
    const n = pushes.filter((d) => d === X).length;
    if (n >= 2 && !pushes.includes(OPP[X])) {
      motion = { kind: 'desplazamiento', dir: X };
      break;
    }
  }
  if (motion.kind === 'desplazamiento') {
    steps.push(`B9 · Desplazamiento: dos o más partes empujan al ${DIR_NAME[motion.dir]} y ninguna al ${DIR_NAME[OPP[motion.dir]]}.`);
  } else {
    // B10: giro
    const e1 = parts.E1.push;
    const e2 = parts.E2.push;
    const centreSideways = parts.C.cards.some((c) => c !== null && c !== 'A' && isSideways(sofa, c));
    if (e1 && e2 && e1 === OPP[e2] && isSideways(sofa, e1) && !centreSideways) {
      motion = { kind: 'giro', e1, e2 };
      steps.push(`B10 · Giro: E1 empuja al ${DIR_NAME[e1]}, E2 al ${DIR_NAME[e2]}, de costado, y nadie del centro juega de costado.`);
    } else {
      const why =
        e1 && e2 && e1 === OPP[e2] && isSideways(sofa, e1) && centreSideways
          ? 'los extremos empujan de costado en sentidos contrarios, pero alguien del centro jugó de costado'
          : 'ninguna dirección tiene dos partes sin oposición y no se cumplen las condiciones de giro';
      steps.push(`B11 · Forcejeo: ${why}. Sin movimiento ni daño.`);
    }
  }

  const base: Omit<BeatReport, 'motion' | 'outcome' | 'hits' | 'revealed' | 'stumbles' | 'entering' | 'damage' | 'to' | 'status'> = {
    beat,
    cards,
    parts,
    from: sofa,
    nada: st.seats.filter((s) => cards[s] === null),
    steps,
  };

  const finish = (
    next: GameState,
    rest: Pick<BeatReport, 'outcome' | 'hits' | 'revealed' | 'stumbles' | 'entering' | 'damage'>,
  ): { state: GameState; report: BeatReport } => {
    next.beat = beat;
    next.status = endCheck(next);
    if (next.status === 'won') steps.push('B17 · ¡Las tres partes están en la meta! Victoria.');
    else if (next.status === 'lost-damage') steps.push(`B17 · ${next.damage} daños: derrota.`);
    else if (next.status === 'lost-beats') steps.push(`B17 · Compás ${MAX_BEATS} sin llegar a la meta: derrota.`);
    return { state: next, report: { ...base, motion, to: next.sofa, status: next.status, ...rest } };
  };

  if (motion.kind === 'forcejeo') {
    return finish({ ...st }, { outcome: 'forcejeo', hits: [], revealed: [], stumbles: [], entering: [], damage: [] });
  }

  // Destinos y partes que entran (B14)
  let dest: Sofa;
  let entering: PartId[];
  if (motion.kind === 'desplazamiento') {
    const d = DV[motion.dir];
    dest = { E1: add(sofa.E1, d), C: add(sofa.C, d), E2: add(sofa.E2, d), red: sofa.red };
    entering = ['E1', 'C', 'E2'];
  } else {
    const E1 = add(sofa.C, DV[motion.e1]);
    const E2 = add(sofa.C, DV[motion.e2]);
    const oldAxis = DV[axisOf(sofa)];
    const newAxis = sub(E2, sofa.C);
    const cw = rotCW(oldAxis);
    const rot = cw.x === newAxis.x && cw.y === newAxis.y ? rotCW : rotCCW;
    dest = { E1, C: { ...sofa.C }, E2, red: dirOf(rot(DV[sofa.red])) };
    entering = ['E1', 'E2'];
  }

  // B12: golpe
  let hits: Vec[];
  if (motion.kind === 'desplazamiento') {
    hits = entering.map((p) => dest[p]).filter((v) => cellInfo(st, v).wall);
  } else {
    hits = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const v = { x: sofa.C.x + dx, y: sofa.C.y + dy };
        if (cellInfo(st, v).wall) hits.push(v);
      }
  }
  if (hits.length > 0) {
    steps.push(
      motion.kind === 'giro'
        ? `B12 · Golpe: hay muro en el cuadrado 3×3 alrededor del centro (${hits.map(key).join(' ')}). No se mueve, +1 daño.`
        : `B12 · Golpe: el destino ${hits.map(key).join(' ')} es muro. No se mueve, +1 daño.`,
    );
    return finish(
      { ...st, damage: st.damage + 1 },
      { outcome: 'golpe', hits, revealed: [], stumbles: [], entering, damage: [{ reason: 'golpe' }] },
    );
  }

  // B13: revelar
  const revealed: Reveal[] = [];
  const rev = { ...st.revealed };
  for (const p of entering) {
    const info = cellInfo(st, dest[p]);
    if (info.hiddenToken && !rev[info.hiddenToken]) {
      const content = tokenContent(st, info.hiddenToken);
      rev[info.hiddenToken] = content;
      revealed.push({ token: info.hiddenToken, cell: dest[p], content });
    }
  }
  if (revealed.length) steps.push(`B13 · Se revela: ${revealed.map((r) => `${r.token} = ${r.content}`).join(', ')}.`);
  const after: GameState = { ...st, revealed: rev };

  // B15: tropiezo
  const stumbles = entering.filter((p) => parts[p].status === 'PLANA' && cellInfo(after, dest[p]).bulto);
  if (stumbles.length > 0) {
    steps.push(`B15 · Tropiezo: ${stumbles.join(' y ')} entra${stumbles.length > 1 ? 'n' : ''} PLANA en un bulto. No se mueve, +1 daño.`);
    return finish(
      { ...after, damage: st.damage + 1 },
      { outcome: 'tropiezo', hits: [], revealed, stumbles, entering, damage: [{ reason: 'tropiezo' }] },
    );
  }

  // B16: movimiento
  const damage: DamageItem[] = [];
  for (const p of entering) {
    const r = parts[p];
    const toward = r.seats.filter((s) => cards[s] !== 'A');
    if (r.status === 'INCLINADA') damage.push({ reason: 'inclinada', part: p, toward });
    else if (r.status === 'ALZADA' && !cellInfo(after, dest[p]).bulto) damage.push({ reason: 'alzada-sin-bulto', part: p });
  }
  steps.push(
    damage.length
      ? `B16 · Movimiento con ${damage.length} daño${damage.length > 1 ? 's' : ''}: ${damage
          .map((d) => (d.reason === 'inclinada' ? `${d.part} entra INCLINADA` : `${d.part} entra ALZADA sin bulto`))
          .join(', ')}.`
      : 'B16 · Movimiento limpio, sin daño.',
  );
  return finish(
    { ...after, sofa: dest, damage: st.damage + damage.length },
    { outcome: 'movimiento', hits: [], revealed, stumbles: [], entering, damage },
  );
}

/**
 * B17. Orden de comprobación: meta, después daños, después compás 40 (orden del paso «Fin»
 * del kit). Ver docs/AMBIGUEDADES.md para el caso de meta y sexto daño en el mismo compás.
 */
export function endCheck(st: GameState): EndState {
  const s = st.sofa;
  if ([s.E1, s.C, s.E2].every((v) => isGoal(st.level, v))) return 'won';
  if (st.damage >= MAX_DAMAGE) return 'lost-damage';
  if (st.beat >= MAX_BEATS) return 'lost-beats';
  return 'playing';
}

export const describeCard = cardName;
export const allSeatIds = SEATS.map((s) => s.id);
