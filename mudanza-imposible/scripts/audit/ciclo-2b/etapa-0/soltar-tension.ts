// Ciclo 2b, etapa 0: ¿cuándo hace caer a J2 «soltar mientras tira»? Experimento en Node (no es una prueba del juego).
// Dos porteadores agarran los extremos de un sofá colocado con un giro dado, tiran cada uno hacia fuera por el eje
// (con la dirección exacta o con la más parecida de las 8 del teclado) durante `PULL` s y J2 suelta sin dejar de tirar.
// Las entradas cambian solo cada 5 pasos (un fotograma del navegador con render por software) con fase al azar.
// Uso: ROOT=<árbol mudanza-imposible> [N=40] [PULL=1.2] npx vite-node soltar-tension.ts
const ROOT = process.env.ROOT!;
const N = +(process.env.N ?? 40), PULL = +(process.env.PULL ?? 1.2);
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const { yawQuat } = await import(`${ROOT}/src/sim/sofa.ts`);
const { existsSync } = await import('node:fs');
const level = existsSync(`${ROOT}/src/levels/calle.ts`) ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const DT = 1 / 60;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Dirección de teclado (8 posibles) más parecida a (x, z). */
const key8 = (x: number, z: number) => { const a = Math.round(Math.atan2(z, x) / (Math.PI / 4)) * (Math.PI / 4); let mx = Math.round(Math.cos(a)), mz = Math.round(Math.sin(a)); const m = Math.hypot(mx, mz); return { mx: mx / m, mz: mz / m }; };
type In = { mx: number; mz: number; grab: boolean; turn: 0; right: boolean };
const inp = (mx = 0, mz = 0, grab = false): In => ({ mx, mz, grab, turn: 0, right: false });

function trial(seed: number, yaw: number, mode: 'exacta' | 'teclas') {
  const rnd = mulberry32(seed);
  const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  while (g.phase !== 'playing') g.step(DT, [NO_INPUT, NO_INPUT]);
  const s0 = g.sofaPos;
  g.sofa.setRotation(yawQuat(yaw), true);
  for (let i = 0; i < 30; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  const ax = Math.cos(g.sofaYaw), az = Math.sin(g.sofaYaw), sp = g.sofaPos;
  const side = [1, -1];
  g.carriers.forEach((c: any, i: number) => c.teleport({ x: sp.x + ax * 1.75 * side[i], y: c.pos.y, z: sp.z + az * 1.75 * side[i] }));
  // Mirando al sofá y agarrando
  for (let i = 0; i < 3; i++) g.step(DT, side.map((s) => inp(-ax * s * 0.5, -az * s * 0.5)));
  g.step(DT, [inp(0, 0, true), inp(0, 0, true)]);
  const ends = g.carriers.map((c: any) => (c.grabLocal ? Math.sign(c.grabLocal.x) : 0));
  for (let i = 0; i < 48; i++) g.step(DT, [NO_INPUT, NO_INPUT]);
  // Tira cada uno hacia fuera por el eje real, con entradas que cambian por fotogramas de 5 pasos
  let phase = Math.floor(rnd() * 5), cur: In[] = [inp(), inp()];
  const want = () => {
    const a = g.sofaYaw, x = Math.cos(a), z = Math.sin(a);
    return g.carriers.map((c: any, i: number) => {
      const out = Math.sign((c.pos.x - g.sofaPos.x) * x + (c.pos.z - g.sofaPos.z) * z) || side[i];
      const d = mode === 'exacta' ? { mx: x * out, mz: z * out } : key8(x * out, z * out);
      return inp(d.mx, d.mz);
    });
  };
  const steps = Math.round(PULL / DT) + Math.floor(rnd() * 5);
  for (let i = 0; i < steps; i++) { if ((i + phase) % 5 === 0) cur = want(); g.step(DT, cur); }
  const before = { holding: g.carriers.map((c: any) => c.holding), tension: Math.hypot(g.carriers[1].forceExp.x, g.carriers[1].forceExp.z) };
  // J2 suelta en el primer paso del siguiente fotograma, sin dejar de tirar (las teclas siguen pulsadas)
  cur = want();
  g.step(DT, [cur[0], { ...cur[1], grab: true }]);
  let wob = false, fell = false;
  for (let i = 0; i < 90; i++) {
    if (i % 5 === 0) cur = [want()[0], cur[1]];
    g.step(DT, cur);
    const c = g.carriers[1];
    if (c.wobbling) wob = true;
    if (c.stunned > 0 && c.knock === 'balance') fell = true;
  }
  return { seed, yaw: +yaw.toFixed(2), mode, ends, before, wob, fell };
}
const rows: any[] = [];
for (const mode of ['exacta', 'teclas'] as const) {
  for (let k = 0; k < N; k++) {
    const yaw = (k / N) * Math.PI; // de 0 a 180°
    rows.push(trial(k + 1, yaw, mode));
  }
}
for (const mode of ['exacta', 'teclas']) {
  const r = rows.filter((x) => x.mode === mode);
  const ok = r.filter((x) => x.wob && x.fell).length;
  console.log(`${mode}: tambalea y cae ${ok}/${r.length}; extremos opuestos ${r.filter((x) => x.ends[0] === -x.ends[1] && x.ends[0] !== 0).length}/${r.length}`);
  for (const x of r.filter((x) => !(x.wob && x.fell))) console.log('   no cae', JSON.stringify(x));
}
