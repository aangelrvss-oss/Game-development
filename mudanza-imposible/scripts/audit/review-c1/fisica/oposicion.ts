// Tirar en sentidos opuestos y «¡Se escapa!»: ¿se suelta alguien alguna vez sin pulsar soltar? ¿Puede un jugador
// resistirse o la correa le arrastra pegado al sofá? Uso: ./node_modules/.bin/vite-node scripts/audit/review-c1/fisica/oposicion.ts
import { init, setup, near, play, inp, f2, f3, count, SOFA, DT, NO_INPUT } from './comun';
import { CARRIER } from '../../../../src/sim/carrier';
await init();
const h = SOFA.half;

// 1) Dos en los extremos tiran hacia fuera (a lo largo del eje), 6 s
{
  const g = setup(2);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0);
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  let maxSep = 0; const p0 = g.carriers.map((c) => ({ ...c.pos }));
  const ev = play(g, 6, () => [inp({ mx: -1 }), inp({ mx: 1 })], (g) => { maxSep = Math.max(maxSep, ...g.carriers.map((c) => c.handSep)); });
  const moved = g.carriers.map((c, i) => Math.hypot(c.pos.x - p0[i].x, c.pos.z - p0[i].z));
  console.log(`Dos tiran hacia fuera 6 s: separación máx ${f3(maxSep)} m; gripBreak ${count(ev, 'gripBreak')}; caídas ${count(ev, 'fall')}; tambaleos ${count(ev, 'wobble')}; agarrando ${g.carriers.map((c) => c.holding)}; se han movido ${moved.map(f2)} m`);
  g.dispose();
}

// 2) Tres tiran hacia -x y uno (en el extremo +x) hacia +x: ¿le arrastran? ¿se suelta?
{
  const g = setup(4);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, -0.5, h.z, 0, 1); near(g, 2, -0.5, -h.z, 0, -1); near(g, 3, h.x, 0, 1, 0);
  play(g, 0.3);
  g.step(DT, g.carriers.map(() => inp({ grab: true })));
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  const loner = g.carriers[3], p0 = { ...loner.pos };
  let maxSep = 0, minAlong = Infinity;
  const ev = play(g, 6, () => [inp({ mx: -1 }), inp({ mx: -1 }), inp({ mx: -1 }), inp({ mx: 1 })], (g) => {
    maxSep = Math.max(maxSep, loner.handSep);
    minAlong = Math.min(minAlong, g.carriers[3].body.linvel().x);
  });
  console.log(`3 contra 1 durante 6 s: el que tira solo hacia +x se ha desplazado ${f2(loner.pos.x - p0.x)} m en x (pide +x); separación máx ${f3(maxSep)} m; gripBreak ${count(ev, 'gripBreak')}; caídas ${count(ev, 'fall')}; sigue agarrando ${loner.holding}; velocidad x mínima ${f2(minAlong)} m/s`);
  g.dispose();
}

// 3) Uno agarra el extremo y el otro arrastra el sofá en su dirección contraria sin agarrarlo: el sofá lo mueve
// solo la mano del otro... Aquí: el compañero agarra y anda; el primero quieto o andando hacia atrás (mx=+1) 4 s
for (const back of [0, 0.5, 1]) {
  const g = setup(2);
  near(g, 0, -h.x, 0, -1, 0); near(g, 1, h.x, 0, 1, 0);
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  const p0 = { ...g.carriers[1].pos };
  let maxSep = 0;
  const ev = play(g, 4, () => [inp({ mx: -1 }), inp({ mx: back })], (g) => { maxSep = Math.max(maxSep, g.carriers[1].handSep); });
  console.log(`J1 tira hacia -x y J2 pide mx=${back}: J2 se ha movido ${f2(g.carriers[1].pos.x - p0.x)} m en x; separación máx ${f3(maxSep)}; gripBreak ${count(ev, 'gripBreak')}; caídas ${count(ev, 'fall')}`);
  g.dispose();
}

// 4) Dos de lado (costados opuestos) tiran hacia fuera, perpendicular al eje
{
  const g = setup(2);
  near(g, 0, 0, h.z, 0, 1); near(g, 1, 0, -h.z, 0, -1);
  play(g, 0.3);
  g.step(DT, [inp({ grab: true }), inp({ grab: true })]);
  play(g, 0.5, () => [NO_INPUT, NO_INPUT]);
  let maxSep = 0;
  const ev = play(g, 5, () => [inp({ mz: 1 }), inp({ mz: -1 })], (g) => { maxSep = Math.max(maxSep, ...g.carriers.map((c) => c.handSep)); });
  console.log(`Dos costados tiran hacia fuera 5 s: separación máx ${f3(maxSep)}; gripBreak ${count(ev, 'gripBreak')}; caídas ${count(ev, 'fall')}; agarrando ${g.carriers.map((c) => c.holding)}`);
  g.dispose();
}
console.log(`(gripBreak ${CARRIER.gripBreak} m durante ${CARRIER.gripHold} s, o ${2 * CARRIER.gripBreak} m de golpe; correa ${CARRIER.leash} m)`);
