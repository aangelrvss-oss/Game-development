// Revisor A+G+C+E (ciclo 1, segunda ronda): ¿se lee el esfuerzo desde la cámara de juego, y distingue «uno solo no
// puede» de «lo llevamos bien entre dos»? Partida a 2 en modo captura:
//   1) reposo; 2) J1 con el piloto agarra solo y arrastra (J2 quieto); 3) los dos con el piloto lo llevan en llano;
//   4) los dos en la escalera.
// Por fase: esfuerzo del muñeco, rayas visibles, escala y color de la bola de agarre, escala del aro, inclinación del
// tronco, y aviso del HUD. Capturas con la cámara de juego (recorte alrededor de J1) y de cerca.
//   NODE_PATH=$(npm root -g) node scripts/audit/review-c1b/rol-agce/esfuerzo.cjs
const { launch, page, adv, shot, closeShot, screenBox, hud, OUT, mkOut } = require('./comun.cjs');

(async () => {
  mkOut();
  const b = await launch();
  const p = await page(b, { humans: 2 });
  const sample = () => p.evaluate(() => {
    const m = window.__mudanza, g = m.game;
    return {
      t: +g.time.toFixed(2), sofaY: +g.sofaPos.y.toFixed(2), sz: +g.sofaPos.z.toFixed(2), stage: g.stageLabel,
      warn: (() => { const e = document.getElementById('h-warn'); return e.style.display === 'none' ? '' : e.textContent; })(),
      d: m.view.carriers.map((v, i) => {
        const c = g.carriers[i];
        const torso = v.rig.torso; torso.updateMatrixWorld(true);
        const e = torso.matrixWorld.elements; // eje Y del tronco = columnas 4..6
        const upLen = Math.hypot(e[4], e[5], e[6]);
        const tilt = Math.acos(Math.min(1, e[5] / upLen));
        const col = v.grip.material.color;
        return {
          hold: c.holding, strain: +c.strain.toFixed(2), effort: +v.effort.toFixed(2), marks: v.marks.visible,
          markOp: +v.marks.material.opacity.toFixed(2), grip: +v.grip.scale.x.toFixed(2), red: +(col.r - col.g).toFixed(2),
          ring: +v.ring.scale.x.toFixed(3), tiltDeg: +(tilt * 180 / Math.PI).toFixed(1),
        };
      }),
    };
  });
  const phases = {};
  const rec = (name, s) => { (phases[name] ??= []).push(s); };
  // 1) Reposo
  for (let i = 0; i < 10; i++) { await adv(p, 3, 'return [{mx:0,mz:0,grab:false,turn:0,right:false},{mx:0,mz:0,grab:false,turn:0,right:false}]'); rec('1-reposo', await sample()); }
  await shot(p, 'esf-1-reposo-juego.png', await screenBox(p, 0));
  // 2) J1 solo con el piloto (J2 quieto) durante ~6 s
  const solo = 'const a = window.__mudanza.autoInputs(g); return [a[0], {mx:0,mz:0,grab:false,turn:0,right:false}];';
  let shotSolo = false;
  for (let i = 0; i < 60; i++) {
    await adv(p, 3, solo); const s = await sample();
    if (s.d[0].hold) rec('2-solo-arrastra', s);
    if (s.d[0].hold && !shotSolo && /Pesa mucho/.test(s.warn) && s.t > 0) {
      shotSolo = true;
      await shot(p, 'esf-2-solo-juego-full.png');
      await shot(p, 'esf-2-solo-juego.png', await screenBox(p, 0));
      await closeShot(p, 'esf-2-solo-cerca.png', 0);
    }
  }
  // 3) Los dos con el piloto, llevándolo en llano
  let both = 0, shotBoth = false;
  for (let i = 0; i < 200; i++) {
    await adv(p, 3); const s = await sample();
    if (s.d[0].hold && s.d[1].hold) {
      both++;
      if (both > 10 && s.stage !== 'Escalera' && s.sofaY > 0.3) {
        rec('3-entre-dos-llano', s);
        if (!shotBoth && both > 25) { shotBoth = true; await shot(p, 'esf-3-dos-juego-full.png'); await shot(p, 'esf-3-dos-juego.png', await screenBox(p, 0)); await closeShot(p, 'esf-3-dos-cerca.png', 0); }
      }
      if (s.stage === 'Escalera') rec('4-entre-dos-escalera', s);
    }
    if (/Arriba|Rampa|Cami/.test(s.stage)) break;
  }
  const st = await p.evaluate(() => window.__mudanza.game.stageLabel);
  console.log('Etapa al acabar:', st);
  // Resumen por fase (J1)
  for (const [name, arr] of Object.entries(phases)) {
    const j = arr.map((s) => s.d[0]);
    const f = (k) => j.map((x) => x[k]);
    const mean = (a) => (a.reduce((x, y) => x + (+y), 0) / a.length);
    const pct = (k) => (100 * j.filter((x) => x[k]).length / j.length).toFixed(0);
    console.log(`${name} (n=${j.length}): esfuerzo ${Math.min(...f('effort'))}–${Math.max(...f('effort'))} (media ${mean(f('effort')).toFixed(2)}), ` +
      `rayas visibles ${pct('marks')} %, bola ×${Math.min(...f('grip'))}–${Math.max(...f('grip'))}, rojo (r−g) ${Math.min(...f('red'))}–${Math.max(...f('red'))}, ` +
      `aro ${Math.min(...f('ring'))}–${Math.max(...f('ring'))}, tronco inclinado ${Math.min(...f('tiltDeg'))}–${Math.max(...f('tiltDeg'))}° (media ${mean(f('tiltDeg')).toFixed(1)}), ` +
      `aviso «Pesa mucho» ${(100 * arr.filter((s) => /Pesa mucho/.test(s.warn)).length / arr.length).toFixed(0)} %`);
    if (name !== '2-solo-arrastra') {
      const j2 = arr.map((s) => s.d[1]);
      console.log(`   J2 en la misma fase: esfuerzo media ${mean(j2.map((x) => x.effort)).toFixed(2)}, rayas ${(100 * j2.filter((x) => x.marks).length / j2.length).toFixed(0)} %, bola ×${Math.max(...j2.map((x) => x.grip))}, rojo máx ${Math.max(...j2.map((x) => x.red))}`);
    }
  }
  console.log('Errores de página:', p.__errors.length ? p.__errors.slice(0, 3).join(' | ') : 'ninguno');
  console.log('Capturas en', OUT);
  await b.close();
})();
