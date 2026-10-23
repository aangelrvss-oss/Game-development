// Ciclo 2b, etapa 0: ¿dónde agarra el sofá un porteador que llega a su extremo, según hacia dónde mira al pulsar?
// El juego agarra el punto del sofá más cercano a una sonda 0,35 m por delante del porteador, en la dirección en que
// mira (`Carrier.findGrab`). El piloto de duo-e2e llega a ±0,3 m del punto objetivo (1,75 m del centro por el eje) y
// mira hacia donde dio el último paso. Aquí se colocan porteadores en ese margen, con miradas al azar, y se compara:
//   - «sin»: pulsa agarrar tal cual (lo que hacía la prueba);
//   - «apunta»: igual que «mira», pero de las 8 direcciones elige la que deja la sonda más cerca del eje del sofá;
//   - «mira»: antes, un toque de un fotograma (MIRA_PASOS pasos) en la dirección de teclado (8) más parecida a la que va
//     de él al centro de la cara del extremo (1,1 m del centro del sofá por el eje), 0,2 s quieto, y agarrar.
// Mide el punto local agarrado (|z| es la distancia al centro de la cara: el sofá mide ±0,45 de ancho).
// Uso: ROOT=<árbol> [N=200] [MIRA_PASOS=5] npx vite-node agarre-mirada.ts
import { existsSync } from 'node:fs';
const ROOT = process.env.ROOT!, N = +(process.env.N ?? 200), MP = +(process.env.MIRA_PASOS ?? 5);
const RAPIER = (await import('@dimforge/rapier3d-compat')).default; await RAPIER.init({});
const { Game } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const { yawQuat } = await import(`${ROOT}/src/sim/sofa.ts`);
const level = existsSync(`${ROOT}/src/levels/calle.ts`) ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const key8 = (x: number, z: number) => { const a = Math.round(Math.atan2(z, x) / (Math.PI / 4)) * (Math.PI / 4); const sx = Math.round(Math.cos(a)), sz = Math.round(Math.sin(a)), m = Math.hypot(sx, sz) || 1; return { mx: sx / m, mz: sz / m, grab: false, turn: 0, right: false }; };
const MODOS = ['sin', 'mira', 'apunta', 'frente'];
const LAT = +(process.env.LAT ?? 0.12), OTRO = process.env.OTRO === '1';
const res: Record<string, number[]> = { sin: [], mira: [], apunta: [], frente: [] };
const fails: Record<string, number> = { sin: 0, mira: 0, apunta: 0, frente: 0 };
const asiento: Record<string, number> = { sin: 0, mira: 0, apunta: 0, frente: 0 };
const buenos: Record<string, number> = { sin: 0, mira: 0, apunta: 0, frente: 0 };
for (let k = 0; k < N; k++) {
  for (const modo of MODOS) {
    const rnd = mulberry32(k + 1);
    const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: 1 });
    while (g.phase !== 'playing') g.step(1 / 60, [NO_INPUT, NO_INPUT]);
    const yaw = rnd() * Math.PI * 2;
    g.sofa.setRotation(yawQuat(yaw), true);
    for (let i = 0; i < 20; i++) g.step(1 / 60, [NO_INPUT, NO_INPUT]);
    const ax = Math.cos(g.sofaYaw), az = Math.sin(g.sofaYaw), s = g.sofaPos;
    const c = g.carriers[0] as any, other = g.carriers[1] as any;
    if (OTRO) {
      // El otro agarra ya el extremo contrario (y lo levanta), como al volver a agarrar en la prueba
      other.teleport({ x: s.x - ax * 1.75, y: other.pos.y, z: s.z - az * 1.75 });
      other.facing = { x: ax, z: az };
      g.step(1 / 60, [NO_INPUT, { mx: 0, mz: 0, grab: true, turn: 0, right: false }]);
      for (let i = 0; i < 40; i++) g.step(1 / 60, [NO_INPUT, NO_INPUT]);
    } else other.teleport({ x: s.x - ax * 4, y: other.pos.y, z: s.z - az * 4 });
    // En el margen de llegada del piloto: ±0,3 m alrededor del objetivo (a lo largo y de través)
    const along = 1.75 + (rnd() - 0.5) * 0.6, lat = (rnd() - 0.5) * 0.6 + (modo === 'frente' ? LAT : 0);
    c.teleport({ x: s.x + ax * along - az * lat, y: c.pos.y, z: s.z + az * along + ax * lat });
    const fa = rnd() * Math.PI * 2;
    c.facing = { x: Math.cos(fa), z: Math.sin(fa) };
    if (modo === 'mira' || modo === 'apunta' || modo === 'frente') {
      // «frente»: el objetivo de la marcha y de la mirada está LAT m hacia el lado del asiento (z local +)
      const off = modo === 'frente' ? LAT : 0;
      const ex = s.x + ax * 1.1 - az * off, ez = s.z + az * 1.1 + ax * off;
      let d = key8(ex - c.pos.x, ez - c.pos.z);
      if (modo === 'apunta') {
        // De las 8 direcciones, la que deja la sonda (0,35 m delante, más ~0,1 m que avanza con el toque) más cerca del
        // eje del sofá, siempre que mire hacia el sofá (componente hacia el extremo > 0,3)
        let best = Infinity;
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4, fx = Math.cos(a), fz = Math.sin(a);
          if (-(fx * ax + fz * az) < 0.3) continue; // hacia el sofá: contra el eje (está en el extremo +)
          const px = c.pos.x + fx * 0.45 - s.x, pz = c.pos.z + fz * 0.45 - s.z, lat = Math.abs(-px * az + pz * ax);
          if (lat < best) { best = lat; d = key8(fx, fz); }
        }
      }
      for (let i = 0; i < MP; i++) g.step(1 / 60, [d, NO_INPUT]);
      for (let i = 0; i < 12; i++) g.step(1 / 60, [NO_INPUT, NO_INPUT]);
    }
    g.step(1 / 60, [{ mx: 0, mz: 0, grab: true, turn: 0, right: false }, NO_INPUT]);
    if (!c.holding) fails[modo]++;
    else {
      res[modo].push(Math.abs(c.grabLocal.z) * (Math.abs(c.grabLocal.x) > 0.8 ? 1 : 10));
      if (c.grabLocal.y < 0.55) asiento[modo]++;
      if (c.grabLocal.y < 0.55 && Math.abs(c.grabLocal.z) <= 0.25 && Math.abs(c.grabLocal.x) > 0.8) buenos[modo]++;
    }
    g.dispose?.();
  }
}
const q = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return +b[Math.floor(p * (b.length - 1))].toFixed(2); };
for (const m of MODOS) {
  const a = res[m];
  console.log(JSON.stringify({ modo: m, N, agarra: a.length, noAgarra: fails[m], noExtremo: a.filter((v) => v >= 1).length, mediana: q(a, 0.5), p90: q(a, 0.9), max: q(a, 1), absZmayor03: a.filter((v) => v > 0.3).length, absZmayor02: a.filter((v) => v > 0.2).length, enAsiento: asiento[m], asientoYz025: buenos[m] }));
}
