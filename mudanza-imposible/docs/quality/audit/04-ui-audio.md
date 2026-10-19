# Auditoría 4/6 — Interfaz, menús, audio y bucle

> Informe íntegro del agente `audit:ui-audio` (flujo `wf_9501e555-672`, 19-10-2026, solo lectura sobre el commit `08547f8` + documentos). Transcripción literal de su salida estructurada: no está resumido ni corregido. Las afirmaciones son del agente; su verificación está en `../QUALITY_STATE.md` y `08-verificacion.md`.

## Resumen

La capa de UI, audio y bucle (index.html, main.ts, hud.ts, sfx.ts, input.ts; unas 750 líneas) funciona para el caso para el que se hizo: un sofá, un recorrido y dos jugadores en un teclado. Todo está atado a ese caso. main.ts hace de «app shell» monolítico: estado global mutable, menú, traducción de eventos a sonido, efectos y mensajes, resultados, bucle de paso fijo y la API de captura `__mudanza`. El HUD lee directamente STAGES, la integridad del único sofá y unas coordenadas de calle escritas a mano. Los avisos citan las teclas de J1 y J2. La entrada admite solo dos esquemas de teclado y asigna los mandos por posición, compartiéndolos con esos esquemas. El audio son 17 efectos sintetizados fijos, sin música, sin variación, sin buses y sin limitador.

Hay un defecto crítico: en los fotogramas en los que no se ejecuta ningún paso de simulación se pierden las pulsaciones de agarrar y enderezar. Eso es el 50 % de los fotogramas a 120 Hz y el 58 % a 144 Hz.

Hay también varios defectos mayores:
- Los enfriamientos de avisos y sonidos no se reinician entre partidas, así que en las repeticiones desaparecen las bocinas y el tic del semáforo.
- El botón Start de los mandos que no son el de J1 abre y cierra la pausa al instante.
- Con mando no se puede empezar ni navegar por el menú.
- Retroceso, Intro y R reinician por accidente.
- El cronómetro cuenta hacia arriba aunque el objetivo es un límite de tiempo.
- La demo automática guarda récords.
- «Alzar» (Mayús) solo se explica con un aviso al pie de la escalera.

tsc --noEmit no da errores y vitest pasa 29/29, pero las pruebas solo cubren la simulación: nada prueba UI, entrada, audio ni flujo.

## Arquitectura

ARCHIVOS Y RESPONSABILIDADES

index.html (DOM estático y CSS en línea, 8-62)
- canvas #c (65).
- HUD #hud (67-79):
  - #h-time, tiempo (69).
  - #h-stages, etapas (70).
  - #h-sofa, «Estado del sofá» con barra (71).
  - #h-center, cuenta atrás (73).
  - #h-warn, aviso rojo único (74).
  - #h-light, semáforo (75).
  - #h-toasts (76).
  - #h-players (77).
  - #h-hint, «Esc pausa · Retroceso reiniciar · M sonido» (78).
- Overlay #menu (81-102):
  - Opciones jugadores, porteadores y ayudantes (85-87).
  - Botones «¡A mover!» y demo (88).
  - Tabla de controles J1/J2/Mando (89-96).
  - Notas (97-100).
- Overlay #pause (104-108).
- Overlay #results (110-118).
- Media query <700 px que oculta el panel de jugadores y la ayuda (61).

src/main.ts (punto de entrada y orquestador único)
- Parámetros de URL (16-23): humans, carriers, style y auto; capture en la línea 25.
- Inicializa RAPIER (33), WorldView (34), InputManager (35), Sfx con registro de sonidos (36-37) y Hud con reloj de simulación (38).
- Estado global (40-50): game, autopilot, paused, screen ('menu'|'play'|'results'), acc, simTime, pendingResults, toastCooldown y testPilots.
- Menú: seg() genera los botones de opción (53-74); nota de mandos con setInterval (75-78); manejadores de botón (80-86).
- Teclas globales vía input.onGlobal (88-96): M silencia; en menú Intro empieza; en resultados Intro/R repiten y Esc va al menú; en partida Esc pausa y Retroceso reinicia.
- Transiciones: toMenu (100-105), setPaused (107-111) y start (113-128). start crea un Game nuevo, view.attach, hud.setup con textos de ayuda fijos (120) y pone simTime=0.
- handle() (138-198): traductor de eventos de simulación a sonido, efectos de mundo y toasts.
- results() (200-224): título y motivo, estrellas (214), cuadrícula y récord en localStorage 'mudanza.best' (205-211).
- Bucle frame() (227-268):
  - En captura, retorno temprano (230).
  - Resultados pendientes (231).
  - Resolución adaptable (233).
  - Start del mando (236).
  - input.read una vez por fotograma (240) y acumulador de paso fijo DT=1/60, máximo 5 pasos (241-253); los flancos solo valen en el primer subpaso (249).
  - Tic del semáforo (254).
  - hud.update y view.render sin interpolación (258-259).
  - En el menú, un Game de fondo sin simular (263-264).

src/ui/hud.ts (clase Hud ligada a ids fijos, 15-24)
- setup(): pinta las etapas de STAGES y el panel de jugadores con su ayuda de teclado (32-40).
- toast(): dura 2,2 s de tiempo de juego, máximo 4 (42-49).
- update() en cada fotograma (51-106):
  - Tiempo transcurrido, en rojo si quedan menos de 30 s (55-56).
  - Etapas (57-63).
  - Barra de integridad (64-67).
  - Cuenta atrás y «¡A mover!» (69-78).
  - Aviso único por prioridad (80-93): volcado, se vuelca, escalera/alzar, uno solo, atasco, agarrad.
  - Semáforo si el sofá está entre z 7 y -12 (95-100).
  - Estado por jugador (101-105).

src/audio/sfx.ts
- Sfx con AudioContext perezoso que se crea en unlock() (15-22).
- Ganancia maestra 0,5 (24-29) y silencio (31-35).
- play() con 17 nombres (37-63), construidos con tone() (67-81) y noise() (83-98).
- onPlay registra cada sonido (12).
- renderTrack() vuelve a reproducir el registro en un OfflineAudioContext y devuelve un WAV mono en base64 (102-124).

src/input/input.ts
- KEYS: dos esquemas (4-7). J1: WASD, Espacio, Mayús izq., Q/E, R. J2: flechas, Intro, Mayús dcha., coma/punto, Slash.
- keydown/keyup/blur (17-26): preventDefault solo en flechas y Espacio; onGlobal en cada pulsación sin repetición.
- pads(): lista filtrada de mandos conectados (31-33).
- read(n) (36-75):
  - Suma el teclado KEYS[i] y el mando pads[i].
  - Flancos con pressedOnce, que se vacía en la línea 73, y con prevPad, que se actualiza en la 66.
  - Zona muerta 0,2 sin reescalar (54).
- padStart(): flanco del botón 9 de cualquier mando (78-85).

FLUJO
- Menú, con Intro o con el botón (91, 80) → start() → fase 'countdown' de 3 s (game.ts:16, 172-175). Durante ella el HUD muestra 3-2-1 (hud.ts:69-71) y las entradas se ignoran (game.ts:184).
- 'playing': se muestra «¡A mover!» durante 1,2 s (hud.ts:72-74).
- Victoria por inZone ≥1 s, o derrota por integridad 0 o 180 s (game.ts:356-358) → handle() programa pendingResults a +1,2 s de simTime (main.ts:195-196) → results() (200-224).
- Desde resultados: Intro, R o Start del mando repiten (92, 236); Esc lleva al menú (93).
- La pausa se activa con Esc o Start (94, 236). Retroceso reinicia sin confirmar (95).
- La simulación sigue corriendo detrás del overlay de resultados (235-254).

AVISOS CONTEXTUALES
- Banner rojo único con prioridad fija (hud.ts:80-91).
- Toasts de evento (main.ts:165-190): atropello, verde, etapa, enderezado, respawn.
- Textos flotantes en el mundo (main.ts:146, 155, 165, 171, 178, 181, 194) y «¡ATASCO!» en world.ts:120.

AUDIO POR EVENTO (main.ts:141-196)
- grab y release, solo de humanos.
- slip (gripBreak).
- impact, cuyo volumen y filtro escalan con strength.
- crash (atropello), stun, wobble, fall.
- honk, con enfriamiento de 1,5 s por coche.
- beep en verde y pedTick cada 0,5 s en verde, solo si el sofá está cerca de la calle (185, 254).
- checkpoint (etapa), hop (enderezar), win y lose.
- Sin usar: 'step' y 'thud' (sfx.ts:48, 54).
- No suenan: la cuenta atrás, el respawn, la interfaz ni la música.
- No hay variación salvo el impacto. Mezcla: un único GainNode, sin compresor.

MODO CAPTURA (?capture=1)
- frame() no avanza ni dibuja fuera del menú (main.ts:230).
- `__mudanza` (273-315) expone:
  - game, screen y start.
  - advance(frames, fps, script) (278-299): Math.round(60/fps) subpasos por fotograma; las entradas salen de un script evaluado con new Function('g', script) (281); procesa eventos, resultados, HUD y render con simTime.
  - autoInputs(g): un Autopilot por humano (305-308).
  - sound(from,to): WAV del soundLog (309).
  - setZoom, fps, renderInfo y view.
- Lo usan scripts/record-duo.cjs:29-46,107, scripts/stills.cjs:12-21 y scripts/duo-e2e.cjs:251-258.

PRUEBAS
- Solo tests/sim.test.ts (29 OK); tsc sin errores.
- Ninguna prueba unitaria de UI, entrada, audio ni flujo. Las e2e usan solo teclado en Chromium a 60 Hz (README:657: «los mandos no se han probado con un mando físico»).

## Acoplamientos (14)

| Dónde | Qué | Impacto |
|---|---|---|
| src/ui/hud.ts:2,33,57-63; src/sim/game.ts:149 (stageLabel); index.html:70 | Las etapas del HUD salen de STAGES, la lista fija de un único nivel (level.ts:144-152), importada directamente. | Sin un LevelDef no se pueden tener 4 niveles con progreso distinto. En un nivel con varios objetos, «etapa» ya no tiene sentido (cada objeto va por un sitio): hay que sustituirla por la checklist de objetos. |
| src/ui/hud.ts:95-100; src/main.ts:185, 254, 295 | La «zona de calle» se repite a mano cuatro veces (s.z < 7 && s.z > -12) y siempre se mide contra la posición del sofá. | El semáforo, su toast y el tic solo funcionan en el nivel actual y con el sofá. Debe venir del LevelDef (zonas con nombre) y de la posición de cualquier objeto o jugador. |
| index.html:71; src/ui/hud.ts:64-67; src/main.ts:212-219 | Una sola barra «Estado del sofá» enlazada a game.integrity. Los resultados también hablan de un solo sofá: título, texto, estrellas por integridad ≥70. | No hay dónde mostrar el estado de cada objeto, la fragilidad ni los objetos rotos o entregados. Hay que rediseñar el HUD y los resultados alrededor de DeliveryState[]. |
| src/ui/hud.ts:80-91 | Los avisos leen propiedades del sofá (sofaUp, needsLiftAtStairs, soloDrag, stuckTime) y escriben literalmente las teclas de J1 y J2 (R, Q/E, Mayús, ESPACIO/INTRO). | Para varios objetos y 4 jugadores con mandos hacen falta avisos por objeto y por jugador, con el glifo del dispositivo de cada uno. |
| src/input/input.ts:4-7, 36-66 | Solo hay dos esquemas de teclado. read(n) asocia el jugador i a KEYS[i] y a pads[i] a la vez, por posición en la lista filtrada de mandos. | No se pueden combinar 2 en teclado con 2 mandos, la asignación cambia si alguien se desconecta y no hay identidad de dispositivo. Bloquea el objetivo de hasta 4 jugadores locales. |
| src/main.ts:120; src/ui/hud.ts:36 | Los textos de ayuda del panel de jugadores son un array fijo: J1 WASD…, J2 flechas…, 'Mando 3', 'Mando 4'. | Muestra teclado aunque J1 o J2 usen mando. Debe generarse desde el dispositivo asignado a cada jugador. |
| src/main.ts:113-128 (start), 263 (Game de fondo) | Game se construye solo con humans, carriers y botStyle. No hay parámetro de nivel ni de lista de objetos, y view.attach tampoco los recibe. | La selección de nivel exige que start() reciba {levelId, players[]} y que el Game y la vista se construyan a partir de un LevelDef. |
| src/main.ts:43, 100-128, 200-224 | Las pantallas son una unión de tres valores ('menu'\|'play'\|'results') más los indicadores paused y pendingResults, sueltos en variables globales. | No caben sala de unión, selección de nivel, presentación ni «siguiente nivel». Hace falta una máquina de estados explícita. |
| src/main.ts:138-197 (handle); src/sim/types.ts:12-15, 20-35 | Los eventos dan por hecho que hay un único sofá: carHit target 'sofa', view.sofa.bump, 'righted' y 'respawnSofa' sin id de objeto, 'win' global, PlayerInput.right descrito como «enderezar el sofá». | Los efectos, sonidos y toasts no pueden distinguir qué objeto se golpea, se rompe o se carga. Los eventos necesitan objectId, kind y material. |
| src/sim/game.ts:13-27 (RULES), usado en hud.ts:54-56 y main.ts:165, 189-190, 213-219; index.html:84, 99 | Límite de tiempo, tiempo par, costes y daños son constantes globales. El texto del menú repite «3 minutos» a mano. | Cada nivel necesita su propio límite, tiempo par y criterios de estrellas, y la interfaz debe leerlos del nivel, no de RULES ni del HTML. |
| src/main.ts:205-211 | El récord se guarda en una sola clave, 'mudanza.best', sin nivel, número de jugadores ni modo. | No sirve para el progreso por nivel ni para los récords por número de jugadores. Hay que versionar el formato de guardado. |
| src/main.ts:305-308; src/sim/autopilot.ts:82 | autoInputs crea un Autopilot por humano que sigue la ruta del sofá; la decisión de alzar depende de la etiqueta 'Escalera'. | Las grabaciones y e2e (record-duo.cjs, duo-e2e.cjs) dejarán de funcionar con varios objetos o niveles si el piloto no recibe un objetivo por jugador. |
| index.html:61, 37-40, 84, 89-99 | El texto y la tabla del menú están escritos para «dos en el mismo teclado». La media query oculta el panel de jugadores y el panel está pensado para dos. | Hay que rehacer el menú y el panel para 4 jugadores, con dispositivos mixtos y legibilidad en TV. |
| src/audio/sfx.ts:3, 37-63 | SfxName es un conjunto cerrado de sonidos genéricos, sin parámetros de material, objeto ni jugador. | La nevera, la lámpara frágil o el piano sonarían igual que el sofá. Hace falta un catálogo por material y objeto. |

## Defectos (24)

| Gravedad | Título | Dónde | Evidencia |
|---|---|---|---|
| critical | Se pierden pulsaciones de agarrar/soltar y enderezar en los fotogramas sin paso de simulación | src/main.ts:240-253; src/input/input.ts:36-75 | input.read() se llama en cada fotograma (main.ts:240) y vacía pressedOnce al final (input.ts:73); además actualiza prevPad (input.ts:66). Si acc < DT, el while (main.ts:243) no ejecuta g.step y esas entradas se tiran. He replicado el acumulador: el 0,8-2,9 % de los fotogramas no tiene paso a 60 Hz con fluctuación, el 20 % a 75 Hz, el 50 % a 120 Hz y el 58 % a 144 Hz. Esa misma proporción de pulsaciones de Espacio, Intro, A, R o Y no llega a la simulación («pulso y no agarra»). Las e2e corren a 60 Hz y no lo ven. |
| major | Los enfriamientos de mensajes y sonidos no se reinician entre partidas: en las repeticiones faltan bocinas, tic del semáforo y textos | src/main.ts:49, 126, 131-136, 155, 166, 181, 254 | toastCooldown (main.ts:49) guarda instantes absolutos de simTime. start() pone simTime=0 (main.ts:126) sin limpiar el mapa, y cooled() (131-136) devuelve false mientras simTime sea menor que el último instante de la partida anterior más el margen. Afecta a las bocinas (181), al tic del semáforo (254), a «¡Se escapa!» (146), a «¡Uy, uy, uy!» (171), al aviso de atropello (166) y al texto de daño (155). Encima, en resultados simTime sigue creciendo porque la simulación no se detiene (235-254). |
| major | El botón Start de los mandos que no son el de J1 abre y cierra la pausa al instante, o la alterna en cada fotograma | src/input/input.ts:78-85; src/main.ts:236, 256 | padStart() compara con prevPad[i] (input.ts:78-85), pero prevPad solo se actualiza en read(n) para i<n (input.ts:66). En pausa se llama read(1) (main.ts:256). Con J2 en mando, la pausa se abre en un fotograma y se cierra en el siguiente. Un mando que no se lee (índice ≥ humanos) la alterna cada fotograma mientras se mantenga Start. En resultados reinicia y después hace lo mismo con la pausa. |
| major | Con mando no se puede empezar la partida ni navegar por los menús | src/main.ts:235-236; index.html:85-88, 106 | padStart solo se consulta si screen !== 'menu' (main.ts:235-236). Las opciones y botones del menú (index.html:85-88) y Reiniciar y Menú de la pausa (index.html:106) solo funcionan con ratón. J3 y J4 son «solo con mando» (main.ts:77), así que siempre hace falta alguien con teclado o ratón. |
| major | Los mandos se asignan por posición y se comparten con el teclado: no se puede jugar 2 en teclado más 2 con mando | src/input/input.ts:31-33, 36-66 | read() suma KEYS[i] y pads[i] para el mismo jugador (input.ts:42-66), y pads() es la lista filtrada de conectados (input.ts:31-33). El mando 1 controla a J1 aunque J1 use WASD. Para tener J3 y J4 hacen falta 4 mandos. Al desconectar uno se reasignan todos, y no hay pausa ni aviso. Según README:657 no se ha probado con hardware. |
| major | Reinicios accidentales y resultados que se saltan solos | src/main.ts:92, 95, 195-196 | Retroceso reinicia sin confirmar (main.ts:95) y está justo encima de Intro, que es agarrar de J2 (input.ts:6). En resultados, Intro y R, teclas de juego de J2 y J1, reinician (main.ts:92). Los resultados aparecen 1,2 s después del final (main.ts:195-196), mientras la gente sigue pulsando, y no hay un tiempo de bloqueo de entradas. |
| major | «Alzar» (Mayús) no se entiende y no da ninguna respuesta visible | src/ui/hud.ts:84, 104; index.html:93; src/input/input.ts:5-6 | Solo se enseña en la tabla del menú (index.html:93) y en un banner al pie de la escalera que habla únicamente de las teclas de J1 y J2 (hud.ts:84). El panel de jugador muestra «agarrando» pero no «alzando» (hud.ts:104), y no hay ninguna pista sobre el objeto. Sin embargo, la simulación lo exige en la escalera (game.ts:155-162; carrier.ts:266). Pulsar Mayús varias veces seguidas activa las Teclas especiales de Windows, y README:692 ya avisa de los teclados que no registran tantas teclas a la vez. |
| major | El cronómetro cuenta hacia arriba aunque el objetivo es un límite de tiempo | src/ui/hud.ts:54-56 | hud.ts:55 muestra game.time, el tiempo transcurrido. El límite de 180 s (game.ts:14, 358) solo se nota porque el número se pone rojo cuando quedan menos de 30 s (hud.ts:56). Los +5 s por reaparecer (game.ts:397) solo salen en un toast (main.ts:190), y no hay ningún aviso sonoro. |
| major | Los avisos citan teclas equivocadas o incompletas para J2, para quien juega con mando y para J3/J4 | src/ui/hud.ts:82-89, 36; src/main.ts:120 | hud.ts:82 dice «Pulsa R (o Y)» y omite la tecla de J2. hud.ts:86 dice «Q/E» y omite coma y punto. hud.ts:89 dice «J1 con ESPACIO, J2 con INTRO» aunque se juegue con mando o seáis 3 o 4. El panel de jugador enseña la ayuda de teclado a J1 y J2 aunque usen mando (main.ts:120; hud.ts:36). |
| major | La demo automática y el modo captura guardan récord, y hay un solo récord para cualquier configuración | src/main.ts:205-211 | results() guarda 'mudanza.best' sin comprobar autopilot ni capture (main.ts:205-211). En docs/capturas/s12-resultado.jpg se ve «Mejor tiempo 36.0 s» con J1 «Piloto automático». La partida cooperativa a dos y la de 1 jugador con 5 ayudantes comparten la misma clave. |
| major | La física cambia sin aviso al tocar el número de jugadores | src/main.ts:69; index.html:86-87 | Si se elige 2, luego 3 y luego 2 jugadores, carriers se queda en 3: la función solo lo sube (main.ts:69). Entonces isCoop (game.ts:42) pasa a false y se juega con física original y un ayudante sin que el menú lo diga. La opción «Ayudantes de la máquina» (index.html:87) se ve aunque no haya ningún ayudante. |
| minor | La cuenta atrás, la reaparición y la interfaz no suenan; hay sonidos definidos que nadie usa | src/audio/sfx.ts:48, 54; src/main.ts:190; src/ui/hud.ts:69-74 | game.ts:172-175 no emite ningún evento en la cuenta atrás y el HUD solo la muestra en pantalla (hud.ts:69-74). respawnSofa no tiene sonido (main.ts:190). 'step' y 'thud' están definidos pero no se usan (sfx.ts:48, 54). No hay música (README:665). |
| minor | La mezcla no tiene limitador ni buses y el silencio no persiste | src/audio/sfx.ts:24-35, 43-49; src/main.ts:90 | Hay una sola ganancia maestra (sfx.ts:24-29). crash suma ruido a 0,9 más un tono (sfx.ts:49) e impact llega a 0,75+0,7 (sfx.ts:43-46); al coincidir con fall o stun puede saturar. toggleMute fija 0,5 e ignora el volumen pasado (sfx.ts:33). Pulsar M en el menú no muestra nada porque el toast va al HUD, que está oculto (main.ts:90, 104). |
| minor | El audio no varía y cada ruido reserva memoria nueva | src/audio/sfx.ts:40-98 | Cada evento usa frecuencias fijas (sfx.ts:40-61) y solo impact escala. No hay tono aleatorio ni paneo, así que con 4 jugadores no se distingue quién agarra. noise() crea un AudioBuffer nuevo en cada llamada (sfx.ts:83-98). |
| minor | La simulación y sus sonidos siguen detrás del overlay de resultados | src/main.ts:235-259 | Con screen === 'results' y sin pausa, frame() sigue llamando a g.step y handle (main.ts:235-254): bocinas, golpes y toasts continúan bajo la tarjeta. |
| minor | soundLog crece sin límite y su eje de tiempo se reinicia en cada partida | src/main.ts:26, 37, 126, 309 | Se llena en todas las partidas, no solo en captura (main.ts:26, 37). Como simTime vuelve a 0 en cada start (126), sound(from,to) (309) mezcla sonidos de partidas distintas. |
| minor | La API de captura se publica siempre y graba mal con ciertas fps | src/main.ts:273-299 | `__mudanza` se publica también en producción, con new Function sobre un script de texto, view y start (main.ts:273-281). advance usa Math.round(60/fps) (285): con 24 fps avanza 3 pasos (0,05 s) en lugar de 0,0417 s, así que el vídeo va a otra velocidad. Además ignora la pausa y duplica la lógica del bucle (238-254 frente a 283-297). |
| minor | El HUD se solapa en ventanas estrechas y su letra es pequeña para jugar desde el sofá | index.html:15, 30-31, 38-40, 61 | La barra superior se parte en dos filas por debajo de unos 860 px y choca con #h-warn y #h-light, fijos a top:96px (index.html:15, 30, 31). Por debajo de 700 px se ocultan los jugadores y la ayuda (61). Hay textos de 12-13 px (38, 40). Cada panel de jugador mide unos 300 px con la ayuda larga (ver docs/capturas/duo/a2-uno-solo.jpg); con 4 ocupan dos filas. |
| minor | Resultados poco informativos y con formatos distintos | src/main.ts:212-222 | «Tiempo» usa m:ss.s y «Mejor tiempo» usa «N.N s» (main.ts:216 frente a 221). Al ganar, «Etapa alcanzada» siempre dice «Camión» (220). No hay estadísticas por jugador, golpes ni causa del daño. |
| minor | Las etiquetas de teclas dependen de la distribución del teclado y hay riesgo de doble activación | index.html:95; src/input/input.ts:6, 19 | El menú muestra «-» para enderezar con J2 (index.html:95), pero el código es e.code 'Slash' (input.ts:6), que en un teclado US es «/». Intro no llama a preventDefault (input.ts:19) y los botones conservan el foco tras un clic, así que onGlobal y el clic nativo pueden activarse a la vez. |
| minor | No se pausa sola al perder el foco, ocultar la pestaña o desconectar un mando | src/input/input.ts:17-26 | Al perder el foco solo se vacían las teclas (input.ts:25). No se escuchan visibilitychange ni gamepaddisconnected. |
| minor | Sin interpolación de render: tirones en pantallas de alta frecuencia | src/main.ts:243-259 | Se simula a 60 Hz fijos (main.ts:243-253) y se dibuja sin interpolar (259). A 120-144 Hz, la mitad de los fotogramas repite la misma pose. |
| minor | Escrituras en el DOM en cada fotograma y código muerto | src/ui/hud.ts:55-100; src/input/input.ts:13, 71; src/main.ts:188 | El semáforo se reescribe con innerHTML en cada fotograma (hud.ts:100), igual que el tiempo y la barra (55, 65-67). prevEdge no se usa (input.ts:13, 71). La condición e.index > 0 siempre se cumple porque la etapa 0 nunca emite evento (main.ts:188). |
| minor | Textos del menú duplicados y desfasados | index.html:84, 97-99 | «Tenéis 3 minutos» (index.html:84, 99) repite RULES.timeLimit (game.ts:14). «Demo para dos en el mismo teclado» (84) aparece con una opción de hasta 4 jugadores. El texto habla de «Sin ayudantes» (97), pero no existe ningún botón con ese nombre. |

## Recomendaciones (13)

1. P0. Corregir la entrada antes de construir nada encima. (1) Guardar los flancos por jugador (agarrar, enderezar, botones de menú) en un búfer que solo se vacía cuando un paso de simulación los consume, no en cada read() (main.ts:240-253, input.ts:73). (2) Hacer un único poll() por fotograma que actualice prevPad de todos los mandos y que calcule desde ahí padStart y la navegación de menús (input.ts:66, 78-85). (3) Cubrirlo con pruebas de vitest que simulen navigator.getGamepads y un bucle a 60 y 144 Hz.
2. P0. Juntar la lógica de paso en una sola función tick(session, inputs), que usen tanto frame() como advance() (main.ts:238-254 y 283-297). Crear un objeto Session (simTime, enfriamientos, soundLog, pendingResults) que se recree en cada start: así se arreglan los enfriamientos que sobreviven entre partidas (main.ts:49, 126). Parar la simulación, o al menos sus sonidos, al entrar en resultados.
3. P1. Máquina de estados explícita (p. ej. src/app/flow.ts): Título (pulsa cualquier tecla o botón; aquí se desbloquea el AudioContext) → Sala de unión → Selección de nivel → Presentación → Cuenta atrás → Juego ⇄ Pausa → Resultados → siguiente nivel, repetir o volver a selección. En todas las pantallas: navegación con teclado y mando (foco gestionado, A/Intro acepta, B/Esc vuelve), entradas bloqueadas unos 0,8 s al entrar en resultados y «mantén para reiniciar» en lugar de Retroceso.
4. P1. Entrada para 4 jugadores. Dispositivos con identidad: 'kb-izq', 'kb-dcha' y 'pad:<gamepad.index>'. Sala de unión donde cada dispositivo pulsa su botón (Espacio, Intro o A) para crear un PlayerSlot {dispositivo, color, personaje, listo}. Teclado y mandos independientes, de modo que 2 en teclado + 2 con mando funcione. Además: gamepadconnected/disconnected pausan y piden «reconecta el mando de J3»; comprobar pad.mapping === 'standard'; zona muerta radial con reescalado; una función promptFor(jugador, acción) que devuelva el glifo de su dispositivo (Espacio / A / Intro), usada por todo el HUD y los avisos.
5. P1. Alzar. Decidirlo con quien lleva la simulación: alzar automático cuando dos o más cargan junto a un escalón, o «mantener agarrar» para alzar. En cualquier caso, quitar Mayús (Teclas especiales de Windows, teclados que no registran tantas teclas). En la interfaz: icono «alzando» sobre cada muñeco y en su panel; aviso en el mundo sobre el objeto con el glifo de cada portador; enseñarlo la primera vez en el nivel 1 con un obstáculo hecho para ello, en vez del banner rojo genérico (hud.ts:84).
6. P1. HUD guiado por datos. Un LevelDef (id, nombre, límite, tiempo par, objetos, zonas con nombre como 'calle' o 'camión', avisos propios) y un DeliveryState por objeto (en casa / en tránsito / cargado / roto, integridad, frágil, valor). Componentes: (a) temporizador descendente, en grande, con aviso sonoro a 30 y 10 s; (b) checklist «Por cargar» con icono, nombre, barra de estado, marca de frágil, ✓/✗ y contador «3/7 · camión 40 %»; (c) indicadores en el mundo (barra o icono sobre cada objeto dañado o en movimiento, flecha en el borde para objetos fuera de pantalla); (d) avisos por jugador anclados a su muñeco, en una cola de prioridad con enfriamiento por clave y jugador; (e) panel compacto de 4 jugadores con color, nombre, glifo del dispositivo y estado (agarrando, alzando, mareado). Sustituir #h-sofa y #h-stages (index.html:70-71) y las zonas escritas a mano (hud.ts:95-100; main.ts:185, 254).
7. P1. Selección de nivel y progreso: tarjetas para los 4 niveles con miniatura, estrellas, mejor tiempo por (nivel, nº de jugadores) y candado si está bloqueado. Guardado versionado (p. ej. 'mudanza.v2.progress', siempre dentro de try/catch) que no registre récords de la demo, del piloto ni del modo captura (main.ts:205-211). Estrellas por nivel (por ejemplo: todo cargado, sin roturas, tiempo par) en lugar de RULES.parTime e integridad ≥70.
8. P1. Presentación inicial breve (≤6 s, que cualquiera pueda saltar manteniendo A o Espacio): vuelo de cámara por el nivel a lo largo de una spline definida en el LevelDef, que muestre los objetos y el camión; rótulo con el nombre del nivel y la checklist entrando en el HUD; después 3-2-1 con pitidos. Hace falta un modo de cámara cinemática en WorldView, porque updateCamera (world.ts:126-163) solo sigue al sofá. Se puede aprovechar la fase 'countdown' (game.ts:172-175), que ya ignora las entradas, alargándola.
9. P2. Resultados de party game: lista de objetos entregados y rotos con su valor, estrellas del nivel, distinciones por jugador (más golpes, más caídas, héroe de la lámpara…), botones «Siguiente nivel / Repetir / Niveles» navegables con mando, formatos de tiempo iguales (main.ts:216 y 221) y causa de la derrota por objeto.
10. P2. Audio: (1) buses de música, efectos e interfaz que pasen por un DynamicsCompressor antes de la salida, con volúmenes guardados en ajustes y un silencio que también se vea en el menú; (2) variación de tono de ±5-8 %, alternancia entre variantes y límite de voces simultáneas por nombre; (3) paneo estéreo según la posición en pantalla y un timbre propio por jugador para agarrar y soltar; (4) catálogo por material y objeto: cartón, madera, metal de la nevera, cristal que se rompe para la lámpara, acorde disonante del piano; (5) eventos nuevos: cuenta atrás, objeto cargado con caja registradora, objeto roto, aviso de tiempo, navegación de la interfaz, jugador que se une; (6) música sintetizada sencilla por nivel que acelere en los últimos 30 s y baje bajo los golpes fuertes; (7) reutilizar un único buffer de ruido (sfx.ts:83-98).
11. P2. Modo captura: mantener `__mudanza`, porque lo usan record-duo.cjs, stills.cjs y duo-e2e.cjs, pero publicarlo solo con ?capture=1 o import.meta.env.DEV. Ampliarlo con start({nivel, jugadores}), con advance también en presentación y menús (cámara cinemática determinista) y con un acumulador real para cualquier fps (main.ts:285). autoInputs debe asignar un objetivo y un objeto por jugador; el piloto actual sigue la ruta del sofá (autopilot.ts:82). soundLog por sesión y con límite.
12. P2. Textos y maquetación: todas las cadenas en una tabla (es), sin literales repartidos por index.html, main.ts y hud.ts, y sin mencionar «sofá», «3 minutos» ni «dos en el mismo teclado». Tipografía mínima de 18-20 px para TV y diseño probado a 1280×720 y 1920×1080 con 4 paneles. Evitar innerHTML en cada fotograma (hud.ts:100) y actualizar solo lo que cambie.
13. P3. Calidad: sacar a módulos sin DOM la lógica pura (prioridad de avisos, estrellas y puntuación, asignación de dispositivos, búfer de flancos) y probarla con vitest. Añadir una e2e con mandos simulados y otra que repita la partida para comprobar que vuelven a sonar las bocinas y el tic. Pausa automática con visibilitychange y blur. Interpolar el render entre pasos para 120-144 Hz. Borrar código muerto (input.ts:13, 71; sfx.ts:48, 54).
