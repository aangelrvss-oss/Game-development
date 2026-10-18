// Dos jugadores en el mismo teclado (WASD+Espacio y flechas+Intro), sin ayudantes: ¿cooperan de verdad?
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:4173/');
  await p.waitForFunction(() => window.__mudanza && document.getElementById('menu').style.display === 'flex');
  // 2 humanos, 2 porteadores en total
  await p.click('#opt-humans button:nth-child(2)');
  await p.click('#opt-carriers button:nth-child(1)');
  await p.click('#btn-start');
  await p.waitForFunction(() => window.__mudanza.game.phase === 'playing', null, { timeout: 15000 });
  const st = () => p.evaluate(() => { const g = window.__mudanza.game; return { cs: g.carriers.map((c) => ({ h: c.holding, human: c.human, x: c.pos.x, z: c.pos.z })), sofa: [g.sofaPos.x, g.sofaPos.y, g.sofaPos.z], yaw: g.sofaYaw }; });
  const keys = [{ l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', g: 'Space' }, { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', g: 'Enter' }];
  // Cada jugador va a un extremo del sofá y agarra
  for (let it = 0; it < 80; it++) {
    const s = await st();
    if (s.cs.every((c) => c.h)) break;
    const down = [];
    for (let i = 0; i < 2; i++) {
      const c = s.cs[i];
      if (c.h) continue;
      const tx = s.sofa[0] + (i === 0 ? 1.75 : -1.75), tz = s.sofa[2];
      const dx = tx - c.x, dz = tz - c.z;
      const k = keys[i];
      if (Math.abs(dx) > 0.2) down.push(dx > 0 ? k.r : k.l);
      if (Math.abs(dz) > 0.2) down.push(dz > 0 ? k.d : k.u);
      if (Math.abs(dx) <= 0.2 && Math.abs(dz) <= 0.2) await p.keyboard.press(k.g);
    }
    for (const k of down) await p.keyboard.down(k);
    await p.waitForTimeout(110);
    for (const k of down) await p.keyboard.up(k);
  }
  let s = await st();
  console.log(s.cs.every((c) => c.h) ? 'OK   los dos jugadores agarran el sofá' : 'FALLA agarre de los dos jugadores', JSON.stringify(s.cs.map((c) => c.h)));
  await p.waitForTimeout(1200);
  // Los dos tiran hacia arriba (norte) a la vez
  const z0 = (await st()).sofa[2];
  await p.keyboard.down('KeyW'); await p.keyboard.down('ArrowUp');
  await p.waitForTimeout(2000);
  await p.keyboard.up('KeyW'); await p.keyboard.up('ArrowUp');
  s = await st();
  console.log(z0 - s.sofa[2] > 1.2 ? 'OK  ' : 'FALLA', 'avanzan juntos hacia el norte', (z0 - s.sofa[2]).toFixed(2), 'm');
  await p.screenshot({ path: 'shots/j2-juntos.png' });
  // Descoordinación: uno empuja al norte y el otro al sur → el sofá gira sin que nadie pida giro
  const yaw0 = s.yaw;
  await p.keyboard.down('KeyW'); await p.keyboard.down('ArrowDown');
  await p.waitForTimeout(1500);
  await p.keyboard.up('KeyW'); await p.keyboard.up('ArrowDown');
  s = await st();
  const dy = Math.abs(Math.atan2(Math.sin(s.yaw - yaw0), Math.cos(s.yaw - yaw0)));
  console.log(dy > 0.4 ? 'OK  ' : 'FALLA', 'tirar en direcciones opuestas hace girar el sofá', dy.toFixed(2), 'rad');
  await p.screenshot({ path: 'shots/j2-giro.png' });
  console.log(errors.length ? 'ERRORES ' + errors.join(' | ') : 'OK   sin errores de página');
  await b.close();
})();
