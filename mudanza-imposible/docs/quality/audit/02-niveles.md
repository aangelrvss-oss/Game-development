# Auditoría 2/6 — Niveles y contenido

> Informe íntegro del agente `audit:niveles` (flujo `wf_9501e555-672`, 19-10-2026, solo lectura sobre el commit `08547f8` + documentos). Transcripción literal de su salida estructurada: no está resumido ni corregido. Las afirmaciones son del agente; su verificación está en `../QUALITY_STATE.md` y `08-verificacion.md`.

## Resumen

El nivel es un único recorrido fijo (patio, calle, portal, escalera, piso de arriba, rampa y camión). Se construye al importar `src/sim/level.ts`: `span`/`slope` (level.ts:35-63) escriben en un array de módulo (level.ts:32) que se exporta como el singleton `LEVEL` (level.ts:124). Alrededor hay constantes sueltas de instancia única: `DOOR`, `STAIRS`, `TERRACE`, `RAMP`, `ZONE`, `SOFA_START`, `PED_LIGHT` y `FLOOR2` (level.ts:30-155), además de `PROPS` (props.ts:23) y `LANES`/`LIGHT`/`X_LIMIT` (traffic.ts:7-15).

El mismo camino del sofá está descrito cuatro veces, en listas paralelas acopladas por índice o por nombre: `ROUTE` (11 puntos, level.ts:129), `STAGES` (7 etapas con funciones, level.ts:144), `CHECKPOINTS` (7 puntos, game.ts:47) y `NEXT` (6 puntos, levelView.ts:99). A eso se suma el literal `stage >= 5` (world.ts:122).

En la vista, unas 330 de las 679 líneas de `levelView.ts` dibujan ese barrio concreto con coordenadas literales. Lo genérico sí se puede reutilizar: `mergeStatic`, `boxMesh`/`kindLook`, `fadeables`, la baliza, el tejado, los árboles, los edificios, el semáforo y el camión, estos tres últimos con su posición como parámetro. También son reutilizables la biblioteca de objetos de `decor.ts` y las cachés de `textures.ts`/`materials.ts`.

Estado de partida: `tsc --noEmit` sin errores y las 29 pruebas de vitest en verde. Pero las pruebas y los scripts e2e usan coordenadas del nivel actual: el patio en z=10, el carril en z=-1,6 y la valla en x=7,8. Por eso este recorrido tiene que conservarse como `LevelDef` de referencia.

Para llegar a 4 niveles, varios objetos y 4 jugadores conviene: reunir esas listas en un `LevelDef` de datos, sustituir las funciones (`STAGES.reached`, `NEAR_DOOR`, la regla y>1,6) por regiones como datos, y convertir el tráfico y el camión en instancias configurables. Además hay que añadir a la vista la liberación de recursos (`dispose`) y el cambio de nivel.

## Arquitectura

FLUJO GENERAL
- La simulación (`src/sim/`, sin Three) se construye al importar `level.ts`:
  - `span()` (level.ts:35) y `slope()` (level.ts:43) añaden cajas `Box` (level.ts:14-28) al array de módulo `boxes` (level.ts:32).
  - Los objetos con `hit` de `PROPS` se añaden como cajas de kind `prop` (level.ts:122).
  - El resultado se exporta como `LEVEL` (level.ts:124).
- `Game.build()` (game.ts:103-145):
  - Crea un cuerpo fijo de Rapier por cada caja sólida. El roce depende del kind: rampa 0,15 con regla Min, escalera 0,9 y el resto 0,6 (game.ts:108-115).
  - Crea el sofá en `SOFA_START` (game.ts:117).
  - Coloca a los porteadores alrededor de las asas del sofá (game.ts:124-131).
  - Crea siempre 6 coches en 2 carriles fijos (game.ts:136-144).
- `Game.afterStep()`:
  - Avanza las etapas con `STAGES[i].reached(sofa)` (game.ts:341-344).
  - Gana cuando el sofá reposa 1 s dentro de `ZONE` (game.ts:354-356).
  - Hace reaparecer el sofá en `CHECKPOINTS[stage]` (game.ts:388-399).
  - Devuelve a los porteadores junto al sofá si se alejan más de 22 m (game.ts:333-336).
- La vista (`WorldView`):
  - Llama a `buildLevel()` una sola vez, en el constructor (world.ts:59).
  - Cada fotograma llama a `level.update(t, light, stage>=5, stage, sofaPos)` (world.ts:122).
  - `fadeOccluders` (world.ts:165-200) lanza rayos desde la cámara al sofá y a los humanos contra `level.fadeables` y aplica las reglas `userData.fadeRule`.
- La interfaz (`hud.ts`):
  - Dibuja la tira de etapas a partir de `STAGES` (hud.ts:233).
  - Muestra el aviso de la escalera (hud.ts:285).
  - Muestra el semáforo cuando el sofá está en z∈(-12,7) (hud.ts:297).
- `main.ts` repite esa región de calle en tres sitios (main.ts:185, 254, 295).
- El piloto automático sigue `ROUTE` (autopilot.ts:55-67) y alza cuando `label==='Escalera'` (autopilot.ts:82).

CONSTANTES GLOBALES Y DÓNDE SE CONSUMEN
- `LEVEL` (level.ts:124):
  - colisiones en game.ts:108;
  - dibujo en levelView.ts:60;
  - prueba de datos en sim.test.ts:201-202.
- `FLOOR2` (level.ts:30):
  - level.ts:97-106 y 149;
  - `CHECKPOINTS` en game.ts:52-53;
  - `NEXT` en levelView.ts:100;
  - decor.ts:359-363 y levelView.ts:330-334 (cuadros y cartel);
  - sim.test.ts:208-210.
- `DOOR` (level.ts:85):
  - fachada en level.ts:86-88;
  - `NEAR_DOOR` en levelView.ts:38;
  - marco, escaparates y cornisa en levelView.ts:282-325;
  - portal en decor.ts:335;
  - `NEXT` en levelView.ts:100;
  - pruebas en sim.test.ts:77-92.
  - `STAGES` NO usa `DOOR.z`: repite el literal -13.5 (level.ts:147).
- `STAIRS` (level.ts:91):
  - pendiente en level.ts:95;
  - `needsLiftAtStairs` en game.ts:160;
  - peldaños en levelView.ts:239-255;
  - alfombra y pasamanos en decor.ts:347-354;
  - `NEXT` en levelView.ts:100.
  - `STAGES` repite el literal -22 (level.ts:148).
  - No define ni x ni ancho: -1.4..1.4 y 2.8 son literales en level.ts:92-95, levelView.ts:246 y decor.ts:352.
- `TERRACE` (level.ts:105): exportada y sin ningún uso.
- `RAMP` (level.ts:108):
  - pendiente en level.ts:109;
  - etapa en level.ts:150;
  - `CHECKPOINTS` en game.ts:53;
  - `NEXT` en levelView.ts:100;
  - sim.test.ts:208-214.
- `ZONE` (level.ts:117):
  - caja `zone` en level.ts:118;
  - etapa 'Camión' en level.ts:151;
  - victoria en game.ts:354;
  - `addZone` en levelView.ts:657-679;
  - `NEXT` en levelView.ts:101.
- `ROUTE` (level.ts:129): solo autopilot.ts:5, 55, 67 y 82. El campo `Waypoint.y` (level.ts:127) nunca se lee.
- `STAGES` (level.ts:144):
  - game.ts:151 y 341-343;
  - hud.ts:2 y 233;
  - sim.test.ts:179, 352 ('Arriba') y 373;
  - scripts por `stageLabel` (smoke.cjs:23, doll-check.cjs:81).
- `SOFA_START` (level.ts:154):
  - game.ts:117;
  - literal z=10 en duo-e2e.cjs:248 y 273.
- `PED_LIGHT` (level.ts:155): solo levelView.ts:577. El segundo semáforo está en `(-PED_LIGHT.x, -9.6)`, con literal (levelView.ts:578).
- `PROPS` (props.ts:23):
  - colisiones en level.ts:122;
  - dibujo en decor.ts:373.
- `LANES`/`CAR`/`X_LIMIT`/`LIGHT`/`LIGHT_PERIOD`/`CAR_COLORS` (traffic.ts:6-26):
  - `Car` (traffic.ts:36, 46-47);
  - `stepTraffic` (traffic.ts:59-95);
  - game.ts:8, 136-147 y 233;
  - líneas de detención en levelView.ts:518-522;
  - carView.ts:3 y 33-48;
  - pruebas en sim.test.ts:9 y 98-101.
  - `lightAt(clock)` es un ciclo global que consumen `Game.light` (game.ts:147), `level.update` (world.ts:122), el piloto (autopilot.ts:62), main.ts:185 y 254, y hud.ts:298.

LEVELVIEW.TS: QUÉ SE PUEDE REUTILIZAR Y QUÉ ES DE ESTE NIVEL
- Reutilizable tal cual o casi:
  - `kindLook` (levelView.ts:13-29). Le falta un tema por nivel: hoy el suelo siempre es césped.
  - `boxMesh` (levelView.ts:40-55): UV en coordenadas del mundo, material propio si la caja se recorta y sombras por kind.
  - El bucle de cajas (levelView.ts:60-76).
  - La preparación de lo que se recorta, con su caja y su modo `cut`/`hide` (levelView.ts:65-72 y 91-95), junto con `WorldView.fadeOccluders` (world.ts:165-200).
  - `addBeacon` (levelView.ts:117-147).
  - `mergeStatic` (levelView.ts:149-173): agrupa por `material.uuid` y sombra, y respeta el conjunto `keep`.
  - `addRoof` (levelView.ts:175-192).
  - `tree` (levelView.ts:406-422).
  - El auxiliar `building` (levelView.ts:377-390).
  - `make` del semáforo (levelView.ts:551-576) y su `set` (levelView.ts:580-597).
  - `addZone` (levelView.ts:657-679), que recibe el rectángulo.
- Reutilizable si se parametriza:
  - `addStairs` (levelView.ts:239-255): asume x=0, ancho 2,8, sube hacia -z y 14 peldaños.
  - `addFence` (levelView.ts:218-237): solo vallas a lo largo de z.
  - `addRampStripes` (levelView.ts:257-270): solo rampas con giro en z (`rz`).
  - `addSkirting` (levelView.ts:194-199): y=0,07 fijo y solo si p.y<2,2.
  - `addTruck` (levelView.ts:600-655): posición fija en `cz=-30.25` y x de 28 a 36,5.
- Específico del nivel actual: unas 330 líneas.
  - `NEAR_DOOR` (levelView.ts:38).
  - La regla de las paredes y>1,6 (levelView.ts:70).
  - `NEXT` (levelView.ts:99-102).
  - `addCurbs` (levelView.ts:201-216).
  - `addFacadeDetails` (levelView.ts:272-337).
  - `addHouse` (levelView.ts:339-372).
  - La lista de `addNeighbourhood` (levelView.ts:391-403).
  - `addTrees`, con su lista y el conjunto `nearRoute` de cadenas «x,z» (levelView.ts:424-456).
  - `addStreetProps` (levelView.ts:458-523).
  - `addRooftopProps` (levelView.ts:525-547).
  - La colocación de los semáforos (levelView.ts:577-578).
  - Las llamadas en orden fijo dentro de `buildLevel` (levelView.ts:77-89).
- decor.ts:
  - La biblioteca de objetos es reutilizable: `cardboard` (decor.ts:38-51), el registro `build` (decor.ts:53-281), `bunting` (decor.ts:284-300), `checkerTex` (decor.ts:302-315) y `sconce` (decor.ts:318-323). Algunos servirán como transportables: cajas, sillón, lámpara.
  - Es de este nivel: `addDetails` (decor.ts:326-370, todo con coordenadas literales) y `addDecor`, que itera el `PROPS` global (decor.ts:372-381).
- Texturas y materiales: reutilizables y compartibles entre niveles.
  - `TEX`, con caché por clave y sin liberación (textures.ts:32-158).
  - `worldUV` (textures.ts:164-176).
  - `windowsTex`/`signTex`/`awningTex` (textures.ts:179-235).
  - `mat` con caché y `ownMat` sin compartir (materials.ts:241-261).
  - Falta un tema: hormigón y baldosa para el almacén, por ejemplo.

## Acoplamientos (19)

| Dónde | Qué | Impacto |
|---|---|---|
| src/sim/level.ts:32-40, 124 | El nivel se construye al importar el módulo: `span`/`slope` escriben en un array de módulo y se exporta un singleton `LEVEL`. | Solo puede existir un nivel por proceso. No se pueden cargar 4 niveles, cambiar de nivel en caliente ni probar varios a la vez en vitest. |
| src/sim/level.ts:85, 91, 105, 108, 117, 154, 155 | `DOOR`, `STAIRS`, `TERRACE`, `RAMP`, `ZONE`, `SOFA_START` y `PED_LIGHT` son constantes de una sola instancia: una puerta, una escalera, una rampa, una zona y un sofá. | La casa con varias habitaciones, el edificio con varios tramos y el almacén con varias rampas no se pueden expresar sin duplicar constantes ni código. |
| src/sim/level.ts:127-141; src/sim/autopilot.ts:5, 55, 67, 82 | `ROUTE` es una única ruta para el centro del sofá. El piloto decide alzar por la etiqueta (`label === 'Escalera'`) y no usa `Waypoint.y`. | No hay ruta por objeto. Las acciones dependen del texto de la etiqueta y las rutas de varios pisos no se distinguen. |
| src/sim/level.ts:144-152; src/sim/game.ts:151, 341-344; src/ui/hud.ts:2, 233 | `STAGES` son funciones `(x,y,z)` evaluadas solo con la posición del sofá y en orden lineal. | No hay lista de objetos ni progreso de carga. Las etapas no se pueden serializar ni validar, y la interfaz solo sabe pintar una tira lineal. |
| src/sim/game.ts:47-55; src/view/levelView.ts:99-102; src/view/world.ts:122 | `CHECKPOINTS` (7), `NEXT` (6) y el literal `stage >= 5` son paralelos a `STAGES` (7) por índice, con coordenadas repetidas (-30.6 y 25.5). | Si se toca una etapa, la reaparición, la baliza o el pulso de la zona se desincronizan sin ningún error. |
| src/sim/game.ts:117, 124-131 | El sofá nace en `SOFA_START` y los porteadores se colocan alrededor de sus asas (`SLOTS`). | La salida de los jugadores depende del sofá. Con varios objetos, o sin sofá, no hay dónde empezar. |
| src/sim/game.ts:157-163; src/ui/hud.ts:285 | `needsLiftAtStairs` usa `STAIRS` y `\|x\|<1.8`. El aviso dice «Escalera… Mayús (J1 la izquierda, J2 la derecha)». | El aviso de alzar existe solo para una escalera y dos jugadores con teclado. Hacen falta avisos por región, como datos del nivel. |
| src/sim/game.ts:354-356 | La victoria es «el sofá reposa 1 s en `ZONE` con y<1,6». | Hay un solo objeto, una zona en el suelo y nada de camión que se llena. |
| src/sim/traffic.ts:6-26, 36, 46-47, 59, 90; src/sim/game.ts:136-147 | Carriles, semáforo, límite de x y colores son globales. `Car` lee `LANES[lane]`. `Game` crea siempre 6 coches con `lane < 2` y posiciones literales. | Los niveles sin calle también simularían coches, y el nivel de calle no puede tener otros carriles, ciclos ni varios cruces. |
| src/sim/game.ts:232, 333-336 | Los coches solo frenan ante el sofá y los porteadores. Un porteador a más de 22 m del sofá se teletransporta junto a él. | Con varios objetos, un jugador que va a por una caja lejana sería devuelto junto al sofá, y los coches no verían las demás cargas. |
| src/ui/hud.ts:297; src/main.ts:185, 254, 295 | La región de la calle (`z<7 && z>-12`) está escrita a mano cuatro veces. | El semáforo de la interfaz, el aviso y el tictac sonarían en sitios sin sentido en otros niveles. |
| src/view/world.ts:59, 96-110 | `buildLevel()` se llama una vez en el constructor. `attach(game)` no reconstruye el nivel y no existe `dispose`. | No se puede pasar de un nivel a otro. Reconstruir el nivel dejaría en memoria de vídeo texturas de canvas, materiales propios y geometrías fundidas. |
| src/view/levelView.ts:35, 107-112 | La firma `update(t, light, zoneActive, stage, sofa)` está pensada para un sofá, un semáforo y un índice de etapa. | Habrá que cambiarla para pasar varios objetivos, un tráfico opcional y el progreso del camión. |
| src/view/levelView.ts:38, 69-70, 276; src/view/world.ts:166-190 | Las reglas de recorte son funciones (`NEAR_DOOR` y «pared si el sofá está a más de 1,6 m») y solo reciben la posición del sofá. | En un edificio de varias plantas, la regla y>1,6 recorta todas las paredes de todas las plantas. Las reglas no son datos del nivel. |
| src/view/levelView.ts:77-89, 201-547, 577-578, 600-655; src/view/decor.ts:326-370 | El barrio entero (casa, fachada, árboles, farolas, azoteas, camión, detalles) se dibuja con coordenadas literales. | Cada nivel nuevo obligaría a copiar estas funciones. Hay que separar los kits genéricos de los datos de colocación. |
| src/view/levelView.ts:13-29; src/view/world.ts:45-58 | `kindLook` y el entorno (cielo, niebla, sol) son fijos: el suelo es césped y el bloque, enlucido. | El almacén industrial y los interiores necesitan otra paleta y otra luz por nivel. |
| src/sim/level.ts:7-12; src/sim/game.ts:112-113 | `Kind` es una unión cerrada que mezcla aspecto y física (el roce sale del kind). | No se puede fijar el roce de una caja concreta (rampa de chapa, día de lluvia) sin inventar kinds nuevos. |
| src/sim/game.ts:13-16; src/main.ts:212-213; index.html:84, 99 | `RULES.timeLimit`/`parTime` son globales y los textos del menú y de los resultados describen este recorrido y este sofá. | No hay tiempo ni estrellas por nivel, y los textos quedarían falsos en los demás niveles. |
| tests/sim.test.ts:7, 52, 58, 77-92, 108, 122, 179, 201-214, 253-254, 326-341, 352, 356, 373; scripts/duo-e2e.cjs:239, 248, 273 | Las pruebas usan coordenadas de este recorrido: patio en z=10, carril en z=-1,6, valla en x=7,8, pared en x=18 y la etiqueta 'Arriba'. | El recorrido actual debe conservarse como `LevelDef` explícito (por ejemplo `TUTORIAL`) y pasarse a `Game`; si no, las 29 pruebas se rompen. |

## Defectos (15)

| Gravedad | Título | Dónde | Evidencia |
|---|---|---|---|
| major | El camión es un bloque macizo mientras la vista dibuja una caja de carga abierta | src/sim/level.ts:119; src/view/levelView.ts:600-638; src/sim/game.ts:354 | En la simulación, `span(28, 34, 0, 3.4, -33.5, -27, 'truck')` es un sólido desde el suelo hasta 3,4 m. La vista dibuja el suelo de carga a 1,3 m, «abierta por detrás», con cajas dentro. La entrega real es un rectángulo en el suelo delante del camión. Para «cargar el camión con progreso» hacen falta colisiones huecas (suelo, laterales, frente y techo, más una rampa o plataforma) generadas desde la misma definición que el dibujo. |
| major | Cuatro listas paralelas describen el mismo camino y van acopladas por índice | src/sim/level.ts:129-152; src/sim/game.ts:47-55; src/view/levelView.ts:99-102; src/view/world.ts:122 | `ROUTE` tiene 11 puntos, `STAGES` 7, `CHECKPOINTS` 7 y `NEXT` 6 (el último índice queda sin definir a propósito), y `world.ts` usa `game.stage >= 5` para «zona activa». Las coordenadas se repiten a mano: -30.6 aparece en level.ts:136-139, game.ts:52-53 y levelView.ts:100; 25.5/25.6 en level.ts:140 y game.ts:54. Añadir o quitar una etapa desincroniza la reaparición, la baliza y el pulso de la zona sin ningún error. |
| minor | Las etapas repiten literales en vez de usar las constantes | src/sim/level.ts:147-148 | La etapa 'Portal' usa `z < -13.5` en vez de `DOOR.z`, y 'Escalera' usa `z < -22` en vez de `STAIRS.z0`. Si se mueve la puerta o la escalera, las etapas dejan de corresponder. |
| minor | La escalera está definida a medias y su dibujo se calcula en tres sitios | src/sim/level.ts:91-95; src/view/levelView.ts:239-255; src/view/decor.ts:347-354; src/sim/game.ts:160 | `STAIRS` no tiene ni x ni ancho:<br>- la colisión usa -1.4..1.4 (level.ts:92-95);<br>- los peldaños, ancho 2,8 en x=0 y `n = 14` (levelView.ts:240, 246);<br>- la alfombra y los pasamanos repiten `n = 14` y `s * 1.37` (decor.ts:347-352);<br>- el aviso usa `\|x\| < 1.8` (game.ts:160).<br>Además, el canto de cada peldaño dibujado queda una altura de peldaño (unos 0,19 m) por encima de la pendiente de colisión. |
| minor | La región de la calle está escrita a mano en cuatro sitios | src/ui/hud.ts:297; src/main.ts:185, 254, 295 | `s.z < 7 && s.z > -12` aparece en el aviso del semáforo de la interfaz, en el aviso de «verde», en el tictac del bucle y en el tictac de `advance`. No se deriva de `LANES` ni de la acera. |
| minor | La simulación ignora `rz` si una caja también tiene `rx`, pero la vista aplica las dos | src/sim/game.ts:404-409; src/view/levelView.ts:50-51 | `eulerQuat` devuelve solo la rotación de `rx` si existe («Solo se usa una de las dos rotaciones a la vez»), mientras `boxMesh` aplica `rotation.x` y `rotation.z`. Además, no se puede girar en `ry`. Hoy no hay ninguna caja con las dos rotaciones, pero el almacén con rampas en diagonal chocaría con esto. |
| minor | Los decoradores por caja solo funcionan en una orientación o a una altura | src/view/levelView.ts:73-75, 194-199, 218-237, 257-270 | - `addFence` usa `h[2]` como largo y coloca las estacas a lo largo de z: una valla a lo largo de x se dibujaría mal.<br>- `addRampStripes` usa solo `h[0]`/`rz`, así que las rampas que suben en z no tienen bandas correctas.<br>- `addSkirting` pone el rodapié a y=0,07 fijo y solo si `p.y < 2.2`: en un edificio de varias plantas falta o sale mal. |
| minor | `mergeStatic` no funde las mallas con varios materiales (edificios de fondo) | src/view/levelView.ts:149-173, 381-389 | `if (... Array.isArray(m.material) ...) return;`. Los 9 edificios de `addNeighbourhood` usan un array de 6 materiales por `BoxGeometry`, así que quedan sin fundir: hasta unas 54 llamadas de dibujo. Además, todo se funde en una sola malla por material para todo el nivel, sin descarte por zonas; el README ya lo anota (unos 9 000 triángulos más en cualquier vista). Con niveles más grandes esto crece. |
| minor | La zona, los focos del semáforo y el camión se funden y siguen animándose solo porque comparten el objeto material | src/view/levelView.ts:96-98, 111, 560, 570, 600-655 | `keep` incluye solo `fadeables` y la baliza. La malla de la zona, que se anima con `zone.material.opacity`, y los focos del semáforo (cambian de color) se funden y se quitan de la escena. Siguen funcionando porque la malla fundida reutiliza el mismo material. El camión también se funde, así que no se puede mover ni mostrar cómo se llena. |
| minor | La vista no tiene liberación de recursos: cambiar de nivel dejaría basura en la GPU | src/view/levelView.ts:31-36, 657-679; src/view/text.ts:7-28; src/view/world.ts:59 | `addZone` crea un `CanvasTexture` nuevo en cada construcción (levelView.ts:661-670). `textSprite` crea un canvas, una textura y un `SpriteMaterial` por letrero (text.ts:7-28). `ownMat` da un material propio a cada pieza que se recorta (levelView.ts:48, 306-321). Las geometrías fundidas son nuevas en cada construcción. `LevelView` no tiene `dispose` y `WorldView` no puede cambiar de nivel. |
| minor | El piloto depende del texto de las etiquetas y `Waypoint.y` no se usa | src/sim/autopilot.ts:55-82; src/sim/level.ts:127; tests/sim.test.ts:352 | `inp.lift = target.label === 'Escalera'`. La prueba busca `s.label === 'Arriba'`. `Waypoint.y` está declarado pero el piloto solo usa x y z. |
| minor | Las cajas de choque de los objetos ignoran su giro `ry` | src/sim/props.ts:19-20, 184-186; src/sim/level.ts:122 | `hit` se describe como «alineada con los ejes» y se crea sin rotación. Por ejemplo, el sillón (`ry: -0.5`) y la carretilla (`ry: 0.4`) chocan con una caja que no coincide con su dibujo. |
| minor | El texto dice «zona verde» y la zona se pinta amarilla | index.html:84, 99; src/view/levelView.ts:664, 674 | index.html habla de la «zona verde del camión», pero `addZone` pinta rayas amarillas; solo el letrero 'ENTREGA' es verde. El README dice «zona amarilla». |
| minor | Código muerto y caché con clave incompleta | src/sim/level.ts:105; src/view/textures.ts:179-180 | `TERRACE` se exporta y no se usa en ningún sitio. `windowsTex` guarda en caché por `win\|wall\|shutter` e ignora `seed`: dos llamadas con los mismos colores y distinta semilla devuelven la misma textura. |
| minor | Cada caja sólida crea su propio cuerpo fijo de Rapier | src/sim/game.ts:108-115 | Hay un `createRigidBody(fixed)` por cada caja (incluidas las cajas de choque de los objetos). Hoy funciona, pero en niveles más grandes conviene un solo cuerpo fijo con colliders desplazados. |

## Recomendaciones (12)

1. P0. Convertir el nivel en datos sin cambiar el juego. Crear `src/sim/level/types.ts`, `src/sim/level/kit.ts` (constructor puro) y un archivo por nivel. El recorrido actual se mueve a `levels/tutorial.ts` y se exporta como `TUTORIAL: LevelDef`. `Game` recibe `opts.level ?? TUTORIAL`. `buildLevel(def)`, `Hud.setup` y `Autopilot` leen `game.level`. Las 29 pruebas deben seguir en verde sin tocarlas, porque usan coordenadas de este recorrido (sim.test.ts:52, 77-92, 108, 253-341; duo-e2e.cjs:239, 248).
2. P0. LevelDef mínimo (solo datos, sin Three, en `src/sim/level/types.ts`):<br><br>```ts<br>interface Region { x0; x1; z0; z1; y0?; y1? }<br><br>interface LevelDef {<br>  id; name; intro;<br>  rules: { timeLimit; parTime };<br>  bounds: Region & { killY: number };   // genera el suelo y los muros invisibles; sustituye level.ts:66 y 81-82<br>  theme: { ground: 'grass' \| 'concrete' \| 'tiles'; sky; fog };<br>  boxes: Box[];                         // Box con ry?, friction?, look?, fade?: { mode: 'cut' \| 'hide'; when?: Region \| { focusAboveY: number } }<br>  stairs?: StairsDef[];                 // { x, z0, z1, y0, y1, width, axis, steps }: un mismo dato genera pendiente, peldaños, alfombra y aviso de alzar<br>  spawn: { x; z; yaw }[];               // 4 entradas<br>  items: { id; type: ItemType; x; y?; z; yaw; optional? }[];<br>  truck: TruckDef;<br>  objectives: ObjectiveDef[];<br>  routes: Record<string, Waypoint[]>;   // clave: id del objeto<br>  checkpoints?: { region: Region; pose }[];<br>  traffic?: TrafficDef;<br>  hints?: { region: Region; when: 'notLifted' \| 'pedRed' \| 'heavy'; text }[];<br>  props: Prop[];<br>  decor: DecorItem[];<br>  art?: string;<br>}<br>```<br><br>Con esto:<br>- `STAGES.reached`, `NEAR_DOOR` y la regla y>1,6 pasan a ser regiones de datos que se pueden validar en pruebas.<br>- `hints` sustituye `needsLiftAtStairs` (game.ts:157-163), la región de calle de hud.ts:297 y main.ts:185.
3. P0. Zona de carga y camión como una sola fuente de verdad:<br><br>```ts<br>TruckDef = {<br>  x; z; yaw;<br>  bed: { len; width; floorY; height };<br>  ramp?: { len };<br>  loadZone: Region;<br>  mode: 'zone' \| 'bed';<br>  capacity?;<br>}<br>```<br><br>- `kit.truckColliders(def)` genera en la simulación el suelo, los laterales, el frente, el techo y la rampa.<br>- `truckView(def)` en la vista sustituye `addTruck` (levelView.ts:600-655) y no se funde (va en `keep`), para poder mostrar el llenado y animar la salida.<br>- La victoria pasa a ser «objetivos `deliver` cumplidos» y deja de ser `inZone` del sofá (game.ts:354).<br>- Para el almacén, `mode: 'bed'` con `floorY` a la altura del muelle.
4. P0. Objetivos, lista y rutas unificadas, que sustituyen ROUTE, STAGES, CHECKPOINTS, NEXT y `stage>=5`:<br><br>```ts<br>ObjectiveDef =<br>  \| { id; kind: 'deliver'; items: string[] \| 'all'; label }<br>  \| { id; kind: 'reach'; item; region: Region; label; checkpoint?: Pose }<br><br>Waypoint = { x; y?; z; yaw: number \| null; tol?; action?: 'lift' \| 'waitLight'; label? }<br>```<br><br>- El piloto elige el siguiente objeto sin entregar y sigue `routes[item.id]`, primero hasta el objeto y luego su camino.<br>- Usa `action` en vez de la etiqueta (autopilot.ts:82) y `y` para distinguir pisos.<br>- La baliza y la interfaz derivan de los objetivos y no de índices.
5. P1. Kit de construcción en la simulación (`kit.ts`) para que 4 niveles no dupliquen código:<br>- `createBuilder()` devuelve `span`, `slope(axis \| yaw)`, `stairs(def)`, `wallWithDoor(axis, from, to, at, door, thickness, height)`, `room(rect, doors[])`, `fence(...)`, `truckColliders(def)` y `bounds(def)`. Es lo de level.ts:35-63 sin el array de módulo.<br>- Uso en cada nivel:<br>  - Casa: habitaciones con `room`/`wallWithDoor` y jardín con valla y seto.<br>  - Edificio: `stairs` en zigzag con rellanos y `floors[]`.<br>  - Calle: `traffic`.<br>  - Almacén: `slope` con `friction` de chapa, palés y muelle.<br>- `eulerQuat` (game.ts:404) pasa a un cuaternión completo (rx, ry, rz) para que la física coincida con la vista.
6. P1. Tráfico como instancia configurable:<br><br>```ts<br>TrafficDef = {<br>  lanes: { z; dir; stopX }[];<br>  xLimit;<br>  light: { cars; yellow; allRed; ped };<br>  cars: { lane; x }[];<br>  pedLights: { x; z; face }[];<br>  crossing: Region;<br>}<br>```<br><br>- `TrafficSystem` guarda la definición. `Car` recibe su carril y deja de leer `LANES` global (traffic.ts:36, 46-47, 59).<br>- `Game` crea coches solo si `level.traffic` existe; desaparece `lane < 2` (game.ts:136).<br>- `Game.light` devuelve `null` sin tráfico.<br>- Los obstáculos de `stepTraffic` incluyen todos los objetos (game.ts:232).
7. P1. Separar en la vista los kits reutilizables de los datos de colocación:<br>- `view/level/build.ts`: bucle de cajas, recortables, baliza, zona, `mergeStatic` y `dispose`.<br>- `view/level/kits.ts`, con estas piezas sacadas de las funciones actuales: `tree`, `building`, `streetLamp`, `bench`, `bin`, `hydrant`, `trafficLight`, `fence(axis)`, `rampStripes(rx \| rz)`, `stairsVisual(StairsDef)`, `skirting` con la base de la caja, `facade(DoorDef, windowsEvery)`, `truckView` y `zone`.<br>- `LevelDef.decor: DecorItem[]` como datos: `{ kit: 'tree', x, z, s, fadeNearRoute }`, `{ kit: 'building', ... }`, etc. Sustituye las listas literales de levelView.ts:391-403, 425-428 y 461-516.<br>- Un hueco `art?: string` hacia `view/level/art/<id>.ts` para detalles a medida, como `addDetails` (decor.ts:326-370) y `addHouse`.<br>- `addDecor(g, props)` recibe la lista por parámetro (decor.ts:372).
8. P1. Que el renderizador pueda cambiar de nivel:<br>- `LevelView.dispose()` libera las geometrías fundidas, los materiales `ownMat`, la textura de la zona y las de los `textSprite`. `TEX`/`mat` se conservan porque se comparten entre niveles.<br>- `WorldView.setLevel(def)` se llama desde `attach` si `game.level.id` cambia (world.ts:59, 96).<br>- La firma de `update` pasa a `update(t, { light?, objectives, truckProgress, focus: Vec3[] })` (levelView.ts:35).<br>- `fadeOccluders` recibe como foco los objetos que se cargan y los jugadores, no solo el sofá (world.ts:166).
9. P2. Rendimiento con niveles más grandes:<br>- `mergeStatic` agrupa por celda espacial (clave `mat \| cast \| celdaX,celdaZ` de unos 20 m) para recuperar el descarte por cámara.<br>- Funde también las mallas con varios materiales (edificios) partiéndolas por grupo.<br>- Excluye explícitamente lo animado (zona, semáforos, camión) con `keep`, en vez de depender de que compartan material (levelView.ts:96-98).<br>- En la simulación, un solo cuerpo fijo con colliders desplazados (game.ts:108-115).
10. P2. Tema y entorno por nivel:<br>- `kindLook(kind, theme)` (levelView.ts:13-29) con nuevas texturas en `TEX`: hormigón pulido, baldosa interior, chapa de almacén.<br>- Cielo, niebla y luces de `WorldView` (world.ts:45-58) leídos de `level.theme`.<br>- Corregir de paso la clave de caché de `windowsTex` para incluir la semilla (textures.ts:180).
11. P2. Pruebas por nivel en un nuevo `tests/levels.test.ts`, que se ejecuta para cada `LevelDef`:<br>- cajas con semiextensiones positivas;<br>- `spawn`, `items`, waypoints y `truck.loadZone` dentro de `bounds`, y ningún spawn dentro de una caja sólida;<br>- cada objeto tiene ruta y cada objetivo cita objetos que existen;<br>- el piloto completa el nivel con 1, 2 y 4 jugadores (sustituye sim.test.ts:166-182 y 364-375).<br>- Mantener `TUTORIAL` como banco de pruebas de la física: puerta, coche y rampa (sim.test.ts:74-127 y 206-216).
12. P3. Limpieza menor durante la migración:<br>- Quitar `TERRACE` (level.ts:105).<br>- Usar `DOOR.z`/`STAIRS.z0` en vez de literales mientras existan las constantes (level.ts:147-148).<br>- Alinear los peldaños dibujados con la pendiente (levelView.ts:245-246).<br>- Usar la rotación de las cajas de choque de los objetos (level.ts:122).<br>- Corregir «zona verde» (index.html:84, 99).<br>- `RULES.timeLimit`/`parTime` pasan a `level.rules`, y los textos del menú y de los resultados se leen de `level.intro` (main.ts:212-213).
