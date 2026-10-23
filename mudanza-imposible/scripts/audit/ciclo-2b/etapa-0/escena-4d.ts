// Ciclo 2b, etapa 0: el paso 4d de duo-e2e («soltar mientras tira») reconstruido en Node, determinista, para medir
// por qué a veces J2 se tambalea pero no cae. No es una prueba del juego: solo lee su estado.
// Reproduce la lógica de la prueba ARREGLADA (duo-e2e.cjs, pasos 4c y 4d):
//   - el sofá se coloca en (X, Z) con giro YAW0 y cada uno agarra un extremo (como en soltar-tension.ts);
//   - 4c: tiran en sentidos opuestos, de través, con la dirección de teclado (de las 8) más parecida a la perpendicular
//     al eje, durante 1,5 s de juego (si TWIST=1);
//   - 4d: tiran hacia fuera por el eje real (de las 8 teclas la más parecida, corregida en cada fotograma) 1,2 s de juego
//     y J2 suelta (Intro) sin dejar de tirar; se observan 1,5 s con las teclas pulsadas.
// El navegador avanza por fotogramas de varios pasos: las entradas cambian solo en el límite de fotograma. `SPF` es la
// lista de pasos por fotograma de la que se elige al azar (p. ej. «5» o «2,3,3,4»).
// Mide, para J2: tensión sostenida al soltar (forceExp, N; y su componente hacia el sofá), el giro que le da el tirón
// (releaseKick · tensión / (m·h), rad/s), la inclinación máxima, cuándo se tambalea y cae, y si le derriba un coche
// (`stun`) y dónde.
// Uso: ROOT=<árbol mudanza-imposible> [MODE=uno|barrido] [X=0] [Z=6.8] [YAW0=0.38] [TWIST=1] [SPF=5] [N=..] npx vite-node escena-4d.ts
const ROOT = process.env.ROOT!;
const env = (k: string, d: string) => process.env[k] ?? d;
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { CARRIER } = await import(`${ROOT}/src/sim/carrier.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const sofaMod = await import(`${ROOT}/src/sim/sofa.ts`);
const { yawQuat } = sofaMod;
const { existsSync } = await import('node:fs');
const level = existsSync(`${ROOT}/src/levels/calle.ts`) ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
const DT = 1 / 60;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Igual que `keysToward` de e2e-piloto.cjs: dirección de teclado (8) más parecida y su error (rad). */
const key8 = (x: number, z: number) => {
  const a = Math.round(Math.atan2(z, x) / (Math.PI / 4)) * (Math.PI / 4);
  const sx = Math.round(Math.cos(a)), sz = Math.round(Math.sin(a)), m = Math.hypot(sx, sz) || 1;
  const e = Math.atan2(z, x) - a;
  return { mx: sx / m, mz: sz / m, err: Math.abs(Math.atan2(Math.sin(e), Math.cos(e))), name: `${sx}${sz}` };
};
type In = { mx: number; mz: number; grab: boolean; turn: 0; right: boolean };
const inp = (mx = 0, mz = 0, grab = false): In => ({ mx, mz, grab, turn: 0, right: false });

export function trial(o: { seed: number; x: number; z: number; yaw0: number; twist: boolean; spf: number[]; exact?: boolean; grip?: number[] }) {
  const rnd = mulberry32(o.seed);
  const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
  while (g.phase !== 'playing') g.step(DT, [NO_INPUT, NO_INPUT]);
  const evs: string[] = [];
  const step = (ins: In[]) => {
    g.step(DT, ins);
    for (const e of g.out) if (['grab', 'release', 'wobble', 'fall', 'stun'].includes(e.type)) evs.push(`${g.time.toFixed(2)} ${e.type} J${e.carrier + 1}`);
  };
  g.sofa.setTranslation({ x: o.x, y: g.sofaPos.y, z: o.z }, true);
  g.sofa.setRotation(yawQuat(o.yaw0), true);
  for (let i = 0; i < 30; i++) step([NO_INPUT, NO_INPUT]);
  let ax = Math.cos(g.sofaYaw), az = Math.sin(g.sofaYaw);
  const sp = g.sofaPos, side = [1, -1];
  g.carriers.forEach((c: any, i: number) => c.teleport({ x: sp.x + ax * 1.75 * side[i], y: c.pos.y, z: sp.z + az * 1.75 * side[i] }));
  for (let i = 0; i < 3; i++) step(side.map((s) => inp(-ax * s * 0.5, -az * s * 0.5)));
  if (o.grip) {
    // Punto agarrado elegido (local del sofá): J1 en (gx, gy, gz) y J2 en (-gx, gy, gz2)
    const { localToWorld } = sofaMod;
    const pts = [{ x: Math.abs(o.grip[0]), y: o.grip[1], z: o.grip[2] }, { x: -Math.abs(o.grip[0]), y: o.grip[4] ?? o.grip[1], z: o.grip[3] }];
    g.carriers.forEach((c: any, i: number) => c.grab(g.sofa, localToWorld(g.sofa, pts[i])));
    step([NO_INPUT, NO_INPUT]);
  } else step([inp(0, 0, true), inp(0, 0, true)]);
  const ends = g.carriers.map((c: any) => (c.grabLocal ? [c.grabLocal.x, c.grabLocal.y, c.grabLocal.z].map((v: number) => +v.toFixed(2)) : 0));
  for (let i = 0; i < 30; i++) step([NO_INPUT, NO_INPUT]); // «hold([], 0.5)» de la prueba
  /** Avanza `sec` s de juego por fotogramas; `want` da las entradas al empezar cada fotograma. */
  const run = (sec: number, want: () => In[], each?: () => void) => {
    const t0 = g.time;
    let first = true;
    while (g.time - t0 < sec - 1e-9) {
      let n = o.spf[Math.floor(rnd() * o.spf.length)];
      // Fase al azar: el primer fotograma de cada tramo empieza a medias
      if (first) { n = 1 + Math.floor(rnd() * n); first = false; }
      const cur = want();
      // Una pulsación (agarrar/soltar) la consume solo el primer paso del fotograma, como `input.step` en main.ts
      for (let k = 0; k < n; k++) { step(k ? cur.map((x) => ({ ...x, grab: false })) : cur); each?.(); }
    }
  };
  // 4c: de través, cada uno hacia un lado (teclas fijas, calculadas con el giro inicial, como la prueba)
  const yawA = g.sofaYaw;
  let twistKeys = '';
  if (o.twist) {
    const px = -Math.sin(yawA), pz = Math.cos(yawA);
    const k = [key8(px, pz), key8(-px, -pz)];
    twistKeys = k.map((q) => q.name).join('/');
    run(1.5, () => k.map((q) => inp(q.mx, q.mz)));
  }
  const yawB = g.sofaYaw;
  const dyaw = Math.abs(Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA)));
  // 4d: hacia fuera por el eje real, corrigiendo en cada fotograma
  let maxErr = 0;
  const outward = () => {
    const a = g.sofaYaw, x = Math.cos(a), z = Math.sin(a), s = g.sofaPos;
    return g.carriers.map((c: any, i: number) => {
      const out = Math.sign((c.pos.x - s.x) * x + (c.pos.z - s.z) * z) || (i ? -1 : 1);
      if (o.exact) return inp(x * out, z * out);
      const q = key8(x * out, z * out); maxErr = Math.max(maxErr, q.err);
      return inp(q.mx, q.mz);
    });
  };
  run(1.2, outward);
  const c2 = g.carriers[1] as any, mass = c2.body.mass();
  const fe = c2.forceExp, s = g.sofaPos;
  // Componente de la tensión hacia el sofá (lo que el tirón convierte en giro hacia atrás)
  const tx = s.x - c2.pos.x, tz = s.z - c2.pos.z, tl = Math.hypot(tx, tz);
  const pre = {
    holding: g.carriers.map((c: any) => c.holding), yaw: +g.sofaYaw.toFixed(3),
    tension: +Math.hypot(fe.x, fe.z).toFixed(0), toward: +((fe.x * tx + fe.z * tz) / tl).toFixed(0),
    kick: +((CARRIER.releaseKick * Math.hypot(fe.x, fe.z)) / (mass * CARRIER.comHeight)).toFixed(2),
    leanBefore: +Math.hypot(c2.lean.x, c2.lean.z).toFixed(3),
    keys: outward().map((q: In) => `${q.mx.toFixed(2)},${q.mz.toFixed(2)}`).join(' / '),
    j2: [+c2.pos.x.toFixed(2), +c2.pos.z.toFixed(2)],
  };
  const tRel = g.time;
  // Suelta en el primer paso del fotograma siguiente; las teclas siguen pulsadas
  let firstFrame = true, wob = false, fell = false, stun = false, maxLean = 0, stunAt: number[] | null = null;
  run(1.5, () => {
    const w = outward();
    if (firstFrame) { firstFrame = false; return [w[0], { ...w[1], grab: true }]; }
    return w;
  }, () => {
    maxLean = Math.max(maxLean, Math.hypot(c2.lean.x, c2.lean.z));
    if (c2.wobbling) wob = true;
    if (c2.stunned > 0 && c2.knock === 'balance') fell = true;
    if (c2.stunned > 0 && c2.knock === 'car' && !stun) { stun = true; stunAt = [+c2.pos.x.toFixed(2), +c2.pos.z.toFixed(2)]; }
  });
  const ev = evs.filter((e) => parseFloat(e) >= tRel - 1e-6 && / J2$/.test(e)).map((e) => `${(parseFloat(e) - tRel).toFixed(2)} ${e.split(' ')[1]}`);
  const r = { seed: o.seed, x: o.x, z: o.z, yaw0: o.yaw0, twistKeys, dyaw: +dyaw.toFixed(2), ends, maxErrDeg: Math.round((maxErr * 180) / Math.PI), pre, wob, fell, stun, stunAt, maxLean: +maxLean.toFixed(2), ev, j2end: [+c2.pos.x.toFixed(2), +c2.pos.z.toFixed(2)] };
  g.dispose?.();
  return r;
}

const MODE = env('MODE', 'uno');
const spf = env('SPF', '5').split(',').map(Number);
if (MODE === 'uno') {
  const N = +env('N', '10');
  const grip = process.env.GRIP ? process.env.GRIP.split(',').map(Number) : undefined;
  for (let k = 0; k < N; k++) console.log(JSON.stringify(trial({ seed: +env('SEED', '1') + k, x: +env('X', '0'), z: +env('Z', '6.8'), yaw0: +env('YAW0', '0.38'), twist: env('TWIST', '1') === '1', spf, exact: env('EXACT', '0') === '1', grip })));
} else {
  // Barrido: posición del sofá en el patio y giro inicial; varias fases de fotograma por punto
  const xs = env('XS', '-1.5,0,1.5').split(',').map(Number), zs = env('ZS', '5.5,6.5,7.5').split(',').map(Number);
  const NY = +env('NY', '24'), REP = +env('REP', '3');
  for (const x of xs) for (const z of zs) for (let k = 0; k < NY; k++) for (let r = 0; r < REP; r++) {
    const yaw0 = (k / NY) * Math.PI;
    console.log(JSON.stringify(trial({ seed: 1000 * r + k + 1, x, z, yaw0, twist: env('TWIST', '1') === '1', spf, exact: env('EXACT', '0') === '1' })));
  }
}
