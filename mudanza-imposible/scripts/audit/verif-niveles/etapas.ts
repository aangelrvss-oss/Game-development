// Verificación (niveles-02): si se añade una etapa a STAGES, CHECKPOINTS (game.ts:47), NEXT (levelView.ts:99)
// y el literal `stage >= 5` (world.ts:122) se desincronizan sin ningún error. Se modifica STAGES SOLO en memoria
// (el array exportado es mutable); ningún archivo del juego se toca.
// Uso: npx vite-node scripts/audit/verif-niveles/etapas.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../../../src/sim/game.ts';
import { STAGES } from '../../../src/sim/level.ts';
import { NO_INPUT } from '../../../src/sim/types.ts';

await RAPIER.init();

function run(label: string) {
  const g = new Game(RAPIER as any, { humans: 1, carriers: 1, botStyle: 'atentos', seed: 1 });
  g.phase = 'playing';
  // Sofá justo pasado el portal (z=-16,5): la etapa alcanzada debería ser 'Portal'
  g.sofa.setTranslation({ x: 0, y: 0.6, z: -16.5 }, true);
  for (let i = 0; i < 5; i++) g.step(1 / 60, [NO_INPUT]);
  const st = g.stage, lab = g.stageLabel;
  // Forzar la reaparición: sofá bajo el suelo
  g.sofa.setTranslation({ x: 0, y: -5, z: -16.5 }, true);
  g.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true);
  let resp: any = null;
  for (let i = 0; i < 3 && !resp; i++) { g.step(1 / 60, [NO_INPUT]); resp = g.out.find((e) => e.type === 'respawnSofa'); }
  console.log(`${label}: STAGES=${STAGES.length} [${STAGES.map((s) => s.label).join(', ')}]`);
  console.log(`   sofá en z=-16.5 -> stage=${st} ('${lab}'); reaparece en ${resp ? JSON.stringify(resp.pos) : 'sin reaparición'}`);
  const zoneActiveAt = STAGES.map((s, i) => (i >= 5 ? s.label : null)).filter(Boolean);
  console.log(`   'zona activa' (world.ts:122, stage >= 5) en las etapas: ${zoneActiveAt.join(', ')}`);
  g.dispose();
}

run('Original');
STAGES.splice(1, 0, { label: 'Acera', reached: (_x, _y, z) => z < 3 });
run('Con una etapa más (solo en memoria)');
