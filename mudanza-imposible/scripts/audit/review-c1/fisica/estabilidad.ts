// Estabilidad de la mano blanda de 10 a 250 kg con formas distintas (cubo, tablón largo, armario alto y estrecho),
// 1 a 4 porteadores, y maniobras duras: quietos, andar, frenar en seco, invertir la marcha, girar tirando en
// sentidos contrarios y zigzag. Mide temblor (cambios de signo de la aceleración vertical con amplitud), velocidades
// máximas del objeto y de los porteadores, el tope de clampLoads (11 m/s, 6 rad/s), NaN, roturas y caídas, y el
// solape porteador-objeto. Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/estabilidad.ts
import { init, setup, play, inp, f2, f3, count, box, depth, DT, NO_INPUT, OPEN, standY } from './comun';
import type { PlayerInput } from '../../../../src/sim/types';
await init();

const shapes = {
  cubo: { x: 0.25, y: 0.25, z: 0.25 },
  tablon: { x: 1.2, y: 0.05, z: 0.2 },
  armario: { x: 0.45, y: 0.9, z: 0.3 },
};
type Mode = 'quietos' | 'andar' | 'frenar' | 'invertir' | 'tirar-opuestos' | 'zigzag';
const modes: Mode[] = ['quietos', 'andar', 'frenar', 'invertir', 'tirar-opuestos', 'zigzag'];

function input(mode: Mode, n: number, i: number): PlayerInput[] {
  const t = i * DT;
  return Array.from({ length: n }, (_, k) => {
    switch (mode) {
      case 'quietos': return NO_INPUT;
      case 'andar': return inp({ mz: -1 });
      case 'frenar': return t < 1.5 ? inp({ mz: -1 }) : NO_INPUT;
      case 'invertir': return inp({ mz: Math.floor(t / 0.8) % 2 ? 1 : -1 });
      case 'tirar-opuestos': return inp({ mx: k % 2 ? 1 : -1 });
      case 'zigzag': return inp({ mz: -1, mx: Math.sin(t * 6) });
    }
  });
}

const rows: string[] = [];
let worst = { jitter: 0, w: 0, v: 0, clamp: 0, nan: 0, pen: 0 };
for (const [sname, half] of Object.entries(shapes)) {
  for (const m of [10, 25, 50, 90, 150, 250]) {
    for (const n of [1, 2, 3, 4]) {
      for (const mode of modes) {
        const g = setup(n, { x: OPEN.x - 10, z: OPEN.z - 10 });
        const { body, col } = box(g, m, half, { x: OPEN.x, z: OPEN.z });
        // Porteadores repartidos alrededor: extremos ±x y luego costados ±z
        const spots = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
        g.carriers.forEach((c, k) => {
          const s = spots[k];
          const off = s.x ? half.x + 0.7 : half.z + 0.7;
          c.teleport({ x: OPEN.x + s.x * off, y: standY, z: OPEN.z + s.z * off });
          c.facing = { x: -s.x, z: -s.z };
        });
        play(g, 0.4);
        g.step(DT, g.carriers.map(() => inp({ grab: true })));
        const grabbed = g.carriers.filter((c) => c.heldBody === body).length;
        play(g, 1.0);
        // Temblor: cambios de signo de la aceleración vertical con |a| > 2 m/s² (fotograma a fotograma)
        let prevVy = body.linvel().y, prevA = 0, flips = 0, maxW = 0, maxV = 0, clamp = 0, nan = false, pen = 0, carrierV = 0;
        const ev = play(g, 4, (_g, i) => input(mode, n, i), (g) => {
          const v = body.linvel(), w = body.angvel();
          const a = (v.y - prevVy) / DT;
          if (Math.abs(a) > 2 && Math.abs(prevA) > 2 && Math.sign(a) !== Math.sign(prevA)) flips++;
          prevA = a; prevVy = v.y;
          const sv = Math.hypot(v.x, v.y, v.z), sw = Math.hypot(w.x, w.y, w.z);
          maxV = Math.max(maxV, sv); maxW = Math.max(maxW, sw);
          if (sv > 10.9 || sw > 5.9) clamp++;
          const p = body.translation();
          if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
          pen = Math.max(pen, depth(g.carriers.map((c) => c.collider), [col]));
          for (const c of g.carriers) { const cv = c.body.linvel(); carrierV = Math.max(carrierV, Math.hypot(cv.x, cv.y, cv.z)); }
        });
        const holding = g.carriers.filter((c) => c.heldBody === body).length;
        const r = `${sname.padEnd(8)} ${String(m).padStart(3)} kg n=${n} ${mode.padEnd(15)} agarran ${grabbed}->${holding} temblor ${String(flips).padStart(3)} |v|max ${f2(maxV)} |ω|max ${f2(maxW)} tope ${clamp} NaN ${nan} solape ${f3(pen)} |v porteador|max ${f2(carrierV)} roturas ${count(ev, 'gripBreak')} caídas ${count(ev, 'fall')} tambaleos ${count(ev, 'wobble')}`;
        rows.push(r);
        worst = { jitter: Math.max(worst.jitter, flips), w: Math.max(worst.w, maxW), v: Math.max(worst.v, maxV), clamp: Math.max(worst.clamp, clamp), nan: worst.nan + (nan ? 1 : 0), pen: Math.max(worst.pen, pen) };
        g.dispose();
      }
    }
  }
}
for (const r of rows) console.log(r);
console.log('PEOR', JSON.stringify(worst));
