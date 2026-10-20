// ¿Hacen falta de verdad minCarriers personas? Con minCarriers − 1 porteadores agarrando por CUALQUIER punto (anillo de
// 12 direcciones alrededor del objeto, más las asas), 0,5 s para subir las manos y 4 s andando en la dirección indicada.
// Mide: si despega (base sostenida > 0,1 m durante 0,5 s), lo que avanza el objeto y la velocidad media.
// Uso: npx vite-node scripts/audit/review-c2/fisica/necesidad.ts
import { ITEMS, atAngle, atHandle, flat, f2, init, inp, lowest, play, NO_INPUT, type ItemDef } from './comun';

await init();

type Mode = 'tira' | 'empuja' | 'lado';
function trial(def: ItemDef, places: ({ ang: number } | { h: number })[], mode: Mode) {
  const n = places.length;
  const { g, it } = flat(def, n);
  places.forEach((pl, i) => ('h' in pl ? atHandle(g, it, i, pl.h) : atAngle(g, it, i, pl.ang)));
  play(g, 0.3);
  g.step(1 / 60, g.carriers.map(() => inp({ grab: true })));
  const grabbed = g.carriers.filter((c) => c.heldBody === it.body).length;
  play(g, 0.5, () => g.carriers.map(() => NO_INPUT));
  // Dirección: la del primero hacia fuera del objeto (tira andando de espaldas), hacia dentro (empuja) o de lado
  const c0 = g.carriers[0].pos, p = it.body.translation();
  let d = { x: c0.x - p.x, z: c0.z - p.z };
  const l = Math.hypot(d.x, d.z); d = { x: d.x / l, z: d.z / l };
  if (mode === 'empuja') d = { x: -d.x, z: -d.z };
  if (mode === 'lado') d = { x: -d.z, z: d.x };
  const p0 = it.body.translation(), y0 = it.body.worldCom().y;
  const lows: number[] = [];
  let maxCom = -Infinity;
  play(g, 4, () => g.carriers.map(() => inp({ mx: d.x, mz: d.z })), () => { lows.push(lowest(it)); maxCom = Math.max(maxCom, it.body.worldCom().y - y0); });
  // Base sostenida: el máximo, en ventanas de 0,5 s, del mínimo de la base
  let sustained = -Infinity;
  for (let i = 0; i + 30 <= lows.length; i++) sustained = Math.max(sustained, Math.min(...lows.slice(i, i + 30)));
  const p1 = it.body.translation();
  const r = { grabbed, held: g.carriers.filter((c) => c.heldBody === it.body).length, d: Math.hypot(p1.x - p0.x, p1.z - p0.z), sustained, maxCom };
  g.dispose();
  return r;
}

const ANG = Array.from({ length: 12 }, (_, k) => (k * Math.PI) / 6);
for (const id of ['mesa', 'nevera', 'sofa', 'piano'] as const) {
  const def = ITEMS[id];
  const n = def.minCarriers - 1;
  console.log(`\n== ${def.name}: ${def.mass.toFixed(1)} kg, ${(def.mass * 9.81).toFixed(0)} N; minCarriers ${def.minCarriers}; se prueba con ${n} ==`);
  const sets: { name: string; places: ({ ang: number } | { h: number })[] }[] = [];
  if (n === 1) {
    for (const a of ANG) sets.push({ name: `punto ${Math.round((a * 180) / Math.PI)}°`, places: [{ ang: a }] });
    def.handles.forEach((_, h) => sets.push({ name: `asa ${h}`, places: [{ h }] }));
  } else {
    const A8 = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) sets.push({ name: `puntos ${i * 45}°+${j * 45}°`, places: [{ ang: A8[i] }, { ang: A8[j] }] });
    for (let i = 0; i < def.handles.length; i++) for (let j = i + 1; j < def.handles.length; j++) sets.push({ name: `asas ${i}+${j}`, places: [{ h: i }, { h: j }] });
  }
  let lifted = 0, best = { d: 0, name: '' }, bestLift = { s: -Infinity, name: '' }, total = 0;
  const rows: string[] = [];
  for (const s of sets) for (const mode of ['tira', 'empuja', 'lado'] as Mode[]) {
    const r = trial(def, s.places, mode);
    if (r.grabbed < n) { rows.push(`  ${s.name} ${mode}: agarran ${r.grabbed}/${n} (no llegan)`); continue; }
    total++;
    if (r.sustained > 0.1) lifted++;
    if (r.d > best.d) best = { d: r.d, name: `${s.name} ${mode}` };
    if (r.sustained > bestLift.s) bestLift = { s: r.sustained, name: `${s.name} ${mode}` };
    rows.push(`  ${s.name} ${mode}: agarran ${r.grabbed}, siguen ${r.held}, avanza ${f2(r.d)} m en 4 s (${f2(r.d / 4)} m/s), base sostenida máx ${f2(r.sustained)} m, centro de masas +${f2(r.maxCom)} m`);
  }
  console.log(rows.join('\n'));
  console.log(`RESUMEN ${def.name} con ${n}: ${total} pruebas con agarre; despega (base sostenida > 0,1 m) en ${lifted}; mayor avance ${f2(best.d)} m (${f2(best.d / 4)} m/s) en «${best.name}»; mayor base sostenida ${f2(bestLift.s)} m en «${bestLift.name}»`);
}
