# Auditoría 7/7 — Revisor de completitud (texto íntegro)

> Salida literal del agente `critic` del flujo `wf_9501e555-672`. Verificó en el código las 5 afirmaciones principales con scripts propios (no versionados entonces; ver `08-verificacion.md`).

# Revisión de completitud de las auditorías de física y de niveles

No he modificado el repositorio (`git status` limpio). Mi línea de partida coincide con la de los informes: `npx tsc --noEmit` termina sin errores y `npx vitest run` pasa 29/29. Para comprobar las afirmaciones escribí dos scripts propios, que solo leen el código del juego:
- /tmp/claude-0/-home-user-Game-development/1374a132-0d8e-53e9-9475-ac1ed6b0fb3f/scratchpad/review/verify.ts
- /tmp/claude-0/-home-user-Game-development/1374a132-0d8e-53e9-9475-ac1ed6b0fb3f/scratchpad/review/three.ts

## 1. Comprobación de las 5 afirmaciones más importantes

**V1. Con 4 jugadores en la física cooperativa el sofá vuelca solo: CONFIRMADO. Con 3 está exagerado.**
- **Causa en el código:**
  - El porteador tiene la rotación bloqueada (`carrier.ts:131`).
  - El agarre es una rótula (`carrier.ts:190-191`) y, en cooperativa, el cuerpo sigue chocando con el sofá mientras lo agarra (`carrier.ts:196`).
  - Con 4 jugadores, dos salen frente a las asas laterales (`sofa.ts:25-28`, `game.ts:124-131`).
- **Lo que medí con 4 humanos agarrando** (5 casos × 2 semillas):
  - Quietos: sofaUp mínimo −1,00, integridad 84, 2 caídas, y al final no agarra nadie.
  - Andando a lo largo: integridad 76.
  - Alzando mientras andan: integridad 63.
  - De lado: sofaUp −0,19, integridad 79, 3 caídas.
- **Con 3 humanos:** integridad 100 y 0 caídas en todos los casos. Lo peor es de lado, con sofaUp 0,54, justo en el umbral de «¡Volcado!» (`hud.ts:82`). Por tanto, «3 o 4 jugadores» exagera para 3: con 3 es un problema leve.
- **Alcance real:** el menú permite 4 humanos (`main.ts:69`) y eso fuerza la física cooperativa (`game.ts:42`, `main.ts:117`). Hoy elegir 4 jugadores lleva directamente a este fallo.
- Ninguna prueba usa más de 2 humanos (`tests/sim.test.ts:35-365`).

**V2. El agarre es una mordaza rígida: CONFIRMADO.**
- Uno solo, sin alzar, mueve el sofá 2,50 m en 3 s.
- Con Mayús lo mueve 4,85 m, y el extremo libre llega a y=2,08.
- `soloDrag` se queda en 0 porque solo avisa si el sofá va a menos de 1,2 m/s (`game.ts:350`).
- Código implicado: `carrier.ts:190-196` y `carrier.ts:266-277`.

**V3. Se pierden pulsaciones a más de 60 Hz: CONFIRMADO leyendo el código.**
- `read()` vacía `pressedOnce` en cada fotograma (`input.ts:73`).
- `main.ts:240` lee la entrada antes del `while` de `main.ts:243`, que puede no ejecutarse ni una vez si `acc<DT`. En ese caso el flanco de agarrar o enderezar se pierde. Pasa lo mismo con el mando, porque `prevPad` se actualiza igualmente (`input.ts:66`).
- A 144 Hz, 1−60/144 ≈ 58 % de los fotogramas no ejecutan ningún paso.
- **Fallo relacionado, también confirmado:** solo el Start del mando de J1 pausa bien.
  - `padStart` se llama antes de `read` (`main.ts:236`) y compara con `prevPad[i]` (`input.ts:80-82`).
  - En pausa solo se lee un jugador (`read(1)`, `main.ts:256`), así que `prevPad` del J2 no se actualiza.
  - Resultado: el Start del J2 pausa y en el fotograma siguiente quita la pausa. Con mandos de índice ≥ n, la pausa se alterna en cada fotograma mientras se mantiene Start.

**V4. El piloto automático retrocede porque `lastDist` no se reinicia: CONFIRMADO.**
- `autopilot.ts:67` hace `wp++` sin reiniciar `lastDist`; la comprobación de atasco está en `autopilot.ts:69-70`.
- Los retrocesos de J1 salen exactamente en los instantes del informe: 6,08, 10,67, 16,97, 19,95, 22,63, 32,82 y 35,50 s.
- **Matiz:** no todos caen «unos 2,5 s después de un cambio de punto». Medidos desde el último cambio de punto:

| Retroceso (s) | Tiempo desde el cambio de punto |
|---|---|
| 6,08 | +3,22 s |
| 10,67 | +2,48 s |
| 16,97 | +0,78 s |
| 19,95 | +2,50 s |
| 22,63 | +5,18 s |
| 32,82 | +2,43 s |
| 35,50 | +0,02 s |

- Aun así, el recorrido se completa en 42,4 s con integridad 100.

**V5. El nivel es un singleton y el camión es un bloque macizo: CONFIRMADO.**
- `level.ts:32` usa un array de módulo y `level.ts:124` lo exporta como `LEVEL`.
- En la simulación, el camión es `span(28,34,0,3.4,…,'truck')` (`level.ts:119`): sólido desde el suelo hasta 3,4 m.
- La vista lo dibuja abierto por detrás, con el suelo de carga a 1,3 m (`levelView.ts:601-604`).
- La victoria es el sofá dentro de `ZONE` (`game.ts:354-356`).

## 2. Afirmaciones dudosas o errores en los informes

- **El informe de física se contradice sobre «alzar».** Dice «(a) En llano no sirve para nada… no cambia la velocidad», pero su propio fallo crítico 2 (y mi medición: 2,50 m frente a 4,85 m) muestra que alzar sí acelera cuando un extremo roza el suelo. Alzar sí tiene efecto; el problema es que no se nota y no hace falta.
- **El P0 de física puede reabrir un fallo ya corregido.** Recomienda desactivar el choque cuerpo-objeto mientras se agarra. Eso deshace un arreglo documentado en `carrier.ts:192-195`, donde el sofá se metía hasta 0,6 m en el cuerpo, y rompería la prueba `sim.test.ts:262-286`, que exige atravesar menos de 3 cm. El informe menciona separar con la mano, pero no cita esa prueba.
- **Los informes chocan entre sí:**
  - **Alzar:** física propone quitar el botón de alzar (P1). Niveles mantiene `hints.when:'notLifted'` y `Waypoint.action:'lift'` en su `LevelDef`. Hay que decidir antes de definir el esquema.
  - **Pruebas:** niveles dice que las 29 pruebas «deben seguir en verde sin tocarlas». Pero las pruebas usan `STAGES`, `stageLabel` y `needsLiftAtStairs` (`sim.test.ts:179, 352-361, 373`), y física propone cambiar `sim.test.ts:346-362` y unificar la física. Las pruebas de piloto con ayudantes (`sim.test.ts:166-183`) corren con la física no cooperativa, a la que los ayudantes están ajustados (`game.ts:36-41`). «Sin tocarlas» solo vale para el primer paso, el que convierte el nivel en datos.
- **El informe de niveles está cortado** a mitad de la recomendación de tráfico («desaparece `lane`»). Faltan el resto de esa recomendación y, presumiblemente, las de vista, liberación de recursos, HUD y pruebas.
- **Citas erróneas en el informe de niveles:**

| Cita del informe | Correcta |
|---|---|
| `hud.ts:233` | `hud.ts:33` |
| `hud.ts:285` | `hud.ts:84` |
| `hud.ts:297` | `hud.ts:96` |
| `hud.ts:298` | `hud.ts:97` |
| `props.ts:184-186` (el archivo tiene 56 líneas) | `props.ts:19-20`, `29` y `31`, junto con `level.ts:122` |
| `materials.ts:241-261` (el archivo tiene 49 líneas) | `materials.ts:6-26` |

- **Las semillas no aportan variedad.** En cooperativa, cambiar `seed` no altera nada (solo afecta al azar de los ayudantes): obtuve resultados idénticos con las semillas 1 y 7. Las pruebas de estabilidad deberían variar las posiciones y el momento del agarre.
- **El límite de 6 teclas del USB es especulativo.** Muchos teclados actuales no lo tienen. Lo que sí se puede documentar es el fantasma de teclas (lo reconoce `README.md:692`).
- **Todo está medido con scripts.** `README.md:691` dice: «No la ha jugado ninguna persona». Ningún informe lo señala, y las conclusiones sobre por qué no se entiende alzar son hipótesis sin prueba con jugadores.

## 3. Lo que falta en los informes

- **No hay navegación del menú con mando.**
  - En el menú solo se llama a `input.read(1)` (`main.ts:260-264`) y `padStart` solo se mira fuera del menú (`main.ts:235-236`).
  - Solo se empieza con Intro en el teclado (`main.ts:91`) o con el ratón (`main.ts:62`). Cuatro jugadores con mando no pueden arrancar.
  - Tampoco hay selección de personaje: `CAST[i]` sale del índice del porteador (`game.ts:129`).
- **No hay escalado por número de jugadores.** Nadie trata cómo se resuelve un objeto que necesita N porteadores (un piano para 4) con 1 o 2 humanos. Los ayudantes no esquivan obstáculos ni deciden la ruta (`bots.ts:1-3`) y el piloto conoce la ruta de antemano (`autopilot.ts:1-3`).
- **Vista y cámara para 4 jugadores y varios objetos.** Ningún informe auditó esta capa:
  - La cámara se centra en el sofá con un 75 % de peso (`world.ts:130-140`).
  - La dispersión se mide respecto al sofá y el zoom queda limitado a ×1,6 (`world.ts:137, 145`).
  - No se valora la pantalla dividida.
  - `DollView`, el muñeco de cada humano, recibe `sofaColliders` y lanza rayos y consultas de solape en cada fotograma (`world.ts:104`; `dollView.ts:64, 106, 185-231`). No se ha medido su coste con 4 muñecos.
- **Rendimiento con muchos cuerpos dinámicos sin medir.** El mundo usa 8 iteraciones del resolvedor (`game.ts:106`) y el sofá añade CCD y 4 iteraciones extra (`sofa.ts:39-40`). Cada porteador lanza un rayo y comprueba contactos en cada paso (`carrier.ts:237-238, 242`). Existe `scripts/perf.ts`, pero nadie lo ha pasado con N objetos.
- **No hay grupos de colisión ni eventos de fuerza de contacto en todo `src`.** Una búsqueda de `CollisionGroups`, `setSolverGroups` y `CONTACT_FORCE` no da ningún resultado. Hacen falta para los objetos agarrados, los entregados y el choque con coches.
- **Flujo de partida y metajuego:**
  - No hay selección de nivel ni progresión.
  - El récord se guarda bajo una sola clave `mudanza.best` (`main.ts:207-209`).
  - Los resultados y las estrellas están escritos para el sofá (`main.ts:212-222`).
  - El texto del menú habla de «dos en el mismo teclado» (`index.html:84`).
- **Código muerto:** `prevEdge` (`input.ts:13, 71`) y `lastProgress` (`autopilot.ts:21`).

## 4. Los 10 problemas estructurales más importantes, por prioridad

1. **`Game` está construido alrededor de un único sofá.**
   - Campos únicos: `sofa`, `sofaColliders`, `integrity`, `prevSofaVel` y `lastCarHit` (`game.ts:69-70, 78, 88-90`). `handleOwner` solo distingue `{kind:'sofa'}` (`game.ts:93`).
   - `wristAssist` y `clampSofa` actúan solo sobre el sofá (`game.ts:271-288`); `tryRight` y `respawnSofa` también (`game.ts:374-399`).
   - Los porteadores que se alejan más de 22 m vuelven junto al sofá (`game.ts:332-336`).
   - El porteador no guarda qué cuerpo agarra (`carrier.ts:80-82, 159, 228`).
   - Hace falta `ItemDef`/`Item[]` antes que cualquier otra cosa.
2. **El agarre es rígido.** Una rótula sin límite de fuerza, más el contacto cuerpo-objeto y la rotación bloqueada (`carrier.ts:131, 190-196, 266-277`), provocan el vuelco con 4 jugadores (V1) y la mordaza con uno solo (V2). Sin una «mano blanda» con fuerza limitada, la regla de que un objeto necesita N porteadores no puede salir de la física. Restricción: `sim.test.ts:262-286` sigue exigiendo que el cuerpo no atraviese el objeto.
3. **Hay dos físicas según el modo.** `isCoop` (`game.ts:42`) cambia la masa y el rozamiento (`sofa.ts:44-45`), el contacto del agarre (`carrier.ts:196`), el límite de fuerza (`carrier.ts:242`), `followSofa` (`carrier.ts:268`) y el equilibrio (`game.ts:326`).
   - Con 1 jugador la fuerza es ilimitada, unos 2240 N (`carrier.ts:10, 13`).
   - En el aire no hay límite de fuerza (`carrier.ts:241`).
   - Los ayudantes y sus pruebas dependen de la física no cooperativa (`game.ts:36-41`; `sim.test.ts:166-183`).
4. **La entrada no escala a 4 jugadores.**
   - Solo hay 2 esquemas de teclado (`input.ts:4-7`).
   - Los mandos se asignan por su posición en la lista filtrada, no por `Gamepad.index` (`input.ts:32, 51`). Con 2 en teclado y 2 con mando, J3 y J4 se quedan sin control.
   - Se pierden pulsaciones a más de 60 Hz (`input.ts:73`; `main.ts:240-253`).
   - La pausa con Start falla para J2 en adelante (`input.ts:80-82`; `main.ts:236, 256`).
   - El menú no se puede manejar con mando (`main.ts:91, 235-236, 260-264`).
   - Falta una pantalla de «pulsa para unirte» con un dispositivo asignado a cada jugador.
5. **El nivel es un singleton y el recorrido está duplicado en listas paralelas.**
   - `LEVEL` es un array de módulo (`level.ts:32, 124`) y hay constantes de una sola instancia (`level.ts:85-155`).
   - El mismo camino se describe cuatro veces, enlazadas por índice: `ROUTE` (`level.ts:129-141`), `STAGES` (`level.ts:144-152`), `CHECKPOINTS` (`game.ts:47-55`) y `NEXT` (`levelView.ts:99-102`), más el literal `stage>=5` (`world.ts:122`).
   - El tráfico es global (`traffic.ts:7`, `36`, `46-47`; `game.ts:136-144`).
   - Hace falta un `LevelDef` que reciba `Game`, conservando el recorrido actual como nivel de referencia para las pruebas.
6. **No existe entrega con progreso.** El camión es un bloque macizo en la simulación (`level.ts:119`) y hueco en la vista (`levelView.ts:601-615`). La victoria es el sofá en `ZONE` (`game.ts:354-356`). No hay estado de entregado por objeto, ni un recuento entregados/total, ni objetivos por nivel. Las estrellas se calculan con la integridad global (`main.ts:214`).
7. **El daño es global y tiene ruido.** Hay una única `integrity` (`game.ts:78, 302-305, 357`). El daño se calcula con el cambio de velocidad del centro, después de `clampSofa` (`game.ts:240, 309-319`). Con 4 jugadores quietos produce 3 impactos sin chocar con nada. Para objetos frágiles (una lámpara) hace falta daño por objeto usando eventos de fuerza de contacto, que hoy no existen en el código.
8. **La mecánica de alzar y sus avisos están hechos para una escalera y un teclado.**
   - `needsLiftAtStairs` (`game.ts:157-163`) y el texto «Mayús (J1 la izquierda, J2 la derecha)» (`hud.ts:84`).
   - El piloto alza según el texto de la etiqueta (`autopilot.ts:82`).
   - La prueba de la escalera está mal planteada (`sim.test.ts:346-362`) y el texto de «uno solo» también es de dos jugadores (`hud.ts:85, 89`).
   - Hay que decidir el alzado automático antes de fijar `LevelDef`, porque hoy los dos informes chocan aquí.
9. **No hay IA ni navegación para objetos.**
   - Los ayudantes solo conocen las asas del sofá (`SLOTS`) e imitan la intención del grupo (`bots.ts:29-94`). Las asas ocupadas por humanos no se marcan como ocupadas (`game.ts:194-195`).
   - El piloto sigue una ruta fija con el fallo de `lastDist` (`autopilot.ts:67-70`), y es la base de las pruebas de recorrido completo (`sim.test.ts:166-183, 364-375`).
   - Sin esto no se puede jugar con menos de 4 humanos con objetos de N porteadores, ni hacer pruebas automáticas de los niveles nuevos.
10. **La vista, la cámara y el flujo de pantallas están acoplados al sofá y no permiten cambiar de nivel.**
    - `buildLevel()` se llama una sola vez y no hay `dispose` (`world.ts:59, 96-110`).
    - La cámara y el recorte de paredes siguen al sofá (`world.ts:130-140, 166, 186-190`).
    - El muñeco de cada humano recibe `sofaColliders` (`world.ts:104`; `dollView.ts:64, 185-231`) y la vista del sofá se construye desde `SOFA`/`SLOTS` (`sofaView.ts:4, 36`).
    - Los resultados y el menú están escritos para el sofá (`main.ts:120, 212-222`; `index.html:84, 99`).
