// Revisión ciclo 1 (rol A+G): ¿cuánto dura el aviso «Pesa mucho: falta alguien en el otro extremo» cuando el
// compañero YA ha agarrado (o cuando el que arrastraba suelta)? `soloDrag` crece sin límite y baja a 2× velocidad.
// Uso: npx vite-node scripts/audit/review-c1/director-producto/aviso-persistente.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../../src/sim/game';
import { CENTER_Y } from '../../../../src/sim/carrier';
import { SOFA, localToWorld, yawQuat } from '../../../../src/sim/sofa';
import { heavyAloneHint } from '../../../../src/ui/hud';
import { NO_INPUT, type PlayerInput } from '../../../../src/sim/types';
await RAPIER.init({});
const DT = 1 / 60;
const OPEN = { x: -35, z: 25 };
const standY = CENTER_Y + 0.05;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
function atEnd(g: Game, i: number, side: 1 | -1) {
  const a = localToWorld(g.sofa, { x: side * SOFA.half.x, y: 0, z: 0 });
  const o = localToWorld(g.sofa, { x: side * (SOFA.half.x + 0.75), y: 0, z: 0 });
  const c = g.carriers[i], l = Math.hypot(a.x - o.x, a.z - o.z);
  c.teleport({ x: o.x, y: standY, z: o.z });
  c.facing = { x: (a.x - o.x) / l, z: (a.z - o.z) / l };
}
for (const [soloSecs, then] of [[3, 'J2 agarra'], [10, 'J2 agarra'], [30, 'J2 agarra'], [10, 'J1 suelta']] as const) {
  const g = new Game(RAPIER, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing'; g.countdown = 0;
  g.sofa.setTranslation({ x: OPEN.x, y: 0.25, z: OPEN.z }, true);
  g.sofa.setRotation(yawQuat(0), true);
  g.carriers[1].teleport({ x: OPEN.x, y: standY, z: OPEN.z + 7 });
  atEnd(g, 0, -1);
  for (let i = 0; i < 20; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  // J1 arrastra solo, alternando sentido para no salir del descampado
  for (let i = 0; i < soloSecs * 60; i++) g.step(DT, [inp({ mx: Math.floor(i / 180) % 2 ? 1 : -1 }), NO_INPUT]);
  const before = g.soloDrag;
  if (then === 'J2 agarra') {
    // J2 aparece en el otro extremo y agarra
    const side = (g.carriers[0].pos.x - g.sofaPos.x) * Math.cos(0) > 0 ? -1 : 1;
    atEnd(g, 1, side as 1 | -1);
    g.step(DT, [NO_INPUT, inp({ grab: true })]);
  } else {
    g.step(DT, [inp({ grab: true }), NO_INPUT]);
  }
  let t = 0, last = '';
  const holding = () => g.carriers.map((c) => (c.holding ? 'sí' : 'no')).join('/');
  const h0 = holding();
  while (g.heavyAlone && t < 60) { last = heavyAloneHint(g); g.step(DT, [NO_INPUT, NO_INPUT]); t += DT; }
  console.log(`${soloSecs} s arrastrando solo, luego ${then} (agarran ${h0}): soloDrag=${before.toFixed(1)} → el aviso sigue ${t.toFixed(1)} s más; texto: «${last}»`);
  g.dispose();
}
