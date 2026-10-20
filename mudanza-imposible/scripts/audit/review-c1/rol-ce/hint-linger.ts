// Revisor C+E (ciclo 1): cuánto tarda en irse el aviso «Pesa mucho: falta alguien en el otro extremo» después de que
// llegue la ayuda, según cuánto rato llevaba uno solo arrastrando. Y si sale cuando solo un AYUDANTE arrastra.
// Uso: npx vite-node scripts/audit/review-c1/rol-ce/hint-linger.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';

await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

for (const soloSecs of [2, 5, 10, 20]) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  for (let i = 0; i < 30; i++) g.step(DT, []);
  const [a, b] = g.carriers;
  // J1 en el extremo +x del sofá, J2 apartado
  const s = g.sofaPos;
  a.teleport({ x: s.x + 1.5, y: 0.75, z: s.z }); a.facing = { x: -1, z: 0 };
  b.teleport({ x: s.x - 1.5, y: 0.75, z: s.z }); b.facing = { x: 1, z: 0 };
  for (let i = 0; i < 10; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  let t = 0;
  // Arrastra solo hacia +x/-x alternando para no salir del patio
  for (; t < soloSecs; t += DT) g.step(DT, [inp({ mx: Math.sin(t * 0.6) >= 0 ? 1 : -1 }), NO_INPUT]);
  const heavyBefore = !!g.heavyAlone;
  // Llega J2 y agarra el otro extremo
  const s2 = g.sofaPos;
  b.teleport({ x: s2.x - 1.5, y: 0.75, z: s2.z }); b.facing = { x: 1, z: 0 };
  g.step(DT, [inp({ mx: 1 }), inp({ grab: true })]);
  let linger = 0;
  for (let k = 0; k < 60 * 30 && g.heavyAlone; k++) { g.step(DT, [inp({ mx: 1 }), inp({ mx: 1 })]); linger += DT; }
  console.log(`solo ${soloSecs} s: aviso antes=${heavyBefore}, J2 agarra=${b.holding}; el aviso sigue ${linger.toFixed(2)} s con los dos agarrando (soloDrag acumulado ${(linger * 2).toFixed(1)} s)`);
  g.dispose();
}

// Un ayudante solo (1 humano + 1 ayudante): ¿sale el aviso cuando el que arrastra solo es el ayudante?
{
  const g = new Game(RAPIER, { humans: 1, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  let shown = 0, botSolo = 0;
  for (let i = 0; i < 60 * 8; i++) {
    g.step(DT, [NO_INPUT]);
    const h = g.heavyAlone;
    if (h) { shown += DT; if (h.human === null) botSolo += DT; }
  }
  console.log(`1 humano quieto + 1 ayudante, 8 s: aviso visible ${shown.toFixed(2)} s, de ellos con un AYUDANTE como el que arrastra solo ${botSolo.toFixed(2)} s`);
  g.dispose();
}
