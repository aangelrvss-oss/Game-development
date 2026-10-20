// Situaciones normales de juego con el sofá en marcha: el compañero suelta, frena en seco o se da la vuelta. ¿Se
// cae alguien? ¿Vuelca el sofá? (Las pruebas del ciclo solo cubren soltar tirando en sentidos opuestos.)
// Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/eventos.ts
import { init, setup, near, play, inp, f2, count, SOFA, DT, NO_INPUT } from './comun';
import type { PlayerInput } from '../../../../src/sim/types';
await init();
const h = SOFA.half;

type Ev = 'suelta' | 'frena' | 'invierte' | 'suelta y se para';
function run(n: number, dir: 'largo' | 'lado', ev: Ev) {
  const g = setup(n);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0);
  if (n >= 3) near(g, 2, 0.5, -h.z, 0, -1);
  if (n >= 4) near(g, 3, -0.5, h.z, 0, 1);
  play(g, 0.3);
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  play(g, 0.6, (g) => g.carriers.map(() => NO_INPUT));
  const go: PlayerInput = dir === 'largo' ? inp({ mx: -1 }) : inp({ mz: -1 });
  const back: PlayerInput = dir === 'largo' ? inp({ mx: 1 }) : inp({ mz: 1 });
  play(g, 2, (g) => g.carriers.map(() => go));
  // El último porteador (J2 con 2) hace el suceso; el resto sigue andando 3 s
  const k = n - 1;
  let upMin = 1;
  const evs = play(g, 3, (_g, i) => g.carriers.map((_c, j) => {
    if (j !== k) return go;
    if (ev === 'suelta') return i === 0 ? { ...go, grab: true } : go;
    if (ev === 'suelta y se para') return i === 0 ? inp({ grab: true }) : NO_INPUT;
    if (ev === 'frena') return NO_INPUT;
    return back;
  }), (g) => { upMin = Math.min(upMin, g.sofaUp); });
  const who = (t: string) => evs.filter((e) => e.type === t).map((e) => `J${(e as { carrier: number }).carrier + 1}`).join('+') || '-';
  const r = `${n} humanos, ${dir.padEnd(5)}, J${k + 1} ${ev.padEnd(17)}: caídas ${who('fall')}, tambaleos ${who('wobble')}, «se escapa» ${who('gripBreak')}; sofaUp mín ${f2(upMin)}; daño ${100 - g.integrity}; agarran ${g.carriers.map((c) => (c.holding ? 1 : 0)).join('')}`;
  g.dispose();
  return r;
}
for (const n of [2, 3, 4]) for (const dir of ['largo', 'lado'] as const) for (const ev of ['suelta', 'suelta y se para', 'frena', 'invierte'] as const) console.log(run(n, dir, ev));
void count;
