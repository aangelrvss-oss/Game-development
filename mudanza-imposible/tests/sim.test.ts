// Pruebas del núcleo físico sin navegador: usan la misma simulación que el juego.
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { Autopilot } from '../src/sim/autopilot';
import { CARRIER, CENTER_Y } from '../src/sim/carrier';
import { Game, RULES } from '../src/sim/game';
import { HAND } from '../src/sim/hand';
import { DOOR, FLOOR2, STAGES, STAIRS } from '../src/sim/level';
import { SLOTS, SOFA, localToWorld, yawQuat } from '../src/sim/sofa';
import { LIGHT, lightAt, LIGHT_PERIOD } from '../src/sim/traffic';
import { NO_INPUT, type GameEvent, type PlayerInput } from '../src/sim/types';

const DT = 1 / 60;
beforeAll(async () => { await RAPIER.init(); });

function play(g: Game, seconds: number, input: (g: Game) => PlayerInput[] = () => []) {
  const events: GameEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) { g.step(DT, input(g)); events.push(...g.out); }
  return events;
}

/** Coloca el sofá y aparta a los porteadores (sin ayudantes que intervengan), sin cuenta atrás. */
function place(g: Game, x: number, z: number, yaw: number, y = 0.6) {
  g.bots.clear();
  g.phase = 'playing';
  g.countdown = 0;
  g.sofa.setTranslation({ x, y, z }, true);
  g.sofa.setRotation(yawQuat(yaw), true);
  g.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true);
  g.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
  for (const c of g.carriers) c.teleport({ x: x + 30, y: 0.7, z: z + 30 });
}

describe('Sofá y agarre', () => {
  it('el sofá en reposo no se mueve ni vibra', () => {
    const g = new Game(RAPIER, { humans: 0, carriers: 2, botStyle: 'atentos' });
    g.bots.clear();
    play(g, 2);
    const a = g.sofaPos;
    play(g, 3);
    const b = g.sofaPos;
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.02);
    expect(g.sofaUp).toBeGreaterThan(0.99);
    g.dispose();
  });

  it('los ayudantes agarran asas y, con el jugador, levantan y llevan el sofá', () => {
    const g = new Game(RAPIER, { humans: 1, carriers: 4, botStyle: 'atentos', seed: 3 });
    const ap = new Autopilot(0);
    play(g, 3 + 4, (g) => [ap.input(g, DT)]);
    expect(g.carriers.filter((c) => c.holding).length).toBe(4);
    expect(g.sofaPos.y).toBeGreaterThan(0.6); // en reposo el centro está a 0,2 m
    expect(g.sofaPos.z).toBeLessThan(8); // ha salido del patio hacia la calle
    g.dispose();
  });

  it('soltar deja caer el sofá: se agarra y se suelta con la misma tecla', () => {
    const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos' });
    place(g, 0, 10, 0);
    play(g, 1);
    const me = g.carriers[0];
    const a = localToWorld(g.sofa, SLOTS[0].p);
    me.teleport({ x: a.x + 0.7, y: 0.7, z: a.z });
    me.facing = { x: -1, z: 0 };
    play(g, 0.2);
    play(g, DT, () => [{ ...NO_INPUT, grab: true }]);
    expect(me.holding).toBe(true);
    play(g, 1.5);
    play(g, DT, () => [{ ...NO_INPUT, grab: true }]);
    expect(me.holding).toBe(false);
    g.dispose();
  });
});

describe('Puerta estrecha', () => {
  const pushThrough = (yaw: number) => {
    const g = new Game(RAPIER, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, 0, DOOR.z + 2.5, yaw, 0.3);
    play(g, 0.5);
    for (let i = 0; i < 60 * 5; i++) {
      // Empuje mayor que el rozamiento con el suelo (μ = 0,6), como si lo empujaran varios
      g.sofa.applyImpulse({ x: 0, y: 0, z: -g.sofa.mass() * 10 * DT }, true);
      g.step(DT, []);
    }
    const z = g.sofaPos.z;
    g.dispose();
    return z;
  };
  it('de lado no cabe: se queda en la fachada', () => {
    expect(pushThrough(0)).toBeGreaterThan(DOOR.z - 0.2);
  });
  it('de largo sí pasa', () => {
    expect(pushThrough(Math.PI / 2)).toBeLessThan(DOOR.z - 1.5);
  });
});

describe('Tráfico', () => {
  it('el semáforo da paso a los peatones solo tras ámbar y rojo total', () => {
    expect(lightAt(1).ped).toBe('red');
    expect(lightAt(LIGHT.cars + 0.5).cars).toBe('yellow');
    expect(lightAt(LIGHT.cars + LIGHT.yellow + 0.5)).toMatchObject({ cars: 'red', ped: 'red' });
    expect(lightAt(LIGHT_PERIOD - 1)).toMatchObject({ cars: 'red', ped: 'green' });
  });

  it('un coche que encuentra el sofá en su carril lo golpea, lo daña y lo desplaza', () => {
    const g = new Game(RAPIER, { humans: 0, carriers: 1, botStyle: 'atentos' });
    // Sofá en mitad del carril que va hacia +x, con el semáforo en verde para los coches
    g.clock = 0;
    place(g, 8, -1.6, 0, 0.3);
    const x0 = g.sofaPos.x;
    const ev = play(g, 8);
    expect(ev.some((e) => e.type === 'carHit' && e.target === 'sofa')).toBe(true);
    expect(ev.some((e) => e.type === 'honk')).toBe(true);
    expect(g.integrity).toBeLessThanOrEqual(100 - RULES.carDamage);
    expect(Math.abs(g.sofaPos.x - x0)).toBeGreaterThan(1);
    g.dispose();
  });

  it('un porteador atropellado queda mareado y suelta lo que lleva', () => {
    const g = new Game(RAPIER, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, 0, 10, 0);
    const c = g.carriers[0];
    c.teleport({ x: 8, y: 0.7, z: -1.6 });
    const ev = play(g, 6);
    expect(ev.some((e) => e.type === 'stun' && e.carrier === 0)).toBe(true);
    g.dispose();
  });
});

describe('Recuperación', () => {
  it('un sofá volcado se puede enderezar', () => {
    const g = new Game(RAPIER, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, 0, 10, 0);
    g.sofa.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true); // boca abajo
    play(g, 1.5);
    expect(g.sofaUp).toBeLessThan(0);
    expect(g.tryRight()).toBe(true);
    play(g, 2);
    expect(g.sofaUp).toBeGreaterThan(0.95);
    g.dispose();
  });

  it('si el sofá cae fuera del mapa reaparece en el último punto, con penalización', () => {
    const g = new Game(RAPIER, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, 0, 10, 0);
    g.sofa.setTranslation({ x: 0, y: -10, z: 10 }, true);
    const ev = play(g, 0.1);
    expect(ev.some((e) => e.type === 'respawnSofa')).toBe(true);
    expect(g.sofaPos.y).toBeGreaterThan(0);
    expect(g.integrity).toBe(100 - RULES.respawnCost);
    g.dispose();
  });

  it('un porteador que se pierde lejos vuelve junto al sofá', () => {
    const g = new Game(RAPIER, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, 0, 10, 0);
    g.carriers[0].teleport({ x: 0, y: -8, z: 10 });
    play(g, 0.1);
    const p = g.carriers[0].pos;
    expect(p.y).toBeGreaterThan(0);
    expect(Math.hypot(p.x - g.sofaPos.x, p.z - g.sofaPos.z)).toBeLessThan(4);
    g.dispose();
  });
});

describe('Partida completa', () => {
  it.each([
    [2, 'atentos', 1],
    [4, 'atentos', 3],
    [4, 'despistados', 2],
  ] as const)('el piloto automático entrega el sofá con %i porteadores (%s)', (n, style, seed) => {
    const g = new Game(RAPIER, { humans: 1, carriers: n, botStyle: style, seed });
    const ap = new Autopilot(0);
    const stages: number[] = [];
    for (let i = 0; i < 60 * (RULES.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(DT, [ap.input(g, DT)]);
      for (const e of g.out) if (e.type === 'stage') stages.push(e.index);
    }
    expect(g.phase).toBe('won');
    expect(stages).toEqual(STAGES.map((_, i) => i).slice(1));
    expect(g.time).toBeLessThan(RULES.timeLimit);
    g.dispose();
  });

  it('se pierde al agotar el tiempo', () => {
    const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos' });
    g.phase = 'playing';
    g.time = RULES.timeLimit - 0.05;
    const ev = play(g, 0.2);
    expect(g.phase).toBe('lost');
    expect(ev).toContainEqual({ type: 'lose', reason: 'time' });
  });

  it('las constantes de control son coherentes', () => {
    expect(CARRIER.carrySpeed).toBeLessThan(CARRIER.walkSpeed);
    expect(CARRIER.gripBreak).toBeGreaterThan(0.3);
  });
});

describe('Datos del nivel', () => {
  it('todas las cajas tienen semiextensiones positivas', async () => {
    const { LEVEL } = await import('../src/sim/level');
    for (const b of LEVEL) for (const h of b.h) expect(h).toBeGreaterThan(0);
  });
});

describe('Rampa', () => {
  it('un sofá soltado en la rampa de chapa resbala hacia abajo', async () => {
    const { RAMP, FLOOR2 } = await import('../src/sim/level');
    const g = new Game(RAPIER, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, RAMP.x0 + 2, (RAMP.z0 + RAMP.z1) / 2, 0, FLOOR2 + 0.2);
    play(g, 0.3);
    const x0 = g.sofaPos.x;
    play(g, 3);
    expect(g.sofaPos.x - x0).toBeGreaterThan(2.5);
    g.dispose();
  });
});

describe('Dos jugadores sin ayudantes', () => {
  const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
  /** Partida a dos, ya en juego, con los dos frente a los extremos del sofá. */
  function duo() {
    const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    play(g, RULES.countdown + 0.2, () => [NO_INPUT, NO_INPUT]);
    return g;
  }
  const moved = (g: Game, s: { x: number; z: number }) => Math.hypot(g.sofaPos.x - s.x, g.sofaPos.z - s.z);

  it('uno solo apenas arrastra el sofá; entre los dos lo llevan más del doble de lejos', () => {
    const dist = (both: boolean) => {
      const g = duo();
      g.step(DT, [inp({ grab: true }), inp({ grab: both })]);
      const s0 = g.sofaPos;
      play(g, 3, () => [inp({ mz: -1 }), inp({ mz: both ? -1 : 0 })]);
      const d = moved(g, s0);
      g.dispose();
      return d;
    };
    const solo = dist(false), both = dist(true);
    expect(solo).toBeLessThan(3.2);
    expect(both).toBeGreaterThan(2 * solo);
  });

  it('empujar el sofá con el cuerpo, sin agarrarlo, no sirve para llevarlo solo', () => {
    // Regresión: el límite de fuerza solo se aplicaba al agarrar, y uno solo empujando lo llevaba 14 m en 3 s
    const g = duo();
    g.carriers[1].teleport({ x: -6, y: 0.7, z: 14 });
    g.carriers[0].teleport({ x: 0, y: 0.7, z: 11.2 });
    play(g, 1.5, () => [inp({ mz: -1 }), NO_INPUT]); // el choque inicial puede moverlo algo
    const s0 = g.sofaPos;
    play(g, 4, (g) => [inp({ mz: -1, mx: Math.max(-1, Math.min(1, (g.sofaPos.x - g.carriers[0].pos.x) * 2)) }), NO_INPUT]);
    expect(moved(g, s0)).toBeLessThan(0.5);
    g.dispose();
  });

  it('agarrando, girando y llevando el sofá, el cuerpo de los porteadores no lo atraviesa', () => {
    // Regresión: el agarre desactivaba el choque cuerpo-sofá y, al girarlo, el sofá se metía 0,5–0,6 m en ellos
    const depth = (g: Game) => {
      let worst = 0;
      for (const c of g.carriers) for (const s of g.sofaColliders) {
        const k = c.collider.contactCollider(s, 0);
        if (k && k.distance < 0) worst = Math.max(worst, -k.distance);
      }
      return worst;
    };
    const cases: [string, (g: Game, t: number) => PlayerInput[]][] = [
      ['giro', () => [inp({ mz: -1 }), inp({ mz: 1 })]],
      // (Antes con Mayús para alzar; ahora la mano sube sola a la altura de carga al agarrar)
      ['uno empuja hacia el sofá y el otro de lado', () => [inp({ mx: -1 }), inp({ mz: 1 })]],
      ['llevarlo en alto zigzagueando', (_g, t) => [inp({ mz: -1, mx: Math.sin(t * 2) }), inp({ mz: -1, mx: -Math.sin(t * 2) })]],
    ];
    for (const [, f] of cases) {
      const g = duo();
      g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
      let worst = 0;
      for (let i = 0; i < 180; i++) { g.step(DT, f(g, i * DT)); worst = Math.max(worst, depth(g)); }
      expect(worst).toBeLessThan(0.03);
      g.dispose();
    }
  });

  it('tirar en sentidos opuestos hace girar o estira el agarre, sin explotar la física', () => {
    const g = duo();
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    const yaw0 = g.sofaYaw;
    play(g, 2, () => [inp({ mz: -1 }), inp({ mz: 1 })]);
    expect(Math.abs(g.sofaYaw - yaw0)).toBeGreaterThan(0.5);
    const v = g.sofa.linvel();
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(6);
    g.dispose();
  });

  it('soltar mientras se tira con fuerza: se tambalea, cae, y al rato vuelve a poder agarrar', () => {
    const g = duo();
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    play(g, 1.5, () => [inp({ mx: 1 }), inp({ mx: -1 })]);
    const ev = play(g, 1, (g) => [inp({ mx: 1 }), inp({ mx: -1, grab: g.carriers[1].holding })]);
    const types = ev.filter((e) => 'carrier' in e && e.carrier === 1).map((e) => e.type);
    expect(types).toContain('wobble');
    expect(types).toContain('fall');
    const j2 = g.carriers[1];
    expect(j2.stunned).toBeGreaterThan(0);
    expect(j2.knock).toBe('balance');
    play(g, CARRIER.fallTime + 0.2, () => [NO_INPUT, NO_INPUT]);
    expect(j2.stunned).toBe(0);
    expect(j2.wobbling).toBe(false);
    g.dispose();
  });

  it('llevar el sofá juntos no hace perder el equilibrio a nadie', () => {
    const g = duo();
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    const ev = play(g, 4, () => [inp({ mz: -1 }), inp({ mz: -1 })]);
    expect(ev.filter((e) => e.type === 'wobble' || e.type === 'fall')).toEqual([]);
    g.dispose();
  });

  it('agarrar el sofá llegando a la carrera no hace tambalearse', () => {
    const g = duo();
    // Se alejan y vuelven corriendo hacia su extremo; agarran sin frenar
    g.carriers[0].teleport({ x: 5.5, y: 0.7, z: 10 });
    g.carriers[1].teleport({ x: -5.5, y: 0.7, z: 10 });
    const ev = play(g, 2.5, (g) => g.carriers.map((c, i) => inp({ mx: c.holding ? 0 : i ? 1 : -1, grab: !c.holding && Math.abs(c.pos.x) < 2.3 })));
    expect(g.carriers.every((c) => c.holding)).toBe(true);
    expect(ev.filter((e) => e.type === 'wobble' || e.type === 'fall')).toEqual([]);
    g.dispose();
  });

  it('chocar a la carrera con el compañero desequilibra a los dos; chocar con una pared, no', () => {
    const g = duo();
    g.carriers[0].teleport({ x: 0, y: 0.7, z: 14 });
    g.carriers[1].teleport({ x: 4, y: 0.7, z: 14 });
    const ev = play(g, 1.5, () => [NO_INPUT, inp({ mx: -1 })]);
    expect(ev.filter((e) => e.type === 'wobble').map((e) => (e as { carrier: number }).carrier).sort()).toEqual([0, 1]);
    const g2 = duo();
    const ev2 = play(g2, 4, () => [inp({ mx: 1 }), NO_INPUT]);
    expect(ev2.filter((e) => e.type === 'wobble' || e.type === 'fall')).toEqual([]);
    g.dispose(); g2.dispose();
  });

  it('dos jugadores (llevados por el piloto automático) completan el recorrido', () => {
    const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    const aps = [new Autopilot(0), new Autopilot(1)];
    const stages: number[] = [];
    for (let i = 0; i < 60 * (RULES.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(DT, aps.map((a) => a.input(g, DT)));
      for (const e of g.out) if (e.type === 'stage') stages.push(e.index);
    }
    expect(g.phase).toBe('won');
    expect(stages).toEqual(STAGES.map((_, i) => i).slice(1));
    g.dispose();
  });
});

describe('Mano blanda y física única (ciclo 1)', () => {
  const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
  /** Descampado sin nada alrededor (lejos de la calle, de la casa y de los objetos de decoración). */
  const OPEN = { x: -35, z: 25 };
  const standY = CENTER_Y + 0.05;

  /** Partida ya en juego con n humanos, el sofá en (x, z) con giro yaw y los porteadores apartados. */
  function setup(n: number, x = OPEN.x, z = OPEN.z, yaw = 0) {
    const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
    g.phase = 'playing';
    g.countdown = 0;
    g.sofa.setTranslation({ x, y: 0.25, z }, true);
    g.sofa.setRotation(yawQuat(yaw), true);
    // Aparcados en el descampado: junto a la escalera, (x + 5, z + 6) caía dentro de la fachada y del bloque del
    // edificio, y al salir despedidos de la pared quedaban derribados y sin poder agarrar
    g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
    play(g, 0.5);
    return g;
  }
  /** Pone al porteador i frente al extremo ±x (local) del sofá, mirándolo. */
  function atEnd(g: Game, i: number, side: 1 | -1) {
    const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 });
    const o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
    const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
    c.teleport({ x: o.x, y: standY, z: o.z });
    c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  }
  /** Altura de la base del sofá en sus extremos ±x (punto más bajo de cada extremo). */
  const endBase = (g: Game, side: 1 | -1) =>
    Math.min(...[-1, 1].map((sz) => localToWorld(g.sofa, { x: side * SOFA.half.x, y: -SOFA.half.y, z: sz * SOFA.half.z }).y));
  const base = (g: Game) => Math.min(endBase(g, 1), endBase(g, -1));
  const count = (ev: GameEvent[], t: GameEvent['type']) => ev.filter((e) => e.type === t).length;

  /** Agarran uno o los dos extremos, 0,5 s para que suban las manos y 3 s andando a lo largo del sofá (-x). */
  function flat(both: boolean) {
    const g = setup(2);
    atEnd(g, 0, -1); atEnd(g, 1, 1);
    if (!both) g.carriers[1].teleport({ x: OPEN.x, y: standY, z: OPEN.z + 7 });
    play(g, 0.3);
    g.step(DT, [inp({ grab: true }), inp({ grab: both })]);
    play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
    const s0 = g.sofaPos;
    let minBase = Infinity, freeEnd = -Infinity;
    const ev = play(g, 3, (g) => {
      minBase = Math.min(minBase, base(g));
      freeEnd = Math.max(freeEnd, endBase(g, 1));
      return [inp({ mx: -1 }), inp({ mx: both ? -1 : 0 })];
    });
    const r = { d: Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z), minBase, freeEnd, heldEnd: endBase(g, -1), ev, holding: g.carriers.map((c) => c.holding) };
    g.dispose();
    return r;
  }

  // Arrastre a lo largo del sofá, alejándose de él. Tirando de lado, el sofá pivota sobre el extremo que queda en el
  // suelo, que cuesta mucho menos: el centro avanza hasta 1,74 m en 3 s (ver scripts/grip-measure.ts); esa
  // dirección no cumple el límite de 1,5 m de T-grip-2 y no se comprueba aquí.
  it('T-grip-2/3 en llano: uno solo levanta un extremo y lo arrastra despacio; entre dos lo llevan en el aire', () => {
    const solo = flat(false), duo = flat(true);
    // Uno solo: un extremo en alto, el otro por el suelo, y avanza despacio sin soltarse
    expect(solo.d).toBeGreaterThan(0.3);
    expect(solo.d).toBeLessThan(1.5);
    expect(solo.heldEnd).toBeGreaterThan(0.1);
    expect(solo.freeEnd).toBeLessThan(0.05);
    expect(solo.holding[0]).toBe(true);
    expect(count(solo.ev, 'gripBreak')).toBe(0);
    // Entre dos: la base del sofá no toca el suelo mientras andan, y llegan más de 2,5 veces más lejos
    expect(duo.minBase).toBeGreaterThan(0.1);
    expect(duo.d).toBeGreaterThan(2.5 * solo.d);
    expect(duo.holding).toEqual([true, true]);
  });

  /** Sofá a lo largo al pie de la escalera; agarran uno (delante o detrás) o los dos y empujan hacia arriba. */
  function stairs(who: 'dos' | 'delante' | 'detrás', limit: number) {
    const g = setup(2, 0, STAIRS.z0 + 2.2, Math.PI / 2);
    atEnd(g, 0, 1); atEnd(g, 1, -1); // con este giro, el extremo +x mira hacia la escalera
    if (who === 'delante') g.carriers[1].teleport({ x: 0, y: standY, z: -16 });
    if (who === 'detrás') g.carriers[0].teleport({ x: 0, y: standY, z: -16 });
    play(g, 0.3);
    g.step(DT, [inp({ grab: who !== 'detrás' }), inp({ grab: who !== 'delante' })]);
    play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
    let t = 0, up = -1;
    // Ninguna tecla de alzar: solo andar hacia arriba
    for (let i = 0; i < limit * 60 && up < 0; i++) {
      g.step(DT, [inp({ mz: -1 }), inp({ mz: -1 })]);
      t += DT;
      if (g.sofaPos.z < STAIRS.z1 && g.sofaPos.y > FLOOR2 + 0.15) up = t;
    }
    g.dispose();
    return up;
  }

  it('T-grip-2/3 en la escalera: uno solo no la sube en 20 s; entre dos, en menos de 8 s y sin tecla de alzar', () => {
    expect(stairs('delante', 20)).toBe(-1);
    expect(stairs('detrás', 20)).toBe(-1);
    const t = stairs('dos', 8);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(8);
  });

  /** Caja de masa m creada aquí y registrada con la API genérica de agarre (nada específico del sofá). */
  function box(g: Game, m: number, at = OPEN) {
    const h = 0.25;
    const body = g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, h + 0.01, at.z).setCcdEnabled(true));
    const col = g.world.createCollider(RAPIER.ColliderDesc.cuboid(h, h, h).setDensity(m / (8 * h * h * h)).setFriction(0.6), body);
    g.addGrabbable(body, [col]);
    return { body, h };
  }

  it('T-grip-4: una caja de 10 kg la lleva una sola persona levantada a más del 70 % de su velocidad de carga', () => {
    const g = setup(1, OPEN.x - 10, OPEN.z - 10);
    const { body, h } = box(g, 10);
    const me = g.carriers[0];
    me.teleport({ x: OPEN.x + h + 0.7, y: standY, z: OPEN.z });
    me.facing = { x: -1, z: 0 };
    play(g, 0.3);
    g.step(DT, [inp({ grab: true })]); // el mismo agarrar que el sofá
    expect(me.heldBody).toBe(body);
    play(g, 0.5);
    let low = Infinity, p0 = body.translation();
    for (let i = 0; i < 4 * 60; i++) {
      if (i === 2 * 60) p0 = body.translation();
      g.step(DT, [inp({ mz: -1 })]);
      low = Math.min(low, body.translation().y - h);
    }
    const p1 = body.translation();
    const speed = Math.hypot(p1.x - p0.x, p1.z - p0.z) / 2; // media de los segundos 2 a 4
    expect(me.heldBody).toBe(body);
    expect(low).toBeGreaterThan(0.1);
    expect(speed).toBeGreaterThan(0.7 * CARRIER.carrySpeed);
    g.dispose();
  });

  it('la mano blanda es estable con objetos de 10 a 250 kg (quietos y andando, con una y dos personas)', () => {
    for (const m of [10, 25, 50, 90, 150, 250]) for (const n of [1, 2]) {
      const g = setup(n, OPEN.x - 10, OPEN.z - 10);
      const { body, h } = box(g, m);
      g.carriers[0].teleport({ x: OPEN.x + h + 0.7, y: standY, z: OPEN.z }); g.carriers[0].facing = { x: -1, z: 0 };
      if (n === 2) { g.carriers[1].teleport({ x: OPEN.x - h - 0.7, y: standY, z: OPEN.z }); g.carriers[1].facing = { x: 1, z: 0 }; }
      play(g, 0.3);
      g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
      play(g, 2.5);
      let mv = 0, mw = 0;
      play(g, 1, () => {
        const v = body.linvel(), w = body.angvel();
        mv = Math.max(mv, Math.hypot(v.x, v.y, v.z)); mw = Math.max(mw, Math.hypot(w.x, w.y, w.z));
        return [];
      });
      // Quietos: sin temblores (la velocidad residual es la de la gravedad en un paso)
      expect(mv, `${m} kg, ${n}`).toBeLessThan(0.2);
      expect(mw, `${m} kg, ${n}`).toBeLessThan(0.3);
      play(g, 2, () => [inp({ mz: -1 }), inp({ mz: -1 })]);
      const p = body.translation(), v = body.linvel();
      expect(Number.isFinite(p.x + p.y + p.z), `${m} kg, ${n}`).toBe(true);
      expect(Math.hypot(v.x, v.y, v.z), `${m} kg, ${n}`).toBeLessThan(CARRIER.carrySpeed + 1);
      expect(g.carriers.slice(0, n).every((c) => c.heldBody === body), `${m} kg, ${n}`).toBe(true);
      g.dispose();
    }
  });

  /**
   * n humanos agarran el sofá desde sus posiciones de salida (layout 0) o desde posiciones variadas alrededor
   * (layout > 0: pseudoaleatorias, deterministas) y luego se quedan quietos, andan a lo largo, de lado o giran.
   */
  function coop(n: number, layout: number, mode: 'quietos' | 'largo' | 'lado' | 'girando') {
    const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
    play(g, RULES.countdown + 0.2);
    // El grupo, tal como sale, a un descampado (en el patio, andando de lado acabarían en la calzada)
    const s0 = g.sofaPos;
    for (const c of g.carriers) {
      const p = c.pos, f = { ...c.facing };
      c.teleport({ x: p.x - s0.x + OPEN.x, y: p.y, z: p.z - s0.z + OPEN.z });
      c.facing = f;
    }
    g.sofa.setTranslation({ x: OPEN.x, y: s0.y, z: OPEN.z }, true);
    if (layout > 0) {
      let a = layout * 7919 + 17;
      const rnd = () => ((a = (a * 16807) % 2147483647), a / 2147483647);
      const used: { x: number; z: number }[] = [];
      for (const c of g.carriers) {
        for (let k = 0; k < 100; k++) {
          // Un punto alrededor del sofá: frente a un extremo o frente a un costado, a 0,75 m
          const end = rnd() < 0.4, sgn = rnd() < 0.5 ? -1 : 1;
          const along = (rnd() * 2 - 1) * (end ? SOFA.half.z : SOFA.half.x);
          const lp = end ? { x: sgn * (SOFA.half.x + 0.75), z: along } : { x: along, z: sgn * (SOFA.half.z + 0.75) };
          const w = localToWorld(g.sofa, { x: lp.x, y: 0, z: lp.z });
          if (used.some((u) => Math.hypot(u.x - w.x, u.z - w.z) < 0.8)) continue;
          used.push(w);
          const t = localToWorld(g.sofa, { x: end ? sgn * SOFA.half.x : along, y: 0, z: end ? along : sgn * SOFA.half.z });
          const l = Math.hypot(t.x - w.x, t.z - w.z);
          c.teleport({ x: w.x, y: standY, z: w.z });
          c.facing = { x: (t.x - w.x) / l, z: (t.z - w.z) / l };
          break;
        }
      }
      play(g, 0.3);
    } else {
      // Desde la salida: se acercan un poco a su asa
      play(g, 0.4, (g) => g.carriers.map((c) => inp({ mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
    }
    g.step(DT, g.carriers.map(() => inp({ grab: true })));
    const grabbed = g.carriers.every((c) => c.holding);
    const yaw0 = g.sofaYaw;
    let minUp = 1;
    const m = mode === 'largo' ? inp({ mx: -1 }) : mode === 'lado' ? inp({ mz: -1 }) : mode === 'girando' ? inp({ turn: 1 }) : NO_INPUT;
    const ev = play(g, 4, (g) => { minUp = Math.min(minUp, g.sofaUp); return g.carriers.map(() => (g.time > 0.5 ? m : NO_INPUT)); });
    let turned = g.sofaYaw - yaw0;
    turned = Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned)));
    const r = { grabbed, minUp, falls: count(ev, 'fall'), lost: count(ev, 'gripBreak') + count(ev, 'release'), integrity: g.integrity, holding: g.carriers.every((c) => c.holding), turned };
    g.dispose();
    return r;
  }

  it.each([3, 4])('T-coop: con %i humanos agarrando, quietos, andando a lo largo, de lado y girando, el sofá no vuelca ni se rompe y nadie se cae ni se suelta', (n) => {
    for (let layout = 0; layout < 8; layout++) for (const mode of ['quietos', 'largo', 'lado', 'girando'] as const) {
      const r = coop(n, layout, mode), at = `${n} humanos, posiciones ${layout || 'de salida'}, ${mode}`;
      expect(r.grabbed, at).toBe(true);
      expect(r.minUp, at).toBeGreaterThanOrEqual(0.7);
      expect(r.falls, at).toBe(0);
      expect(r.integrity, at).toBe(100);
      expect(r.lost, at).toBe(0);
      expect(r.holding, at).toBe(true);
      if (mode === 'girando') expect(r.turned, at).toBeGreaterThan(0.5);
    }
  });

  it('T-auto-lift: al agarrar, la mano sube sola a la altura de carga y el aviso «Pesa mucho» sale solo con uno arrastrando algo pesado', () => {
    // Uno solo con el sofá: la mano sube sola (no hay tecla de alzar) y, al intentar llevarlo, sale el aviso
    const g = setup(2);
    atEnd(g, 0, -1);
    play(g, 0.3);
    const y0 = g.carriers[0].pos.y;
    g.step(DT, [inp({ grab: true }), NO_INPUT]);
    const me = g.carriers[0], grab0 = me.grabWorld()!.y;
    play(g, 0.6, () => [NO_INPUT, NO_INPUT]);
    expect(me.anchorCur.y).toBeCloseTo(me.handAnchor().y, 1);
    expect(me.grabWorld()!.y - grab0).toBeGreaterThan(0.2);
    expect(me.pos.y).toBeCloseTo(y0, 1);
    expect(g.heavyAlone).toBe(null); // quieto: aún no arrastra
    play(g, 1.5, () => [inp({ mx: -1 }), NO_INPUT]);
    expect(g.heavyAlone).toBe(me);
    // Llega el compañero y agarra el otro extremo: el aviso se va
    atEnd(g, 1, 1);
    play(g, 0.2, () => [inp({ mx: -1 }), NO_INPUT]);
    g.step(DT, [inp({ mx: -1 }), inp({ grab: true })]);
    play(g, 1.5, () => [inp({ mx: -1 }), inp({ mx: -1 })]);
    expect(g.carriers[1].holding).toBe(true);
    expect(g.heavyAlone).toBe(null);
    g.dispose();
    // Una caja ligera, uno solo: sin aviso
    const g2 = setup(1, OPEN.x - 10, OPEN.z - 10);
    box(g2, 10);
    g2.carriers[0].teleport({ x: OPEN.x + 0.95, y: standY, z: OPEN.z }); g2.carriers[0].facing = { x: -1, z: 0 };
    play(g2, 0.3);
    g2.step(DT, [inp({ grab: true })]);
    play(g2, 2, () => [inp({ mz: -1 })]);
    expect(g2.carriers[0].holding).toBe(true);
    expect(g2.heavyAlone).toBe(null);
    g2.dispose();
    expect(HAND.maxV).toBeLessThan(SOFA.mass * 9.81); // el sofá pesa más de lo que sostiene una persona
  });

  it('T-phys-unify: con ayudantes la física es la misma (mismo sofá, misma fuerza y mismo equilibrio)', () => {
    // Uno solo arrastrando el sofá: igual en una partida con ayudantes que en una solo de humanos
    const drag = (humans: number, carriers: number) => {
      const g = new Game(RAPIER, { humans, carriers, botStyle: 'atentos', seed: 1 });
      g.bots.clear();
      g.phase = 'playing'; g.countdown = 0;
      g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
      g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
      play(g, 0.5);
      atEnd(g, 0, -1);
      play(g, 0.3);
      g.step(DT, [inp({ grab: true })]);
      play(g, 0.5);
      const s0 = g.sofaPos;
      play(g, 3, () => [inp({ mx: -1 })]);
      const r = { d: Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z), mass: g.sofa.mass(), friction: g.sofaColliders[0].friction() };
      g.dispose();
      return r;
    };
    const coopDrag = drag(2, 2), helperDrag = drag(1, 4);
    expect(helperDrag.mass).toBeCloseTo(coopDrag.mass, 3);
    expect(helperDrag.friction).toBe(coopDrag.friction);
    expect(helperDrag.d).toBeCloseTo(coopDrag.d, 2);
    // Un ayudante también pierde el equilibrio si le arrollan a la carrera
    const g = new Game(RAPIER, { humans: 1, carriers: 2, botStyle: 'atentos', seed: 1 });
    g.bots.clear();
    g.phase = 'playing'; g.countdown = 0;
    g.carriers[0].teleport({ x: OPEN.x + 4, y: standY, z: OPEN.z });
    g.carriers[1].teleport({ x: OPEN.x, y: standY, z: OPEN.z });
    const ev = play(g, 1.5, () => [inp({ mx: -1 })]);
    expect(ev.some((e) => e.type === 'wobble' && e.carrier === 1)).toBe(true);
    g.dispose();
  });
});
