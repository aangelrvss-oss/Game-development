// ¿Desapareció la mordaza? ¿Puede uno solo alzar el sofá entero? Barrido de puntos de agarre alrededor del sofá
// (extremos, costados, esquinas, respaldo), con el sofá derecho, de lado y de pie, y movimientos en 8 direcciones.
// Mide la altura mínima del sofá (su punto más bajo) a lo largo del tiempo: si supera 2 cm, está en el aire.
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/mordaza.ts
import { init, setup, near, play, inp, f2, f3, sofaLowest, count, SOFA, DT, NO_INPUT, standY } from './comun';
import { HAND } from '../../../../src/sim/hand';
import type { Game } from '../../../../src/sim/game';
await init();

type P = { name: string; lx: number; lz: number; ox: number; oz: number };
const h = SOFA.half;
const points: P[] = [
  { name: 'extremo +x', lx: h.x, lz: 0, ox: 1, oz: 0 },
  { name: 'esquina +x+z', lx: h.x, lz: h.z * 0.8, ox: 1, oz: 0 },
  { name: 'costado asiento centro', lx: 0, lz: h.z, ox: 0, oz: 1 },
  { name: 'costado asiento 0,5', lx: 0.5, lz: h.z, ox: 0, oz: 1 },
  { name: 'respaldo centro', lx: 0, lz: -h.z, ox: 0, oz: -1 },
  { name: 'respaldo 0,8', lx: 0.8, lz: -h.z, ox: 0, oz: -1 },
];
const dirs = [0, 45, 90, 135, 180, 225, 270, 315];
const rot = (q: { x: number; y: number; z: number; w: number }) => q;

let worstAir = -Infinity, worstCase = '';
const lines: string[] = [];
for (const pose of ['derecho', 'de lado', 'de pie'] as const) {
  for (const p of points) {
    for (const gapExtra of [0.55, 0.75, 0.95]) {
      let best = -Infinity, bestDir = -1, maxY = -Infinity, breaks = 0, held = true;
      for (const deg of [null, ...dirs]) {
        const g = setup(1);
        if (pose === 'de lado') g.sofa.setRotation(rot({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }), true); // asiento hacia arriba/abajo
        if (pose === 'de pie') g.sofa.setRotation(rot({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }), true); // apoyado en un extremo
        if (pose !== 'derecho') { const t = g.sofa.translation(); g.sofa.setTranslation({ x: t.x, y: pose === 'de pie' ? 1.2 : 0.6, z: t.z }, true); }
        play(g, 1.5);
        near(g, 0, p.lx, p.lz, p.ox, p.oz, gapExtra);
        play(g, 0.3);
        g.step(DT, [inp({ grab: true })]);
        const c = g.carriers[0];
        if (!c.holding) { g.dispose(); continue; }
        let air = -Infinity;
        const a = deg === null ? 0 : (deg * Math.PI) / 180;
        const ev = play(g, 4, (_g, i) => [deg === null || i < 60 ? NO_INPUT : inp({ mx: Math.cos(a), mz: Math.sin(a) })], (g) => {
          air = Math.max(air, sofaLowest(g));
          maxY = Math.max(maxY, g.sofaPos.y);
        });
        breaks += count(ev, 'gripBreak');
        held &&= c.holding;
        if (air > best) { best = air; bestDir = deg ?? -1; }
        g.dispose();
      }
      const line = `${pose.padEnd(8)} ${p.name.padEnd(24)} a ${gapExtra} m: punto más bajo del sofá, máx. ${f3(best)} m (dir ${bestDir}°); centro hasta y=${f2(maxY)}; roturas ${breaks}`;
      lines.push(line);
      if (best > worstAir) { worstAir = best; worstCase = line; }
    }
  }
}
for (const l of lines) console.log(l);
console.log(`\nPEOR CASO (uno solo): ${worstCase}`);
console.log(`Peso del sofá ${f2(90 * 9.81)} N frente a HAND.maxV ${HAND.maxV} N`);

// Rigidez efectiva de la mano con el sofá entre dos: cuánto cede el punto agarrado
const g = setup(2);
near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0);
play(g, 0.3);
g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
let maxSep = 0;
play(g, 3, (_g, i) => (i < 60 ? [NO_INPUT, NO_INPUT] : [inp({ mx: -1 }), inp({ mx: -1 })]), (g) => { maxSep = Math.max(maxSep, ...g.carriers.map((c) => c.handSep)); });
console.log(`Entre dos, separación mano-punto agarrado máx. ${f3(maxSep)} m (gripBreak 0,55)`);
g.dispose();
void standY;
