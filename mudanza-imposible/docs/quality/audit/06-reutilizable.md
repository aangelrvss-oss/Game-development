# Auditoría 6/6 — Laboratorio, a-la-de-tres y referencias

> Informe íntegro del agente `audit:reutilizable` (flujo `wf_9501e555-672`, 19-10-2026, solo lectura sobre el commit `08547f8` + documentos). Transcripción literal de su salida estructurada: no está resumido ni corregido. Las afirmaciones son del agente; su verificación está en `../QUALITY_STATE.md` y `08-verificacion.md`.

## Resumen

Revisión de solo lectura del laboratorio de personaje (mudanza-imposible-character-lab), del motor de reglas «A la de tres», de la documentación (README de los dos proyectos de mudanza, docs/quality/ART_DIRECTION.md y assets-src/blender/setup.sh) y de three/examples en node_modules del juego. Verificación: `tsc --noEmit` sin errores en los 3 proyectos; Vitest 25/25 (a-la-de-tres), 12/12 (laboratorio) y 29/29 (juego); el árbol git sigue limpio.
Lo más reutilizable:
(a) El muñeco procedural ya está portado al juego con el contrato `DollSource` (dollRig.ts:14-35), así que sirve para 4 jugadores. Falta lo que exige ART_DIRECTION: un sombrero distinto por jugador y el contorno.
(b) El modelo de equilibrio del laboratorio es más rico que el del juego. Tiene límite de agarre por fuerza, rampa de esfuerzo y tropiezo con bordillos, y vale para objetos pesados o frágiles. Su `tryGrab` reintroduce el bug de atravesar el mueble (character.ts:213).
(c) De «A la de tres» sirve el concepto de partes ALZADA/PLANA/INCLINADA y de «bultos» que obligan a alzar (engine.ts:179-193, 325-353), junto con el reparto de asas según el número de jugadores (seats.ts:39-47). Es una base para sustituir el Mayús que nadie entiende.
(d) El juego ya tiene audio sintetizado (sfx.ts). El laboratorio y a-la-de-tres no tienen sonido.
(e) three 0.179.1 trae GLTFLoader, DRACOLoader con sus decodificadores, KTX2Loader, SkeletonUtils, BufferGeometryUtils, RoundedBoxGeometry, OutlineEffect, DecalGeometry, RapierHelper y lil-gui, todos con tipos. bpy 5.2.2 está instalado para generar GLB.
Referencias externas documentadas: 1 URL de claude.ai (README.md:622) y 2 recursos aportados sin URL (README.md:629-630). Hay documentos citados en el código de a-la-de-tres que no existen en el repositorio.

## Arquitectura

REPOSITORIO: tres proyectos independientes. No comparten paquete; cada uno tiene su propio node_modules y package-lock, y todos resuelven contra registry.npmjs.org. No hay README ni docs/ en la raíz. Remote: https://github.com/aangelrvss-oss/Game-development.

1) LABORATORIO (mudanza-imposible-character-lab). Three 0.179.1 y Rapier 0.19.3, las mismas versiones que el juego (package.json:15-16).
- sim/ no importa Three, así que se prueba en Node.
  · types.ts: LabInput {mx, mz, run, grab} y los estados idle/walking/grabbing/pulling/losingBalance/falling/recovering (types.ts:5-18).
  · character.ts, clase Character:
    - Parámetros en la constante global CHAR (30-76).
    - Cápsula de 75 kg con rotación bloqueada (127-134).
    - preStep (226-279): control por velocidad objetivo con aceleración máxima. Agarrado, el esfuerzo sube del 40 % al 100 % (241-247) y la mano lleva el ancla a su sitio (268-278).
    - tryGrab(body, colliders) (182-218): genérico para cualquier cuerpo, con rótula Rapier y setContactsEnabled(false) en la línea 213.
    - postStep (286-397): mide la fuerza externa por balance de momento (287-306). El agarre se rompe por distancia o por fuerza: 900 N afianzado, 420 N suelto (308-314). Tropiezo con obstáculo a la altura de los pies (319-330). Péndulo invertido con postura buscada y desviación (332-374). Máquina de estados (378-397).
    - startFall desbloquea la rotación y la cápsula cae de verdad (400-425); updateRecovering la endereza de forma cinemática en 0,85 s (441-469); footGround hace un rayo hacia abajo (472-476).
  · lab.ts:
    - SOFA es una constante compartida entre física y vista (8-18). ZONES (21-25) y FRICTION (27) definen alfombra, hielo y bordillo.
    - Lab.build crea un mundo nuevo en cada prueba, así que es determinista (61-71). buildStatic (76-93). Sofá compuesto con patas cilíndricas (95-111).
    - reset(test) (130-169). heightAt es analítico (172-178).
    - step (187-213): entrada (teclado o guion), grab, preStep, world.step, clasificación de contactos obstáculo/sofá (196-209) y postStep.
    - Sistema de guiones: Script = (lab, t) => LabInput (32), memoria once() (216-219) y las pruebas A-D (233-290).
- view/ solo lee la simulación:
  · characterRig.ts: LOOK (19-33) y materiales MeshPhysical (44-47).
    - Construcción del muñeco (109-234): gorra fija en 174-182 y botas con RoundedBoxGeometry.
    - sync(lab, dt, camera) (253): planificador de pasos (487), suela que se adapta al suelo (239-251), IK de dos huesos, cara y miembros como partículas al caer (573-626).
  · tube.ts: FlexTube, tubo que se actualiza sin crear geometría nueva (7-80), y twoBone (83-97).
  · scene.ts: canvasTex (6-15), luces (38-56), OrbitControls (59-65) y follow(focus) (181-191).
- main.ts:
  · Bucle fijo a 60 Hz.
  · Teclado relativo a la cámara, con Mayús para correr (44-56).
  · Ganchos de grabación window.__lab.advance (140-160).
- Pruebas: tests/lab.test.ts (12).

2) PUERTO AL JUEGO (lo que ya se reutiliza).
- src/view/doll/dollRig.ts es un fork de characterRig.ts (141 líneas de diff). Añade:
  · el contrato DollSource (14-35) y Look parametrizable (49-66);
  · materiales Standard;
  · trimShadows (270);
  · bodySpheres (291).
- src/view/doll/tube.ts es copia literal de la del laboratorio.
- src/view/doll/dollView.ts es el adaptador porteador → muñeco:
  · PLAYER_LOOKS solo cambia colores (12-17);
  · heightAt por rayo de Rapier ONLY_FIXED (103-108);
  · recibe sofaColliders para no dibujar el muñeco dentro del sofá (64, 187).
- El equilibrio está simplificado en carrier.ts:307-371: sin bordillos y sin límite de fuerza en las manos.
- Flujo: Game.step → Carrier.control y balance → DollView.sync → CharacterRig.sync.

3) A LA DE TRES (a-la-de-tres). Three 0.170.0; solo existe src/rules.
- types.ts: rejilla, Sofa de 3 casillas E1/C/E2 con lado rojo (45-51), isSideways (58).
- seats.ts: 10 asas (12-23) y SEATS_BY_COUNT de 4 a 10 jugadores (39-47).
- levels.ts: tableros ASCII A y B-espejo con mirror() (18-66), LEVELS (68), BOARD_* (70-72) y rawAt (75-79).
- engine.ts, motor puro de estado más cartas:
  · newGame (46-60);
  · privateViews (B5, 115-123), información privada por asa;
  · partReport (B7-B8, 179-193): una parte queda ALZADA, PLANA o INCLINADA según cuántos alzan;
  · resolveBeat (197-354): desplazamiento (B9), giro (B10), forcejeo (B11), golpe (B12), revelar (B13), tropiezo al entrar PLANA en un bulto (B15) y daño por INCLINADA o por ALZADA sin bulto (B16);
  · endCheck (B17, 360-366).
- Pruebas: tests/rules.test.ts (25).
- Directorios vacíos: src/audio, src/bots, src/game, src/render, src/ui y docs/.

4) DOCUMENTACIÓN.
- mudanza-imposible/README.md (708 líneas):
  · controles (261-272);
  · física cooperativa (37-50);
  · integración del muñeco (52-89);
  · propuesta LevelDef/ItemDef (214-259);
  · stack (302-330);
  · recursos externos (624-632).
- docs/quality/ART_DIRECTION.md es vinculante:
  · un sombrero por jugador (27-33) y colores de jugador (34-40);
  · ItemDef con colliders definidos en datos (61);
  · ambiente de luz por nivel (76-83), kit modular a 0,5 m (87) y cámara a 53° que encuadra a todos (108-110).
- Laboratorio, README.md: recursos (116-123), defectos pendientes (173-181), limitaciones (207-217) y próximos pasos (219-226).
- assets-src/blender/setup.sh instala bpy==5.2.2 (líneas 3, 10 y 13). Comprobado que importa en /root/blender-venv. No hay CLI de Blender, gltf-transform ni gltfpack. ffmpeg sí está.

5) node_modules/three/examples/jsm (0.179.1, con .d.ts en @types/three 0.179.0).
- loaders: GLTFLoader, DRACOLoader, KTX2Loader, FBXLoader, OBJLoader, SVGLoader, FontLoader…
- libs: draco/ (decodificadores, también en draco/gltf/), basis/ (transcoder), meshopt_decoder, lil-gui, stats, tween, fflate.
- geometries: RoundedBoxGeometry, DecalGeometry, ConvexGeometry, TextGeometry.
- utils: BufferGeometryUtils, SkeletonUtils, SceneUtils, GeometryCompressionUtils.
- animation: CCDIKSolver, AnimationClipCreator.
- effects: OutlineEffect. postprocessing: EffectComposer, OutlinePass, SMAAPass, OutputPass…
- objects: Sky, Reflector. helpers: RapierHelper. math: Octree, Capsule, OBB, SimplexNoise. csm: CSM. environments: RoomEnvironment. lines: Line2. exporters: GLTFExporter, DRACOExporter.
- Usado hoy: solo RoundedBoxGeometry (levelView.ts:2, decor.ts:2, sofaView.ts:2, dollRig.ts:2, carView.ts:2) y mergeGeometries (levelView.ts:3). En el laboratorio, además, OrbitControls (scene.ts:2).
- physics/RapierPhysics.js:3 carga Rapier 0.17.3 desde https://cdn.skypack.dev: no conviene usarlo.
- public/models/ existe y está vacío.

## Acoplamientos (15)

| Dónde | Qué | Impacto |
|---|---|---|
| mudanza-imposible-character-lab/src/sim/lab.ts:34-38, 187-213 | Lab tiene un único `char: Character` y un único `sofa`. step() solo procesa lab.char, y la clasificación de contactos (196-209) usa un único `sofaSet` (40). | No sirve como mundo de juego con 4 jugadores ni con varios objetos. Para reutilizarlo hay que recorrer los personajes y clasificar los contactos por objeto transportable (item) y no por «sofá». |
| mudanza-imposible-character-lab/src/sim/lab.ts:8-18, 95-111; src/view/sofaView.ts | SOFA es una constante de módulo compartida por la física y la vista (95 kg, medidas, patas). | El patrón es bueno (colliders en datos, como pide ART_DIRECTION.md:61), pero está atado a un solo mueble. Hay que convertirlo en ItemDef[] (colliders, masa, roce, patas, asas, fragilidad, dibujo). |
| mudanza-imposible-character-lab/src/sim/character.ts:30-76 | CHAR es un objeto global mutable con todos los parámetros (masa, velocidades, umbrales de equilibrio, fuerzas de agarre). | No permite ajustar por personaje ni por objeto (piano frente a caja). Hay que pasar los parámetros al constructor o a ItemDef/LevelDef. |
| mudanza-imposible-character-lab/src/sim/character.ts:286 (postStep contact {obstacle, sofa}) y lab.ts:207 | El contacto que desequilibra el tronco se llama y se calcula como «sofa». | Con varios objetos hay que generalizarlo a «objeto dinámico transportable» y decidir si un objeto ajeno en movimiento empuja igual. |
| mudanza-imposible-character-lab/src/view/characterRig.ts:3-4, 253-254 | El rig original importa Lab y lee lab.char directamente. | Ya está resuelto en el juego con DollSource (mudanza-imposible/src/view/doll/dollRig.ts:14-35). Conviene tomar como fuente la versión del juego, no la del laboratorio. |
| mudanza-imposible-character-lab/src/view/characterRig.ts:174-182 y mudanza-imposible/src/view/doll/dollRig.ts:207-215; dollView.ts:12-17 | El sombrero es siempre la misma gorra. PLAYER_LOOKS solo cambia los colores del peto, la gorra y el pelo. | Incumple ART_DIRECTION.md:27-33: gorra, gorro de lana con pompón, pañuelo y casco, distinguibles «aunque no se vea el color». Con 4 jugadores y cámara cenital es la principal señal de identidad. |
| mudanza-imposible/src/view/doll/dollView.ts:64, 187; src/view/world.ts:104 | DollView recibe solo `game.sofaColliders` para apartar el dibujo del mueble. | Con varios objetos, el muñeco se dibujaría dentro de cajas, mesas o la nevera. Hay que pasarle la lista de colliders de todos los objetos dinámicos. |
| mudanza-imposible/src/view/world.ts:128-145, 164, 183-186 | La cámara y el corte de paredes se centran en sofaPos más la media de los humanos. | ART_DIRECTION.md:109 pide encuadrar a todos los jugadores y el objeto que se lleva. Con varios objetos y jugadores repartidos hay que encuadrar un conjunto de puntos (Stage.follow del laboratorio, scene.ts:181-191, ya recibe un foco genérico). |
| mudanza-imposible/src/input/input.ts:4-7, 59; src/main.ts:77, 120 | Solo hay 2 esquemas de teclado. Alzar está en ShiftLeft y ShiftRight; J3 y J4 solo pueden jugar con mando. La ayuda de controles tiene textos fijos para J1 y J2. | Hasta 4 jugadores locales exige mandos o más esquemas, y estos chocan con el ghosting documentado en README.md:692. Alzar con Mayús es justo lo que no se entiende. |
| mudanza-imposible/src/ui/hud.ts:84 y game.ts:157-163 | El aviso «Mantened Mayús (J1 la izquierda, J2 la derecha)» y needsLiftAtStairs están escritos para el sofá, la escalera del nivel único y 2 jugadores. | Hay que pasar a avisos por jugador y por objeto, con la tecla o el botón de su esquema, como pide ART_DIRECTION.md:95. |
| mudanza-imposible/src/sim/carrier.ts:228, 268, 375-379 | Carrier.control(input, dt, sofa) y flatYaw dan por hecho que el objeto agarrado es el sofá y que su eje largo es la x local. | Con una lámpara, que es casi un cilindro, o una caja cuadrada, followSofa devuelve null o da giros raros. El eje de referencia debe salir de ItemDef. |
| a-la-de-tres/src/rules/types.ts:45-51, 16; seats.ts:12-23 | El sofá son 3 casillas fijas E1, C y E2 con 10 asas fijas. | El concepto de partes y asas se puede llevar a ItemDef (asas agrupadas por parte), pero el código no: solo modela un objeto alargado de 3 partes. |
| a-la-de-tres/src/rules/seats.ts:39-47; engine.ts:47-49 | SEATS_BY_COUNT solo cubre de 4 a 10 jugadores, y newGame exige al menos un jugador en cada parte. | Para «hasta 4 jugadores» solo vale la fila de 4. Con 2 o 3 no hay reparto definido; habría que diseñar uno por objeto. |
| a-la-de-tres/src/rules/levels.ts:9, 68, 70-72; engine.ts:28-29 | Level.id es 'A' \| 'B'. BOARD_W=9, BOARD_Y0/Y1, MAX_DAMAGE=6 y MAX_BEATS=40 son constantes globales. | El formato ASCII con mirror() sirve como idea para hacer maquetas grises de niveles, pero las dimensiones y los límites están fijos. |
| mudanza-imposible-character-lab/src/main.ts:53 e index.html:80, frente a mudanza-imposible/src/input/input.ts:5-6 | Mayús significa «correr» en el laboratorio y «alzar» en el juego. | Si se reutilizan controles o pruebas del laboratorio, la tecla cambia de significado. Conviene un mapa de acciones único. |

## Defectos (11)

| Gravedad | Título | Dónde | Evidencia |
|---|---|---|---|
| major | Reutilizar Character.tryGrab del laboratorio reintroduce el bug de atravesar el mueble | mudanza-imposible-character-lab/src/sim/character.ts:211-213 | character.ts:213 llama a `this.joint.setContactsEnabled(false)`. mudanza-imposible/README.md:148-155 documenta que esa misma llamada era la causa de penetraciones de hasta 50-71 cm. El juego la corrigió con `setContactsEnabled(this.coop)` y followSofa (carrier.ts:196, 204-209). El laboratorio conserva la versión defectuosa. |
| major | El aro de J1 tiene el mismo amarillo que el objetivo y los colores de jugador no siguen ART_DIRECTION | mudanza-imposible/src/view/carrierView.ts:7; src/view/levelView.ts:119 | PLAYER_COLORS = ['#facc15', '#22d3ee', '#f472b6', '#a3e635'] (carrierView.ts:7) se usa para el aro de cada jugador (dollView.ts:67-68). El aro de objetivo también es '#facc15' (levelView.ts:119, 124). ART_DIRECTION.md:35-39 fija #e2483d, #1597b8, #d0457f y #5f9c2a, con peto, sombrero y aro del mismo tono, y reserva #facc15 para «destino y avisos» (67). README.md:26 y 28 describen a la vez «J1… aro amarillo» y «El aro amarillo en el suelo marca el siguiente objetivo». |
| major | Los 4 jugadores solo se distinguen por el color (no hay sombreros distintos) | mudanza-imposible/src/view/doll/dollRig.ts:207-215; src/view/doll/dollView.ts:12-17 | ART_DIRECTION.md:27-33 exige gorra, gorro de lana con pompón, pañuelo con lazo y casco de obra, distinguibles «aunque no se vea el color». dollRig.ts:207-215 construye siempre la misma gorra y PLAYER_LOOKS (dollView.ts:12-17) solo cambia colores. Es un problema de accesibilidad para el daltonismo con 4 jugadores y cámara cenital. |
| minor | Documentos citados en el código de a-la-de-tres que no existen | a-la-de-tres/src/rules/seats.ts:34-37; a-la-de-tres/src/rules/engine.ts:358; a-la-de-tres/src/rules/levels.ts:4 | seats.ts:37 y engine.ts:358 remiten a docs/AMBIGUEDADES.md, pero a-la-de-tres/docs/ está vacío y git log no registra ese archivo nunca. Las fuentes «diseño v3», con su tabla «Escalabilidad de 4 a 10 jugadores» (seats.ts:34), y el «kit del test de papel v3» (levels.ts:4; tests/rules.test.ts:1) tampoco están en el repositorio. Además, a-la-de-tres no tiene README.md. |
| minor | El muñeco está duplicado en dos copias que ya se han separado | mudanza-imposible-character-lab/src/view/characterRig.ts; mudanza-imposible/src/view/doll/dollRig.ts; ambos src/view/**/tube.ts | dollRig.ts es un fork de characterRig.ts: 141 líneas distintas en el diff (materiales, DollSource, trimShadows, bodySpheres). tube.ts es idéntica en los dos proyectos. Las mejoras pendientes del laboratorio (README del laboratorio:173-181: traspiés con saltitos y límite del 30 % de estiramiento) habría que hacerlas dos veces. |
| minor | Coste por fotograma del muñeco que crece con 4 jugadores | mudanza-imposible/src/view/doll/dollRig.ts:304-307, 410-418, 529-539 | Cada pie hace ground(), es decir 9 llamadas a heightAt (dollRig.ts:304-307), más 6 esquinas de suela (dollRig.ts:416-418). Con la sombra (539) son unos 31 rayos de Rapier por muñeco y fotograma (dollView.ts:103-108), y unos 124 con 4 jugadores. Además hay unos 38 puntos con `new THREE.Vector3/Quaternion` por fotograma (p. ej. 331-349, 382, 417, 471-472) y se construye un objeto `debug` completo en cada fotograma, también en producción (dollRig.ts:529-536). README.md:85-89 ya midió un −12 % de fps con solo 2 muñecos. |
| minor | El README del laboratorio dice que no hay Blender, y ya está instalado | mudanza-imposible-character-lab/README.md:119; mudanza-imposible/assets-src/blender/setup.sh:3-15 | README del laboratorio:119 dice «no hay ninguna instalada (ni Blender ni conversores glTF)». El commit 2200910 añadió assets-src/blender/setup.sh (bpy==5.2.2), y /root/blender-venv/bin/python importa bpy 5.2.2 LTS. Los conversores glTF (gltf-transform, gltfpack) siguen sin estar. |
| minor | Dos planes de niveles distintos en la documentación | mudanza-imposible/docs/quality/ART_DIRECTION.md:78-83; mudanza-imposible/README.md:248-253 | ART_DIRECTION.md:78-83 define los niveles «1 · Casa, 2 · Edificio, 3 · Calle, 4 · Almacén». README.md:249-253 propone «Ático sin ascensor, Calle en obras, El piano, Día de lluvia». Antes de planificar hay que elegir uno. |
| minor | El muñeco no lleva el contorno obligatorio | mudanza-imposible/src/view/doll/dollRig.ts (sin contorno); docs/quality/ART_DIRECTION.md:71 | ART_DIRECTION.md:71 exige contorno #2a2140 en personajes y objetos transportables. README.md:84 reconoce que el muñeco no lo lleva. Los ayudantes y el sofá sí lo llevan, con casco invertido: outlineMat en carrierView.ts:11-17 y sofaView.ts:13. |
| minor | Directorios vacíos y versión de Three distinta en a-la-de-tres | a-la-de-tres/package.json:13-17; a-la-de-tres/src/{audio,bots,game,render,ui} | src/audio, src/bots, src/game, src/render, src/ui y docs/ existen vacíos (no están en git). Usa three 0.170.0 y @types/three 0.170.0 (package.json:13-17), frente a 0.179.1 en los otros dos proyectos. No hay código de render ni de audio que aprovechar. |
| minor | RapierPhysics.js de three/examples carga otra versión de Rapier desde un CDN | mudanza-imposible/node_modules/three/examples/jsm/physics/RapierPhysics.js:3, 98 | physics/RapierPhysics.js:3 define RAPIER_PATH = 'https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.17.3' y lo importa dinámicamente (98). El proyecto usa 0.19.3 local. Si alguien lo usa por comodidad, rompe el funcionamiento sin red y mezcla versiones. |

## Recomendaciones (14)

1. 1. Unificar el porteador en un único módulo de simulación. Partir de Carrier del juego, que conserva las correcciones cooperativas: setContactsEnabled(coop) en carrier.ts:196, followSofa en 204-209 y touching en 218-225. Incorporar del laboratorio, configurable por ItemDef: el límite de agarre por fuerza (character.ts:308-314; 900 N afianzado y 420 N suelto), la rampa de esfuerzo del 40 % al 100 % (241-247), que hace legible el peso del piano o la nevera, y el tropiezo con obstáculos a la altura de los pies (319-330, más el conjunto `obstacles` de lab.ts:39, 86, 201-206), útil para umbrales, cables o juguetes en el suelo. NO copiar tryGrab del laboratorio tal cual (character.ts:213).
2. 2. Usar como única fuente del muñeco src/view/doll/dollRig.ts más DollSource (14-35), que ya tiene materiales ligeros, y archivar characterRig.ts en el laboratorio. Ampliar `Look` con `hat: 'gorra' \| 'gorro' \| 'panuelo' \| 'casco'` según ART_DIRECTION.md:27-33, añadir el contorno con casco invertido (el outlineMat de carrierView.ts:11-17) y pasar a DollView la lista de colliders de TODOS los objetos dinámicos, no solo sofaColliders (dollView.ts:64).
3. 3. Corregir la identidad de jugador antes de añadir J3 y J4. PLAYER_COLORS (carrierView.ts:7) debe usar la paleta de ART_DIRECTION.md:35-39, con aro, peto y sombrero del mismo tono, y #facc15 queda solo para el objetivo (levelView.ts:119).
4. 4. Sustituir «Mayús para alzar» con la idea de «A la de tres». Cada objeto tiene partes con asas (seats.ts:12-23) y su estado sale de quién sostiene cada parte: ALZADA, PLANA o INCLINADA (engine.ts:179-193). Hay que alzar solo para cruzar «bultos» marcados en el nivel (peldaños, umbrales, bordillos), y entrar PLANA en un bulto provoca un tropiezo (B15, engine.ts:325-333). Propuesta: alzar automático al agarrar entre suficientes jugadores, o alzar con el MISMO botón de agarrar mantenido. El estado de cada parte se ve en el objeto (anillo o color de las asas), no en un texto con «Mayús».
5. 5. Usar SEATS_BY_COUNT (seats.ts:39-47) como modelo de datos para decidir, por objeto y número de jugadores (1-4), cuántas asas se ofrecen y cuántas manos hacen falta: la caja con 1, la silla con 1, la mesa con 2, la nevera con 2-3, el piano con 3-4. La tabla actual empieza en 4 jugadores, así que el reparto para 1-3 hay que diseñarlo.
6. 6. Hacer el LevelDef/ItemDef propuesto en README.md:214-259 siguiendo el patrón del laboratorio de una constante compartida por física y vista (lab.ts:8-18, sofaView.ts). Al reiniciar un nivel, reconstruir el mundo de Rapier como Lab.build (lab.ts:61-71) para que sea determinista. Reutilizar el sistema de guiones (lab.ts:32, 216-219, 233-290) para tutoriales por nivel y para pilotos de prueba por objeto. El formato ASCII con mirror() de levels.ts:18-66 sirve como maqueta gris rápida sobre la retícula de 0,5 m (ART_DIRECTION.md:87). Antes de nada, decidir entre los niveles de ART_DIRECTION.md:78-83 y los de README.md:249-253.
7. 7. Superficies: el laboratorio ya demuestra que el roce por zona da juego (alfombra 1,6, hielo 0,03 y patas que se enganchan; lab.ts:21-27, 76-93, 105-108). Pasarlo a LevelDef para el «día de lluvia», la rampa encerada o la alfombra que frena la nevera.
8. 8. Entrada para 4 jugadores: mantener 2 esquemas de teclado y exigir mando para J3 y J4, que la Gamepad API ya mapea (input.ts:51-67). Añadir una pantalla de «pulsa un botón para unirte» y un mapa de acciones único: en el laboratorio Mayús es correr (main.ts:53) y en el juego es alzar (input.ts:5-6).
9. 9. Audio: el laboratorio y a-la-de-tres no tienen. Reutilizar src/audio/sfx.ts (síntesis con WebAudio y renderTrack sin conexión para los vídeos) y añadir lo que recomienda el README del laboratorio:224 (chirrido de goma al tirar, «plof» al caer, pasitos), más sonidos por objeto: cristal para la lámpara frágil, acorde al golpear el piano, cartón para las cajas.
10. 10. Pipeline de assets con lo que ya está disponible sin instalar nada:<br>- bpy 5.2.2 (assets-src/blender/setup.sh) para exportar GLB a public/models/, que está vacío.<br>- GLTFLoader con DRACOLoader. Hay que copiar los decodificadores de node_modules/three/examples/jsm/libs/draco/gltf/ a public/, o usar meshopt_decoder.module.js. KTX2Loader con libs/basis si hacen falta texturas comprimidas.<br>- SkeletonUtils.clone para instancias por jugador, si se pasa a un modelo con huesos. El README del laboratorio:114 explica que basta con mantener sync().<br>- RoundedBoxGeometry para los chaflanes del 6-12 % (ART_DIRECTION.md:51-52), DecalGeometry para la pegatina de frágil, BufferGeometryUtils.mergeGeometries (ya se usa en levelView.ts:3) y GLTFExporter para congelar en GLB lo que hoy es procedural.<br>- RapierHelper y lil-gui para un panel de ajuste por objeto, como el del laboratorio (index.html, intensidad acotada en lab.ts:73).<br>- Evitar physics/RapierPhysics.js, que se descarga de un CDN la versión 0.17.3.
11. 11. Rendimiento con 4 muñecos y varios objetos: sustituir los unos 31 rayos por muñeco y fotograma por una caché de altura del nivel estático. El laboratorio ya usaba heightAt analítico (lab.ts:172-178). Además, reutilizar vectores temporales en dollRig.ts y construir `debug` (529-536) solo en modo captura.
12. 12. Cámara: generalizar updateCamera (world.ts:128-145) para que encuadre un conjunto de puntos (todos los jugadores y los objetos agarrados o en tránsito) con zoom acotado, como pide ART_DIRECTION.md:109. Stage.follow del laboratorio (scene.ts:181-191) ya separa el foco del cálculo de la cámara.
13. 13. Reparar la documentación: subir al repositorio o eliminar las referencias a docs/AMBIGUEDADES.md y al «kit v3» (seats.ts:34-37, engine.ts:358, levels.ts:4), escribir un README para a-la-de-tres y actualizar el README del laboratorio:119 sobre Blender.
14. REFERENCIAS EXTERNAS DOCUMENTADAS (literal; ninguna inventada):<br>(a) mudanza-imposible/README.md:622: «https://claude.ai/artifact/Bo3j9ipvmdz9wpVPxfqtqC», página privada de claude.ai con el vídeo.<br>(b) mudanza-imposible/README.md:629: «`open-source-games` (CC0) es una lista de enlaces a juegos». No da URL ni está en el repositorio.<br>(c) mudanza-imposible/README.md:630 y 632: «`Claude-Code-Game-Studios` (MIT) son definiciones de agentes… solo se tomó como referencia el reparto de papeles para las revisiones… no se ha instalado». No da URL ni está en el repositorio.<br>(d) mudanza-imposible/assets-src/blender/setup.sh:3, 10 y 13: «bpy 5.2.2 (PyPI)», con `uv pip install -q bpy==5.2.2` y `pip install -q bpy==5.2.2`.<br>(e) mudanza-imposible/README.md:304 y README del laboratorio:120: el stack «Vite 7, TypeScript, Three.js 0.179 y Rapier 0.19 (`rapier3d-compat`, WASM)», y en el laboratorio «Three.js 0.179.1, Rapier 0.19.3, Vite 7, Vitest 4», más vite-node (README del laboratorio:123).<br>(f) README del laboratorio:119: «En la sesión hay un servicio externo de generación 3D, pero es de pago; no lo he usado». No lo nombra.<br>(g) ART_DIRECTION.md:14-19: referencias de «sensación» sin URL («figuras de vinilo de diseño; maquetas de arquitectura con corte; dioramas de stop-motion»).<br>(h) Documentos citados que no existen: «diseño v3, tabla “Escalabilidad de 4 a 10 jugadores”» (a-la-de-tres/src/rules/seats.ts:34), «kit del test de papel v3 (hojas 2 y 3, y “Contenido de las fichas”)» (levels.ts:4) y «docs/AMBIGUEDADES.md» (seats.ts:37, engine.ts:358).<br>Las demás URLs del repositorio son de localhost (README.md:22, 31 y 35; README del laboratorio:18 y 23; scripts/*.cjs) o el xmlns de SVG en index.html:6. El remote de git es https://github.com/aangelrvss-oss/Game-development; sale de la configuración de git, no de la documentación.
