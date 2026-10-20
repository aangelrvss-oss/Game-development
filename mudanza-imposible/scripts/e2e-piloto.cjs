// Piloto de prueba para los e2e de navegador (duo-e2e y keyboard-e2e): anda con teclas reales hasta un punto.
//
// Por qué existe (ciclo 2b, etapa 0; diagnóstico en docs/quality/reviews/ciclo-2/revision-independiente/
// diagnostico-regresiones.md, §2): el piloto anterior de duo-e2e pulsaba las teclas al menos un fotograma con render por
// software (5 pasos = 0,083 s, unos 0,4 m a 5,2 m/s) contra una ventana de llegada de ±0,2 m, perseguía un objetivo que
// él mismo empujaba (se chocaba con el sofá) y no rodeaba los objetos fijos (la alfombra de (-4,9; 7,4)).
// Este piloto:
// - planifica en la propia página una ruta A* en una rejilla de 0,25 m, con las mismas consultas de forma de Rapier que
//   ya usa la prueba (`roomToStand`): cada celda está ocupada si la cápsula del porteador, algo más ancha, toca algún
//   collider sólido (lo fijo, el sofá y el resto de objetos; los porteadores solo si se pide). Las celdas ocupadas no
//   se prohíben, se encarecen, para poder salir de un contacto;
// - anda por tramos rectos de la ruta en una de las 8 direcciones del teclado y mantiene la tecla el tiempo de JUEGO que
//   corresponde a la distancia (aceleración y velocidad de `CARRIER`), no un tiempo de reloj;
// - tras soltar la tecla, deja que el porteador se pare (0,2 s de juego) antes de volver a medir y planificar;
// - el objetivo es fijo durante la aproximación: solo se recalcula si el sofá se ha movido de verdad.
// No cambia nada del juego: solo lee el estado público (`window.__mudanza.game`) y pulsa teclas.

/** `CARRIER.walkSpeed` y `CARRIER.accel` de src/sim/carrier.ts (iguales en 657fd30 y 5cab122). */
const WALK = 5.2, ACCEL = 32;

/** Tiempo de juego que hay que mantener la tecla, desde parado, para recorrer `d` m (acelera, va a tope y frena). */
function pressTime(d) {
  const tAcc = WALK / ACCEL, dAccBrake = WALK * tAcc; // acelerar y frenar: v²/2a cada uno
  if (d <= dAccBrake) return Math.sqrt(d / ACCEL);
  return tAcc + (d - dAccBrake) / WALK;
}

/** Teclas de la dirección de teclado (de las 8) más parecida a (x, z). `k`: { l, r, u, d }. */
function keysToward(k, x, z) {
  const a = Math.round(Math.atan2(z, x) / (Math.PI / 4)) * (Math.PI / 4);
  const sx = Math.round(Math.cos(a)), sz = Math.round(Math.sin(a)), keys = [];
  if (sx > 0) keys.push(k.r); else if (sx < 0) keys.push(k.l);
  if (sz > 0) keys.push(k.d); else if (sz < 0) keys.push(k.u);
  const m = Math.hypot(sx, sz) || 1;
  return { keys, dir: [sx / m, sz / m], err: Math.abs(Math.atan2(Math.sin(Math.atan2(z, x) - a), Math.cos(Math.atan2(z, x) - a))) };
}

const gameTime = (p) => p.evaluate(() => window.__mudanza.game.time);
/** Espera a que el tiempo de juego llegue a `t` (se comprueba en cada fotograma de la página). */
const waitGame = (p, t, timeout = 120000) => p.waitForFunction((x) => window.__mudanza.game.time >= x, t, { polling: 'raf', timeout });

/**
 * Ruta A* (en la página) del porteador `i` hasta (tx, tz). Devuelve el primer tramo recto: dirección (8 posibles) y
 * longitud, o null si ya está a menos de `arrive` m.
 */
function planInPage([i, tx, tz, avoidCarriers, arrive]) {
  const g = window.__mudanza.game, me = g.carriers[i], pos = me.pos;
  if (Math.hypot(tx - pos.x, tz - pos.z) <= arrive) return null;
  const sh = me.collider.shape, margin = 0.06;
  const probe = new sh.constructor(sh.halfHeight, sh.radius + margin);
  const feet = pos.y - sh.halfHeight - sh.radius;
  // La cápsula de la sonda empieza 6 cm por encima de los pies: el suelo no cuenta, un bordillo o un escalón tampoco
  const cy = feet + 0.06 + sh.radius + margin + sh.halfHeight;
  const carrierBodies = new Set(g.carriers.map((c) => c.body.handle));
  const C = 0.25, pad = 4;
  const x0 = Math.min(pos.x, tx) - pad, z0 = Math.min(pos.z, tz) - pad;
  const nx = Math.ceil((Math.max(pos.x, tx) + pad - x0) / C), nz = Math.ceil((Math.max(pos.z, tz) + pad - z0) / C);
  const blocked = new Uint8Array(nx * nz);
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
    const at = { x: x0 + (a + 0.5) * C, y: cy, z: z0 + (b + 0.5) * C };
    let hit = false;
    g.world.intersectionsWithShape(at, rot, probe, () => { hit = true; return false; }, 8 /* EXCLUDE_SENSORS */, undefined, me.collider, undefined,
      (c) => !c.isSensor() && (avoidCarriers || !carrierBodies.has(c.parent()?.handle)));
    blocked[a * nz + b] = hit ? 1 : 0;
  }
  const cell = (x, z) => [Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / C))), Math.max(0, Math.min(nz - 1, Math.floor((z - z0) / C)))];
  const [sa, sb] = cell(pos.x, pos.z), [ga, gb] = cell(tx, tz);
  // A* con 8 vecinos; una celda ocupada cuesta 40 veces más (se puede salir de un contacto, no atravesar un muro)
  const N = nx * nz, cost = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const h = (a, b) => Math.hypot(a - ga, b - gb) * C;
  const open = [[h(sa, sb), sa * nz + sb]];
  cost[sa * nz + sb] = 0;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, u] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === ga * nz + gb) break;
    const ua = Math.floor(u / nz), ub = u % nz;
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      if (!da && !db) continue;
      const va = ua + da, vb = ub + db;
      if (va < 0 || vb < 0 || va >= nx || vb >= nz) continue;
      const v = va * nz + vb;
      // En diagonal, sin cortar esquinas ocupadas
      const corner = da && db && (blocked[ua * nz + vb] || blocked[va * nz + ub]);
      const c = cost[u] + Math.hypot(da, db) * C * (blocked[v] || corner ? 40 : 1);
      if (c < cost[v]) { cost[v] = c; from[v] = u; open.push([c + h(va, vb), v]); }
    }
  }
  const path = [];
  for (let v = ga * nz + gb; v !== -1; v = from[v]) path.unshift(v);
  const occupied = path.filter((v) => blocked[v]).length;
  // Primer tramo recto de la ruta (celdas seguidas en la misma dirección); el último punto es el objetivo exacto
  const ab = (v) => [Math.floor(v / nz), v % nz];
  let end = Math.min(1, path.length - 1);
  if (path.length > 2) {
    const [a0, b0] = ab(path[0]), [a1, b1] = ab(path[1]), da = a1 - a0, db = b1 - b0;
    while (end + 1 < path.length) {
      const [p0, q0] = ab(path[end]), [p1, q1] = ab(path[end + 1]);
      if (p1 - p0 !== da || q1 - q0 !== db) break;
      end++;
    }
  }
  const last = end >= path.length - 1;
  const q = last ? [tx, tz] : [x0 + (ab(path[end])[0] + 0.5) * C, z0 + (ab(path[end])[1] + 0.5) * C];
  return { dx: q[0] - pos.x, dz: q[1] - pos.z, len: Math.hypot(q[0] - pos.x, q[1] - pos.z), last, occupied, cells: path.length };
}

/**
 * Un paso de marcha de varios porteadores a la vez. `moves`: [{ i, keys: {l,r,u,d}, target: [x, z], avoidCarriers }].
 * Cada uno pulsa la dirección de su primer tramo durante el tiempo de juego de esa distancia (como mínimo lo que dé un
 * fotograma) y la suelta. Devuelve, por porteador, si ya estaba a menos de `arrive` m (no se ha movido).
 */
async function walkStep(p, moves, arrive) {
  const plans = [];
  for (const m of moves) {
    const pl = await p.evaluate(planInPage, [m.i, m.target[0], m.target[1], !!m.avoidCarriers, arrive]);
    if (!pl) { plans.push({ m, arrived: true }); continue; }
    // El último tramo se acorta 0,1 m (se queda corto antes que pasarse); los intermedios, enteros
    const d = pl.last ? Math.max(0.05, pl.len - 0.1) : pl.len;
    plans.push({ m, arrived: false, keys: keysToward(m.keys, pl.dx, pl.dz).keys, sec: pressTime(d), plan: pl });
  }
  const go = plans.filter((x) => !x.arrived && x.keys.length).sort((a, b) => a.sec - b.sec);
  if (go.length) {
    for (const x of go) for (const k of x.keys) await p.keyboard.down(k);
    const t0 = await gameTime(p);
    for (const x of go) {
      await waitGame(p, t0 + x.sec);
      for (const k of x.keys) await p.keyboard.up(k);
    }
    // Que se paren antes de volver a medir (frenar desde 5,2 m/s lleva 0,16 s)
    await waitGame(p, (await gameTime(p)) + 0.2);
  }
  return plans;
}

module.exports = { pressTime, keysToward, gameTime, waitGame, walkStep, planInPage };
