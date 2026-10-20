// Revisión c1b, roles B+F. T-grip-2 en la escalera más allá de la prueba (que solo agarra los extremos): uno solo
// agarra el sofá por otros puntos (respaldo, esquinas, costado) y anda escalera arriba 20 s. ¿Lo sube?
// También en llano: ¿cuánto lo lleva en 10 s agarrando por el centro del respaldo?
// Uso: npx vite-node scripts/audit/review-c1b/fisica-qa/escalera-solo.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { FLOOR2, STAIRS } from '../../../../src/sim/level';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60, standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const h = SOFA.half;

function run(label: string, lx: number, lz: number, ox: number, oz: number, gap = 0.75) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: 0, y: 0.25, z: STAIRS.z0 + 2.2 }, true);
  g.sofa.setRotation(yawQuat(Math.PI / 2), true);
  g.carriers.forEach((c, i) => c.teleport({ x: -35 + 5 + i * 1.5, y: standY, z: 25 + 6 }));
  for (let i = 0; i < 30; i++) g.step(DT, []);
  const a = localToWorld(g.sofa, { x: lx, y: 0, z: lz }), o = localToWorld(g.sofa, { x: lx + ox * gap, y: 0, z: lz + oz * gap });
  const c = g.carriers[0], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z }); c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
  for (let i = 0; i < 18; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  if (!c.holding) { console.log(`${label}: no llega a agarrar (porteador en ${o.x.toFixed(2)}, ${o.z.toFixed(2)})`); g.dispose(); return; }
  const gl = c.grabLocal!;
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  let t = 0, up = -1, maxZ = 0, breaks = 0;
  const z0 = g.sofaPos.z;
  for (let i = 0; i < 20 * 60 && up < 0; i++) {
    // Anda hacia arriba (−z); si se suelta, vuelve a agarrar (como haría un jugador)
    g.step(DT, [inp({ mz: -1, grab: !c.holding && i % 20 === 0 }), NO_INPUT]);
    t += DT;
    for (const e of g.out) if (e.type === 'gripBreak') breaks++;
    maxZ = Math.max(maxZ, z0 - g.sofaPos.z);
    if (g.sofaPos.z < STAIRS.z1 && g.sofaPos.y > FLOOR2 + 0.15) up = t;
  }
  console.log(`${label}: agarre local (${gl.x.toFixed(2)}, ${gl.y.toFixed(2)}, ${gl.z.toFixed(2)}); ${up > 0 ? `LO SUBE SOLO en ${up.toFixed(1)} s` : `no lo sube en 20 s (avanza ${maxZ.toFixed(2)} m, y ${g.sofaPos.y.toFixed(2)})`}; gripBreak ${breaks}; integridad ${g.integrity}`);
  g.dispose();
}

// Con giro π/2, el eje x local del sofá va por −z del mundo: el extremo +x mira hacia la escalera
run('extremo +x (delante, como la prueba)', h.x, 0, 1, 0);
run('extremo -x (detrás, como la prueba)', -h.x, 0, -1, 0);
run('esquina +x+z', h.x, h.z * 0.8, 0.7071, 0.7071, 0.5);
run('esquina +x-z', h.x, -h.z * 0.8, 0.7071, -0.7071, 0.5);
run('centro respaldo -z', 0, -h.z, 0, -1, 0.5);
run('cuarto respaldo -z delante', h.x / 2, -h.z, 0, -1, 0.5);
run('centro asiento +z', 0, h.z, 0, 1, 0.5);
run('cuarto asiento +z delante', h.x / 2, h.z, 0, 1, 0.5);

// En llano: 10 s agarrando el respaldo por el centro y andando hacia atrás
{
  const OPEN = { x: -35, z: 25 };
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.carriers.forEach((c, i) => c.teleport({ x: OPEN.x + 5 + i * 1.5, y: standY, z: OPEN.z + 6 }));
  for (let i = 0; i < 30; i++) g.step(DT, []);
  const c = g.carriers[0];
  c.teleport({ x: OPEN.x, y: standY, z: OPEN.z - h.z - 0.75 }); c.facing = { x: 0, z: 1 };
  for (let i = 0; i < 18; i++) g.step(DT, []);
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const s0 = g.sofaPos, marks: string[] = [];
  let minBase = Infinity;
  for (let i = 1; i <= 10 * 60; i++) {
    g.step(DT, [inp({ mz: -1 }), NO_INPUT]);
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => localToWorld(g.sofa, { x: sx * h.x, y: -h.y, z: sz * h.z }).y));
    minBase = Math.min(minBase, Math.max(...corners));
    if (i % 120 === 0) marks.push(`${(i / 60).toFixed(0)} s: ${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} m`);
  }
  console.log(`Llano, respaldo por el centro, andando hacia atrás: ${marks.join(', ')}; agarra ${c.holding}; aviso «Pesa mucho» ${g.heavyAlone ? 'sí' : 'no'}; integridad ${g.integrity}`);
  g.dispose();
}
