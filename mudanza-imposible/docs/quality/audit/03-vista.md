# Auditoría 3/6 — Render, personajes y animación

> Informe íntegro del agente `audit:vista` (flujo `wf_9501e555-672`, 19-10-2026, solo lectura sobre el commit `08547f8` + documentos). Transcripción literal de su salida estructurada: no está resumido ni corregido. Las afirmaciones son del agente; su verificación está en `../QUALITY_STATE.md` y `08-verificacion.md`.

## Resumen

La vista funciona y compila: `npx tsc --noEmit` termina sin errores y `npx vitest run` pasa las 29 pruebas. Para medir, compilé el juego en el scratchpad y lo recorrí con Playwright, sin tocar el repositorio. Está muy atada a un solo sofá, un solo nivel y a una mezcla de muñecos procedurales (humanos) y caricaturas (ayudantes de la máquina).

1. **visOff incumple la regla del usuario** («No escondas las penetraciones desplazando el modelo visual de manera que contradiga su cuerpo físico»). Medido: empujando el sofá con el cuerpo, el dibujo vive 10 cm apartado de la cápsula en 83 de 90 fotogramas, con la cápsula sin penetrar. Tambaleándose hacia el sofá haría falta apartarlo 0,82 m; se recorta a 0,20 m, así que sigue penetrando y además arrastra pies, aro y etiqueta.
2. **Las piernas se estiran sin límite** cuando la cápsula no toca el suelo: 1,79 m en el aire y 2,65 m al reaparecer, frente a 0,29 m de normal.
3. **Las caras no se leen.** Desde la cámara de juego la propia gorra tapa los ojos, incluso con el muñeco mirando de frente. Cuando se ven, miden unos 8×10 px a 1280×720 y las cejas unos 2 px.
4. **Los 4 jugadores solo se distinguen por el color.** La silueta es la misma y J1 lleva peto rojo pero aro y etiqueta amarillos.
5. **Coste de dibujo:**
   - Cada muñeco: 48 mallas, 47 llamadas, 24 materiales propios, 48 geometrías sin compartir, 14,4 k triángulos y 24 proyectores de sombra.
   - El sofá: 54 llamadas y 18 k triángulos.
   - Escena: 233 llamadas con 2J y 331 con 4J, sin contar la pasada de sombras.
6. **Animaciones que faltan:** aire, celebrar, frustración, empujar, alzar, recolocar, resbalar, impacto.

Es una buena base para una capa procedural (pasos, IK, equilibrio) encima de un modelo GLB con esqueleto, siempre que se quite visOff y el volumen dibujado quepa en el físico.

## Arquitectura

**PIPELINE DE DIBUJO (src/view/world.ts)**
- **Renderizador (world.ts:36-44).** WebGLRenderer con antialias, densidad de píxeles adaptable entre 0,5 y min(dpr, 2) según el tiempo medio de fotograma (adapt, world.ts:69-84). Sombras PCFSoftShadowMap, salida sRGB, ACESFilmic con exposición 1,05, fondo color cielo y niebla 45–110 m (world.ts:45-46).
- **Luces (world.ts:47-58).**
  - Hemisférica 1,15.
  - Sol direccional 2,6 con sombra de 2048², frustum ±26 m, bias −0,0006. Sigue al objetivo de la cámara (world.ts:155-156) sin ajustarse a la rejilla de texeles.
  - Relleno frío 0,55 sin sombra.
- **Nivel.** Se construye una sola vez en el constructor (world.ts:59, buildLevel en levelView.ts:57-114).
  - Cajas de LEVEL con texturas de canvas y UV del mundo (textures.ts:164-176) y decoración (decor.ts).
  - mergeStatic (levelView.ts:149-173) funde todo lo estático por material y sombra en mallas gigantes del tamaño del nivel. Quedan fuera los fadeables, las InstancedMesh (valla, levelView.ts:222-223) y los edificios multimaterial (levelView.ts:381-385).
- **Oclusión (fadeOccluders, world.ts:165-200).**
  - Lanza rayos desde la cámara al sofá y a cada humano (más un punto a 0,7 m si está tumbado, world.ts:171-172) contra el Box3 de 64 fadeables.
  - Modo 'cut': escala en Y hasta un zócalo de 0,4 m. Modo 'hide': oculta. También hay reglas por posición del sofá (fadeRule, levelView.ts:69-70).
  - Cada fadeable tiene material propio (ownMat, levelView.ts:48 y 273-279).
- **Cámara (world.ts:128-158).**
  - Perspectiva de 42° (58° en vertical, world.ts:91), con offset (0; 8,5; 6,3)×camDist: unos 53° de inclinación, que pasan a ~62° para lo que queda cerca de la cámara.
  - Objetivo: 0,75·sofá + 0,25·media de humanos + 0,35·velocidad del sofá.
  - Zoom de 1 a 1,6 según la distancia máxima de cualquier porteador al sofá. Temblor aleatorio por fotograma (world.ts:152).
- **Bucle.** Física a 60 Hz fija sin interpolar el estado dibujado (main.ts:241-259). La vista lee el estado actual de Rapier.
- **Materiales (materials.ts).** mat() guarda en caché MeshStandardMaterial por color, rugosidad, emisivo, mapa y metal (materials.ts:6-21). ownMat crea materiales no compartidos (materials.ts:24-26). PALETTE en materials.ts:28-49.
- **Texturas (textures.ts).** Generadas en canvas con semilla, en caché, sRGB, repetidas y con anisotropía 8 (textures.ts:10-37). worldUV hace una proyección por caras (textures.ts:164-176). También windowsTex, signTex y awningTex.
- **Efectos (fx.ts).** Polvo, anillo, estrellas, confeti, sudor y texto (sprite de canvas). Cada partícula lleva su propio material (fx.ts:22, 51, 60, 71) y se libera al morir (fx.ts:118-124).
- **Coches (carView.ts).** Carrocería RoundedBox con contorno de casco invertido (carView.ts:19-31), ruedas que giran, cabeceo al frenar y luz de freno con ownMat (carView.ts:43, 65-66).

**PERSONAJES**
- world.ts:104 crea un DollView para cada humano y un CarrierView (caricaturas con contorno: abuelas, gordo, alien, enano, perro; carrierView.ts:106-249) para cada ayudante.
- **DollView (dollView.ts:43-257).** Adapta el Carrier (cápsula de radio 0,32 y semialtura 0,33, rotación bloqueada; carrier.ts:7-9 y 130-142) a la interfaz DollSource (dollRig.ts:14-35).
  - Calcula el estado: idle, walking, grabbing, pulling, losingBalance, falling, recovering (dollView.ts:131-152).
  - Calcula el esfuerzo a partir de la tensión del agarre (dollView.ts:121-129).
  - Calcula la inclinación total: desequilibrio físico más colgarse hacia atrás o adelantarse (dollView.ts:159-161).
  - Sintetiza la pose tumbada: giro de 1,45 rad alrededor de los pies hacia freeFallDir (dollView.ts:115-145, 224-241), mientras la cápsula sigue de pie.
  - Consulta el suelo con un rayo solo contra la geometría fija (dollView.ts:103-108).
  - Calcula visOff con pushOut (dollView.ts:168-171, 202-218): proyecta 5 esferas del tronco y la cabeza contra los colisionadores del sofá y desplaza en horizontal todo el grupo hasta 0,2 m de pie o 0,6 m tumbado, salvo agarrando. Aro, etiqueta y estrellas se desplazan con él (dollView.ts:174-181).
- **CharacterRig (dollRig.ts:101-689).**
  - Proporciones (DIM, dollRig.ts:68-74): cadera a 0,41 m, muslo y espinilla de 0,165 m, hombros a 0,83 m, cuello a 0,93 m, cabeza de torno de 0,55 m (dollRig.ts:179) y gorra de radio 0,336 (dollRig.ts:211). Medido: 1,58 m de alto con gorra frente a 1,30 m de la cápsula; cabeza 0,64 m (40 %); tronco de radio máximo 0,359 m (dollRig.ts:157-158).
  - Cara: ojos esferoides de 0,05×0,075 con brillo, colocados a 0,245 m sobre el cuello (mitad inferior de la cabeza). Cejas de cápsula de 0,013 m de radio, colorete, nariz, mechones y boca que solo sale en apuros (dollRig.ts:181-206).
  - Manos: manoplas de esfera escalada con pulgar (dollRig.ts:235-242).
  - Pies: botas con suela RoundedBox (dollRig.ts:244-251).
  - Brazos y piernas: tubos FlexTube que se regeneran cada fotograma (tube.ts:7-80) con IK de dos huesos que estira sin límite (tube.ts:83-97).
  - Sombra de contacto: una textura de canvas por muñeco (dollRig.ts:257-265).
  - Sincronía (sync, dollRig.ts:316-542):
    - La raíz va en los pies de la cápsula (p − CENTER_Y), con el giro limitado a 7,5 rad/s y la inclinación del tronco de hasta 1,2 rad (dollRig.ts:327-347).
    - El planificador de pasos coloca cada pie donde estará la cadera, con suela muestreada por 9 rayos y corrección de hundimiento (dollRig.ts:302-314, 396-459, 550-633).
    - La pelvis se mece y el tronco se aplasta con muelle (dollRig.ts:358-379).
    - Tumbado, tobillos y manos son partículas Verlet atadas a cadera y hombros (dollRig.ts:386-393, 646-688).
    - Brazos: al agarre (con temblor de esfuerzo), molinillo al tambalearse, balanceo al andar (dollRig.ts:463-492).
    - Cabeza: anticipa los giros y mira a cámara cuando sufre (dollRig.ts:494-507).
    - Cara: parpadeo, cejas y ojos según esfuerzo o susto (dollRig.ts:509-528).

**SOFÁ (src/view/sofaView.ts)**
- group recibe la transformación física (sofaView.ts:136-138). inner es el hijo deformable.
- Piezas:
  - Base, respaldo y brazos: RoundedBox de 3 segmentos con tela de canvas y contorno de casco invertido (sofaView.ts:15-19, 39-58).
  - Zócalo de madera y vivos.
  - 6 cojines con botones capitoné (sofaView.ts:63-79) y 2 cojines decorativos que indican hacia dónde mira (sofaView.ts:81-88).
  - 6 asas de cincha en los SLOTS: rojo en el respaldo, azul en el asiento, amarillo en los extremos (sofaView.ts:91-106).
  - 4 parches de cinta que aparecen al perder integridad (sofaView.ts:108-116, 166-167).
  - Aro rojo de aviso de vuelco (sofaView.ts:118-120, 168-171).
- Animación:
  - Los cojines se desplazan al revés de la aceleración, solo en fotogramas con paso de física (sofaView.ts:142-158).
  - Aplastamiento con muelle al golpear, de ±18 % en Y (sofaView.ts:126, 160-165).

**MEDIDAS (Playwright y SwiftShader, 1280×720, dpr 1)**

| Medida | 2 jugadores | 4 jugadores |
|---|---|---|
| Llamadas de dibujo, pasada principal | 233 | 331 |
| Triángulos | 71,6 k | 100,6 k |
| Mallas | 514 | 626 |
| Materiales únicos | 274 | 330 |
| Geometrías | 480 | 590 |
| Geometrías en GPU | 325 | 420 |
| Texturas | 20 | 21 |
| Programas | 13 | 13 |
| Mallas proyectoras de sombra | 246 | 294 |

- Las llamadas de la pasada de sombras no están incluidas: renderer.info se reinicia después de shadowMap.render (three/src/renderers/WebGLRenderer.js:1606-1612).
- Reparto de llamadas (2J): muñecos 94 (47 cada uno), sofá 54, nivel 81.
- Nivel: 229 mallas, 188 materiales y 157 mallas con material único.
- Confeti tras la victoria: 71 mallas con 71 materiales.
- CPU de simulación y vista sin GPU: 0,87 ms por fotograma con 2J y 1,26 ms con 4J.

Scripts de medición (fuera del repositorio): /tmp/claude-0/-home-user-Game-development/1374a132-0d8e-53e9-9475-ac1ed6b0fb3f/scratchpad/tools/measure.cjs, measure2.cjs, measure3.cjs y measure4.cjs. Capturas en /tmp/claude-0/-home-user-Game-development/1374a132-0d8e-53e9-9475-ac1ed6b0fb3f/scratchpad/out, out2 y out3.

## Acoplamientos (12)

| Dónde | Qué | Impacto |
|---|---|---|
| src/view/world.ts:18, 103, 113-116 | Un único SofaView como campo de WorldView, sincronizado con game.sofa, game.integrity y game.sofaUp; cada porteador calcula su agarre con grabWorld(game.sofa). | No hay lista de objetos transportables. Para cajas, sillas, nevera o piano hace falta un ItemView genérico por ItemDef y que el agarre devuelva el objeto y el punto. |
| src/view/world.ts:128-146 | La cámara apunta al sofá (75 %) y la media de humanos (25 %); el zoom depende de la distancia máxima de los porteadores al sofá, con tope en camDist 1,6. | Con 4 jugadores repartidos entre varios objetos, quien se aleje más de unos 10 m del sofá sale de cuadro y no hay indicador fuera de pantalla. Hace falta un encuadre por caja envolvente de jugadores y objetos activos. |
| src/view/world.ts:166-172, 186-190 | La oclusión usa como puntos el sofá y los humanos, y las reglas fadeRule reciben la posición del sofá (s.x, s.y, s.z). | Los objetos nuevos no despejan paredes. Las reglas (NEAR_DOOR, pared con y > 1,6) solo valen para este edificio. |
| src/view/world.ts:59, levelView.ts:4, 38, 57-114, 99-102, 428 | buildLevel() se llama una vez en el constructor e importa LEVEL, STAIRS, FLOOR2, ZONE, DOOR, RAMP y PED_LIGHT. Las balizas NEXT están escritas por etapa, los árboles junto a la ruta con claves de texto ('-6,7'…), y camión, semáforos, casa y fachada son funciones a medida. | No hay carga ni descarga de niveles ni liberación de memoria de vídeo del nivel. Cada nivel nuevo necesita su propio levelView. Conviene describir el nivel con datos (GLB y JSON) y un LevelView genérico. |
| src/view/world.ts:120-122 | El aviso «¡ATASCO!» sale sobre game.sofaPos y la zona de entrega se activa con game.stage >= 5 (índice de etapa de este recorrido). | Lógica de presentación atada a las etapas de un solo recorrido. La entrega en camión con progreso necesita eventos por objeto. |
| src/view/doll/dollView.ts:64, 185-218, 224-241; world.ts:104 | DollView recibe game.sofaColliders; pushOut, sofaDepth y freeFallDir solo consideran el sofá. | El desplazamiento visual habría que extenderlo a cada objeto, pero no debería existir (va contra la regla del usuario). Lo correcto es quitarlo, no generalizarlo. |
| src/view/sofaView.ts:4, 36-58, 91-106 | La geometría sale de las constantes SOFA y SLOTS de sim/sofa.ts; las cinchas se colocan en los SLOTS de los ayudantes de la máquina. | Cada mueble nuevo sería otra clase hecha a mano de unas 170 líneas y unas 50 llamadas de dibujo. Mejor un modelo GLB más un ItemDef con colisionadores y asas como datos. |
| src/view/carrierView.ts:7; dollView.ts:4, 12-20, 65-67; ui/hud.ts:3, 36 | Hay tres tablas separadas de 4 entradas: PLAYER_COLORS (aro, etiqueta, HUD), PLAYER_LOOKS (peto y gorra) y PLAYER_NAMES. DollView importa colores de la vista de los ayudantes. | Los colores no coinciden (J1 rojo con aro amarillo; J4 verde oliva con aro lima) y no hay una sola fuente de identidad de jugador (color, sombrero, forma). |
| src/view/world.ts:104; carrierView.ts (601 líneas); doll/* | Dos sistemas de personaje en paralelo según c.human: muñeco procedural sin contorno para humanos y caricaturas con contorno para ayudantes. | Duplican mantenimiento y estilo, y docs/quality/ART_DIRECTION.md pide contorno en personajes. Para hasta 4 humanos conviene un solo CharacterView, y los ayudantes, si se quedan, como variantes de piel. |
| src/view/doll/dollRig.ts:3, 68-75, 339; dollView.ts:113, 144 | El muñeco usa CENTER_Y de sim/carrier y sus propias medidas (DIM), que no derivan del colisionador. | Cambiar la cápsula (para que el dibujo quepa) obliga a retocar las medidas a mano. Las proporciones deberían salir de un único perfil físico y visual. |
| src/main.ts:120, 19 | La ayuda de teclas es para 2 jugadores en un teclado (WASD y flechas); J3 y J4 solo con mando. Mayús se usa para «alzar». | Para 4 jugadores locales la vista debe mostrar la acción contextual de cada jugador (aviso sobre el muñeco, icono de botón) en vez de depender de la leyenda inferior. |
| src/main.ts:241-259; src/view/sofaView.ts:141 | Paso fijo de 1/60 sin interpolar; todas las vistas leen la pose actual de Rapier. | Al añadir objetos dinámicos y 4 jugadores en pantallas de 120/144 Hz, todo da tirones. Hace falta un búfer de estado anterior y actual por cuerpo y dibujar con alpha. |

## Defectos (15)

| Gravedad | Título | Dónde | Evidencia |
|---|---|---|---|
| critical | visOff desplaza el muñeco entero para esconder penetraciones y contradice la cápsula física (lo prohíbe el usuario) | src/view/doll/dollView.ts:31-33, 56-62, 168-171, 174-181, 202-218 | pushOut busca el desplazamiento horizontal que saca del sofá el tronco y la cabeza dibujados y lo aplica a todo el grupo: pies, sombra de contacto, aro, etiqueta y estrellas. Tope de 0,2 m de pie y 0,6 m tumbado. Medido:<br>- Empujando el sofá con el cuerpo sin agarrarlo: visOff ≈ 0,10 m sostenido en 83 de 90 fotogramas, con la cápsula sin penetrar (≤ 0,027 m transitorio).<br>- Con desequilibrio de 0,65 rad hacia el sofá: haría falta 0,82 m, se recorta a 0,20 m y el tronco sigue dentro del sofá (captura tambaleo-sofa.png).<br>- Tumbado: 0,04–0,12 m.<br>El README.md:82 y 172 lo documenta como solución. |
| major | El volumen dibujado no cabe en el físico: más alto, más ancho, inclinación y pose tumbada solo visuales | src/view/doll/dollRig.ts:68-74, 157-158, 179, 211, 334-347; src/view/doll/dollView.ts:133-145, 159-161; src/sim/carrier.ts:8-9 | Es la causa raíz de visOff.<br>- Muñeco de 1,58 m con gorra frente a cápsula de 1,30 m.<br>- Tronco de radio 0,352–0,359 frente a 0,32.<br>- Inclinación visual de hasta 1,2 rad alrededor de los pies; la cápsula no se inclina.<br>- Tumbado, el cuerpo se dibuja girado 1,45 rad (hasta unos 1,5 m del eje) mientras la cápsula sigue de pie en el sitio. Se puede caminar o pasar el sofá sobre el «cuerpo» tumbado. |
| major | La dirección de caída dibujada no es la simulada y la oclusión mira donde no está el cuerpo | src/view/doll/dollView.ts:115-119, 224-241; src/view/world.ts:171-172 | DollView elige freeFallDir, una dirección libre distinta de c.fallDir. Medido: simulación (−1,0; 0), dibujo (−0,07; −1,0), es decir, unos 86° de diferencia. fadeOccluders añade el punto del cuerpo tumbado con c.fallDir de la simulación, no con la dirección dibujada, así que puede no despejar la pared que tapa el cuerpo visible. |
| major | Piernas de goma de varios metros: no hay estado en el aire y la reaparición no recoloca los pies | src/view/doll/dollRig.ts:396-421, 550-633; src/view/doll/dollView.ts:91, 103-108; src/view/doll/tube.ts:88-89; src/sim/game.ts:335 | El muñeco nunca lee c.grounded y planSteps pega las botas al suelo bajo la cápsula. Medido:<br>- Cápsula elevada 1,5 m: cadera–tobillo de 1,79 m (normal 0,29) mientras cae (captura en-el-aire.png).<br>- Tras un teleport como el de game.ts:335: 2,65 m durante unos 0,4 s.<br>- En un recorrido normal con piloto: el 14 % de los fotogramas por pie supera 0,45 m, con máximo de 1,18 m (al arrancar, los pies se quedan atrás).<br>- Si el suelo está a más de 2,3 m bajo los pies, heightAt devuelve footY y las botas flotan.<br>snap() solo se llama en el constructor. twoBone estira sin límite. |
| major | Caras ilegibles desde la cámara de juego: la gorra tapa los ojos | src/view/doll/dollRig.ts:185-202, 208-215, 494-528; src/view/world.ts:150 | Rayo desde la cámara a cada ojo en recorridos completos (muestreo cada 4 fotogramas):<br>- 2J: algún ojo visible el 63 % y el 4 % del tiempo.<br>- 4J: 0, 65, 96 y 2 %.<br>- El principal oclusor es la propia gorra (más del 95 % de los bloqueos).<br>- Muñeco quieto mirando de frente a la cámara (62° de elevación): ambos ojos tapados por la gorra (capturas cara-1280.png y cara-1920.png).<br>- Cuando se ven: cabeza de 54–77 px de ancho, ojos de unos 8×10 px y cejas de unos 2 px de grosor a 720p.<br>Los ojos están a 0,245 m de 0,55 de cabeza (mitad inferior), contra docs/quality/ART_DIRECTION.md, que pide mitad superior y visera que no tape. Además, en el recorrido la mitad de los porteadores da la espalda a la cámara (se camina hacia −z). |
| major | Identificación de 4 jugadores solo por color e incoherente | src/view/carrierView.ts:7; src/view/doll/dollView.ts:12-17, 67-73; src/ui/hud.ts:36 | - Los 4 tienen la misma silueta (gorra de visera); solo cambian colores de peto, gorra y pelo.<br>- El aro, la etiqueta y el HUD usan PLAYER_COLORS: J1 amarillo con peto rojo, J4 lima con verde oliva.<br>- El README.md:26 lo documenta («peto rojo, aro amarillo»).<br>- J1 rojo choca con el rojo de peligro (#ef4444) y con las cinchas rojas del sofá.<br>- Rojo y verde (J1 y J4) es mala pareja para daltonismo.<br>- Con 4 alrededor del sofá, los aros se solapan o quedan tapados.<br>- No hay indicadores fuera de pantalla.<br>ART_DIRECTION pide un sombrero distinto por jugador y el mismo tono en peto, sombrero y aro. |
| major | Coste de dibujo del muñeco y del sofá impide escalar a 4 jugadores y muchos objetos | src/view/doll/dollRig.ts:79-80, 143-253; src/view/sofaView.ts:15-19, 39-47 | - Por muñeco: 48 mallas, 47 llamadas en la pasada principal, más 24 proyectores de sombra, 24 materiales nuevos (rubber() y cloth() crean un material en cada llamada), 48 geometrías sin compartir (ni entre los dos ojos) y 14,4 k triángulos (gorra de 40×20 segmentos, cuello de 10×40).<br>- Con 4J, los muñecos suman 188 llamadas y 57,6 k triángulos.<br>- El sofá: 54 llamadas y 18 k triángulos (RoundedBox de 3 segmentos y contorno duplicado por pieza).<br>- Total 4J: 331 llamadas más la pasada de sombras. |
| major | Sin interpolación entre pasos de física: tirones a más de 60 Hz | src/main.ts:241-259; src/view/sofaView.ts:141-146 | main.ts avanza con paso fijo de 1/60 y dibuja el estado actual. Con 120/144 Hz hay fotogramas sin paso (sofaView.ts:141 lo reconoce) y, con fotogramas largos, saltos de 2 a 5 pasos. |
| minor | El babero pone a DoubleSide el material compartido del peto | src/view/doll/dollRig.ts:158-171, 221 | `(bib.material).side = DoubleSide` modifica `over`, que comparten el torno del peto, los tirantes, las perneras y las piernas FlexTube. Todo el peto se dibuja a doble cara. |
| minor | Las manos se hunden en el objeto y saltan sin transición al agarrar o soltar | src/view/doll/dollRig.ts:470-473, 489-491 | La mano va al punto de agarre ±0,14 m en lateral y la manopla se adelanta otros 0,06 m a lo largo del antebrazo, hacia dentro del objeto. No hay suavizado: el brazo cambia de colgar al asa en un fotograma. No hay pose de mano cerrada. |
| minor | Fugas de memoria de vídeo al reiniciar | src/view/doll/dollRig.ts:257-263; src/view/doll/dollView.ts:243-256; src/view/carView.ts:43; src/view/world.ts:99 | - La textura de canvas de la sombra de cada muñeco no se libera: dispose solo libera el mapa de la etiqueta.<br>- El material de freno de cada coche (ownMat) no se libera: attach solo libera geometrías. |
| minor | Fusión estática gigante y fadeables con material propio | src/view/levelView.ts:48, 149-173, 273-279, 381-385; src/view/world.ts:194-198 | - mergeStatic produce mallas del tamaño del nivel: el recorte por frustum no sirve y todo el nivel pasa por la pasada de sombras.<br>- 64 fadeables y 157 mallas del nivel tienen material único (ownMat o clone()).<br>- Los edificios multimaterial no se funden.<br>- Al recortar paredes con scale.y, la textura de UV del mundo se aplasta. |
| minor | Efectos con un material por partícula | src/view/fx.ts:22, 33, 51, 60, 71 | dust y puff clonan dustMat; stars, confetti y sweat crean un MeshBasicMaterial por partícula. Medido: 71 mallas con 71 materiales tras la victoria. |
| minor | Sombra que parpadea y temblor de cámara que depende de la tasa de fotogramas | src/view/world.ts:152, 155-156 | La cámara de sombra sigue al objetivo de forma continua, sin ajustarse a la rejilla de texeles (unos 2,5 cm por texel). El temblor suma Math.random() en cada fotograma sin depender de dt. |
| minor | Los contadores de render infravaloran el coste | src/main.ts:312; node_modules/three/src/renderers/WebGLRenderer.js:1606-1612 | renderer.info se reinicia después de shadowMap.render, así que __mudanza.renderInfo() no cuenta las llamadas de sombra (hasta 246/294 mallas proyectoras). |

## Recomendaciones (11)

1. P0 · Quitar visOff y pushOut, y hacer que el dibujo quepa en el cuerpo físico.<br>- Ajustar el perfil del personaje: o cápsula de radio de unos 0,36 m y altura de unos 1,5 m, o muñeco estrechado a ≤ 0,30 m de tronco y unos 1,3 m de alto, como pide ART_DIRECTION. Las medidas DIM deben derivar de ese perfil (dollRig.ts:68-74, carrier.ts:8-9).<br>- Limitar la inclinación visual a lo que la cápsula admite (≤ 0,25 rad cerca de obstáculos), o hacerla física con un colisionador de pecho y cabeza que se mueva con la inclinación.<br>- Para la caída, decidir la dirección en la simulación (comprobar espacio libre allí) y cambiar el colisionador a tumbado, de modo que dibujo, oclusión (world.ts:172) y física coincidan.<br>- Borrar dollView.ts:31-33, 168-171 y 202-218. Medir la penetración del dibujo con scripts/sofa-contact-check.cjs como prueba de regresión.
2. P0 · Corregir las piernas de goma.<br>- Añadir el estado 'airborne' (leer c.grounded y la velocidad vertical): los pies cuelgan bajo la cadera con una pose de caída.<br>- Llamar a rig.snap() cuando la cápsula salte más de 1 m entre fotogramas (teleport de game.ts:335).<br>- Limitar el estiramiento de twoBone a ~1,15× la longitud de la pierna y forzar un paso cuando se supere.<br>- Que heightAt no devuelva footY sin suelo, sino «sin apoyo».
3. P0 · Caras legibles a 53–62°.<br>- Subir los ojos a la mitad superior de la cabeza y agrandarlos 1,6–2× (≥ 16 px a 720p).<br>- Cejas de ≥ 0,04 m.<br>- Gorra más pequeña o echada atrás, y que la visera nunca cruce la línea cámara–ojo; validarlo con un rayo como el de measure3.cjs en una prueba.<br>- Cara como textura atlas con expresiones (1 material, cambio de UV) en vez de 10 mallas.<br>- Inclinar la cabeza hacia la cámara de forma permanente (0,2–0,3 rad) y girarla al celebrar o sufrir.
4. P1 · Identidad de 4 jugadores desde una sola tabla PlayerStyle (color, sombrero, forma del marcador, nombre), usada por muñeco, aro, etiqueta y HUD.<br>- Sombrero distinto por jugador, según ART_DIRECTION: gorra, gorro con pompón, pañuelo, casco.<br>- Paleta apta para daltonismo y que no choque con el rojo de peligro.<br>- Forma dentro del aro (●▲■◆).<br>- Contorno o luz de borde del color del jugador.<br>- Flecha en el borde de la pantalla para quien sale de cuadro.
5. P1 · Pipeline GLB para el personaje.<br>- Un SkinnedMesh por personaje de ≤ 4–5 k triángulos y 1 material (atlas de paleta o colores de vértice); sombreros como mallas rígidas en el hueso de la cabeza.<br>- Clonar con SkeletonUtils.clone para compartir geometría; cambiar solo el tinte o el atlas por jugador.<br>- Objetivo: 2–3 llamadas por jugador, frente a las 47 de ahora.<br>- Conservar la capa procedural actual escribiendo rotaciones de hueso después de AnimationMixer.update: planificador de pasos, IK de dos huesos, equilibrio y extremidades Verlet. La firma sync(DollSource) ya está pensada para eso (dollRig.ts:46).<br>- Cargar con GLTFLoader + MeshoptDecoder (three/examples/jsm/libs/meshopt_decoder.module.js) y opcionalmente KTX2Loader.<br>- Precompilar con renderer.compileAsync antes de la partida.
6. P1 · Pipeline GLB para muebles y niveles.<br>- Un GLB por ItemDef. Los colisionadores son datos (cajas y cápsulas, nunca la malla) y las asas son nodos vacíos con nombre.<br>- Al cargar, fundir las piezas de cada objeto por material (1–3 llamadas por objeto).<br>- Para objetos repetidos (cajas, sillas), una InstancedMesh por tipo con setMatrixAt en cada fotograma desde Rapier.<br>- Reasignar los materiales del GLB por nombre a la caché compartida mat() (paleta mate, sin metal, mapas en sRGB) para que N objetos compartan M materiales.<br>- Sombra solo en la pieza principal; sombra de contacto para lo pequeño.<br>- Contorno: casco invertido hecho en Blender (Solidify) con un único material de contorno compartido, o un pase de bordes a pantalla completa para todo.<br>- Niveles: un GLB por nivel, fundido por material en trozos de unos 10 m para que funcione el recorte por frustum y por cámara de sombra; fadeables con nombre (fade_cut_*, fade_hide_*) y material compartido (recorte por plano o uniforme); liberar todo al cambiar de nivel.
7. P1 · Generalizar WorldView.<br>- items: ItemView[] en lugar de sofa.<br>- Agarre que devuelva el objeto y el punto.<br>- Oclusión y cámara sobre la caja envolvente de jugadores y objetos activos, con zoom acotado.<br>- LevelView creado por nivel a partir de datos (balizas, fadeRules, decoración) y con dispose.<br>- Un solo CharacterView para humanos; los ayudantes, si se quedan, como pieles.<br>- Animación del camión y del progreso de entrega basada en eventos por objeto.
8. P1 · Interpolación de render: guardar la pose anterior y actual de cada cuerpo en Game.step y dibujar con alpha = acc/DT (main.ts:241-259). Es imprescindible con más cuerpos dinámicos y en pantallas de 120/144 Hz.
9. P2 · Animaciones nuevas, con su estado en DollSource y clips de Blender con máscara de tronco superior:<br>- celebrar: al entregar en el camión y al acabar el nivel;<br>- frustración: al romper o dañar (cabezazo, brazos al cielo);<br>- empujar con el cuerpo: manos apoyadas en el objeto cuando hay contacto sin agarre;<br>- alzar: anticipación en cuclillas y extensión; sustituiría la Mayús que no se entiende por una acción contextual visible;<br>- recolocar el agarre: transición suave de manos;<br>- resbalar: pie que se va y brazos;<br>- impacto o atropello: pirueta como en carrierView.ts:390-397;<br>- en el aire, aterrizaje, objeto frágil en brazos e idle con variaciones.<br>Añadir también suavizado de manos al agarrar y soltar, y manopla cerrada.
10. P2 · Presupuestos y medición.<br>- Presupuestos a 1080p: ≤ 150 llamadas en la pasada principal más ≤ 100 de sombra, ≤ 250 k triángulos, ≤ 3 llamadas por jugador y por objeto.<br>- Contar las llamadas de sombra en renderInfo (info.autoReset = false y reinicio manual).<br>- Prueba en navegador que falle si se superan.<br>- Fx con materiales compartidos o InstancedMesh para el confeti.<br>- Sombra ajustada a la rejilla de texeles y temblor de cámara basado en dt.
11. P3 · Correcciones pequeñas:<br>- No mutar side del material compartido del peto (dollRig.ts:160-161).<br>- Liberar la textura de sombra del muñeco y el material de freno de los coches.<br>- Que el aplastamiento del sofá no crezca por encima de su colisionador (escala Y ≤ 1).<br>- Valorar NeutralToneMapping o AgX en lugar de ACES para que los colores de jugador no se desplacen.
