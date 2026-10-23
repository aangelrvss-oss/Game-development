// Ciclo 2b, etapa 0: paso 4b de duo-e2e («uno solo lo arrastra» y aviso «Pesa mucho») desde estados REALES del
// navegador. Repite en Node una ejecución grabada con grabador-fotogramas.cjs hasta el primer paso en que J1 arrastra
// solo (J2 acaba de soltar) y, desde ese mismo estado, prueba variantes de lo que pulsa J1 durante 2,5 s (+3 s si hace
// falta), por fotogramas de 5 pasos:
//   - «S»: hacia +z (lo que hace la prueba: «de vuelta hacia el patio»), sea cual sea el giro del sofá;
//   - «eje»: hacia fuera por el eje real del sofá, desde el extremo que agarra J1 (la de las 8 teclas más parecida).
// Mide la distancia en 2,5 s, el sofaUp mínimo y si el HUD mostraría «Pesa mucho» (`heavyAlone` con sofaUp ≥ 0,8, la
// prioridad de hud.ts) en 2,5 s o en los 3 s extra.
// Uso: ROOT=<árbol> REC=<carpeta con rec.jsonl> [MODOS=S,eje] npx vite-node variante-4b.ts
import { readFileSync, existsSync } from 'node:fs';
const ROOT = process.env.ROOT!, REC = process.env.REC!, MODOS = (process.env.MODOS ?? 'S,eje').split(',');
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init({});
const { Game, RULES } = await import(`${ROOT}/src/sim/game.ts`);
const { NO_INPUT } = await import(`${ROOT}/src/sim/types.ts`);
const level = existsSync(`${ROOT}/src/levels/calle.ts`) ? { level: (await import(`${ROOT}/src/levels/calle.ts`)).CALLE } : {};
let load = 0; const rows: any[] = [];
for (const l of readFileSync(`${REC}/rec.jsonl`, 'utf8').trim().split('\n')) { let c: any[]; try { c = JSON.parse(l); } catch { continue; } for (const r of c) { if (r[1] === 0 && r[0] === 1) load++; rows.push([`${load}:${r[0]}`, ...r.slice(1)]); } }
const heads = rows.filter((r) => r[1] === 0 && r[6] === 2);
const per = (id: string) => { const m = new Map<number, number>(); for (const r of rows) if (r[0] === id && r[1] > 0 && r[4] === 'p') m.set(r[3], (m.get(r[3]) ?? 0) + 1); return m; };
const head = heads.find((h) => { const m = per(h[0]); return m.size > 100 && Math.max(...m.values()) <= 5; })!;
const steps = rows.filter((r) => r[0] === head[0] && r[1] > 0);
const before = steps[0][4] === 'c' ? Math.round((RULES.countdown - steps[0][6]) * 60) - 1 : 0;
// Primer paso, tras la primera suelta de J2 (r1), en que J1 pulsa hacia +z (empieza a arrastrar solo)
const kR = steps.findIndex((r) => r[13].includes('r1'));
const kS = steps.findIndex((r, k) => k > kR && r[7][0][1] > 0.5);
const toIn = (x: number[]) => ({ mx: x[0], mz: x[1], grab: !!x[2], turn: x[3], right: !!x[4] });
const key8 = (x: number, z: number) => { const a = Math.round(Math.atan2(z, x) / (Math.PI / 4)) * (Math.PI / 4); const sx = Math.round(Math.cos(a)), sz = Math.round(Math.sin(a)), m = Math.hypot(sx, sz) || 1; return { mx: sx / m, mz: sz / m }; };
for (const modo of MODOS) {
  const g = new Game(RAPIER, { ...level, humans: 2, carriers: 2, botStyle: 'atentos', seed: head[7] });
  for (let i = 0; i < before; i++) g.step(1 / 60, [NO_INPUT, NO_INPUT]);
  for (let k = 0; k < kS; k++) g.step(1 / 60, steps[k][7].map(toIn));
  if (process.env.GRIPZ) {
    // Variante: J1 agarra el mismo extremo, a la altura grabada, pero a GRIPZ m del centro de la cara (local z)
    const { localToWorld } = await import(`${ROOT}/src/sim/sofa.ts`);
    const c = g.carriers[0] as any, gl0 = c.grabLocal;
    c.release(true); c.grab(g.sofa, localToWorld(g.sofa, { x: gl0.x, y: process.env.GRIPY ? +process.env.GRIPY : gl0.y, z: process.env.GRIPY ? +process.env.GRIPZ : +process.env.GRIPZ * Math.sign(gl0.z || 1) }));
  }
  const c1 = g.carriers[0] as any, p0 = { ...g.sofaPos }, yaw0 = +g.sofaYaw.toFixed(2), gl = c1.grabLocal ? [c1.grabLocal.x, c1.grabLocal.y, c1.grabLocal.z].map((v: number) => +v.toFixed(2)) : null;
  const want = () => {
    if (modo === 'S') return { mx: 0, mz: 1 };
    const a = g.sofaYaw, ax = Math.cos(a), az = Math.sin(a), s = g.sofaPos;
    const o = Math.sign((c1.pos.x - s.x) * ax + (c1.pos.z - s.z) * az) || 1;
    return key8(ax * o, az * o);
  };
  let minUp = 1, dist25 = 0, saw25 = false, saw = false, sawAt = -1;
  const t0 = g.time;
  while (g.time - t0 < 5.5 - 1e-9) {
    const w = want();
    for (let k = 0; k < 5; k++) {
      g.step(1 / 60, [{ ...w, grab: false, turn: 0, right: false }, NO_INPUT]);
      minUp = Math.min(minUp, g.sofaUp);
      const show = !!g.heavyAlone && g.sofaUp >= 0.8;
      if (show && !saw) { saw = true; sawAt = +(g.time - t0).toFixed(2); }
      if (g.time - t0 <= 2.5 + 1e-9) { if (show) saw25 = true; dist25 = Math.hypot(g.sofaPos.x - p0.x, g.sofaPos.z - p0.z); }
    }
    if (g.time - t0 >= 2.5 && (saw25 || (saw && g.time - t0 > 2.5))) break;
  }
  console.log(JSON.stringify({ rec: REC.split('/').pop(), root: ROOT.split('/').slice(-2, -1)[0], modo, yaw0, yawFin: +g.sofaYaw.toFixed(2), gl1: gl, dist25: +dist25.toFixed(2), minUp: +minUp.toFixed(2), avisoEn25: saw25, avisoEn55: saw, avisoAt: sawAt, agarra: c1.holding }));
  g.dispose?.();
}
