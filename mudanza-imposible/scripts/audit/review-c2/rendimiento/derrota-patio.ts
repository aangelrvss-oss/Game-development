// Revisor (rendimiento/contenido): por qué el patio con 4 humanos (piloto) y 2 ayudantes pierde. Imprime eventos clave
// y el estado de los objetos al acabar. Uso (cwd = árbol 5cab122): npx vite-node <ruta>/derrota-patio.ts -- <humanos> <porteadores> <estilo> <semilla>
import RAPIER from '@dimforge/rapier3d-compat';
import { PATIO } from '../../../../src/levels/patio';
import { Game } from '../../../../src/sim/game';
import { Autopilot } from '../../../../src/sim/autopilot';
const [H = '4', C = '6', ST = 'atentos', SEED = '1'] = process.argv.slice(2).filter((a) => a !== '--');
await RAPIER.init({});
const g = new Game(RAPIER, { level: PATIO, humans: +H, carriers: +C, botStyle: ST as 'atentos', seed: +SEED });
const aps = Autopilot.team(g);
let falls = 0;
for (let i = 0; i < 60 * 250 && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  g.step(1 / 60, aps.map((a) => a.input(g, 1 / 60)));
  for (const e of g.out as { type: string; [k: string]: unknown }[]) {
    if (e.type === 'fall') { falls++; continue; }
    if (['itemLoaded', 'itemUnloaded', 'itemBroken', 'win', 'lose'].includes(e.type)) console.log(g.time.toFixed(2), JSON.stringify(e));
  }
}
console.log('fase', g.phase, 'motivo', (g as unknown as { loseReason?: string }).loseReason, 't', g.time.toFixed(2), 'caídas', falls);
for (const it of g.items as { def: { id: string }; required: boolean; state: string; integrity: number; body: { translation(): { x: number; y: number; z: number } } }[]) {
  const p = it.body.translation();
  console.log(it.def.id, it.required ? 'oblig' : 'opc', it.state, 'integ', it.integrity.toFixed(0), 'pos', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
}
g.dispose();
