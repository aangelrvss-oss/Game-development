// Pruebas del núcleo físico sin navegador: usan la misma simulación que el juego.
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { Autopilot } from '../src/sim/autopilot';
import { CARRIER } from '../src/sim/carrier';
import { Game, RULES, isCoop } from '../src/sim/game';
import { DOOR, STAGES } from '../src/sim/level';
import { SLOTS, localToWorld, yawQuat } from '../src/sim/sofa';
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

describe('Dos jugadores sin ayudantes (física cooperativa)', () => {
  const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
  /** Partida a dos, ya en juego, con los dos frente a los extremos del sofá. */
  function duo() {
    const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    play(g, RULES.countdown + 0.2, () => [NO_INPUT, NO_INPUT]);
    return g;
  }
  const moved = (g: Game, s: { x: number; z: number }) => Math.hypot(g.sofaPos.x - s.x, g.sofaPos.z - s.z);

  it('es cooperativa solo cuando todos los porteadores son humanos', () => {
    expect(isCoop({ humans: 2, carriers: 2, botStyle: 'atentos' })).toBe(true);
    expect(isCoop({ humans: 2, carriers: 4, botStyle: 'atentos' })).toBe(false);
    expect(isCoop({ humans: 1, carriers: 4, botStyle: 'atentos' })).toBe(false);
  });

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
    const ev = play(g, 4, (g) => [inp({ mz: -1, lift: g.time > 2 }), inp({ mz: -1, lift: g.time > 2 })]);
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

  it('sin alzar no se sube la escalera, pero la interfaz lo avisa y alzando se sube', () => {
    // Regresión: con la física cooperativa la pareja se quedaba atascada al pie de la escalera si no alzaba
    // (Mayús), y el aviso de atasco recomendaba girar el sofá
    const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    const aps = [new Autopilot(0), new Autopilot(1)];
    let warned = 0, lift = false;
    for (let i = 0; i < 60 * 120 && g.stage < STAGES.findIndex((s) => s.label === 'Arriba'); i++) {
      if (g.needsLiftAtStairs) warned += DT;
      // Sin alzar hasta llevar 4 s avisados; después, alzan (lo que pide el aviso)
      if (warned > 4) lift = true;
      g.step(DT, aps.map((a) => ({ ...a.input(g, DT), lift: lift && g.sofaPos.z < -15 })));
    }
    expect(warned).toBeGreaterThan(4);
    expect(lift).toBe(true);
    expect(g.stageLabel).toBe('Arriba');
    g.dispose();
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
