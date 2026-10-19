// Verificación ui-audio-02 (enfriamientos que sobreviven entre partidas), ui-audio-15 (la simulación y sus
// sonidos siguen tras los resultados), ui-audio-19 («Etapa alcanzada» al ganar) y parte de ui-audio-16.
// Game y Autopilot REALES; cooled(), simTime, toastCooldown y las decisiones de sonido/texto de handle() y de
// main.ts:254 copiadas literalmente. 60 Hz, un paso por fotograma.
// Uso: npx vite-node scripts/audit/verif-ui-audio/03-enfriamientos-y-resultados.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { Autopilot } from '../../../src/sim/autopilot.ts';
import type { GameEvent } from '../../../src/sim/types.ts';
await RAPIER.init();
const DT = 1 / 60;

// --- estado global de main.ts:46-49 ---
let simTime = 0;
const toastCooldown = new Map<string, number>();
function cooled(key: string, s: number) { // main.ts:131-136
  const t = toastCooldown.get(key) ?? -99;
  if (simTime - t < s) return false;
  toastCooldown.set(key, simTime);
  return true;
}
type Tally = Record<string, number>;
function handleLite(e: GameEvent, g: Game, t: Tally, soundLog: { t: number; name: string }[]) {
  const play = (n: string) => { t['snd:' + n] = (t['snd:' + n] ?? 0) + 1; soundLog.push({ t: simTime, name: n }); };
  const txt = (n: string) => (t['txt:' + n] = (t['txt:' + n] ?? 0) + 1);
  switch (e.type) {
    case 'grab': if (g.carriers[e.carrier].human !== null) play('grab'); break;
    case 'release': if (g.carriers[e.carrier].human !== null) play('release'); break;
    case 'gripBreak': play('slip'); if (cooled(`slip${e.carrier}`, 2)) txt('¡Se escapa!'); break;
    case 'impact': play('impact'); if (e.damage > 0 && g.phase === 'playing' && simTime - (toastCooldown.get('carHit') ?? -99) > 0.8) txt('-N%'); break;
    case 'carHit': toastCooldown.set('carHit', simTime); play('crash'); if (e.target !== 'sofa' && cooled(`run${e.carrier}`, 1.5)) txt('toast atropello'); break;
    case 'stun': play('stun'); break;
    case 'wobble': play('wobble'); if (cooled(`wob${e.carrier}`, 1.5)) txt('¡Uy, uy, uy!'); break;
    case 'fall': play('fall'); break;
    case 'honk': t['ev:honk'] = (t['ev:honk'] ?? 0) + 1; if (cooled(`honk${e.car}`, 1.5)) { play('honk'); txt('¡PIIII!'); } break;
    case 'light': { const s = g.sofaPos; if (e.ped === 'green' && s.z < 7 && s.z > -12) play('beep'); break; }
    case 'stage': play('checkpoint'); break;
    case 'righted': play('hop'); break;
    case 'win': play('win'); break;
    case 'lose': play('lose'); break;
  }
}

/** Una partida de demo (start(true): 1 humano con piloto + 1 ayudante) hasta el final y `afterResults` s en la pantalla de resultados. */
function playOne(seed: number, afterResults: number, soundLog: { t: number; name: string }[]) {
  const g = new Game(RAPIER as any, { humans: 1, carriers: 2, botStyle: 'atentos', seed });
  const ap = new Autopilot(0);
  simTime = 0; // start(): main.ts:126 (toastCooldown NO se limpia)
  const play: Tally = {}, behind: Tally = {};
  let pendingAt: number | null = null, resultsAt: number | null = null, endPhase = '', stageAtEnd = '';
  for (let f = 0; f < 60 * 200; f++) {
    if (pendingAt !== null && simTime >= pendingAt && resultsAt === null) resultsAt = simTime; // results(): screen='results'
    if (resultsAt !== null && simTime >= resultsAt + afterResults) break;
    const tally = resultsAt === null ? play : behind;
    g.step(DT, [ap.input(g, DT)]);
    simTime += DT;
    for (const e of g.out) {
      handleLite(e, g, tally, soundLog);
      if ((e.type === 'win' || e.type === 'lose') && pendingAt === null) { pendingAt = simTime + 1.2; endPhase = g.phase; stageAtEnd = g.stageLabel; }
    }
    // main.ts:254 (también corre en resultados: la simulación no se detiene)
    if (g.light.ped === 'green' && cooled('pedtick', 0.5) && g.sofaPos.z < 7 && g.sofaPos.z > -12) { tally['snd:pedTick'] = (tally['snd:pedTick'] ?? 0) + 1; soundLog.push({ t: simTime, name: 'pedTick' }); }
  }
  g.dispose();
  return { play, behind, endPhase, gameTime: g.time, stageAtEnd, cooldownSnapshot: Object.fromEntries([...toastCooldown].map(([k, v]) => [k, +v.toFixed(2)])) };
}
const fmt = (t: Tally, keys: string[]) => keys.map((k) => `${k}=${t[k] ?? 0}`).join('  ');
const KEYS = ['ev:honk', 'snd:honk', 'snd:pedTick', 'snd:beep', 'txt:¡PIIII!', 'snd:impact', 'snd:crash', 'snd:wobble', 'txt:-N%', 'txt:toast atropello'];

for (const seed of [11, 23]) {
  console.log(`\n=== semilla ${seed} (demo: 1 humano con piloto + 1 ayudante) ===`);
  const log: { t: number; name: string }[] = [];
  toastCooldown.clear();
  const a = playOne(seed, 8, log);
  console.log(`Partida 1 (mapa limpio): fin=${a.endPhase} t=${a.gameTime.toFixed(1)} s, etapa al final=«${a.stageAtEnd}»`);
  console.log('  durante la partida:   ' + fmt(a.play, KEYS));
  console.log('  tras 8 s en resultados (sigue simulando): ' + fmt(a.behind, KEYS));
  console.log('  toastCooldown al salir: ' + JSON.stringify(a.cooldownSnapshot));
  const len1 = log.length;
  const b = playOne(seed, 0, log); // «Otra vez»: misma semilla → mismos eventos; mapa SIN limpiar
  console.log(`Partida 2 (repetición, mapa heredado): fin=${b.endPhase} t=${b.gameTime.toFixed(1)} s`);
  console.log('  durante la partida:   ' + fmt(b.play, KEYS));
  toastCooldown.clear();
  const c = playOne(seed, 0, []);
  console.log('Partida 2 de control (misma semilla, mapa limpio):');
  console.log('  durante la partida:   ' + fmt(c.play, KEYS));
  const win = log.filter((e) => e.t >= 0 && e.t < 40).length;
  console.log(`soundLog tras 2 partidas: ${log.length} entradas, nunca se vacía; sound(0, 40) recogería ${win} entradas de AMBAS partidas (${log.filter((e, i) => i < len1 && e.t < 40).length} de la 1.ª y ${log.filter((e, i) => i >= len1 && e.t < 40).length} de la 2.ª)`);
}

// ui-audio-15, caso de derrota con el sofá en la calzada: ¿siguen los golpes y bocinas bajo la tarjeta de resultados?
{
  const g = new Game(RAPIER as any, { humans: 2, carriers: 2, botStyle: 'atentos', seed: 5 });
  simTime = 0; toastCooldown.clear();
  for (let i = 0; i < 190; i++) { g.step(DT, [{ mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false }, { mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false }]); simTime += DT; }
  // Se coloca el sofá en mitad de la calzada y se adelanta el reloj a 1 s del límite (derrota por tiempo)
  g.sofa.setTranslation({ x: 0, y: 0.6, z: -5 }, true);
  g.time = 179;
  const tl: Tally = {}, tr: Tally = {};
  let pendingAt: number | null = null, resultsAt: number | null = null;
  for (let f = 0; f < 60 * 30; f++) {
    if (pendingAt !== null && simTime >= pendingAt && resultsAt === null) resultsAt = simTime;
    if (resultsAt !== null && simTime >= resultsAt + 20) break;
    g.step(DT, [{ mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false }, { mx: 0, mz: 0, grab: false, lift: false, turn: 0, right: false }]);
    simTime += DT;
    for (const e of g.out) { handleLite(e, g, resultsAt === null ? tl : tr, []); if (e.type === 'lose' && pendingAt === null) pendingAt = simTime + 1.2; }
  }
  console.log(`\nDerrota por tiempo con el sofá en la calzada (z=-5): fase=${g.phase}; sofá z=${g.sofaPos.z.toFixed(1)}`);
  console.log('  20 s con la tarjeta de resultados abierta: ' + fmt(tr, KEYS) + '  snd:stun=' + (tr['snd:stun'] ?? 0));
}
