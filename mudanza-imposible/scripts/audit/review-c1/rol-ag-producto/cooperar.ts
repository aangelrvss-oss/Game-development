// Revisor A+G (ciclo 1): ¿hace falta cooperar y lo dice el juego?
//   npx vite-node scripts/audit/review-c1/rol-ag-producto/cooperar.ts
// 1) Uno solo arrastrando 3 s en llano, a lo largo y de lado (T-grip-2: 0,3–1,5 m), con el aviso «Pesa mucho».
// 2) Dos en el MISMO extremo: ¿lo llevan? ¿avisa el juego de que falta alguien en el otro extremo?
// 3) Un solo jugador activo con el piloto (los demás quietos) durante 180 s: ¿hasta dónde llega?
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const OPEN = { x: -35, z: 25 };
const standY = CENTER_Y + 0.05;
const play = (g: Game, s: number, f: (g: Game) => PlayerInput[] = () => []) => { for (let i = 0; i < s * 60; i++) g.step(DT, f(g)); };

function setup(n: number) {
  const g = new Game(RAPIER, { humans: n, carriers: n, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.sofa.setRotation(yawQuat(0), true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  play(g, 0.5);
  return g;
}
/** Porteador i frente al extremo ±x del sofá; `dz` lo corre a lo ancho (para poner a dos en el mismo extremo). */
function atEnd(g: Game, i: number, side: 1 | -1, dz = 0) {
  const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: dz });
  const o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: dz });
  const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z });
  c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
}
const endBase = (g: Game, side: 1 | -1) => Math.min(...[-1, 1].map((sz) => localToWorld(g.sofa, { x: side * SOFA.half.x, y: -SOFA.half.y, z: sz * SOFA.half.z }).y));

function drag(label: string, who: { i: number; side: 1 | -1; dz?: number }[], n: number, mx: number, mz: number) {
  const g = setup(n);
  for (const w of who) atEnd(g, w.i, w.side, w.dz ?? 0);
  play(g, 0.3);
  g.step(DT, Array.from({ length: n }, (_, k) => inp({ grab: who.some((w) => w.i === k) })));
  play(g, 0.5);
  const s0 = g.sofaPos;
  let heavy = 0, minFree = Infinity, maxFree = -Infinity;
  play(g, 3, (g) => {
    if (g.heavyAlone) heavy += DT;
    const other = (who[0].side === 1 ? -1 : 1) as 1 | -1;
    minFree = Math.min(minFree, endBase(g, other)); maxFree = Math.max(maxFree, endBase(g, other));
    return Array.from({ length: n }, (_, k) => (who.some((w) => w.i === k) ? inp({ mx, mz }) : NO_INPUT));
  });
  const d = Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z);
  console.log(`${label}: ${d.toFixed(2)} m en 3 s; agarran ${g.carriers.map((c) => (c.holding ? 'sí' : 'no')).join('/')}; extremo libre a ${minFree.toFixed(2)}–${maxFree.toFixed(2)} m del suelo; aviso «Pesa mucho» ${heavy.toFixed(1)} s de 3`);
  g.dispose();
  return d;
}

console.log('--- Arrastre en llano, 3 s desde parado ---');
const along = drag('Uno solo, a lo largo (alejándose)', [{ i: 0, side: -1 }], 2, -1, 0);
const sideways = drag('Uno solo, de lado (perpendicular al eje largo)', [{ i: 0, side: -1 }], 2, 0, -1);
drag('Uno solo, en diagonal', [{ i: 0, side: -1 }], 2, -0.707, -0.707);
const duo = drag('Dos en extremos opuestos, a lo largo', [{ i: 0, side: -1 }, { i: 1, side: 1 }], 2, -1, 0);
const same = drag('Dos en el MISMO extremo, a lo largo', [{ i: 0, side: -1, dz: -0.35 }, { i: 1, side: -1, dz: 0.35 }], 2, -1, 0);
console.log(`T-grip-2 pide 0,3–1,5 m: a lo largo ${along.toFixed(2)}, de lado ${sideways.toFixed(2)} → ${sideways > 1.5 ? 'DE LADO SE PASA DEL LÍMITE' : 'dentro'}`);
console.log(`Mismo extremo / extremos opuestos: ${(same / duo).toFixed(2)}`);

console.log('--- Un solo jugador activo con el piloto, 180 s ---');
for (const [humans, label] of [[2, 'de 2'], [4, 'de 4']] as const) {
  for (const seed of [1, 2]) {
    const g = new Game(RAPIER, { humans, carriers: humans, botStyle: 'atentos', seed });
    const pilots = Autopilot.team(g).filter((a) => g.carriers[a.carrierIndex].human === 0);
    let heavy = 0;
    for (let i = 0; i < 60 * 185 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
      const inputs: PlayerInput[] = Array.from({ length: humans }, () => NO_INPUT);
      for (const a of pilots) inputs[0] = a.input(g, DT);
      g.step(DT, inputs);
      if (g.heavyAlone) heavy += DT;
    }
    console.log(`Solo J1 activo (partida ${label}, semilla ${seed}): ${g.phase}, etapa «${g.stageLabel}», ${g.time.toFixed(0)} s, sofá ${Math.round(g.integrity)} %, aviso «Pesa mucho» visible ${heavy.toFixed(0)} s`);
    g.dispose();
  }
}
