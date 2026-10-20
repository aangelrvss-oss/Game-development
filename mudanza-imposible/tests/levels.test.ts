// Pruebas de los niveles como datos (T-level-1 y T-level-2), del camión con caja de carga (T-truck) y de la entrega con
// progreso (T-deliver), sin navegador: la misma simulación que el juego.
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import mainSrc from '../src/main.ts?raw';
import { Sfx, type SfxName } from '../src/audio/sfx';
import { LEVELS, levelFromParam } from '../src/levels';
import { CALLE } from '../src/levels/calle';
import { PATIO } from '../src/levels/patio';
import { cargoHold, TRUCK, truckBoxes } from '../src/levels/truck';
import type { LevelDef } from '../src/levels/types';
import { Autopilot } from '../src/sim/autopilot';
import { CENTER_Y } from '../src/sim/carrier';
import { Game, RULES } from '../src/sim/game';
import { ITEMS, restHeight, type Item, type ItemId } from '../src/sim/items';
import { localToWorld, rotate, SLOTS, yawQuat } from '../src/sim/sofa';
import { NO_INPUT, type GameEvent, type PlayerInput, type Vec3 } from '../src/sim/types';
import { loadList, STATE_LABEL } from '../src/ui/hud';

const DT = 1 / 60;
beforeAll(async () => { await RAPIER.init(); });

const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
function play(g: Game, seconds: number, input: (g: Game) => PlayerInput[] = () => []) {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) { g.step(DT, input(g)); events.push(...g.out); }
  return events;
}
const count = (ev: GameEvent[], t: GameEvent['type'], item?: number) => ev.filter((e) => e.type === t && (item === undefined || ('item' in e && e.item === item))).length;

/** Partida del nivel ya en juego (sin cuenta atrás), con n humanos y sin ayudantes. */
function playing(level: LevelDef, n = 2) {
  const g = new Game(RAPIER, { level, humans: n, carriers: Math.max(1, n), botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  return g;
}

/** Coloca un objeto quieto en `p` (su origen) con giro `yaw`. */
function put(it: Item, p: Vec3, yaw = 0) {
  it.body.setTranslation(p, true);
  it.body.setRotation(yawQuat(yaw), true);
  it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  it.prevVel = { x: 0, y: 0, z: 0 };
}

/** Primer objeto del nivel con esa definición (el n-ésimo si hay varios). */
const item = (g: Game, id: ItemId, n = 0) => g.items.filter((it) => it.def.id === id)[n];

const F = TRUCK.floor;

describe('Niveles como datos (T-level-1)', () => {
  it('«La calle» y el «Patio de pruebas» son LevelDef completos; se eligen con ?nivel= (por defecto, la calle)', () => {
    expect(levelFromParam(null)).toBe(CALLE);
    expect(levelFromParam('calle')).toBe(CALLE);
    expect(levelFromParam('pruebas')).toBe(PATIO);
    expect(levelFromParam('PRUEBAS')).toBe(PATIO);
    expect(levelFromParam('otro')).toBe(CALLE);
    expect(levelFromParam('constructor')).toBe(CALLE);
    expect(Object.values(LEVELS)).toEqual([CALLE, PATIO]);
    for (const l of [CALLE, PATIO]) {
      expect(l.id.length * l.name.length, l.id).toBeGreaterThan(0);
      expect(l.boxes.some((b) => b.solid && b.kind === 'ground'), l.id).toBe(true);
      expect(l.spawns.length, l.id).toBeGreaterThanOrEqual(6);
      expect(l.items.length, l.id).toBeGreaterThan(0);
      expect(l.items[l.main], l.id).toBeDefined();
      expect(l.stages[0].when, l.id).toBe(null);
      expect(l.timeLimit, l.id).toBeGreaterThan(0);
      // Cada objeto tiene su ruta para el piloto, que acaba dentro de la caja de carga, donde se suelta
      const hold = cargoHold(l.truck);
      for (const pl of l.items) {
        const last = pl.route[pl.route.length - 1];
        expect(last.release, `${l.id} ${pl.id}`).toBe(true);
        expect(last.x > hold.min.x && last.x < hold.max.x && last.z > hold.min.z && last.z < hold.max.z, `${l.id} ${pl.id}`).toBe(true);
      }
    }
    // Tráfico y semáforo: la calle los tiene; el patio, no
    expect(CALLE.traffic?.cars.length).toBe(6);
    expect(PATIO.traffic).toBe(null);
  });

  it('fuera de src/levels/ nada importa constantes del recorrido: el juego, la vista y el piloto reciben el LevelDef', () => {
    const src = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const files = Object.entries(src).filter(([f]) => !f.startsWith('../src/levels/'));
    expect(files.length).toBeGreaterThan(20);
    // Los módulos del recorrido fijo ya no existen
    expect(Object.keys(src).filter((f) => /\/sim\/(level|props)\.ts$/.test(f))).toEqual([]);
    const consts = /\b(LEVEL|ROUTE|ZONE|STAGES|CHECKPOINTS|SOFA_START|DOOR|STAIRS|RAMP|TERRACE|FLOOR2|PED_LIGHT|PROPS|LANES|CALLE|PATIO)\b/;
    for (const [f, text] of files) {
      // De los niveles solo se importan tipos, ayudas de geometría, el camión y el registro (no un nivel concreto)
      for (const m of text.matchAll(/from '([^']*levels[^']*)'/g)) expect(m[1], f).toMatch(/levels(\/(types|geometry|truck|index))?$/);
      expect(text, f).not.toMatch(consts);
    }
  });

  it('Game construye el nivel que recibe: sus objetos donde dice, los porteadores en sus salidas y su tráfico', () => {
    const g = new Game(RAPIER, { level: PATIO, humans: 4, carriers: 4, botStyle: 'atentos', seed: 1 });
    expect(g.level).toBe(PATIO);
    expect(g.items.map((it) => it.def.id)).toEqual(PATIO.items.map((pl) => pl.id));
    expect(g.items.map((it) => it.required)).toEqual(PATIO.items.map((pl) => pl.required));
    g.items.forEach((it, i) => {
      const p = it.body.translation(), pl = PATIO.items[i];
      expect(Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z), pl.id).toBeLessThan(1e-6);
      expect(p.y).toBeCloseTo(restHeight(it.def) + 0.01, 5);
    });
    expect(g.sofaItem).toBe(g.items[PATIO.main]);
    g.carriers.forEach((c, i) => {
      const s = PATIO.spawns[i];
      expect(Math.hypot(c.pos.x - s.x, c.pos.z - s.z)).toBeLessThan(1e-6);
      expect(c.facing).toEqual(s.facing);
    });
    expect(g.cars.length).toBe(0);
    g.dispose();
    const c = new Game(RAPIER, { level: CALLE, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    expect(c.cars.length).toBe(6);
    c.dispose();
  });

  it('el «Patio de pruebas» es pequeño y llano, con el camión y al menos 6 objetos del catálogo (varios obligatorios)', () => {
    const ids = PATIO.items.map((pl) => pl.id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids.filter((id) => id === 'caja').length).toBeGreaterThanOrEqual(2);
    for (const id of ['lampara', 'silla', 'mesa'] as const) expect(ids).toContain(id);
    expect(ids.includes('nevera') || ids.includes('piano')).toBe(true);
    expect(PATIO.items.filter((pl) => pl.required).length).toBeGreaterThanOrEqual(2);
    // Llano: un solo suelo, a ras (y = 0), y ninguna caja girada; nada de pisos, escaleras ni rampas (salvo la del camión)
    const solid = PATIO.boxes.filter((b) => b.solid);
    expect(solid.filter((b) => b.kind === 'ground').map((b) => b.p[1] + b.h[1])).toEqual([0]);
    for (const b of solid) {
      expect(['floor', 'stairs', 'ramp']).not.toContain(b.kind);
      expect(b.rx ?? 0).toBe(0);
      expect(b.rz ?? 0).toBe(0);
    }
    // Pequeño: todos los objetos y salidas en menos de 35 × 21 m
    const xs = [...PATIO.items.map((p) => p.pos.x), ...PATIO.spawns.map((s) => s.x)], zs = [...PATIO.items.map((p) => p.pos.z), ...PATIO.spawns.map((s) => s.z)];
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(35);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(21);
    expect(PATIO.test).toBe(true);
  });
});

describe('«La calle» como nivel de referencia (T-level-2)', () => {
  it('un solo objeto, el sofá, obligatorio; sale donde siempre y los porteadores, frente a sus asas como antes', () => {
    expect(CALLE.items.map((pl) => [pl.id, pl.required])).toEqual([['sofa', true]]);
    expect(CALLE.timeLimit).toBe(180);
    const g = new Game(RAPIER, { level: CALLE, humans: 2, carriers: 6, botStyle: 'atentos', seed: 1 });
    const p = g.sofaPos;
    expect([p.x, p.y, p.z]).toEqual([0, Math.fround(0.6), 10]);
    // La regla de antes: a 1,3 m de cada asa del sofá (`SLOTS`), hacia fuera, mirándola
    g.carriers.forEach((c, i) => {
      const slot = SLOTS[i], a = localToWorld(g.sofa, slot.p), out = rotate(g.sofa.rotation(), slot.out);
      expect(Math.abs(c.pos.x - (a.x + out.x * 1.3))).toBeLessThan(1e-6);
      expect(Math.abs(c.pos.z - (a.z + out.z * 1.3))).toBeLessThan(1e-6);
      expect(c.facing).toEqual({ x: -out.x, z: -out.z });
    });
    g.dispose();
  });

  it('la zona del suelo ya no basta: el sofá quieto junto al camión, al pie de su rampa, no cuenta ni hace ganar', () => {
    const g = playing(CALLE);
    for (const c of g.carriers) c.teleport({ x: 20, y: CENTER_Y + 0.05, z: -36 });
    put(g.sofaItem, { x: 23.2, y: 0.25, z: -30.3 });
    const ev = play(g, 3);
    expect(g.sofaItem.state).toBe('pending');
    expect(count(ev, 'itemLoaded')).toBe(0);
    expect(g.phase).toBe('playing');
    g.dispose();
  });

  it('con 2 humanos, el piloto sube el sofá por la rampa, lo mete dentro del camión y lo suelta: cargado y victoria', () => {
    const g = new Game(RAPIER, { level: CALLE, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    const aps = Autopilot.team(g);
    const order: string[] = [];
    for (let i = 0; i < 60 * (g.level.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(DT, aps.map((a) => a.input(g, DT)));
      for (const e of g.out) if (e.type === 'stage' || e.type === 'itemLoaded' || e.type === 'win') order.push(e.type === 'stage' ? e.label : e.type);
    }
    expect(g.phase).toBe('won');
    expect(order.slice(-3)).toEqual(['Camión', 'itemLoaded', 'win']);
    expect(g.sofaItem.state).toBe('loaded');
    expect(g.holdFraction(g.sofaItem)).toBeGreaterThanOrEqual(RULES.loadFraction);
    // Dentro de verdad: sobre el suelo de carga, no en la rampa
    expect(g.sofaPos.y).toBeGreaterThan(F);
    expect(g.carriers.some((c) => c.heldBody === g.sofa)).toBe(false);
    expect(g.sofaItem.integrity).toBe(100);
    expect(g.time).toBeLessThan(g.level.timeLimit);
    g.dispose();
  });
});

describe('El camión es un espacio de verdad (T-truck)', () => {
  it('caja de carga abierta por detrás: suelo, paredes, techo y rampa son piezas de choque separadas, y dentro no hay nada', () => {
    const boxes = truckBoxes(PATIO.truck);
    const kinds = boxes.map((b) => b.kind);
    expect(kinds.filter((k) => k === 'truckFloor').length).toBe(1);
    expect(kinds.filter((k) => k === 'truckWall').length).toBe(3);
    expect(kinds.filter((k) => k === 'truckRoof').length).toBe(1);
    expect(kinds.filter((k) => k === 'truckRamp').length).toBe(1);
    const g = playing(PATIO);
    play(g, 0.1); // las consultas de forma usan el estado tras un paso
    // Cada pieza es un collider fijo propio, en su sitio
    const fixedAt = (p: Vec3) => {
      const hits: number[] = [];
      g.world.intersectionsWithPoint(p, (c) => { if (c.parent()?.isFixed()) hits.push(c.handle); return true; });
      return hits;
    };
    const handles = new Set<number>();
    for (const b of boxes) {
      const at = fixedAt({ x: b.p[0], y: b.p[1], z: b.p[2] });
      expect(at.length, b.kind).toBeGreaterThan(0);
      for (const h of at) handles.add(h);
    }
    expect(handles.size).toBeGreaterThanOrEqual(boxes.length);
    // Por dentro está vacío (ya no es un bloque macizo) y abierto por detrás: de la abertura al fondo, del suelo al techo
    const hold = g.hold;
    for (const fx of [0.05, 0.5, 0.95]) for (const fy of [0.05, 0.5, 0.95]) for (const fz of [0.05, 0.5, 0.95]) {
      const p = { x: hold.min.x + (hold.max.x - hold.min.x) * fx, y: hold.min.y + (hold.max.y - hold.min.y) * fy, z: hold.min.z + (hold.max.z - hold.min.z) * fz };
      expect(fixedAt(p), JSON.stringify(p)).toEqual([]);
    }
    // Detrás de la abertura, a la altura de la caja de carga, tampoco hay nada (la puerta trasera está abierta)
    expect(fixedAt({ x: hold.min.x - 0.05, y: F + 1, z: (hold.min.z + hold.max.z) / 2 })).toEqual([]);
    g.dispose();
  });

  it('dos personas suben la mesa por la rampa y la dejan dentro: queda cargada y entera', () => {
    const g = playing(PATIO, 2);
    const mesa = item(g, 'mesa');
    // Cada uno frente a un extremo de la mesa (asas 0 y 1), mirándola
    mesa.def.handles.slice(0, 2).forEach((h, i) => {
      const a = localToWorld(mesa.body, h.p), out = rotate(mesa.body.rotation(), h.out);
      g.carriers[i].teleport({ x: a.x + out.x * 0.75, y: CENTER_Y + 0.05, z: a.z + out.z * 0.75 });
      g.carriers[i].facing = { x: -out.x, z: -out.z };
    });
    play(g, 0.3);
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    expect(g.carriers.every((c) => c.heldBody === mesa.body)).toBe(true);
    play(g, 0.5);
    // Andan los dos hacia el camión (+x), rampa arriba, hasta tener la mesa dentro
    let t = 0, top = -Infinity;
    const ev: GameEvent[] = [];
    while (mesa.body.translation().x < 9 && t < 12) {
      ev.push(...play(g, DT, () => [inp({ mx: 1 }), inp({ mx: 1 })]));
      top = Math.max(top, ...g.carriers.map((c) => c.pos.y - CENTER_Y));
      t += DT;
    }
    expect(t).toBeLessThan(12);
    expect(top).toBeGreaterThan(F - 0.05); // los dos pies, ya sobre el suelo de carga
    expect(g.carriers.every((c) => c.heldBody === mesa.body)).toBe(true);
    // Paran, sueltan y la dejan (al soltar, el de delante se tambalea un momento y la empuja: tarda en quedar quieta)
    ev.push(...play(g, 0.5, () => [NO_INPUT, NO_INPUT]));
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    ev.push(...g.out, ...play(g, 3.5));
    expect(g.carriers.some((c) => c.holding)).toBe(false);
    expect(mesa.state).toBe('loaded');
    expect(count(ev, 'itemLoaded', mesa.index)).toBe(1);
    expect(g.holdFraction(mesa)).toBeGreaterThanOrEqual(RULES.loadFraction);
    expect(mesa.integrity).toBe(100);
    g.dispose();
  });

  it('la caja de carga admite al menos 4 objetos del catálogo a la vez, también apilados', () => {
    const g = playing(PATIO, 1);
    for (const c of g.carriers) c.teleport({ x: -10, y: CENTER_Y + 0.05, z: 7 });
    const mesa = item(g, 'mesa'), caja = item(g, 'caja'), nevera = item(g, 'nevera'), piano = item(g, 'piano'), silla = item(g, 'silla');
    const on = (it: Item, x: number, z: number, base = F) => put(it, { x, y: base + restHeight(it.def) + 0.01, z });
    on(nevera, 11.2, -1.4);
    on(piano, 10.8, 1.25);
    on(mesa, 9.0, -1.0);
    on(silla, 7.3, 1.2);
    // La caja, encima de la mesa (apilada)
    const mesaTop = F + restHeight(mesa.def) + Math.max(...mesa.def.shape.map((b) => b.p.y + b.h.y));
    on(caja, 9.0, -1.0, mesaTop);
    const ev = play(g, 3);
    const inside = [nevera, piano, mesa, silla, caja];
    for (const it of inside) {
      expect(it.state, it.def.id).toBe('loaded');
      expect(g.holdFraction(it), it.def.id).toBeGreaterThanOrEqual(RULES.loadFraction);
      expect(count(ev, 'itemLoaded', it.index), it.def.id).toBe(1);
    }
    expect(count(ev, 'itemBroken')).toBe(0);
    // Sigue apilada: la caja descansa sobre el tablero
    expect(caja.body.translation().y).toBeGreaterThan(mesaTop);
    g.dispose();
  });
});

describe('Entrega con progreso (T-deliver)', () => {
  it('cuenta como cargado con el centro y al menos el 80 % de su caja envolvente dentro; con el centro dentro pero menos, no', () => {
    const g = playing(PATIO, 1);
    for (const c of g.carriers) c.teleport({ x: -10, y: CENTER_Y + 0.05, z: 7 });
    const sofa = g.addItem(ITEMS.sofa, { x: -10, y: 0.21, z: -6 }, 0, false);
    const x0 = g.hold.min.x;
    // Centro 0,4 m dentro: (1,1 + 0,4) / 2,2 = 68 % de su largo
    put(sofa, { x: x0 + 0.4, y: F + 0.21, z: 0 });
    let ev = play(g, 2.5);
    expect(sofa.body.translation().x).toBeGreaterThan(x0);
    expect(g.holdFraction(sofa)).toBeGreaterThan(0.5);
    expect(g.holdFraction(sofa)).toBeLessThan(RULES.loadFraction);
    expect(sofa.state).toBe('pending');
    expect(count(ev, 'itemLoaded')).toBe(0);
    // Centro 1 m dentro: 95 %
    put(sofa, { x: x0 + 1, y: F + 0.21, z: 0 });
    ev = play(g, 2.5);
    expect(g.holdFraction(sofa)).toBeGreaterThanOrEqual(RULES.loadFraction);
    expect(sofa.state).toBe('loaded');
    expect(count(ev, 'itemLoaded', sofa.index)).toBe(1);
    // Con el centro fuera no cuenta nada, aunque casi la mitad esté dentro
    const caja = item(g, 'caja');
    put(caja, { x: x0 - 0.05, y: F + 0.26, z: 1.2 });
    expect(g.holdFraction(caja)).toBe(0);
    g.dispose();
  });

  it('solo cuenta si nadie lo agarra y lleva winHold s quieto; agarrarlo o sacarlo lo descuenta (itemUnloaded)', () => {
    const g = playing(PATIO, 1);
    const me = g.carriers[0];
    me.teleport({ x: -10, y: CENTER_Y + 0.05, z: 7 });
    const caja = item(g, 'caja');
    put(caja, { x: 8.5, y: F + restHeight(caja.def) + 0.01, z: 0 });
    // Antes de winHold s quieto, no; después, sí (una sola vez)
    let ev = play(g, RULES.winHold - 0.2);
    expect(caja.state).toBe('pending');
    ev = [...ev, ...play(g, 0.5)];
    expect(caja.state).toBe('loaded');
    expect(count(ev, 'itemLoaded', caja.index)).toBe(1);
    expect(loadList(g).title).toBe(`Cargados 1/${g.requiredCount}`);
    // Alguien entra y la agarra: en camino, y deja de contar
    const a = localToWorld(caja.body, caja.def.handles[0].p), out = rotate(caja.body.rotation(), caja.def.handles[0].out);
    me.teleport({ x: a.x + out.x * 0.7, y: F + CENTER_Y + 0.05, z: a.z + out.z * 0.7 });
    me.facing = { x: -out.x, z: -out.z };
    play(g, 0.3);
    ev = play(g, DT, () => [inp({ grab: true })]);
    expect(me.heldBody).toBe(caja.body);
    expect(caja.state).toBe('carried');
    expect(count(ev, 'itemUnloaded', caja.index)).toBe(1);
    expect(g.loadedRequired).toBe(0);
    // La suelta dentro: vuelve a contar pasado winHold
    play(g, 0.5);
    ev = play(g, DT, () => [inp({ grab: true })]);
    ev = [...ev, ...play(g, RULES.winHold + 0.6)];
    expect(me.holding).toBe(false);
    expect(caja.state).toBe('loaded');
    expect(count(ev, 'itemLoaded', caja.index)).toBe(1);
    // Se saca del camión: deja de contar
    put(caja, { x: -2, y: restHeight(caja.def) + 0.01, z: 6 });
    ev = play(g, 0.2);
    expect(caja.state).toBe('pending');
    expect(count(ev, 'itemUnloaded', caja.index)).toBe(1);
    expect(g.loadedRequired).toBe(0);
    g.dispose();
  });

  it('se gana al cargar todos los obligatorios (los opcionales no hacen falta); con uno sin cargar, no', () => {
    const g = playing(PATIO, 1);
    for (const c of g.carriers) c.teleport({ x: -10, y: CENTER_Y + 0.05, z: 7 });
    const spots: Partial<Record<string, [number, number]>> = { mesa: [9.3, -1.0], lampara: [7.3, -1.2], silla: [7.3, 1.2] };
    const cajas = [[9.3, 0.5], [8.5, 0.5]];
    const required = g.items.filter((it) => it.required);
    expect(required.map((it) => it.def.id).sort()).toEqual(['caja', 'caja', 'lampara', 'mesa', 'silla']);
    let k = 0;
    const load = (it: Item) => {
      const [x, z] = it.def.id === 'caja' ? cajas[k++] : spots[it.def.id]!;
      put(it, { x, y: F + restHeight(it.def) + 0.01, z });
    };
    // Todos menos la silla: sigue la partida
    for (const it of required) if (it.def.id !== 'silla') load(it);
    let ev = play(g, 2);
    expect(g.loadedRequired).toBe(4);
    expect(g.phase).toBe('playing');
    expect(count(ev, 'win')).toBe(0);
    // La silla también: victoria (la nevera y el piano, opcionales, siguen fuera)
    load(item(g, 'silla'));
    ev = play(g, 2);
    expect(g.phase).toBe('won');
    expect(count(ev, 'win')).toBe(1);
    expect(item(g, 'nevera').state).toBe('pending');
    expect(item(g, 'piano').state).toBe('pending');
    g.dispose();
  });

  it('un obligatorio roto hace perder; uno opcional roto solo cuenta como daño', () => {
    // La lámpara del patio es obligatoria: se cae desde la altura de carga, se rompe y se pierde
    const g = playing(PATIO, 1);
    for (const c of g.carriers) c.teleport({ x: -10, y: CENTER_Y + 0.05, z: 7 });
    const lamp = item(g, 'lampara');
    put(lamp, { x: -6.5, y: 0.7 + lamp.body.localCom().y, z: 4.5 });
    lamp.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    const ev = play(g, 2);
    expect(lamp.state).toBe('broken');
    expect(g.phase).toBe('lost');
    expect(g.loseReason).toBe('broken');
    expect(ev).toContainEqual({ type: 'lose', reason: 'broken' });
    g.dispose();
    // Una lámpara opcional rota: la partida sigue y su daño cuenta en el total
    const h = playing(PATIO, 1);
    for (const c of h.carriers) c.teleport({ x: -10, y: CENTER_Y + 0.05, z: 7 });
    const extra = h.addItem(ITEMS.lampara, { x: -2, y: 0.7, z: 6 }, 0, false);
    put(extra, { x: -2, y: 0.7 + extra.body.localCom().y, z: 6 });
    extra.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    play(h, 2);
    expect(extra.state).toBe('broken');
    expect(h.phase).toBe('playing');
    expect(h.damageTotal).toBe(100);
    h.dispose();
  });

  it('lista de estados por objeto: pendiente, en camino, cargado y roto; en la interfaz, «Cargados N/M» con nombre y estado', () => {
    expect(STATE_LABEL).toEqual({ pending: 'pendiente', carried: 'en camino', loaded: 'cargado', broken: 'roto' });
    const g = playing(PATIO, 1);
    const me = g.carriers[0];
    const [caja1, caja2] = [item(g, 'caja', 0), item(g, 'caja', 1)];
    // Una caja cargada y la otra en manos de J1…
    put(caja1, { x: 8.5, y: F + restHeight(caja1.def) + 0.01, z: 0 });
    const a = localToWorld(caja2.body, caja2.def.handles[1].p), out = rotate(caja2.body.rotation(), caja2.def.handles[1].out);
    me.teleport({ x: a.x + out.x * 0.7, y: CENTER_Y + 0.05, z: a.z + out.z * 0.7 });
    me.facing = { x: -out.x, z: -out.z };
    play(g, 0.3);
    g.step(DT, [inp({ grab: true })]);
    play(g, 1.5);
    // …y la lámpara rota (es obligatoria: se pierde, pero la lista sigue diciendo el estado de cada objeto)
    const lamp = item(g, 'lampara');
    lamp.body.setTranslation({ x: -6.5, y: 0.7 + lamp.body.localCom().y, z: 4.5 }, true);
    lamp.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    play(g, 1.5);
    expect(g.phase).toBe('lost');
    const l = loadList(g);
    expect(l.title).toBe(`Cargados 1/${g.requiredCount}`);
    expect(l.rows.map((r) => r.name)).toEqual(g.items.map((it) => it.def.name));
    const byState = (s: string) => l.rows.filter((r) => r.label === s).map((r) => r.id);
    expect(byState('cargado')).toEqual(['caja']);
    expect(byState('en camino')).toEqual(['caja']);
    expect(byState('roto')).toEqual(['lampara']);
    expect(byState('pendiente').sort()).toEqual(['mesa', 'nevera', 'piano', 'silla']);
    expect(l.rows.filter((r) => !r.required).map((r) => r.id)).toEqual(['nevera', 'piano']);
    g.dispose();
  });

  it('al cargar un objeto suena un sonido sintetizado (sin archivos): itemLoaded → sfx «load»', () => {
    const heard: SfxName[] = [];
    const s = new Sfx();
    s.onPlay = (name) => heard.push(name);
    s.play('load');
    s.play('unload');
    expect(heard).toEqual(['load', 'unload']);
    // El bucle del juego lo pide al recibir el suceso
    expect(mainSrc).toMatch(/case 'itemLoaded': \{[^}]*sfx\.play\('load'\)/);
    expect(mainSrc).toMatch(/case 'itemUnloaded': sfx\.play\('unload'\)/);
  });
});
