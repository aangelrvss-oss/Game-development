// Revisor A+G+C+E (ciclo 1, segunda ronda): el aviso «Pesa mucho» después de la corrección (tope de 1 s y borrado al
// llegar ayuda). Casos:
//  A) arrastra solo 2/5/10/20 s y J2 agarra: ¿cuánto sigue el aviso?
//  B) arrastra solo 20 s y se para (sigue agarrando): ¿cuánto sigue?
//  C) J2 agarra y vuelve a soltar mientras J1 sigue arrastrando: ¿vuelve el aviso y cuándo?
//  D) J1 arrastra solo con tirones intermitentes (0,5 s sí, 0,4 s no): ¿parpadea? (encendidos/apagados en 10 s)
//  E) dos jugadores en el MISMO extremo arrastrando: ¿avisa? (menor de la primera ronda)
//  F) J1 agarra solo y se queda quieto: ¿qué aviso ven los demás?
// Uso: npx vite-node scripts/audit/review-c1b/rol-agce/aviso.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';

await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function setup(humans = 2) {
  const g = new Game(RAPIER, { humans, carriers: humans, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  for (let i = 0; i < 30; i++) g.step(DT, []);
  const s = g.sofaPos;
  const [a, b] = g.carriers;
  a.teleport({ x: s.x + 1.5, y: 0.75, z: s.z }); a.facing = { x: -1, z: 0 };
  b.teleport({ x: s.x - 1.5, y: 0.75, z: s.z }); b.facing = { x: 1, z: 0 };
  for (let i = 0; i < 10; i++) g.step(DT, []);
  return g;
}
const dragDir = (t: number) => (Math.sin(t * 0.6) >= 0 ? 1 : -1);

// A
for (const secs of [2, 5, 10, 20]) {
  const g = setup();
  const [, b] = g.carriers;
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  let t = 0;
  for (; t < secs; t += DT) g.step(DT, [inp({ mx: dragDir(t) }), NO_INPUT]);
  const before = !!g.heavyAlone;
  const s2 = g.sofaPos;
  b.teleport({ x: s2.x - 1.5, y: 0.75, z: s2.z }); b.facing = { x: 1, z: 0 };
  g.step(DT, [inp({ mx: 1 }), inp({ grab: true })]);
  let linger = 0;
  for (let k = 0; k < 600 && g.heavyAlone; k++) { g.step(DT, [inp({ mx: 1 }), inp({ mx: 1 })]); linger += DT; }
  console.log(`A) ${secs} s solo: aviso antes ${before}; J2 agarra ${b.holding}; sigue ${linger.toFixed(2)} s con los dos`);
  g.dispose();
}
// B
{
  const g = setup();
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  for (let t = 0; t < 20; t += DT) g.step(DT, [inp({ mx: dragDir(t) }), NO_INPUT]);
  let linger = 0;
  for (let k = 0; k < 600 && g.heavyAlone; k++) { g.step(DT, [NO_INPUT, NO_INPUT]); linger += DT; }
  console.log(`B) 20 s solo y se para (agarrando ${g.carriers[0].holding}): el aviso sigue ${linger.toFixed(2)} s`);
  g.dispose();
}
// C
{
  const g = setup();
  const [a, b] = g.carriers;
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  for (let t = 0; t < 3; t += DT) g.step(DT, [inp({ mx: 1 }), NO_INPUT]);
  const s2 = g.sofaPos;
  b.teleport({ x: s2.x - 1.5, y: 0.75, z: s2.z }); b.facing = { x: 1, z: 0 };
  g.step(DT, [inp({ mx: 1 }), inp({ grab: true })]);
  for (let t = 0; t < 1; t += DT) g.step(DT, [inp({ mx: 1 }), inp({ mx: 1 })]);
  const mid = !!g.heavyAlone;
  g.step(DT, [inp({ mx: 1 }), inp({ grab: true })]); // J2 suelta
  let back = -1;
  for (let t = 0; t < 4; t += DT) { g.step(DT, [inp({ mx: -1 }), NO_INPUT]); if (g.heavyAlone && back < 0) back = t; }
  console.log(`C) con J2 agarrando: aviso ${mid}; J2 suelta (${!b.holding}), J1 sigue (${a.holding}): el aviso vuelve a los ${back.toFixed(2)} s`);
  g.dispose();
}
// D
{
  const g = setup();
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  let on = false, toggles = 0, shown = 0;
  for (let t = 0; t < 10; t += DT) {
    const pulling = (t % 0.9) < 0.5;
    g.step(DT, [pulling ? inp({ mx: dragDir(t) }) : NO_INPUT, NO_INPUT]);
    const h = !!g.heavyAlone;
    if (h !== on) { toggles++; on = h; }
    if (h) shown += DT;
  }
  console.log(`D) tirones de 0,5 s con pausas de 0,4 s durante 10 s: aviso visible ${shown.toFixed(2)} s, ${toggles} cambios (encendido/apagado)`);
  g.dispose();
}
// E
{
  const g = setup();
  const [a, b] = g.carriers;
  const s = g.sofaPos;
  b.teleport({ x: s.x + 1.5, y: 0.75, z: s.z + 0.55 }); b.facing = { x: -1, z: 0 };
  a.teleport({ x: s.x + 1.5, y: 0.75, z: s.z - 0.55 }); a.facing = { x: -1, z: 0 };
  for (let i = 0; i < 10; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  let shown = 0;
  const x0 = g.sofaPos.x;
  for (let t = 0; t < 3; t += DT) { g.step(DT, [inp({ mx: 1 }), inp({ mx: 1 })]); if (g.heavyAlone) shown += DT; }
  console.log(`E) dos en el mismo extremo (agarran ${a.holding}/${b.holding}): sofá ${(g.sofaPos.x - x0).toFixed(2)} m en 3 s; aviso ${shown.toFixed(2)} s`);
  g.dispose();
}
// F
{
  const g = setup();
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  let shown = 0;
  for (let t = 0; t < 3; t += DT) { g.step(DT, [NO_INPUT, NO_INPUT]); if (g.heavyAlone) shown += DT; }
  console.log(`F) J1 agarra y se queda quieto 3 s: aviso «Pesa mucho» ${shown.toFixed(2)} s (el HUD no tiene otro aviso para los demás mientras alguien agarra)`);
  g.dispose();
}
