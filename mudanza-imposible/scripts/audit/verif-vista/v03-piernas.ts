// Verificación vista-04: piernas de goma (sin estado en el aire, reaparición sin recolocar pies).
// Mide la distancia cadera→tobillo de cada pierna que dibuja CharacterRig (rig.debug.feet[i].hip/ankle).
// Uso: npx vite-node scripts/audit/verif-vista/v03-piernas.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { headlessWorld } from './harness.ts';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { CENTER_Y } from '../../../src/sim/carrier.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const view = await headlessWorld();
const legLen = (dv: any) => { const d = dv.rig.debug; return d && d.upright ? d.feet.map((f: any) => Math.hypot(f.hip[0] - f.ankle[0], f.hip[1] - f.ankle[1], f.hip[2] - f.ankle[2])) : null; };
function newGame(humans = 2, seed = 1) {
  const g = new Game(RAPIER as any, { humans, carriers: humans, botStyle: 'atentos', seed });
  view.attach(g);
  for (let i = 0; i < (RULES.countdown + 0.5) * 60; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); view.render(g, g.clock, DT); }
  return g;
}
// Normal, de pie y quieto
{
  const g = newGame();
  console.log(`De pie quieto: cadera→tobillo = ${legLen(view.carriers[0]).map((x: number) => x.toFixed(3)).join(' / ')} m (pierna = muslo 0,165 + espinilla 0,165 = 0,33)`);
  // a) Cápsula elevada 1,5 m y soltada
  const c = g.carriers[1], dv = view.carriers[1] as any;
  c.teleport({ x: -6, y: CENTER_Y + 0.05, z: 16 });
  for (let i = 0; i < 60; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); view.render(g, g.clock, DT); }
  c.teleport({ x: -6, y: CENTER_Y + 1.5, z: 16 });
  let mx = 0, airFrames = 0, groundedSeenByView = 'n/a';
  for (let i = 0; i < 60; i++) {
    g.step(DT, g.carriers.map(() => NO_INPUT)); view.render(g, g.clock, DT);
    const l = legLen(dv); if (l) mx = Math.max(mx, ...l);
    if (!c.grounded) airFrames++;
  }
  console.log(`a) Cápsula soltada a 1,5 m: ${airFrames} fotogramas con c.grounded=false; cadera→tobillo máx ${mx.toFixed(3)} m (el muñeco no lee c.grounded: ${groundedSeenByView})`);
  // b) Teleport como game.ts:335 (lejos del sofá > 22 m → reaparece junto al sofá a +1,2 m)
  c.teleport({ x: 0, y: CENTER_Y + 0.05, z: 10 + 25 });
  for (let i = 0; i < 5; i++) { g.step(DT, g.carriers.map(() => NO_INPUT)); view.render(g, g.clock, DT); }
  // vuelve a dejarlo lejos para disparar el teleport de afterStep
  c.body.setTranslation({ x: 30, y: CENTER_Y + 0.05, z: 10 }, true);
  const series: number[] = []; let over = 0;
  for (let i = 0; i < 90; i++) {
    g.step(DT, g.carriers.map(() => NO_INPUT)); view.render(g, g.clock, DT);
    const l = legLen(dv); const m = l ? Math.max(...l) : 0; series.push(m); if (m > 0.45) over++;
  }
  console.log(`b) Reaparición (game.ts:335): cadera→tobillo máx ${Math.max(...series).toFixed(3)} m; fotogramas >0,45 m: ${over} (${(over / 60).toFixed(2)} s); primeros: ${series.slice(0, 30).filter((_, i) => i % 3 === 0).map((x) => x.toFixed(2)).join(' ')}`);
  g.dispose();
}
// c) Recorrido normal con piloto automático para cada humano (como __mudanza.autoInputs)
for (const humans of [2, 4]) {
  const g = newGame(humans, 1);
  const aps = g.carriers.map((c) => new Autopilot(c.id));
  const tot = g.carriers.map(() => [0, 0]), over = g.carriers.map(() => [0, 0]); let mx = 0, frames = 0;
  while ((g.phase === 'playing' || g.phase === 'countdown') && frames < 180 * 60) {
    g.step(DT, aps.map((a) => a.input(g, DT))); view.render(g, g.clock, DT); frames++;
    view.carriers.forEach((dv: any, k: number) => { const l = legLen(dv); if (!l) return; l.forEach((x: number, j: number) => { tot[k][j]++; if (x > 0.45) over[k][j]++; mx = Math.max(mx, x); }); });
  }
  const pct = over.map((o, k) => o.map((x, j) => ((100 * x) / Math.max(1, tot[k][j])).toFixed(1) + '%').join('/')).join('  ');
  console.log(`c) Piloto ${humans}J: fase=${g.phase} t=${g.time.toFixed(1)} s; % de fotogramas por pie con cadera→tobillo > 0,45 m: ${pct}; máximo ${mx.toFixed(3)} m`);
  g.dispose();
}
