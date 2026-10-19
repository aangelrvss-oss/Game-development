// Verificación vista-08 (sin interpolación) y vista-14 (temblor de cámara por fotograma).
// Reproduce aritméticamente el acumulador de main.ts:241-253 (DT = 1/60, máx. 5 pasos) para pantallas de
// 60/75/120/144/165 Hz y mide cuántos fotogramas no avanzan la física, cuántos avanzan 2+ pasos y lo irregular
// que es el desplazamiento dibujado de un objeto a 3,4 m/s (la vista dibuja el estado del último paso).
// No sustituye a ver la pantalla: cuantifica el mecanismo.
// Uso: npx vite-node scripts/audit/verif-vista/v07-bucle.ts
const DT = 1 / 60;
function run(hz: number, jitterMs: number, seconds = 10) {
  let acc = 0, now = 0, last = 0, simTime = 0, seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const hist = new Map<number, number>(); const disp: number[] = []; let prevSim = 0; const err: number[] = [];
  const frames = Math.round(seconds * hz);
  for (let f = 0; f < frames; f++) {
    now += 1000 / hz + (rnd() - 0.5) * 2 * jitterMs;
    const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dtReal; let steps = 0;
    while (acc >= DT && steps < 5) { simTime += DT; acc -= DT; steps++; }
    if (steps === 5) acc = 0;
    hist.set(steps, (hist.get(steps) ?? 0) + 1);
    disp.push((simTime - prevSim) * 3.4); prevSim = simTime;
    err.push((now / 1000 - simTime) * 3.4 * 100); // cm de retraso respecto al tiempo real
  }
  const mean = disp.reduce((a, b) => a + b, 0) / disp.length;
  const sd = Math.sqrt(disp.reduce((a, b) => a + (b - mean) ** 2, 0) / disp.length);
  const e = err.slice(10); const emin = Math.min(...e), emax = Math.max(...e);
  const h = [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} pasos: ${((100 * v) / frames).toFixed(0)}%`).join(', ');
  console.log(`${String(hz).padStart(3)} Hz, variación ±${jitterMs} ms: ${h} | desplazamiento dibujado por fotograma ${(mean * 100).toFixed(2)} ± ${(sd * 100).toFixed(2)} cm | retraso del dibujo frente al tiempo real oscila ${(emax - emin).toFixed(1)} cm`);
}
for (const j of [0, 0.5]) for (const hz of [60, 75, 120, 144, 165]) run(hz, j);
// Fotogramas largos: un tirón de 70 ms
{
  let acc = 0; acc += 0.07; let steps = 0; while (acc >= DT && steps < 5) { acc -= DT; steps++; }
  console.log(`Fotograma de 70 ms: ${steps} pasos de física de golpe en un solo dibujo`);
}
