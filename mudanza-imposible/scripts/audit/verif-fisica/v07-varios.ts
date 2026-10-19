// Verificación fisica-07, 09, 10, 11 y 15.
// Uso: npx vite-node scripts/audit/verif-fisica/v07-varios.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { CARRIER } from '../../../src/sim/carrier.ts';
import { localToWorld } from '../../../src/sim/sofa.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });
const warm = (g: Game) => { for (let i = 0; i < (RULES.countdown + 0.2) * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT)); };

/** Penetración máxima de la cápsula del porteador en los colliders del sofá (m). */
function penetration(g: Game, k: number) {
  const p = g.carriers[k].pos; let worst = 0;
  for (let s = -1; s <= 1; s += 0.25) {
    const pt = { x: p.x, y: p.y + s * CARRIER.halfHeight, z: p.z };
    for (const c of g.sofaColliders) {
      const pr = c.projectPoint(pt, false); if (!pr) continue;
      const d = Math.hypot(pr.point.x - pt.x, pr.point.y - pt.y, pr.point.z - pt.z);
      worst = Math.max(worst, pr.isInside ? CARRIER.radius + d : CARRIER.radius - d);
    }
  }
  return worst;
}

console.log('=== fisica-07: uno solo con y sin física cooperativa ===');
for (const humans of [1, 2]) for (const lift of [false, true]) {
  const g = new Game(RAPIER as any, { humans, carriers: 2, botStyle: 'atentos', seed: 1 });
  g.bots.clear();
  warm(g);
  g.carriers[1].teleport({ x: -6, y: 0.7, z: 14 });
  g.step(DT, [inp({ grab: true }), NO_INPUT]);
  const s0 = g.sofaPos; let pen = 0; const ev = new Set<string>();
  for (let i = 0; i < 180; i++) {
    g.step(DT, [inp({ mz: -1, lift }), NO_INPUT]);
    pen = Math.max(pen, penetration(g, 0));
    for (const e of g.out) ev.add(e.type);
  }
  console.log(`  humans=${humans} coop=${g.coop} masaSofá=${g.sofa.mass().toFixed(0)} kg alza=${lift}: uno solo lo lleva ${Math.hypot(g.sofaPos.x - s0.x, g.sofaPos.z - s0.z).toFixed(2)} m en 3 s; penetración máx. cuerpo-sofá ${(pen * 100).toFixed(1)} cm; soloDrag=${g.soloDrag.toFixed(2)} (el HUD solo avisa si coop); sucesos=${[...ev].join(',')}`);
  g.dispose();
}
for (const o of [{ humans: 1, carriers: 4 }, { humans: 2, carriers: 4 }, { humans: 2, carriers: 2 }, { humans: 4, carriers: 4 }]) {
  const g = new Game(RAPIER as any, { ...o, botStyle: 'atentos' });
  console.log(`  ${JSON.stringify(o)} -> coop=${g.coop}, masa ${g.sofa.mass().toFixed(0)} kg, rozamiento ${g.sofaColliders[0].friction()}`);
  g.dispose();
}

console.log('=== fisica-09: impactos en la prueba de 4 quietos: ¿con qué está en contacto el sofá? ===');
{
  const g = new Game(RAPIER as any, { humans: 4, carriers: 4, botStyle: 'atentos', seed: 1 });
  warm(g);
  for (let k = 0; k < 25; k++) g.step(DT, g.carriers.map((c) => inp({ mx: c.facing.x * 0.6, mz: c.facing.z * 0.6 })));
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  const carrierBodies = new Set(g.carriers.map((c) => c.body.handle));
  const contacts = () => {
    const out = new Set<string>();
    for (const sc of g.sofaColliders) g.world.contactPairsWith(sc, (o) => {
      g.world.contactPair(sc, o, (m) => {
        if (m.numContacts() === 0) return;
        const b = o.parent();
        out.add(b && carrierBodies.has(b.handle) ? `porteador${g.carriers.findIndex((c) => c.body.handle === b.handle)}` : b?.isFixed() ? 'fijo(suelo/pared)' : b?.isKinematic() ? 'coche' : 'otro');
      });
    });
    return [...out].join('+') || 'nada';
  };
  let prev = contacts();
  for (let i = 0; i < 60; i++) {
    g.step(DT, g.carriers.map(() => NO_INPUT));
    const now = contacts();
    for (const e of g.out) if (e.type === 'impact') console.log(`  t=${(i * DT).toFixed(2)} impacto -${e.damage} (Δv=${e.strength.toFixed(2)} m/s) sofaUp=${g.sofaUp.toFixed(2)} y=${g.sofaPos.y.toFixed(2)}; contactos del sofá: paso anterior=${prev} / este paso=${now}`);
    prev = now;
  }
  g.dispose();
}
{
  // Partida normal a dos con pilotos: ¿hay impactos espurios?
  const { Autopilot } = await import('../../../src/sim/autopilot.ts');
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  const aps = [0, 1].map((i) => new Autopilot(i)); let n = 0;
  for (let i = 0; i < 60 * 60 && g.phase !== 'won'; i++) { g.step(DT, aps.map((a) => a.input(g, DT))); for (const e of g.out) if (e.type === 'impact') n++; }
  console.log(`  Recorrido completo con 2 pilotos: fase=${g.phase} impactos=${n} integridad=${g.integrity}`);
  g.dispose();
}

console.log('=== fisica-10: recolocación a más de 22 m ===');
{
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  warm(g);
  const sp = g.sofaPos;
  g.carriers[1].teleport({ x: sp.x + 21.5, y: 0.7, z: sp.z }); g.step(DT, [NO_INPUT, NO_INPUT]);
  const a = g.carriers[1].pos;
  g.carriers[1].teleport({ x: sp.x + 22.5, y: 0.7, z: sp.z }); g.step(DT, [NO_INPUT, NO_INPUT]);
  const b = g.carriers[1].pos;
  console.log(`  J2 a 21,5 m: queda en x=${a.x.toFixed(2)}; J2 a 22,5 m: tras 1 paso está en (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)}), sofá en (${sp.x.toFixed(2)}, ${sp.y.toFixed(2)}, ${sp.z.toFixed(2)})`);
  g.dispose();
}

console.log('=== fisica-11: altura de agarre de humanos y ayudantes ===');
for (const humans of [2, 0, 1]) {
  const g = new Game(RAPIER as any, { humans, carriers: 2, botStyle: 'atentos', seed: 1 });
  warm(g);
  if (humans > 0) g.step(DT, g.carriers.map(() => inp({ grab: true })));
  for (let i = 0; i < 6 * 60; i++) g.step(DT, g.carriers.map(() => NO_INPUT));
  const a = localToWorld(g.sofa, { x: 1.1, y: 0, z: 0 }), b = localToWorld(g.sofa, { x: -1.1, y: 0, z: 0 });
  const tiltLong = Math.atan2(Math.abs(a.y - b.y), 2.2) * 180 / Math.PI;
  console.log(`  humans=${humans} (coop=${g.coop}): agarran=${g.carriers.map((c) => (c.holding ? (c.human !== null ? 'H' : 'B') : '-')).join('')} grabLocal.y=${g.carriers.map((c) => c.grabLocal ? c.grabLocal.y.toFixed(2) : '-').join('/')} centro y=${g.sofaPos.y.toFixed(2)} sofaUp=${g.sofaUp.toFixed(3)} (${(Math.acos(Math.min(1, g.sofaUp)) * 180 / Math.PI).toFixed(1)}°), inclinación del eje largo=${tiltLong.toFixed(1)}°`);
  g.dispose();
}

console.log('=== fisica-15: el giro de un humano que NO agarra mueve a los ayudantes ===');
for (const turn of [0, 1] as const) {
  const g = new Game(RAPIER as any, { humans: 1, carriers: 3, botStyle: 'atentos', seed: 1 });
  warm(g);
  g.carriers[0].teleport({ x: 8, y: 0.7, z: 16 }); // el humano, lejos y sin agarrar
  for (let i = 0; i < 5 * 60; i++) g.step(DT, [NO_INPUT]);
  const held = g.carriers.map((c) => (c.holding ? 1 : 0)).join('');
  const y0 = g.sofaYaw;
  for (let i = 0; i < 2 * 60; i++) g.step(DT, [inp({ turn })]);
  console.log(`  humano sin agarrar, turn=${turn} durante 2 s: agarran=${held} (humano=${g.carriers[0].holding}) lead.w=${g.lead.w} giro del sofá=${((g.sofaYaw - y0) * 180 / Math.PI).toFixed(1)}°`);
  g.dispose();
}
