// Papeles del 3.º y el 4.º jugador (ciclo 2, T-roles) y ayudantes con varios objetos, sin navegador: la misma
// simulación que el juego. El piloto reparte a los humanos en equipos por objeto (`PilotPlan`, según `minCarriers`) y
// lleva cada objeto por su ruta a su carril del camión; los ayudantes van al objeto que necesita manos.
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { CALLE } from '../src/levels/calle';
import { PATIO } from '../src/levels/patio';
import type { LevelDef } from '../src/levels/types';
import { Autopilot } from '../src/sim/autopilot';
import { CENTER_Y } from '../src/sim/carrier';
import { Game } from '../src/sim/game';
import type { Item, ItemId } from '../src/sim/items';
import { localToWorld, rotate } from '../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../src/sim/types';
import { ROLE_STARTS } from './roles-starts';

const DT = 1 / 60;
beforeAll(async () => { await RAPIER.init(); });
/** Mediciones en la salida de Vitest (con el informe por defecto, `console.log` de una prueba que pasa no se ve). */
const report = (text: string) => (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`${text}\n`);

const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const item = (g: Game, id: ItemId, n = 0) => g.items.filter((it) => it.def.id === id)[n];
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** Partida con `humans` jugadores llevados por el piloto (uno por jugador, con el reparto) hasta ganar o perder. */
function pilotRun(level: LevelDef, humans: number, carriers = humans) {
  const g = new Game(RAPIER, { level, humans, carriers, botStyle: 'atentos', seed: 1 });
  const aps = Autopilot.team(g);
  for (let i = 0; i < 60 * (level.timeLimit + 5) && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
    g.step(DT, aps.map((a) => a.input(g, DT)));
  }
  const r = { phase: g.phase, time: g.time, integrity: g.integrity, loaded: g.loadedRequired, required: g.requiredCount };
  g.dispose();
  return r;
}

/** Pone a un porteador frente a un asa del objeto, mirándola. */
function atHandle(g: Game, c: number, it: Item, h: number, d = 0.7) {
  const a = localToWorld(it.body, it.def.handles[h].p), out = rotate(it.body.rotation(), it.def.handles[h].out);
  g.carriers[c].teleport({ x: a.x + out.x * d, y: CENTER_Y + 0.05, z: a.z + out.z * d });
  g.carriers[c].facing = { x: -out.x, z: -out.z };
}

describe('El 3.º y el 4.º jugador aportan (T-roles)', () => {
  it('en el patio de pruebas, con 4 humanos se termina al menos un 25 % antes que con 2, y con 3, antes que con 2 (mediana de 3 salidas)', () => {
    const times: Record<number, number[]> = { 2: [], 3: [], 4: [] };
    const lines: string[] = [];
    for (const [name, spawns] of Object.entries(ROLE_STARTS)) {
      for (const n of [2, 3, 4]) {
        const r = pilotRun({ ...PATIO, spawns }, n);
        lines.push(`${name}, ${n} humanos: ${r.phase} en ${r.time.toFixed(2)} s, ${r.loaded}/${r.required} cargados, integridad ${r.integrity}`);
        expect(r.phase, `${name} ${n}`).toBe('won');
        times[n].push(r.time);
      }
    }
    const m = { 2: median(times[2]), 3: median(times[3]), 4: median(times[4]) };
    lines.push(`Medianas: 2 → ${m[2].toFixed(2)} s; 3 → ${m[3].toFixed(2)} s (${((1 - m[3] / m[2]) * 100).toFixed(1)} % antes); 4 → ${m[4].toFixed(2)} s (${((1 - m[4] / m[2]) * 100).toFixed(1)} % antes)`);
    report(`T-roles, «Patio de pruebas»:\n  ${lines.join('\n  ')}`);
    expect(m[4]).toBeLessThanOrEqual(0.75 * m[2]);
    expect(m[3]).toBeLessThan(m[2]);
  });

  it('el reparto forma equipos por objeto según minCarriers; con un solo objeto («La calle»), todos van al sofá', () => {
    const g = new Game(RAPIER, { level: PATIO, humans: 4, carriers: 4, botStyle: 'atentos', seed: 1 });
    const aps = Autopilot.team(g);
    const crews = new Map<number, number[]>();
    for (const a of aps) {
      const it = a.crew.target(g);
      crews.set(it.index, [...(crews.get(it.index) ?? []), a.carrierIndex]);
    }
    // La mesa (dos personas) con dos; el resto, de uno en uno; ninguno a un opcional
    for (const [i, members] of crews) {
      expect(g.items[i].required).toBe(true);
      expect(members.length, g.items[i].def.id).toBe(g.items[i].def.minCarriers);
    }
    expect(crews.get(item(g, 'mesa').index)?.length).toBe(2);
    expect([...crews.values()].flat().sort()).toEqual([0, 1, 2, 3]);
    g.dispose();
    for (const n of [2, 3, 4]) {
      const c = new Game(RAPIER, { level: CALLE, humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
      const team = Autopilot.team(c);
      expect(new Set(team.map((a) => a.crew)).size).toBe(1);
      expect(team[0].crew.target(c)).toBe(c.sofaItem);
      c.dispose();
    }
  });
});

describe('Ayudantes con varios objetos', () => {
  it('van al objeto que lleva un jugador y necesita manos (la mesa), no a una caja que ya se lleva sola ni a un opcional', () => {
    const g = new Game(RAPIER, { level: PATIO, humans: 2, carriers: 4, botStyle: 'atentos', seed: 1 });
    g.phase = 'playing'; g.countdown = 0;
    const mesa = item(g, 'mesa'), caja = item(g, 'caja');
    // J1 agarra la mesa por un extremo; J2, una caja. Los ayudantes, en sus salidas, al oeste del patio
    atHandle(g, 0, mesa, 0);
    atHandle(g, 1, caja, 0);
    for (let i = 0; i < 18; i++) g.step(DT, []);
    g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
    expect(g.carriers[0].heldBody).toBe(mesa.body);
    expect(g.carriers[1].heldBody).toBe(caja.body);
    // Los dos ayudantes van a por la mesa (le falta una persona para ir en el aire y tiene asas libres)
    expect([...g.bots.values()].map((b) => g.items[b.item].def.id)).toEqual(['mesa', 'mesa']);
    for (let i = 0; i < 60 * 6; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
    const holders = (it: Item) => g.carriers.filter((c) => c.heldBody === it.body).map((c) => c.id);
    expect(holders(mesa)).toContain(0);
    expect(holders(mesa).filter((i) => i >= 2).length).toBeGreaterThanOrEqual(1);
    // Nadie ayuda con la caja (la lleva bien una persona) ni agarra un opcional
    expect(holders(caja)).toEqual([1]);
    for (const it of g.items.filter((o) => !o.required)) expect(holders(it), it.def.id).toEqual([]);
    g.dispose();
  });

  it('en «La calle», con un solo objeto, todos los ayudantes van al sofá como antes', () => {
    const g = new Game(RAPIER, { level: CALLE, humans: 1, carriers: 4, botStyle: 'atentos', seed: 1 });
    for (let i = 0; i < 60 * 4; i++) g.step(DT, []);
    expect([...g.bots.values()].every((b) => b.item === g.sofaItem.index)).toBe(true);
    g.dispose();
  });

  it('con un jugador (el piloto) y dos ayudantes atentos se carga todo el patio: ellos ponen las manos que faltan', () => {
    const r = pilotRun(PATIO, 1, 3);
    report(`Patio con 1 jugador y 2 ayudantes atentos: ${r.phase} en ${r.time.toFixed(2)} s, integridad ${r.integrity}`);
    expect(r.phase).toBe('won');
    expect(r.loaded).toBe(r.required);
  });
});
