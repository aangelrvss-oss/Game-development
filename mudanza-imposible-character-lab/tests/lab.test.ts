// Pruebas de la simulación del laboratorio (sin navegador): estabilidad, estados y las cuatro pruebas.
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { CENTER_Y } from '../src/sim/character';
import { DT, Lab, ZONES } from '../src/sim/lab';
import type { CharState, TestId } from '../src/sim/types';

beforeAll(async () => { await RAPIER.init(); });

interface Run { lab: Lab; states: CharState[]; maxChar: number; maxSofa: number; minFoot: number; nan: boolean; sofaYaws: number[]; maxGap: number }

function run(test: TestId, secs: number, opts: { intensity?: number; reactions?: boolean } = {}): Run {
  const lab = new Lab(RAPIER);
  if (opts.intensity !== undefined) lab.setIntensity(opts.intensity);
  if (opts.reactions !== undefined) lab.setReactions(opts.reactions);
  lab.reset(test);
  const r: Run = { lab, states: [], maxChar: 0, maxSofa: 0, minFoot: Infinity, nan: false, sofaYaws: [], maxGap: 0 };
  for (let i = 0; i < secs / DT; i++) {
    lab.step();
    const c = lab.char, p = c.pos, v = c.body.linvel(), sv = lab.sofa.linvel(), q = lab.sofa.rotation(), s = lab.sofaPos;
    if (r.states[r.states.length - 1] !== c.state) r.states.push(c.state);
    r.maxChar = Math.max(r.maxChar, Math.hypot(v.x, v.y, v.z));
    r.maxSofa = Math.max(r.maxSofa, Math.hypot(sv.x, sv.y, sv.z));
    if (c.upright) r.minFoot = Math.min(r.minFoot, p.y - CENTER_Y - lab.heightAt(p.x, p.z));
    r.nan ||= [p.x, p.y, p.z, s.x, s.y, s.z, c.lean.x, c.lean.z].some((n) => !Number.isFinite(n));
    r.sofaYaws.push(Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z)));
    r.maxGap = Math.max(r.maxGap, Math.hypot(p.x - s.x, p.z - s.z));
  }
  return r;
}
const events = (r: Run) => r.lab.log.map((l) => l.e);
const at = (r: Run, e: string) => r.lab.log.find((l) => l.e === e)?.t;

describe('Estabilidad', () => {
  it('quieto no vibra ni deriva, y el sofá en reposo no se mueve', () => {
    const r = run('libre', 3);
    const lab = r.lab, p0 = lab.char.pos, s0 = lab.sofaPos;
    for (let i = 0; i < 120; i++) lab.step();
    const p1 = lab.char.pos, s1 = lab.sofaPos;
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.01);
    expect(Math.hypot(s1.x - s0.x, s1.y - s0.y, s1.z - s0.z)).toBeLessThan(0.01);
    expect(r.states).toEqual(['idle']);
  });

  it.each(['A', 'B', 'C', 'D'] as const)('prueba %s: sin valores raros, sin atravesar el suelo ni salir disparado', (t) => {
    const r = run(t, 9);
    expect(r.nan).toBe(false);
    expect(r.minFoot).toBeGreaterThan(-0.05);
    expect(r.maxChar).toBeLessThan(8);
    expect(r.maxSofa).toBeLessThan(6);
    // Termina de pie y controlable
    expect(r.lab.char.upright).toBe(true);
  });

  it('las pruebas se repiten igual (mundo nuevo en cada reinicio)', () => {
    const a = run('D', 6).lab.log, b = run('D', 6).lab.log;
    expect(b).toEqual(a);
  });
});

describe('A · caminar', () => {
  it('camina, se para y no pierde el equilibrio por sus propios arranques', () => {
    const r = run('A', 9);
    expect(r.states).toContain('walking');
    expect(r.states[r.states.length - 1]).toBe('idle');
    expect(r.states).not.toContain('losingBalance');
    const p = r.lab.char.pos;
    expect(Math.hypot(p.x + 0.4, p.z - 1.4)).toBeLessThan(0.3);
  });
});

describe('B · tirar del sofá', () => {
  it('al principio apenas lo mueve; al salir de la alfombra se suelta de golpe y pierde el equilibrio', () => {
    const lab = new Lab(RAPIER);
    lab.reset('B');
    const z0 = lab.sofaPos.z;
    let pullStart: number | undefined;
    for (let i = 0; i < 9 / DT; i++) {
      lab.step();
      if (pullStart === undefined && lab.char.state === 'pulling') pullStart = lab.testTime;
      if (pullStart !== undefined && lab.testTime < pullStart + 1) expect(lab.sofaPos.z - z0).toBeLessThan(0.15);
    }
    expect(pullStart).toBeDefined();
    const lost = lab.log.find((l) => l.e === 'desequilibrio');
    expect(lost).toBeDefined();
    // El desequilibrio llega cuando el sofá ya ha salido de la alfombra, no antes
    expect(lab.memo.fuera).toBeDefined();
    expect(lost!.t).toBeGreaterThanOrEqual(lab.memo.fuera - 0.6);
  });

  it('la intensidad cambia el desenlace: aguanta, trastabilla o se cae', () => {
    expect(events(run('B', 8, { intensity: 0.5 }))).not.toContain('desequilibrio');
    const mid = events(run('B', 8, { intensity: 1 }));
    expect(mid).toContain('desequilibrio');
    expect(mid).not.toContain('cae');
    expect(events(run('B', 8, { intensity: 1.5 }))).toContain('cae');
  });
});

describe('C · tropiezo y caída', () => {
  it('tropieza, intenta recuperarse, cae, se queda en el suelo, se levanta y vuelve a andar', () => {
    const r = run('C', 9);
    expect(events(r)).toEqual(expect.arrayContaining(['tropieza', 'desequilibrio', 'cae', 'se levanta', 'de pie']));
    expect(at(r, 'cae')! - at(r, 'desequilibrio')!).toBeGreaterThan(0.25); // se le ve intentarlo
    expect(at(r, 'se levanta')! - at(r, 'cae')!).toBeGreaterThan(0.8); // un instante en el suelo
    const i = r.states.lastIndexOf('recovering');
    expect(r.states.slice(i + 1)).toContain('walking'); // controlable otra vez
  });

  it('sin reacciones físicas no hay tropiezo: la comparación tiene sentido', () => {
    expect(events(run('C', 6, { reactions: false }))).not.toContain('cae');
  });
});

describe('D · física imprevisible', () => {
  it('el sofá gira alrededor de su mano, se le escapa y se aleja; luego le empuja', () => {
    const r = run('D', 8);
    const yaws = r.sofaYaws;
    expect(Math.max(...yaws.map((y) => Math.abs(y)))).toBeGreaterThan(Math.PI / 4);
    expect(events(r)).toContain('se le escapa');
    expect(r.maxGap).toBeGreaterThan(1.6);
    expect(events(r)).toContain('desequilibrio');
    expect(r.lab.sofaPos.z).toBeGreaterThan(ZONES.ramp.z1 - 1.5); // ha bajado la rampa
  });
});
