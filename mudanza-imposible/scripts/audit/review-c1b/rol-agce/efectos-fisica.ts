// Revisor A+G+C+E (ciclo 1, segunda ronda): efectos en el producto de la elipse lateral de la mano y de la correa que
// cede. Sin navegador.
//  A) Dos llevan el sofá en llano 3 s a lo largo, en diagonal y de lado: distancia, altura del sofá, si sale el aviso
//     de atasco (stuckTime > 1,5 s) y tensión de la mano (strain: lo que enciende el esfuerzo del muñeco).
//  B) Tira y afloja de humanos: 1 contra 1, 2 contra 1 (3 humanos), 3 contra 1 (4 humanos): quién se suelta, caídas.
//  C) 1 humano (piloto) + 5 ayudantes despistados, semillas 1–8: sueltas y caídas DEL HUMANO, tiempo.
//  D) 2 humanos con el piloto, semillas 1–4: ¿alguna suelta o caída inesperada en una partida normal?
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/efectos-fisica.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';

await RAPIER.init({});
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function setup(humans: number, carriers = humans, style: 'atentos' | 'despistados' = 'atentos') {
  const g = new Game(RAPIER, { humans, carriers, botStyle: style, seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  for (let i = 0; i < 30; i++) g.step(DT, Array.from({ length: humans }, () => NO_INPUT));
  return g;
}
/** Coloca a los humanos en los extremos del sofá (alternando +x / −x) mirándolo, y que agarren. */
function grabEnds(g: Game, humans: number) {
  const s = g.sofaPos;
  g.carriers.forEach((c, i) => {
    if (c.human === null) return;
    const side = i % 2 === 0 ? 1 : -1, off = Math.floor(i / 2) * 0.5 - 0.25 * (humans > 2 ? 1 : 0);
    c.teleport({ x: s.x + side * 1.5, y: 0.75, z: s.z + off }); c.facing = { x: -side, z: 0 };
  });
  for (let i = 0; i < 10; i++) g.step(DT, Array.from({ length: humans }, () => NO_INPUT));
  g.step(DT, Array.from({ length: humans }, () => inp({ grab: true })));
  for (let i = 0; i < 40; i++) g.step(DT, Array.from({ length: humans }, () => NO_INPUT));
}

// A
for (const [name, dx, dz] of [['a lo largo', 1, 0], ['en diagonal', Math.SQRT1_2, Math.SQRT1_2], ['de lado', 0, 1]] as const) {
  const g = setup(2);
  grabEnds(g, 2);
  const p0 = { ...g.sofaPos };
  let minY = 9, stuck = 0, strain = 0, n = 0;
  for (let t = 0; t < 3; t += DT) {
    g.step(DT, [inp({ mx: dx, mz: dz }), inp({ mx: dx, mz: dz })]);
    minY = Math.min(minY, g.sofaPos.y); if (g.stuckTime > 1.5) stuck += DT;
    strain += Math.max(...g.carriers.map((c) => c.strain)); n++;
  }
  const d = Math.hypot(g.sofaPos.x - p0.x, g.sofaPos.z - p0.z);
  console.log(`A) dos, ${name}: ${d.toFixed(2)} m en 3 s; centro del sofá ≥ ${minY.toFixed(2)} m; aviso de atasco ${stuck.toFixed(2)} s; tensión media de la mano ${(strain / n).toFixed(2)}; agarran ${g.carriers.map((c) => c.holding).join('/')}`);
  g.dispose();
}

// B
for (const [humans, against] of [[2, 1], [3, 1], [4, 1]] as const) {
  const g = setup(humans);
  grabEnds(g, humans);
  // Todos menos el último tiran hacia +x; el último (en el extremo −x si es impar… se elige el de −x) hacia −x
  const holds = g.carriers.map((c) => (c.holding ? "sí" : "no")).join("/");
  const lone = g.carriers.findIndex((c, i) => c.human !== null && i % 2 === 1);
  const evs: string[] = []; let falls = 0;
  for (let t = 0; t < 4; t += DT) {
    const ins = g.carriers.filter((c) => c.human !== null).map((c, i) => (i === lone ? inp({ mx: -1 }) : inp({ mx: 1 })));
    g.step(DT, ins);
    for (const e of g.out) {
      if (e.type === 'gripBreak' || e.type === 'release') evs.push(`${g.time.toFixed(2)} ${e.type} J${e.carrier + 1}`);
      if (e.type === 'fall' || e.type === 'stun') { falls++; evs.push(`${g.time.toFixed(2)} ${e.type} J${e.carrier + 1}`); }
    }
  }
  console.log(`B) [agarran al empezar: ${holds}] ${humans} humanos, ${humans - against} contra ${against} (J${lone + 1} solo): sucesos ${evs.slice(0, 6).join(', ') || 'ninguno'}; caídas ${falls}`);
  g.dispose();
}

// C
{
  const res: string[] = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = new Game(RAPIER, { humans: 1, carriers: 6, botStyle: 'despistados', seed });
    const ap = new Autopilot(0);
    let hb = 0, hf = 0, bf = 0;
    for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      g.step(DT, [ap.input(g, DT)]);
      for (const e of g.out) {
        if (e.type === 'gripBreak' && e.carrier === 0) hb++;
        if ((e.type === 'fall' || e.type === 'stun') && e.carrier === 0) hf++;
        if ((e.type === 'fall' || e.type === 'stun') && e.carrier !== 0) bf++;
      }
    }
    res.push(`${g.phase === 'won' ? 'G' : 'P'}${g.time.toFixed(0)}s(J1: ${hb} escapes, ${hf} caídas; ayudantes ${bf} caídas)`);
    g.dispose();
  }
  console.log(`C) 1 humano + 5 despistados: ${res.join(' ')}`);
}

// D
{
  const res: string[] = [];
  for (const seed of [1, 2, 3, 4]) {
    const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed });
    const team = Autopilot.team(g);
    let br = 0, fa = 0;
    for (let i = 0; i < 60 * 200 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      const ins: PlayerInput[] = [NO_INPUT, NO_INPUT];
      for (const a of team) ins[g.carriers[a.carrierIndex].human!] = a.input(g, DT);
      g.step(DT, ins);
      for (const e of g.out) { if (e.type === 'gripBreak') br++; if (e.type === 'fall' || e.type === 'stun') fa++; }
    }
    res.push(`${g.phase}@${g.time.toFixed(1)}s(escapes ${br}, caídas ${fa})`);
    g.dispose();
  }
  console.log(`D) 2 humanos con el piloto: ${res.join(' ')}`);
}
