// «Cerebro» de los jugadores simulados (revisión del ciclo 2, rol director de juego y UX). Lo usan jugar.cjs
// (Chromium, teclas reales con page.keyboard) y humano.ts (Node, mismas decisiones convertidas a PlayerInput).
// Cada 0,1 s de juego decide, por jugador, qué teclas lógicas mantiene (up/down/left/right/ccw/cw) y si pulsa
// agarrar ('grab') o enderezar ('fix'). Modelo de persona:
// - novato: va al asa de un extremo del mueble pendiente más cercano (el que ve), con 8 direcciones; J2 prueba a
//   agarrar una vez demasiado lejos; agarra de cerca;
// - llevar: la intención (dirección, giro, soltar) es la del piloto del juego, con 0,2 s de retraso de reacción,
//   8 direcciones de teclado, dudas (sin teclas 0,4 s, 2,5 % por tick) y errores (dirección al azar 0,3 s, 1,5 %);
// - final («La calle»): con el último obligatorio dentro del camión, NO suelta (el HUD no lo pide) durante
//   `novatoEspera` s; después pulsa agarrar (= soltar).
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const dirKeys = (mx, mz, th = 0.38) => {
  const s = new Set();
  if (mx > th) s.add('right'); if (mx < -th) s.add('left');
  if (mz > th) s.add('down'); if (mz < -th) s.add('up');
  return s;
};
function makeBrain({ n, scen, seed = 7, novatoEspera = 8, sinNovato = false }) {
  const rnd = lcg(seed);
  const pl = Array.from({ length: n }, (_, k) => ({ phase: sinNovato ? 'llevar' : 'acercarse', farTry: k === 1, lag: [], mood: { until: 0, kind: '' }, firstGrab: null, farTryAt: null }));
  const st = { finalHold: null, releasedAt: null };
  function tick(s, intents) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const me = s.hum[k], P = pl[k];
      let keys = new Set(), press = null;
      if (P.phase === 'acercarse') {
        let best = null, bd = 1e9;
        for (const o of s.items) { if (o.st === 'loaded' || o.st === 'broken') continue; const d = Math.hypot(o.x - me.x, o.z - me.z); if (d < bd) { bd = d; best = o; } }
        if (best) {
          // Extremos: asas 0 y 1 (J1, J3 → 1; J2, J4 → 0, el otro extremo); objetos de una mano: la asa más cercana
          // Cada uno va al extremo (asas 0 y 1) más cercano; si un compañero anterior ya va a ese, al otro (se hablan)
          const hs = best.handles, ends = hs.slice(0, Math.min(2, hs.length));
          const near = (q) => ends.map((h, i) => [i, Math.hypot(h.x + h.ox * 0.65 - q.x, h.z + h.oz * 0.65 - q.z)]).sort((a, b) => a[1] - b[1])[0][0];
          let pick = near(me);
          const mate = out.findIndex((o, j) => o.target && o.target.item === best && o.target.h === pick);
          if (mate >= 0 && best.minCarriers > 1 && ends.length > 1) pick = 1 - pick;
          let h = ends[pick];
          P.target = { item: best, h: pick };
          const tx = h.x + h.ox * 0.65, tz = h.z + h.oz * 0.65;
          const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
          if (P.farTry && d < 2.6) { press = 'grab'; P.farTry = false; P.farTryAt = s.t; }
          else if (d > 0.3) keys = dirKeys(dx / d, dz / d);
          else if (!me.hold) { const fx = h.x - me.x, fz = h.z - me.z, f = Math.hypot(fx, fz) || 1; keys = dirKeys(fx / f, fz / f, 0.5); press = 'grab'; }
        }
        if (me.hold) { P.phase = 'llevar'; P.firstGrab = s.t; }
      } else {
        P.lag.push(intents[k]);
        const d = P.lag.length > 2 ? P.lag.shift() : { mx: 0, mz: 0, grab: false, turn: 0, right: false };
        const md = P.mood;
        if (s.t > md.until) {
          const r = rnd();
          md.kind = r < 0.025 ? 'duda' : r < 0.04 ? 'error' : '';
          md.until = s.t + (md.kind === 'duda' ? 0.4 : md.kind === 'error' ? 0.3 : 0);
          md.dir = [rnd() * 2 - 1, rnd() * 2 - 1];
        }
        if (md.kind === 'duda') keys = new Set();
        else if (md.kind === 'error') keys = dirKeys(md.dir[0], md.dir[1]);
        else keys = dirKeys(d.mx, d.mz);
        if (d.turn > 0) keys.add('ccw'); if (d.turn < 0) keys.add('cw');
        if (d.right) press = 'fix';
        const heldItem = me.held >= 0 ? s.items[me.held] : null;
        const lastReq = heldItem && heldItem.req && heldItem.inHold && s.items.filter((o) => o.req && o.st !== 'loaded').length === 1;
        const novatoFinal = scen.startsWith('calle') && novatoEspera > 0 && !sinNovato;
        if (d.grab) {
          if (me.hold && lastReq && novatoFinal && !st.releasedAt) {
            if (!st.finalHold) st.finalHold = { since: s.t };
          } else press = 'grab';
        }
        if (st.finalHold && !st.releasedAt && me.hold && novatoFinal) {
          keys = new Set(); press = null;
          if (s.t - st.finalHold.since >= novatoEspera) { press = 'grab'; st.releasedAt = s.t; }
        } else if (st.finalHold && st.releasedAt && me.hold && novatoFinal && s.t - st.releasedAt < 0.5) { keys = new Set(); press = 'grab'; }
      }
      out.push({ keys, press, target: P.target });
    }
    return out;
  }
  return { tick, pl, st };
}
module.exports = { makeBrain, dirKeys };
