// Pruebas de los objetos del catálogo (ciclo 2, paso 1): T-item-1, T-item-2 y T-item-3. Sin navegador: la misma
// simulación que el juego. Los números de cada objeto los imprime `scripts/item-measure.ts`.
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { CARRIER, CENTER_Y } from '../src/sim/carrier';
import { Game, RULES } from '../src/sim/game';
import { HAND } from '../src/sim/hand';
import { ITEMS, boxVolume, createItem, restHeight, type Item, type ItemBox, type ItemDef } from '../src/sim/items';
import { SLOTS, SOFA, createSofa, localToWorld, rotate } from '../src/sim/sofa';
import { NO_INPUT, type GameEvent, type PlayerInput, type Vec3 } from '../src/sim/types';

const DT = 1 / 60;
beforeAll(async () => { await RAPIER.init(); });

/** Descampado sin nada alrededor (el mismo de `tests/sim.test.ts`). */
const OPEN = { x: -35, z: 25 };
const standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
function play(g: Game, seconds: number, input: (g: Game) => PlayerInput[] = () => []) {
  const events: GameEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) { g.step(DT, input(g)); events.push(...g.out); }
  return events;
}
const count = (ev: GameEvent[], t: GameEvent['type']) => ev.filter((e) => e.type === t).length;

/** Partida en juego con n humanos, el sofá del nivel aparcado a un lado y el objeto `def` de pie en el descampado. */
function setup(def: ItemDef, n: number, required = false) {
  const g = new Game(RAPIER, { humans: n, carriers: Math.max(1, n), botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x - 12, y: 0.25, z: OPEN.z - 8 }, true);
  const it = g.addItem(def, { x: OPEN.x, y: restHeight(def) + 0.01, z: OPEN.z }, 0, required);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  return { g, it };
}

/** Punto más bajo de la forma del objeto (mundo): la esquina más baja de sus cajas. */
function lowest(it: Item) {
  let low = Infinity;
  for (const b of it.def.shape) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    low = Math.min(low, localToWorld(it.body, { x: b.p.x + sx * b.h.x, y: b.p.y + sy * b.h.y, z: b.p.z + sz * b.h.z }).y);
  }
  return low;
}

/** Pone al porteador i frente al asa h del objeto, a 0,75 m hacia fuera, mirándola (como `atEnd` en `sim.test.ts`). */
function atHandle(g: Game, it: Item, i: number, h: number) {
  const hd = it.def.handles[h], a = localToWorld(it.body, hd.p), out = rotate(it.body.rotation(), hd.out);
  const ol = Math.hypot(out.x, out.z) || 1;
  const c = g.carriers[i];
  c.teleport({ x: a.x + (out.x / ol) * 0.75, y: standY, z: a.z + (out.z / ol) * 0.75 });
  c.facing = { x: -out.x / ol, z: -out.z / ol };
}

/** Dirección horizontal (mundo) hacia fuera de la primera asa: hacia ahí andan todos (quien la agarra tira hacia atrás). */
function firstOut(it: Item) {
  const out = rotate(it.body.rotation(), it.def.handles[0].out), ol = Math.hypot(out.x, out.z) || 1;
  return { x: out.x / ol, z: out.z / ol };
}

/**
 * n porteadores, guiados por la prueba, se ponen frente a las n primeras asas y agarran con el botón, como un jugador
 * (la misma regla que T-grip-3); 0,5 s para que suban las manos y 3 s andando todos hacia fuera de la primera asa.
 */
function carry(def: ItemDef, n: number) {
  const { g, it } = setup(def, n);
  for (let i = 0; i < n; i++) atHandle(g, it, i, i);
  play(g, 0.3);
  g.step(DT, g.carriers.map((_, i) => inp({ grab: i < n })));
  const grabbed = g.carriers.slice(0, n).every((c) => c.heldBody === it.body);
  play(g, 0.5);
  const dir = firstOut(it), p0 = it.body.translation();
  let minLow = Infinity, maxLow = -Infinity;
  const ev = play(g, 3, (g) => {
    const l = lowest(it);
    minLow = Math.min(minLow, l); maxLow = Math.max(maxLow, l);
    return g.carriers.map((_, i) => (i < n ? inp({ mx: dir.x, mz: dir.z }) : NO_INPUT));
  });
  const p1 = it.body.translation();
  const r = {
    grabbed, d: Math.hypot(p1.x - p0.x, p1.z - p0.z), minLow, maxLow, breaks: count(ev, 'gripBreak'),
    holding: g.carriers.slice(0, n).every((c) => c.heldBody === it.body), integrity: it.integrity,
  };
  g.dispose();
  return r;
}

/** Distancia con signo de un punto a una caja (sin redondeo): negativa dentro. */
function boxDist(b: ItemBox, p: Vec3) {
  const q = [Math.abs(p.x - b.p.x) - b.h.x, Math.abs(p.y - b.p.y) - b.h.y, Math.abs(p.z - b.p.z) - b.h.z];
  return Math.hypot(...q.map((v) => Math.max(v, 0))) + Math.min(Math.max(...q), 0);
}

describe('Catálogo de objetos (T-item-1)', () => {
  it('hay al menos 7 definiciones (caja, silla, lámpara de pie frágil, mesa, sofá, nevera y piano) con todos sus datos', () => {
    const defs = Object.values(ITEMS);
    expect(defs.length).toBeGreaterThanOrEqual(7);
    for (const id of ['caja', 'silla', 'lampara', 'mesa', 'sofa', 'nevera', 'piano'] as const) expect(ITEMS[id].id).toBe(id);
    expect(ITEMS.lampara.fragility).not.toBe(null);
    for (const d of defs) {
      expect(d.name.length, d.id).toBeGreaterThan(0);
      expect(d.draw.length, d.id).toBeGreaterThan(0);
      expect(d.mass, d.id).toBeGreaterThan(0);
      expect(d.friction, d.id).toBeGreaterThan(0);
      expect(d.minCarriers, d.id).toBeGreaterThanOrEqual(1);
      // Tantas asas como manos hacen falta, por lo menos
      expect(d.handles.length, d.id).toBeGreaterThanOrEqual(d.minCarriers);
      if (d.fragility) { expect(d.fragility.impactDv, d.id).toBeGreaterThan(0); expect(d.fragility.damage, d.id).toBeGreaterThan(0); }
      for (const b of d.shape) for (const h of [b.h.x, b.h.y, b.h.z]) expect(h, d.id).toBeGreaterThan(b.round ?? 0);
      for (const [i, hd] of d.handles.entries()) {
        const at = `${d.id}, asa ${i}`;
        // En la superficie de la forma (a menos de 1 cm de una caja, sin meterse en ninguna)…
        expect(Math.min(...d.shape.map((b) => Math.abs(boxDist(b, hd.p)))), at).toBeLessThan(0.01);
        expect(Math.min(...d.shape.map((b) => boxDist(b, hd.p))), at).toBeGreaterThan(-0.01);
        // …con la dirección hacia fuera unitaria y en horizontal (hacia donde se pone quien agarra), que sale de la forma
        expect(Math.hypot(hd.out.x, hd.out.y, hd.out.z), at).toBeCloseTo(1, 6);
        expect(hd.out.y, at).toBe(0);
        const off = { x: hd.p.x + hd.out.x * 0.05, y: hd.p.y, z: hd.p.z + hd.out.z * 0.05 };
        expect(Math.min(...d.shape.map((b) => boxDist(b, off))), at).toBeGreaterThan(0.03);
      }
    }
  });

  it('el sofá del catálogo reproduce exactamente SOFA y SLOTS (forma, masa, rozamiento y asas)', () => {
    const d = ITEMS.sofa, { half, back, arm } = SOFA;
    expect(d.handles).toEqual(SLOTS.map((s) => ({ p: s.p, out: s.out })));
    expect(d.friction).toBe(SOFA.friction);
    expect(d.shape[0]).toEqual({ p: { x: 0, y: 0, z: 0 }, h: half, round: 0.05 });
    expect(d.shape[1]).toEqual({ p: back.p, h: back.h });
    for (const [i, s] of [[2, 1], [3, -1]] as const) {
      expect(d.shape[i].h).toEqual(arm.h);
      expect(d.shape[i].p.x).toBeCloseTo(s * (half.x - arm.h.x), 12);
      expect(d.shape[i].p.y).toBe(arm.y);
      expect(d.shape[i].p.z).toBe(0);
    }
    // `createSofa` reparte SOFA.mass en el volumen envolvente de sus cajas; el cuerpo pesa lo que da el volumen real
    const bound = d.shape.reduce((s, b) => s + 8 * b.h.x * b.h.y * b.h.z, 0), real = d.shape.reduce((s, b) => s + boxVolume(b), 0);
    expect((d.mass * bound) / real).toBeCloseTo(SOFA.mass, 9);
  });

  it('createItem(sofá) da los mismos colliders que createSofa', () => {
    const pos = { x: 3, y: 0.6, z: -2 }, yaw = 0.7;
    const wa = new RAPIER.World({ x: 0, y: -9.81, z: 0 }), wb = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const a = createSofa(RAPIER, wa, pos, yaw), b = createItem(RAPIER, wb, ITEMS.sofa, pos, yaw);
    expect(b.colliders.length).toBe(a.colliders.length);
    a.colliders.forEach((ca, i) => {
      const cb = b.colliders[i];
      expect(cb.shapeType()).toBe(ca.shapeType());
      expect(cb.halfExtents()).toEqual(ca.halfExtents());
      expect(cb.roundRadius()).toBe(ca.roundRadius());
      expect(cb.translation()).toEqual(ca.translation());
      expect(cb.rotation()).toEqual(ca.rotation());
      expect(cb.density()).toBe(ca.density());
      expect(cb.mass()).toBe(ca.mass());
      expect(cb.friction()).toBe(ca.friction());
      expect(cb.restitution()).toBe(ca.restitution());
      expect(cb.activeEvents()).toBe(ca.activeEvents());
    });
    expect(b.body.mass()).toBe(a.body.mass());
    expect(b.body.localCom()).toEqual(a.body.localCom());
    expect(b.body.principalInertia()).toEqual(a.body.principalInertia());
    expect(b.body.linearDamping()).toBe(a.body.linearDamping());
    expect(b.body.angularDamping()).toBe(a.body.angularDamping());
    expect(b.body.isCcdEnabled()).toBe(a.body.isCcdEnabled());
    expect(b.body.additionalSolverIterations()).toBe(a.body.additionalSolverIterations());
    // Y el sofá de la partida es ese objeto del catálogo, obligatorio
    const g = new Game(RAPIER, { humans: 1, carriers: 1, botStyle: 'atentos' });
    expect(g.items[0]).toBe(g.sofaItem);
    expect(g.sofaItem.def).toBe(ITEMS.sofa);
    expect(g.sofaItem.required).toBe(true);
    expect(g.sofa).toBe(g.sofaItem.body);
    expect(g.sofa.mass()).toBe(a.body.mass());
    g.dispose(); wa.free(); wb.free();
  });

  it('cada objeto creado pesa lo que dice su definición', () => {
    const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    Object.values(ITEMS).forEach((d, i) => {
      const { body } = createItem(RAPIER, w, d, { x: i * 5, y: 1, z: 0 }, 0);
      expect(body.mass() / d.mass, d.id).toBeCloseTo(1, 5);
    });
    w.free();
  });

  it('su número de asas es el máximo de manos: la lámpara (una asa) no la agarran dos a la vez', () => {
    const { g, it } = setup(ITEMS.lampara, 2);
    atHandle(g, it, 0, 0);
    const a = localToWorld(it.body, ITEMS.lampara.handles[0].p);
    g.carriers[1].teleport({ x: a.x - 0.8, y: standY, z: a.z }); g.carriers[1].facing = { x: 1, z: 0 };
    play(g, 0.3);
    expect(g.carriers[1].findGrab([it])).not.toBe(null); // le llega la mano…
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    expect(g.holdersOf(it.body).length).toBe(1); // …pero el asa ya está ocupada
    expect(it.state).toBe('carried');
    g.dispose();
  });
});

describe('Clases de peso con la misma física (T-item-2)', () => {
  it('las clases salen de la masa y de HAND: la caja y la lámpara, una persona; la mesa y la nevera, dos; el piano, tres', () => {
    expect(ITEMS.caja.minCarriers).toBe(1);
    expect(ITEMS.lampara.minCarriers).toBe(1);
    expect(ITEMS.mesa.minCarriers).toBe(2);
    expect(ITEMS.nevera.minCarriers).toBe(2);
    expect(ITEMS.piano.minCarriers).toBe(3);
    // Con una mano menos no pueden con el peso; con las que pide, sí (si se reparten la carga)
    for (const d of Object.values(ITEMS)) {
      const w = d.mass * 9.81;
      expect(w, d.id).toBeGreaterThan((d.minCarriers - 1) * HAND.maxV);
      expect(w, d.id).toBeLessThan(d.minCarriers * HAND.maxV);
    }
  });

  it.each(Object.values(ITEMS).map((d) => [d.name, d] as const))('%s: con minCarriers personas va en el aire y avanza; con una menos no despega del suelo', (_, def) => {
    const ok = carry(def, def.minCarriers);
    expect(ok.grabbed).toBe(true);
    expect(ok.minLow).toBeGreaterThan(0.1); // la base, en el aire mientras andan
    expect(ok.d).toBeGreaterThan(3); // más de 1 m/s de media
    expect(ok.holding).toBe(true);
    expect(ok.breaks).toBe(0);
    expect(ok.integrity).toBe(100);
    if (def.minCarriers > 1) {
      const less = carry(def, def.minCarriers - 1);
      expect(less.grabbed).toBe(true);
      expect(less.maxLow).toBeLessThan(0.05); // como mucho lo arrastran: siempre toca el suelo
      expect(less.d).toBeLessThan(ok.d);
    }
  });

  it('el piano: con 2 no despega, con 3 sí, y con 4 va más lejos y más alto que con 3', () => {
    const two = carry(ITEMS.piano, 2), three = carry(ITEMS.piano, 3), four = carry(ITEMS.piano, 4);
    expect(two.maxLow).toBeLessThan(0.05);
    expect(three.minLow).toBeGreaterThan(0.1);
    expect(four.minLow).toBeGreaterThan(0.1);
    expect(four.d).toBeGreaterThan(three.d);
    expect(four.minLow).toBeGreaterThan(three.minLow);
    expect(four.holding && three.holding).toBe(true);
  });
});

describe('Fragilidad (T-item-3)', () => {
  const lamp = ITEMS.lampara;
  /** La lámpara en manos de un porteador (agarrada con el botón frente a su asa), ya a la altura de carga. */
  function carried(required = false) {
    const { g, it } = setup(lamp, 1, required);
    atHandle(g, it, 0, 0);
    play(g, 0.3);
    g.step(DT, [inp({ grab: true })]);
    expect(g.carriers[0].heldBody).toBe(it.body);
    play(g, 0.5);
    return { g, it, dir: firstOut(it) };
  }

  it('llevada andando y dejada en el suelo con cuidado (parado, la suelta), no se rompe ni se daña', () => {
    const { g, it, dir } = carried();
    const ev = play(g, 2, () => [inp({ mx: dir.x, mz: dir.z })]);
    expect(it.state).toBe('carried');
    ev.push(...play(g, 1)); // se para
    ev.push(...play(g, 3, (g) => [inp({ grab: g.carriers[0].holding })])); // la suelta y espera
    expect(g.carriers[0].holding).toBe(false);
    expect(count(ev, 'itemBroken')).toBe(0);
    expect(it.integrity).toBe(100);
    expect(it.state).toBe('pending');
    expect(rotate(it.body.rotation(), { x: 0, y: 1, z: 0 }).y).toBeGreaterThan(0.99); // de pie
    g.dispose();
  });

  it('se rompe (estado broken y suceso itemBroken, una sola vez) si cae desde la altura de carga', () => {
    // Soltada andando a paso de carga: se va al suelo
    const a = carried();
    play(a.g, 1.5, () => [inp({ mx: a.dir.x, mz: a.dir.z })]);
    const ev = play(a.g, 3, (g) => [inp({ mx: a.dir.x, mz: a.dir.z, grab: g.carriers[0].holding })]);
    expect(a.it.state).toBe('broken');
    expect(a.it.integrity).toBe(0);
    expect(ev.filter((e) => e.type === 'itemBroken')).toEqual([{ type: 'itemBroken', item: a.it.index, id: 'lampara', pos: expect.anything() }]);
    a.g.dispose();
    // Tumbada, con el centro de masas a la altura a la que va cuando se lleva
    const { g, it } = setup(lamp, 1);
    it.body.setTranslation({ x: OPEN.x, y: CARRIER.carryCom + it.body.localCom().y, z: OPEN.z }, true);
    it.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    const ev2 = play(g, 2);
    expect(it.state).toBe('broken');
    expect(count(ev2, 'itemBroken')).toBe(1);
    g.dispose();
  });

  it('se rompe con un golpe por encima de su umbral: un porteador la arrolla a la carrera', () => {
    const { g, it } = setup(lamp, 1);
    g.carriers[0].teleport({ x: OPEN.x + 4, y: standY, z: OPEN.z });
    const ev = play(g, 2, () => [inp({ mx: -1 })]);
    const hit = ev.filter((e) => e.type === 'impact' && e.item === it.index);
    expect(hit.length).toBeGreaterThan(0);
    expect(Math.max(...hit.map((e) => (e.type === 'impact' ? e.strength : 0)))).toBeGreaterThan(lamp.fragility!.impactDv);
    expect(it.state).toBe('broken');
    g.dispose();
  });

  it('cada objeto tiene su integridad y el daño total es la suma; un opcional roto no hace perder y uno obligatorio sí', () => {
    const { g, it } = setup(lamp, 1); // lámpara opcional; el sofá del nivel, obligatorio
    const box = g.addItem(ITEMS.caja, { x: OPEN.x + 3, y: restHeight(ITEMS.caja) + 0.01, z: OPEN.z - 3 }, 0);
    // La lámpara se cae desde la altura de carga y se rompe
    it.body.setTranslation({ x: OPEN.x, y: CARRIER.carryCom + it.body.localCom().y, z: OPEN.z }, true);
    it.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    // La caja (los golpes no la dañan) cae desde 3 m
    box.body.setTranslation({ x: OPEN.x + 3, y: 3, z: OPEN.z - 3 }, true);
    // El sofá se cae del mapa y reaparece: pierde `respawnCost`
    g.sofa.setTranslation({ x: OPEN.x - 12, y: -10, z: OPEN.z - 8 }, true);
    const ev = play(g, 2);
    expect(ev.some((e) => e.type === 'impact' && e.item === box.index)).toBe(true);
    expect(box.integrity).toBe(100);
    expect(it.integrity).toBe(0);
    expect(g.sofaItem.integrity).toBe(100 - RULES.respawnCost);
    expect(g.damageTotal).toBe(100 + RULES.respawnCost);
    expect(g.phase).toBe('playing'); // la lámpara era opcional
    g.dispose();
    // La misma caída con la lámpara obligatoria: se pierde
    const r = setup(lamp, 1, true);
    r.it.body.setTranslation({ x: OPEN.x, y: CARRIER.carryCom + r.it.body.localCom().y, z: OPEN.z }, true);
    r.it.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    const ev2 = play(r.g, 2);
    expect(r.g.phase).toBe('lost');
    expect(r.g.loseReason).toBe('broken');
    expect(ev2).toContainEqual({ type: 'lose', reason: 'broken' });
    r.g.dispose();
  });
});
