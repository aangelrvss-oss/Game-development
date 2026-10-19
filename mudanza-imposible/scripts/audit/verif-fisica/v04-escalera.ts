// Verificación fisica-04 (y datos para fisica-06): ¿hace falta alzar para subir la escalera?
// A) Escenario controlado: sofá en el pasillo con el eje largo en z, J1 detrás y J2 delante; ambos empujan hacia -z.
// B) Escenario de la prueba sim.test.ts:346: dos pilotos automáticos, pero con alzar forzado a false todo el rato.
// Uso: npx vite-node scripts/audit/verif-fisica/v04-escalera.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, RULES } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import { yawQuat } from '../../../src/sim/sofa.ts';
import { CENTER_Y } from '../../../src/sim/carrier.ts';
import { FLOOR2, STAGES } from '../../../src/sim/level.ts';
import { NO_INPUT, type PlayerInput } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...o });

function controlled(z0: number, lift: 'nadie' | 'ambos', speed: number, pushers: 'ambos' | 'J1' | 'J2') {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  for (let i = 0; i < (RULES.countdown + 0.1) * 60; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.sofa.setTranslation({ x: 0, y: 0.6, z: z0 }, true);
  g.sofa.setRotation(yawQuat(Math.PI / 2), true);
  g.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true); g.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
  g.carriers[0].teleport({ x: 0, y: CENTER_Y + 0.05, z: z0 + 1.6 }); g.carriers[0].facing = { x: 0, z: -1 };
  g.carriers[1].teleport({ x: 0, y: CENTER_Y + 0.05, z: z0 - 1.6 }); g.carriers[1].facing = { x: 0, z: 1 };
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  const held = g.carriers.map((c) => (c.holding ? 1 : 0)).join('');
  let topAt = -1, warn = 0, warnWhileRising = 0, prevY = g.sofaPos.y, airborne = [0, 0], maxCarrierY = [0, 0];
  for (let i = 0; i < 60 * 25; i++) {
    const t = (i + 1) * DT;
    const mv = (k: number) => (pushers === 'ambos' || (pushers === 'J1' && k === 0) || (pushers === 'J2' && k === 1) ? -speed : 0);
    g.step(DT, [inp({ mz: mv(0), lift: lift === 'ambos' }), inp({ mz: mv(1), lift: lift === 'ambos' })]);
    const s = g.sofaPos;
    if (g.needsLiftAtStairs) { warn += DT; if (s.y > prevY + 1e-4) warnWhileRising += DT; }
    prevY = s.y;
    g.carriers.forEach((c, k) => { if (!c.grounded && c.holding) airborne[k] += DT; maxCarrierY[k] = Math.max(maxCarrierY[k], c.pos.y); });
    if (s.y > FLOOR2 && topAt < 0) { topAt = t; break; }
  }
  const s = g.sofaPos;
  console.log(`A z0=${z0} empujan=${pushers} alzan=${lift} vel=${speed} agarran=${held} -> arriba en ${topAt > 0 ? topAt.toFixed(2) + ' s' : 'NO (25 s)'}; sofá fin (z=${s.z.toFixed(2)}, y=${s.y.toFixed(2)}); aviso «alzad» ${warn.toFixed(2)} s, de ellos subiendo ${warnWhileRising.toFixed(2)} s; en el aire agarrando J1=${airborne[0].toFixed(2)} s J2=${airborne[1].toFixed(2)} s; integ=${g.integrity}`);
  g.dispose();
}
for (const z0 of [-17, -20]) for (const lift of ['nadie', 'ambos'] as const) controlled(z0, lift, 1, 'ambos');
for (const lift of ['nadie', 'ambos'] as const) controlled(-17, lift, 0.35, 'ambos');
for (const p of ['J1', 'J2'] as const) for (const lift of ['nadie', 'ambos'] as const) controlled(-17, lift, 1, p);

function pilots(liftMode: 'nunca' | 'piloto') {
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  const aps = [new Autopilot(0), new Autopilot(1)];
  const arriba = STAGES.findIndex((s) => s.label === 'Arriba');
  let warn = 0, tEsc = -1;
  for (let i = 0; i < 60 * 180 && g.stage < arriba && g.phase !== 'lost'; i++) {
    if (g.needsLiftAtStairs) warn += DT;
    if (tEsc < 0 && g.sofaPos.z < -21) tEsc = g.time;
    g.step(DT, aps.map((a) => { const x = a.input(g, DT); return liftMode === 'nunca' ? { ...x, lift: false } : x; }));
  }
  console.log(`B pilotos alzar=${liftMode}: etapa=${g.stageLabel} t=${g.time.toFixed(2)} (pie de escalera z<-21 en t=${tEsc.toFixed(2)}) aviso=${warn.toFixed(2)} s integ=${g.integrity}`);
  g.dispose();
}
pilots('nunca');
pilots('piloto');
