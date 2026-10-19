// qa-03: el helper place() de tests/sim.test.ts:22-31 manda a los porteadores a (x+30, z+30), pero la regla de
// rescate de game.ts:332-336 (más de 22 m del sofá) los devuelve junto al sofá en el primer paso.
// 1) Posición del porteador tras un paso en los escenarios de las pruebas.
// 2) ¿Cambia el resultado de las pruebas si el porteador está apartado de verdad? (se le vuelve a alejar tras
//    cada paso, de modo que nunca está cerca del sofá durante world.step ni en la lista de obstáculos del tráfico).
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { DOOR, RAMP, FLOOR2 } from '../../../src/sim/level.ts';
import { yawQuat } from '../../../src/sim/sofa.ts';
import { CAR, LANES } from '../../../src/sim/traffic.ts';
import type { GameEvent } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
// Copia literal del helper de la prueba
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
let park = false;
const parkFar = (g: Game) => { if (park) for (const c of g.carriers) { const s = g.sofaPos; c.teleport({ x: s.x + 30, y: 0.7, z: s.z + 30 }); } };
let minD = Infinity;
const track = (g: Game) => { for (const c of g.carriers) minD = Math.min(minD, Math.hypot(c.pos.x - g.sofaPos.x, c.pos.z - g.sofaPos.z)); };
function step(g: Game, ev?: GameEvent[]) { g.step(DT, []); if (ev) ev.push(...g.out); parkFar(g); track(g); }
function play(g: Game, s: number) { const ev: GameEvent[] = []; for (let i = 0; i < s * 60; i++) step(g, ev); return ev; }
const f = (n: number) => n.toFixed(2);
const firstStep = (label: string, g: Game) => {
  g.step(DT, []);
  const c = g.carriers[0].pos, s = g.sofaPos;
  console.log(`[tras 1 paso] ${label}: porteador=(${f(c.x)},${f(c.y)},${f(c.z)}) sofá=(${f(s.x)},${f(s.y)},${f(s.z)}) distancia horizontal=${f(Math.hypot(c.x - s.x, c.z - s.z))} m`);
  return c;
};
// --- 1) Posición tras un paso ---
{
  const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' }); place(g, 0, DOOR.z + 2.5, 0, 0.3); firstStep('puerta (prueba :75-87)', g); g.dispose();
}
{
  const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' }); g.clock = 0; place(g, 8, -1.6, 0, 0.3);
  const c = firstStep('coche (prueba :104-116)', g);
  console.log(`   |c.z - LANES[0].z| = ${f(Math.abs(c.z - LANES[0].z))}  umbral de detección CAR.hz + 0.9 = ${f(CAR.hz + 0.9)}  -> dentro de la banda: ${Math.abs(c.z - LANES[0].z) <= CAR.hz + 0.9}`);
  g.dispose();
}
{
  const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' }); place(g, 0, 10, 0); firstStep('patio (pruebas :132,:144,:155)', g); g.dispose();
}
{
  const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' }); place(g, RAMP.x0 + 2, (RAMP.z0 + RAMP.z1) / 2, 0, FLOOR2 + 0.2); firstStep('rampa (prueba :210)', g); g.dispose();
}
// --- 2) Resultado de las pruebas con rescate (como hoy) y con el porteador apartado de verdad ---
for (const p of [false, true]) {
  park = p;
  const tag = p ? 'APARTADO DE VERDAD' : 'COMO EN LA PRUEBA';
  const door = (yaw: number) => {
    const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, 0, DOOR.z + 2.5, yaw, 0.3); minD = Infinity;
    play(g, 0.5);
    for (let i = 0; i < 60 * 5; i++) { g.sofa.applyImpulse({ x: 0, y: 0, z: -g.sofa.mass() * 10 * DT }, true); step(g); }
    const z = g.sofaPos.z; g.dispose(); return z;
  };
  const z0 = door(0), dmin0 = minD, z1 = door(Math.PI / 2), dmin1 = minD;
  console.log(`${tag} puerta: de lado z=${f(z0)} (umbral > ${f(DOOR.z - 0.2)}) dmin=${f(dmin0)}; de largo z=${f(z1)} (umbral < ${f(DOOR.z - 1.5)}) dmin=${f(dmin1)}`);
  {
    const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' });
    g.clock = 0; place(g, 8, -1.6, 0, 0.3); minD = Infinity;
    const x0 = g.sofaPos.x; const ev = play(g, 8);
    const hits = ev.filter((e) => e.type === 'carHit');
    const firstHonk = ev.findIndex((e) => e.type === 'honk');
    console.log(`${tag} coche: carHit(sofa)=${hits.some((e) => e.type === 'carHit' && e.target === 'sofa')} carHit(porteador)=${hits.some((e) => e.type === 'carHit' && e.target === 'carrier')} honk=${firstHonk >= 0} integridad=${g.integrity} (umbral <= ${100 - RULES.carDamage}) |dx|=${f(Math.abs(g.sofaPos.x - x0))} dmin=${f(minD)}`);
    g.dispose();
  }
  {
    const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, RAMP.x0 + 2, (RAMP.z0 + RAMP.z1) / 2, 0, FLOOR2 + 0.2); minD = Infinity;
    play(g, 0.3); const x0 = g.sofaPos.x; play(g, 3);
    console.log(`${tag} rampa: dx=${f(g.sofaPos.x - x0)} (umbral > 2.5) dmin=${f(minD)}`);
    g.dispose();
  }
  {
    const g = new Game(RAPIER as any, { humans: 0, carriers: 1, botStyle: 'atentos' });
    place(g, 0, 10, 0); minD = Infinity;
    g.sofa.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
    play(g, 1.5); const up0 = g.sofaUp; const ok = g.tryRight(); play(g, 2);
    console.log(`${tag} enderezar: up antes=${f(up0)} tryRight=${ok} up después=${f(g.sofaUp)} (umbral > 0.95) dmin=${f(minD)}`);
    g.dispose();
  }
}
