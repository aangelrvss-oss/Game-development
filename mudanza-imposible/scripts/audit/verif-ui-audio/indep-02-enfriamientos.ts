// Verificación independiente ui-audio-02 y ui-audio-15: enfriamientos que sobreviven a start() y simulación tras resultados.
// Game REAL con piloto automático (como la demo: start(true) → humans=1, carriers=max(2,1)=2).
// Se copian literalmente de main.ts: cooled() (131-136), la rama 'honk' (180-182), la rama 'light' (183-186),
// el tic del semáforo (254), y el reinicio de start() (126: simTime = 0, sin tocar toastCooldown).
// Uso: npx vite-node scripts/audit/verif-ui-audio/indep-02-enfriamientos.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
await RAPIER.init();
const DT = 1 / 60;

let simTime = 0;
const toastCooldown = new Map<string, number>();
function cooled(key: string, s: number) {
  const t = toastCooldown.get(key) ?? -99;
  if (simTime - t < s) return false;
  toastCooldown.set(key, simTime);
  return true;
}

type Count = { honkEv: number; honkPlayed: number; pedTick: number; greenToast: number; dmgText: number; dmgEv: number; afterEnd: Record<string, number> };
/** Una partida de demo desde start() hasta `extra` s después del final (pantalla de resultados, la simulación sigue). */
function play(seed: number, extra: number): Count & { end: number; phase: string } {
  simTime = 0; // main.ts:126
  const g = new Game(RAPIER as any, { humans: 1, carriers: 2, botStyle: 'atentos', seed });
  const ap = new Autopilot(0);
  const c: Count = { honkEv: 0, honkPlayed: 0, pedTick: 0, greenToast: 0, dmgText: 0, dmgEv: 0, afterEnd: {} };
  let endAt: number | null = null;
  for (let i = 0; i < 60 * 240; i++) {
    g.step(DT, [ap.input(g, DT)]);
    simTime += DT;
    for (const e of g.out) {
      if (endAt !== null) c.afterEnd[e.type] = (c.afterEnd[e.type] ?? 0) + 1;
      if (e.type === 'honk') { c.honkEv++; if (cooled(`honk${e.car}`, 1.5)) c.honkPlayed++; }
      if (e.type === 'carHit') toastCooldown.set('carHit', simTime);
      if (e.type === 'impact' && e.damage > 0 && g.phase === 'playing') { c.dmgEv++; if (simTime - (toastCooldown.get('carHit') ?? -99) > 0.8) c.dmgText++; }
      if (e.type === 'light') { const s = g.sofaPos; if (e.ped === 'green' && s.z < 7 && s.z > -12) c.greenToast++; }
      if ((e.type === 'win' || e.type === 'lose') && endAt === null) endAt = simTime;
    }
    if (g.light.ped === 'green' && cooled('pedtick', 0.5) && g.sofaPos.z < 7 && g.sofaPos.z > -12) c.pedTick++;
    if (endAt !== null && simTime >= endAt + extra) break;
  }
  const phase = g.phase;
  g.dispose();
  return { ...c, end: endAt ?? NaN, phase };
}

const fmt = (c: Count) => `bocinas (eventos ${c.honkEv}, suenan ${c.honkPlayed}) · tics semáforo ${c.pedTick} · toasts verde ${c.greenToast} · golpes con daño ${c.dmgEv}, textos -N% ${c.dmgText}`;
for (const seeds of [[11, 11], [11, 22], [5, 5]]) {
  // Partida 1 + 8 s en resultados; luego «Otra vez»: partida 2 con el mapa heredado
  toastCooldown.clear();
  const p1 = play(seeds[0], 8);
  const keys = [...toastCooldown.entries()].map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ');
  const p2 = play(seeds[1], 3);
  // Control: la misma partida 2 con el mapa limpio (lo que pasaría si start() lo reiniciara)
  toastCooldown.clear();
  const p2c = play(seeds[1], 3);
  console.log(`semillas ${seeds.join('→')}: partida 1 (${p1.phase} en simTime ${p1.end.toFixed(1)}): ${fmt(p1)}`);
  console.log(`   mapa al pulsar «Otra vez»: ${keys}`);
  console.log(`   partida 2 con mapa heredado : ${fmt(p2)}`);
  console.log(`   partida 2 con mapa limpio   : ${fmt(p2c)}`);
  console.log(`   eventos tras el final (8 s en resultados, partida 1): ${JSON.stringify(p1.afterEnd)}`);
}
