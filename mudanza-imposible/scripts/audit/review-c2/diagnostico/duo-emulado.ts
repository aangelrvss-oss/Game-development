// Diagnóstico ciclo 2: la parte A de scripts/duo-e2e.cjs (pasos 2 a 5, con su misma lógica de teclas y comprobaciones)
// emulada en Node, con un reloj de pared simulado: el juego avanza por fotogramas (duración y pasos por fotograma
// sacados al azar de los fotogramas reales grabados en Chromium) y la prueba ve el estado del último fotograma y pulsa
// teclas que cuentan desde el fotograma siguiente. Con la misma semilla de reloj, las dos versiones reciben el mismo
// ruido de tiempos (comparación emparejada). Uso:
//   ROOT=<árbol> FRAMES=<frames.json> N=<n> [SEED0=1] npx vite-node duo-emulado.ts
// Salida: una línea JSON por escenario.
import { existsSync, readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const c2 = existsSync(`${ROOT}/src/levels/calle.ts`);
const level = c2 ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const POOL: [number, number][] = JSON.parse(readFileSync(process.env.FRAMES!, 'utf8')); // [ms, pasos]
const DT = 1 / 60;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KEYS = [{ l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', g: 'Space' }, { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', g: 'Enter' }];

function scenario(seed: number) {
  const rnd = mulberry32(seed);
  const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  // Hasta la fase de juego, como en la página (la prueba espera a phase === 'playing')
  while (g.phase !== 'playing') g.step(DT, [NO_INPUT, NO_INPUT]);
  const down = new Set<string>(); const latched = [false, false];
  let wall = 0, nextFrame = rnd() * 190;
  const ev: { t: number; type: string; c: number }[] = [];
  const lat = () => 2 + rnd() * 10; // latencia de una llamada de Playwright (ms)
  const inputs = () => KEYS.map((k, i) => {
    let mx = (down.has(k.r) ? 1 : 0) - (down.has(k.l) ? 1 : 0), mz = (down.has(k.d) ? 1 : 0) - (down.has(k.u) ? 1 : 0);
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    const grab = latched[i]; return { mx, mz, grab, turn: 0 as const, right: false };
  });
  const advance = () => {
    while (nextFrame <= wall) {
      const [ms, n] = POOL[Math.floor(rnd() * POOL.length)];
      for (let i = 0; i < n; i++) {
        const inp = inputs(); latched[0] = latched[1] = false;
        g.step(DT, inp);
        for (const e of g.out) if (['grab', 'release', 'gripBreak', 'wobble', 'fall', 'stun'].includes(e.type)) ev.push({ t: g.time, type: e.type, c: e.carrier });
      }
      nextFrame += ms;
    }
  };
  const kdown = (k: string) => { wall += lat(); advance(); if (!down.has(k)) { down.add(k); if (k === 'Space') latched[0] = true; if (k === 'Enter') latched[1] = true; } };
  const kup = (k: string) => { wall += lat(); advance(); down.delete(k); };
  const press = (k: string) => { kdown(k); kup(k); };
  const wait = (ms: number) => { wall += ms; advance(); };
  const st = () => {
    wall += lat(); advance();
    const s = g.sofaPos;
    // Aviso del HUD (misma prioridad que hud.ts en las dos versiones): volcado, «¡Que se vuelca!», «Pesa mucho»
    const warn = g.phase !== 'playing' ? '' : g.sofaUp < 0.55 ? 'fix' : g.sofaUp < 0.8 ? 'vuelca' : g.heavyAlone ? 'Pesa mucho' : '';
    return { t: g.time, sofa: [s.x, s.y, s.z], yaw: g.sofaYaw, solo: g.soloDrag, warn, up: g.sofaUp,
      cs: g.carriers.map((c: any) => ({ h: c.holding, gl: c.grabLocal ? { ...c.grabLocal } : null, x: c.pos.x, z: c.pos.z, wob: c.wobbling, stun: c.stunned, knock: c.knock, nw: c.wobbles })) };
  };
  const hold = (keys: string[], sec: number, each?: (n: any) => void) => {
    const t0 = st().t; for (const k of keys) kdown(k);
    for (;;) { wait(60); const now = st(); if (each) each(now); if (now.t - t0 >= sec) break; }
    for (const k of keys) kup(k);
  };
  const tick = () => { const t0 = st().t; for (let i = 0; i < 100 && st().t - t0 < 0.1; i++) wait(20); };
  let s = st(); let detours = 0;
  function grabBoth() {
    const best = [Infinity, Infinity], stall = [0, 0], detour = [0, 0];
    for (let it = 0; it < 120; it++) {
      s = st();
      if (s.cs.every((c: any) => c.h)) return true;
      const dn: string[] = []; let ready = 0;
      for (let i = 0; i < 2; i++) {
        const c = s.cs[i];
        if (c.h || c.stun > 0) { ready++; continue; }
        const ax = Math.cos(s.yaw), az = Math.sin(s.yaw), o = s.cs[1 - i];
        let side = o.h && o.gl ? -Math.sign(o.gl.x) : 0;
        if (!side) { const near0 = (s.cs[0].x - s.sofa[0]) * ax + (s.cs[0].z - s.sofa[2]) * az >= 0 ? 1 : -1; side = i === 0 ? near0 : -near0; }
        const tx = s.sofa[0] + ax * 1.75 * side, tz = s.sofa[2] + az * 1.75 * side;
        const dx = tx - c.x, dz = tz - c.z, dist = Math.hypot(dx, dz); const k = KEYS[i];
        if (dist < best[i] - 0.05) { best[i] = dist; stall[i] = 0; } else stall[i]++;
        if (stall[i] >= 8 && !detour[i] && dist > 0.3) { detour[i] = 6; detours++; }
        if (detour[i] > 0) {
          let qx = -dz / dist, qz = dx / dist;
          if (qx * (c.x - s.sofa[0]) + qz * (c.z - s.sofa[2]) < 0) { qx = -qx; qz = -qz; }
          if (Math.abs(qx) > 0.3) dn.push(qx > 0 ? k.r : k.l);
          if (Math.abs(qz) > 0.3) dn.push(qz > 0 ? k.d : k.u);
          if (--detour[i] === 0) { best[i] = Infinity; stall[i] = 0; }
          continue;
        }
        if (process.env.TRACE && it % 3 === 0) console.error(`it${it} J${i + 1} (${c.x.toFixed(2)},${c.z.toFixed(2)}) → (${tx.toFixed(2)},${tz.toFixed(2)}) dist ${dist.toFixed(2)} sofá (${s.sofa[0].toFixed(2)},${s.sofa[2].toFixed(2)}) yaw ${s.yaw.toFixed(2)} h=${c.h}`);
        if (Math.abs(dx) > 0.2) dn.push(dx > 0 ? k.r : k.l);
        if (Math.abs(dz) > 0.2) dn.push(dz > 0 ? k.d : k.u);
        if (Math.abs(dx) <= 0.2 && Math.abs(dz) <= 0.2) ready++;
      }
      if (ready === 2) { const gk = s.cs.map((c: any, i: number) => (c.h ? null : KEYS[i].g)).filter(Boolean) as string[]; for (const k of gk) kdown(k); tick(); for (const k of gk) kup(k); continue; }
      for (const k of dn) kdown(k); tick(); for (const k of dn) kup(k);
    }
    return false;
  }
  const r: any = { seed };
  hold(['KeyW', 'ArrowDown'], 0.4);
  r.grab1 = grabBoth(); r.tGrab1 = +st().t.toFixed(2); r.detours1 = detours;
  hold([], 0.8);
  s = st(); let z0 = s.sofa[2];
  hold(['KeyW', 'ArrowUp'], 2.5); s = st(); const together = z0 - s.sofa[2]; r.together = +together.toFixed(2);
  press('Enter'); hold([], 0.6); s = st(); z0 = s.sofa[2]; const ph = s; r.yawSuelta = +s.yaw.toFixed(3);
  let sawSolo = false, maxSolo = 0, minUp = 1;
  hold(['KeyS'], 2.5, (n) => { maxSolo = Math.max(maxSolo, n.solo); minUp = Math.min(minUp, n.up); if (/Pesa mucho/.test(n.warn)) sawSolo = true; }); s = st();
  r.aviso = sawSolo; r.maxSolo = +maxSolo.toFixed(2); r.minUp = +minUp.toFixed(3); r.solo = +Math.hypot(s.sofa[0] - ph.sofa[0], s.sofa[2] - z0).toFixed(2); r.yawSolo = +s.yaw.toFixed(3);
  r.regrab = grabBoth(); hold([], 0.5); s = st();
  const yaw0 = s.yaw; r.yaw0 = +yaw0.toFixed(3);
  const px = -Math.sin(yaw0), pz = Math.cos(yaw0);
  const keyFor = (i: number, sx: number, sz: number) => (Math.abs(sx) > Math.abs(sz) ? (sx > 0 ? KEYS[i].r : KEYS[i].l) : (sz > 0 ? KEYS[i].d : KEYS[i].u));
  const twist = [keyFor(0, px, pz), keyFor(1, -px, -pz)]; r.twist = twist.join('+');
  hold(twist, 1.5); s = st();
  r.dyaw = +Math.abs(Math.atan2(Math.sin(s.yaw - yaw0), Math.cos(s.yaw - yaw0))).toFixed(3); r.yawGiro = +s.yaw.toFixed(3);
  if (!st().cs.every((c: any) => c.h)) grabBoth();
  const out = st().cs.map((c: any) => (c.x > s.sofa[0] ? 1 : -1)); r.out = out;
  const outKey = (i: number) => (out[i] > 0 ? KEYS[i].r : KEYS[i].l);
  hold([outKey(0), outKey(1)], 1.2);
  let wob = false, fell = false;
  kdown(outKey(0)); kdown(outKey(1)); press('Enter');
  const t1 = st().t;
  for (;;) { const n = st(); if (n.cs[1].wob) wob = true; if (n.cs[1].stun > 0 && n.cs[1].knock === 'balance') fell = true; if (n.t - t1 > 1.5) break; wait(40); }
  kup(outKey(0)); kup(outKey(1));
  r.wob = wob; r.fell = fell; r.soltar = wob && fell;
  // 5: espera a que se levante (como mucho lo que permiten las reglas) y vuelve a agarrar
  const fallEv = ev.find((e) => e.c === 1 && e.t >= t1 - 1e-6 && (e.type === 'fall' || e.type === 'stun'));
  if (fallEv) { for (;;) { hold([], 0.2); const n = st(); if (n.cs[1].stun <= 0 || n.t > fallEv.t + 1.3 + 4 + 0.6 + 0.5) break; } hold([], 0.5); }
  r.j2x = +st().cs[1].x.toFixed(2);
  r.regrab2 = grabBoth(); r.detours = detours;
  g.dispose();
  return r;
}
const N = +(process.env.N ?? 20), S0 = +(process.env.SEED0 ?? 1);
for (let k = 0; k < N; k++) console.log(JSON.stringify(scenario(S0 + k)));
