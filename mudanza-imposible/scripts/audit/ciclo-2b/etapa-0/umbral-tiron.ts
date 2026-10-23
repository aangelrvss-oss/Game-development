// Ciclo 2b, etapa 0: ¿qué tensión sostenida hace falta, al soltar, para que el modelo de equilibrio de carrier.ts
// (`Carrier.balance`, 683-741) acabe en caída? Réplica 1D del modelo (sin coches ni obstáculos): en el paso de la suelta
// el giro del tronco recibe releaseKick·T/(m·h) hacia atrás y, después, la fuerza medida cae de T a 0 (filtro 0,18 s),
// lo que también empuja hacia atrás (shoveGain, zona muerta). Devuelve la tensión mínima con la que se cae y en cuánto.
// Uso: ROOT=<árbol> npx vite-node umbral-tiron.ts
const ROOT = process.env.ROOT!;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { CARRIER: C } = await import(`${ROOT}/src/sim/carrier.ts`);
const { existsSync } = await import('node:fs');
const level = existsSync(`${ROOT}/src/levels/calle.ts`) ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const game = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
const mass = (game.carriers[1] as any).body.mass();
const dt = 1 / 60, g = 9.81, h = C.comHeight;
function sim(T: number, kickScale = 1) {
  let D = 0, W = -(kickScale * C.releaseKick * T) / (mass * h), force = T, fe = T, wob = false, wt = 0, calm = 0, tw: number | null = null, maxl = 0;
  for (let i = 0; i < 180; i++) {
    force += (0 - force) * Math.min(1, dt / 0.18);
    fe += (force - fe) * Math.min(1, dt / C.adapt);
    let s = force - fe;
    const sl = Math.abs(s); s *= sl > C.deadZone ? (sl - C.deadZone) / sl : 0;
    const umax = wob ? C.stepMax : C.ankleMax;
    let u = -C.kp * D - C.kd * W; u = Math.max(-umax, Math.min(umax, u));
    W += ((g / h) * D + Math.max(-25, Math.min(25, (C.shoveGain * s) / (mass * h))) + u) * dt;
    D += W * dt;
    const l = Math.abs(D); maxl = Math.max(maxl, l);
    if (wob) {
      wt += dt; calm = l < C.regainBelow ? calm + dt : 0;
      if ((l > C.fallAt && wt > C.stumbleMin) || l > 1.1 || (wt > C.stumbleMaxTime && l > C.loseAt)) return { fall: true, t: +((i + 1) * dt).toFixed(2), wobble: tw, maxLean: +maxl.toFixed(2) };
      if (calm > 0.25) return { fall: false, steady: +((i + 1) * dt).toFixed(2), wobble: tw, maxLean: +maxl.toFixed(2) };
    } else if (l > C.loseAt) { wob = true; wt = 0; calm = 0; tw = +((i + 1) * dt).toFixed(2); }
  }
  return { fall: false, wobble: tw, maxLean: +maxl.toFixed(2) };
}
let lo = 0, hi = 1000;
for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (sim(m).fall) hi = m; else lo = m; }
const r = { mass: +mass.toFixed(1), releaseKick: C.releaseKick, tensionMinimaParaCaer: +hi.toFixed(0), conMutacionKick0: sim(1000, 0), tabla: [100, 145, 150, 160, 162, 165, 168, 170, 177, 190, 200, 210, 233, 246, 290].map((T) => ({ T, ...sim(T), kick: +((C.releaseKick * T) / (mass * h)).toFixed(2) })) };
console.log(JSON.stringify({ ...r, tabla: undefined }));
for (const x of r.tabla) console.log(JSON.stringify(x));
