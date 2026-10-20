export const meta = {
  name: 'rebirth-ciclo-2',
  description: 'Ciclo 2: segunda revisión del ciclo 1, objetos ItemDef, camión y entrega, niveles como datos, papeles para 3-4 jugadores, revisión y corrección',
  phases: [
    { title: 'Re-revisión C1', detail: 'verificación independiente de la corrección del ciclo 1' },
    { title: 'Objetos', detail: 'ItemDef, createItem, fragilidad' },
    { title: 'Niveles', detail: 'LevelDef, camión abierto, entrega, HUD' },
    { title: 'Vista y papeles', detail: 'dibujo, piloto multiobjeto, e2e, perf' },
    { title: 'Revisión', detail: 'revisores independientes del ciclo 2' },
    { title: 'Corrección', detail: 'arreglar lo confirmado' },
  ],
}
const WT = '/home/user/Game-development-c2'
const ROOT = `${WT}/mudanza-imposible`
const RWT = '/home/user/Game-development-r1b'
const RROOT = `${RWT}/mudanza-imposible`
const BASE = '5505243'
const SPEC = `${ROOT}/docs/quality/cycles/ciclo-2.md`
const COMMIT_RULES = `Trabajas SOLO en el worktree ${WT} (rama local rebirth/ciclo-2); el juego está en ${ROOT}. No toques /home/user/Game-development ni otros worktrees. No hagas git push, ni cambies de rama, ni reescribas historia.
Al terminar tu paso: \`npx tsc --noEmit -p .\` y \`npx vitest run\` en ${ROOT} deben pasar. Haz commit (git add de archivos concretos, nunca node_modules ni dist) con mensaje en español que explique qué y por qué, terminado exactamente con estas dos líneas:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011Zi4dW95TL5DjwqiTAaZqK
Reglas: no rebajes ningún umbral de prueba existente (las 71 pruebas actuales siguen pasando con sus umbrales). Una sola física: ningún objeto lleva código de agarre propio; lo que diferencia un objeto de otro son sus datos. No desplaces el dibujo para esconder solapes. Si un objetivo no se cumple sin trampas, NO lo escondas: informa de las mediciones. Escribe código como el que hay alrededor: TypeScript, comentarios en español, mismo estilo. Responde en español.
Contexto obligatorio: lee ${SPEC}, ${ROOT}/docs/quality/QUALITY_STATE.md (secciones 5 y 9), ${ROOT}/docs/quality/ART_DIRECTION.md y la especificación del ciclo anterior ${ROOT}/docs/quality/cycles/ciclo-1.md.`
const REPORT = {
  type: 'object',
  properties: {
    done: { type: 'array', items: { type: 'string' }, description: 'objetivos de la especificación cumplidos (ID y cómo)' },
    notDone: { type: 'array', items: { type: 'string' }, description: 'objetivos no cumplidos o parciales, con mediciones' },
    measurements: { type: 'string', description: 'mediciones literales relevantes' },
    tests: { type: 'string', description: 'resultado literal de tsc y vitest (y e2e si se ejecutaron)' },
    commits: { type: 'array', items: { type: 'string' }, description: 'sha corto y título de cada commit' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['done', 'notDone', 'measurements', 'tests', 'commits', 'risks'],
}
const REVIEW = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'nota 0-10 del área, justificada' },
    justification: { type: 'string' },
    claims: { type: 'array', description: 'afirmaciones verificadas del informe del implementador', items: { type: 'object', properties: { claim: { type: 'string' }, verdict: { type: 'string', enum: ['CONFIRMADO', 'REFUTADO', 'NO REPRODUCIDO', 'PARCIAL'] }, evidence: { type: 'string' } }, required: ['claim', 'verdict', 'evidence'] } },
    defects: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['critical', 'major', 'minor'] }, title: { type: 'string' }, evidence: { type: 'string', description: 'reproducción concreta: comando y salida, o archivo:línea' }, suggestion: { type: 'string' } }, required: ['severity', 'title', 'evidence', 'suggestion'] } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'justification', 'claims', 'defects', 'strengths'],
}
const PW = `Para el navegador: \`npm run build\` y \`npx vite preview --port PORT --strictPort\` en segundo plano (detenlo al acabar); Playwright con NODE_PATH=$(npm root -g) y Chromium en /opt/pw-browsers/chromium con --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader; mira scripts/duo-e2e.cjs y scripts/sofa-contact-check.cjs para ver cómo manejar el juego (window.__mudanza, ?capture=1).`

// --- Fase 1: segunda ronda de revisión del ciclo 1 (la corrección f8efb59) ---
phase('Re-revisión C1')
const RR_RULES = `Eres un revisor INDEPENDIENTE y adversarial. Segunda ronda de revisión del ciclo 1 de La Mudanza Imposible: verificas la CORRECCIÓN (commit f8efb59) de los defectos que encontró la primera ronda. El código está en ${RROOT} (worktree de solo lectura en ${BASE}). Lee la especificación ${RROOT}/docs/quality/cycles/ciclo-1.md, la sección 9 de ${RROOT}/docs/quality/QUALITY_STATE.md, las revisiones de la primera ronda en ${RROOT}/docs/quality/reviews/ciclo-1/revision-*.json y el informe de corrección ${RROOT}/docs/quality/reviews/ciclo-1/informe-correccion.json. Cambios de la corrección: \`git -C ${RWT} show --stat f8efb59\`.
Tarea: (1) verifica de forma independiente cada afirmación del informe de corrección de tu área (CONFIRMADO / REFUTADO / NO REPRODUCIDO / PARCIAL, con tu propia medición, no la del informe); (2) busca regresiones que haya introducido la corrección (p. ej., efectos de la elipse lateral de la mano y de la correa que cede, cambios de los ayudantes); (3) da una nota 0-10 de tu área del estado ACTUAL, con justificación basada en evidencias, sin cortesía. Sé concreto en lo que impide llegar a 8,5.
NO modifiques archivos del repositorio; crea scripts SOLO en ${RROOT}/scripts/audit/review-c1b/<tu-rol>/ y capturas en /tmp/claude-0/review-c1b/. Responde en español.`
const RR_ROLES = [
  { key: 'fisica-qa', prompt: `Roles B + F — física y QA: estabilidad, agarre blando, tira y afloja y «¡Se escapa!», unificación de humanos y ayudantes, colisiones (cápsula y dibujo), pruebas (tsc, vitest varias veces y barajado, npm run perf, scripts/sim-run.ts), umbrales no rebajados (git diff 837dca7..HEAD -- tests scripts), mutaciones para comprobar que las pruebas nuevas detectan los fallos que dicen detectar. ${PW.replace('PORT', '4175')}` },
  { key: 'diseno-arte', prompt: `Roles A + G + C + E — diseño, producto, animación y coherencia visual: extremidades del muñeco (el crítico), esfuerzo visible desde la cámara de juego, aviso «Pesa mucho», Retroceso y pausa, ayudantes dentro de su cápsula, legibilidad para un jugador nuevo, 4 jugadores locales. Describe lo que ves en las capturas. ${PW.replace('PORT', '4176')}` },
]
const rr = await parallel(RR_ROLES.map((r) => () => agent(`${RR_RULES}\n\n${r.prompt}`, { label: `rerev:${r.key}`, phase: 'Re-revisión C1', schema: REVIEW })))
const rrNamed = RR_ROLES.map((r, i) => ({ role: r.key, review: rr[i] }))
const rrCritical = rrNamed.flatMap((n) => (n.review?.defects ?? []).filter((d) => d.severity === 'critical').map((d) => ({ role: n.role, ...d })))
const rrMajor = rrNamed.flatMap((n) => (n.review?.defects ?? []).filter((d) => d.severity === 'major').map((d) => ({ role: n.role, ...d })))
log(`re-revisión C1: notas ${rrNamed.map((n) => `${n.role}=${n.review?.score}`).join(', ')}; críticos ${rrCritical.length}, mayores ${rrMajor.length}`)
if (rrCritical.length) return { stoppedAt: 'Re-revisión C1', rereview: rrNamed }

// --- Fases 2-4: implementación del ciclo 2 ---
const steps = [
  { phase: 'Objetos', key: 'objetos', task: `PASO 1 — OBJETOS EN LA SIMULACIÓN (objetivos T-item-1, T-item-2, T-item-3).
Crea src/sim/items.ts con el catálogo ItemDef (caja, silla, lámpara de pie frágil, mesa, sofá, nevera, piano; datos, sin Three.js) y createItem(R, world, def, pos, yaw), que generaliza createSofa (src/sim/sofa.ts) para cualquier forma de cajas. El sofá del catálogo reproduce exactamente SOFA y SLOTS: añade una prueba que compare los colliders de createItem(sofá) con los de createSofa. Game (src/sim/game.ts) pasa a tener una lista de objetos (cuerpo, colliders, definición, integridad, estado); el sofá del nivel actual es uno de ellos (puedes mantener game.sofa / sofaPos como atajo para no romper la vista y las pruebas). Ya existen grabbables/addGrabbable y la mano genérica: úsalos. Los ayudantes (bots.ts) usan las asas de la definición del objeto, no SLOTS directamente. Fragilidad por objeto (umbral de golpe y daño) con evento itemBroken; el daño total = suma. Pruebas Vitest: T-item-1, T-item-2 (por objeto, con porteadores guiados por la prueba, en llano: minCarriers lo llevan en el aire y minCarriers-1 no lo despegan; el piano con 2 no despega, con 3 sí, con 4 mejor que con 3) y T-item-3. Ajusta masas y asas con mediciones, nunca con código especial por objeto. Reporta las mediciones de cada objeto.` },
  { phase: 'Niveles', key: 'niveles', task: `PASO 2 — NIVELES COMO DATOS Y ENTREGA (objetivos T-level-1, T-level-2, T-truck, T-deliver, y la parte de simulación y HUD de T-hud). Sobre lo que dejó el paso 1 (git log -3).
Crea src/levels/ con el tipo LevelDef y dos niveles: «La calle» (el recorrido actual de src/sim/level.ts y props.ts, solo con el sofá obligatorio) y «Patio de pruebas» (pequeño, llano, con el camión y al menos 6 objetos del catálogo, varios obligatorios). Game, la vista y el piloto reciben el LevelDef; fuera de src/levels/ nada importa constantes del recorrido (LEVEL, ROUTE, ZONE, STAGES, CHECKPOINTS, SOFA_START, DOOR, STAIRS, RAMP, TERRACE…): compruébalo con grep. El camión deja de ser un bloque macizo: caja de carga abierta por detrás (suelo, paredes y techo como colliders separados) y rampa de carga; en «La calle» la entrega es meter el sofá dentro del camión (ajusta la ruta del piloto y las etapas para ello sin rebajar umbrales de tiempo; si el tiempo empeora, mídelo y repórtalo). Entrega con progreso: objeto cargado = centro y ≥80 % de su caja envolvente dentro de la caja de carga, nadie lo agarra, winHold s quieto; si se saca, deja de contar; eventos itemLoaded/itemUnloaded; estados pendiente / en camino / cargado / roto; se gana al cargar todos los obligatorios; un obligatorio roto hace perder. HUD (src/ui/hud.ts): «Cargados N/M» y la lista con el estado de cada objeto, sin tapar los paneles de jugador a 1280×720 con 4 jugadores; sonido sintetizado al cargar (src/audio/sfx.ts). Selección de nivel con ?nivel=pruebas (y ?nivel=calle por defecto). Pruebas Vitest: T-truck (dos personas suben la mesa por la rampa y la dejan dentro; caben 4 objetos a la vez), T-deliver, T-level-2 (todas las pruebas de recorrido y de ayudantes siguen pasando).` },
  { phase: 'Vista y papeles', key: 'vista', task: `PASO 3 — VISTA, PILOTO Y PAPELES (objetivos T-view, T-roles, T-level-3, T-hud, T-perf y la parte de navegador de T-level-2). Sobre lo anterior (git log -5).
(a) Vista: dibujo procedural de cada objeto a partir de su ItemDef (sofá actual, y nuevos para caja, silla, lámpara, mesa, nevera y piano) según ${ROOT}/docs/quality/ART_DIRECTION.md, reconocibles a la distancia de la cámara de juego; camión con caja de carga abierta y rampa dibujadas donde están sus colliders (prueba de coherencia en Node: cajas dibujadas = colliders a menos de 1 cm); levelView.ts y decor.ts a partir del LevelDef. Nada de desplazar dibujos para esconder solapes.
(b) Ayudantes y piloto con varios objetos: los ayudantes buscan el objeto que necesita manos; Autopilot/PilotCrew reparte a los humanos en equipos por objeto (según minCarriers) y lleva cada objeto por su ruta al camión. Prueba Vitest T-roles: en el patio de pruebas, con 4 humanos se termina al menos un 25 % antes que con 2, y con 3 antes que con 2 (mediana de 3 configuraciones de salida distintas por posición); imprime los tiempos.
(c) Navegador: migra los scripts que lo necesiten; ejecuta \`npm run build\`, sirve con \`npx vite preview --port 4174 --strictPort\` en segundo plano y, con NODE_PATH=$(npm root -g): node scripts/duo-e2e.cjs http://localhost:4174/ y node scripts/keyboard-e2e.cjs (mira cómo construye la URL). Haz capturas a 1280×720 del patio de pruebas con 2 y 4 jugadores (HUD con la lista, objetos y camión) y de la entrega del sofá dentro del camión en «La calle», en /tmp/claude-0/c2-capturas/, y descríbelas. Reporta la salida literal. Detén el servidor.
(d) T-perf: \`npm run perf\` y una medición del coste por paso en el patio de pruebas con todos los objetos (script en scripts/); reporta ambos.` },
]
const results = {}
for (const s of steps) {
  phase(s.phase)
  results[s.key] = await agent(`${COMMIT_RULES}\n\n${s.task}`, { label: `impl:${s.key}`, phase: s.phase, schema: REPORT })
  log(`${s.key}: hecho ${results[s.key]?.done?.length ?? 0}, pendiente ${results[s.key]?.notDone?.length ?? 0}`)
}

// --- Fase 5: revisión independiente del ciclo 2 ---
phase('Revisión')
const REVIEW_RULES = `Eres un revisor INDEPENDIENTE y adversarial del ciclo 2 de La Mudanza Imposible. El código está en ${ROOT} (worktree, rama rebirth/ciclo-2; los cambios del ciclo son \`git -C ${WT} log --oneline ${BASE}..HEAD\` y \`git -C ${WT} diff ${BASE}..HEAD\`). Especificación: ${SPEC}. Informes de los implementadores (JSON): ${JSON.stringify(results).slice(0, 12000)}
Verifica de forma independiente las afirmaciones de los informes de tu área (CONFIRMADO / REFUTADO / NO REPRODUCIDO / PARCIAL, con tu propia medición) y busca activamente fallos y regresiones respecto a ${BASE}. NO modifiques archivos del repositorio: crea scripts nuevos SOLO en ${ROOT}/scripts/audit/review-c2/<tu-rol>/ y guarda capturas fuera del repo (/tmp/claude-0/review-c2/). No apruebes por cortesía. Cada defecto con reproducción concreta. Nota 0-10 de tu área con justificación basada en evidencias. Responde en español.`
const ROLES = [
  { key: 'fisica-qa', prompt: `Roles B + F — física, QA y rendimiento: clases de peso con una sola física (¿hay código especial por objeto?, ¿minCarriers sale de los datos?), estabilidad de cada objeto (10 a 220 kg, sin explosiones ni vibraciones, nada atraviesa nada), camión (rampa, caja de carga, apilar, sacar), fragilidad, entrega y estados, pruebas (tsc, vitest varias veces y barajado; umbrales no rebajados: git diff ${BASE}..HEAD -- tests scripts; cualquier umbral relajado es crítico), mutaciones para comprobar que las pruebas nuevas detectan fallos, npm run perf y coste por paso. ${PW.replace('PORT', '4175')}` },
  { key: 'diseno-niveles', prompt: `Roles A + D + G — director de juego, diseño de niveles y producto/streaming: ¿el 3.º y el 4.º jugador tienen un papel real y legible?, ¿la lista de la mudanza y la entrega dentro del camión se entienden sin manual?, ¿los objetos piden cooperar de formas distintas?, ¿el LevelDef permite construir los 4 niveles del plan (casa, piso de escaleras, calle, almacén) sin tocar el motor? (revisa el tipo y los dos niveles; intenta describir uno nuevo solo con datos), momentos de streaming. ${PW.replace('PORT', '4176')}` },
  { key: 'arte', prompt: `Roles C + E — arte, animación y coherencia visual: ¿los objetos se reconocen desde la cámara de juego?, ¿siguen la dirección artística (${ROOT}/docs/quality/ART_DIRECTION.md)?, ¿lo dibujado coincide con los colliders (objetos, camión abierto, rampa)?, ¿las manos del muñeco agarran las asas reales de cada objeto?, ¿el muñeco sigue sin miembros desplazados? Describe lo que ves en las capturas. ${PW.replace('PORT', '4177')}` },
]
const reviews = await parallel(ROLES.map((r) => () => agent(`${REVIEW_RULES}\n\n${r.prompt}`, { label: `review:${r.key}`, phase: 'Revisión', schema: REVIEW })))
const named = ROLES.map((r, i) => ({ role: r.key, review: reviews[i] }))
const serious = [
  ...rrMajor.map((d) => ({ ...d, origin: 'segunda revisión del ciclo 1' })),
  ...named.flatMap((n) => (n.review?.defects ?? []).filter((d) => d.severity !== 'minor').map((d) => ({ role: n.role, ...d, origin: 'revisión del ciclo 2' }))),
]
log(`revisión C2: notas ${named.map((n) => `${n.role}=${n.review?.score}`).join(', ')}; ${serious.length} defectos críticos o mayores (incluidos los de la re-revisión C1)`)

// --- Fase 6: corrección ---
phase('Corrección')
let fix = null
if (serious.length) {
  fix = await agent(`${COMMIT_RULES}\n\nPASO 4 — CORRECCIÓN. Revisores independientes han encontrado estos defectos críticos y mayores (JSON; el campo origin indica si vienen de la segunda revisión del ciclo 1 o de la revisión del ciclo 2):\n${JSON.stringify(serious).slice(0, 45000)}\n\nPara cada uno: reprodúcelo primero; si no se reproduce, dilo con la evidencia; si se reproduce, corrígelo en el sistema adecuado con su prueba de regresión (que falle sin la corrección). No rebajes umbrales. Vuelve a ejecutar tsc y vitest y, si tocas algo de navegador, el e2e afectado sirviendo en el puerto 4174. Reporta cada defecto como CORREGIDO / NO REPRODUCIDO / PENDIENTE con evidencia.`, { label: 'fix', phase: 'Corrección', schema: REPORT })
}
return { rereview: rrNamed, results, reviews: named, fix }
