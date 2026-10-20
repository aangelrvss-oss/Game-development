# Revisión independiente del ciclo 2 y plan de corrección (20-10-2026)

## Alcance y referencias

| Concepto | Valor |
|---|---|
| Código revisado | `5cab122`, «CICLO 2 — PENDIENTE DE REVISIÓN INDEPENDIENTE». El worktree de revisión estaba en `04da4c4`, que tiene el mismo código. |
| Referencia | `657fd30`, el ciclo 1 corregido y revisado |
| Pasos del ciclo 2 | `a84984f` (objetos), `ec1d620` (niveles, camión y entrega), `23b8c66` (vista, piloto y equipos) y `80b4d53` (evidencias) |
| Revisores | 6 revisores que no implementaron nada, un agente de diagnóstico de regresiones y un árbitro de contraste |
| Cambios en el juego durante la revisión | Ninguno. Solo se ha medido. Todo lo que se cita está en `reviews/ciclo-2/revision-independiente/` y `scripts/audit/review-c2/`. |
| Prioridades | P0 = crítico (impide jugar); P1 = mayor que bloquea la siguiente iteración; P2 = mayor no bloqueante; P3 = menor; P4 = cosmético o mejora. Equivalen a las severidades del proyecto: crítico = P0, mayor = P1 o P2, menor = P3 o P4. |

Tipos de evidencia:
- **A** = automatizada y reproducida;
- **V** = observación visual en capturas;
- **C** = lectura de código;
- **H** = solo la puede validar una persona.

## 1. Resumen ejecutivo

- **El ciclo 2 NO es satisfactorio.** Ninguna dimensión llega a 8,5. La nota global del árbitro es 5/10. No hay defectos críticos (P0): «La calle» se gana con 1 a 4 humanos.
- **Lo que funciona y está bien medido:**
  - tsc limpio y Vitest 112/112 determinista, sin umbrales rebajados;
  - la física de manos y piernas no cambia respecto a `657fd30`;
  - lo dibujado coincide con los colliders (camión a 0,00 mm, objetos a 2–3 cm);
  - los objetos son estables de 6 a 130 kg;
  - rendimiento sin regresiones;
  - el sofá ya no sobresale de su forma física (de 18 cm a 2,8 cm).
- **Los defectos que bloquean nacen casi todos de las reglas nuevas, no de la física:**
  - la lámpara obligatoria se rompe de un golpe y hace perder (C2-01);
  - hay que soltar el objeto dentro del camión para que cuente, y la pantalla dice lo contrario (C2-02);
  - en el patio, 4 humanos con ayudantes pierden siempre (C2-04);
  - regresión del piloto automático (R-C2-01);
  - las pruebas de navegador no sirven como criterio de aceptación (C2-05).
- **La sospecha principal de regresión se ha aclarado.** Que `duo-e2e` pasara 6/6 frente a 2/8 resultó ser fragilidad de la propia prueba, presente en las dos versiones (alrededor del 50 % en cada una). No es una regresión del juego. La única regresión de código confirmada es la del piloto (R-C2-01).
- **Decisión propuesta:**
  - mantener el ciclo 2 integrado como base provisional NO aceptada;
  - antes del ciclo 3, hacer un ciclo de corrección (llamado aquí «2b»), empezando por arreglar las pruebas de navegador para poder medir;
  - no ampliar contenido hasta cerrar los P1.

## 2. Resultados de cada revisor

| # | Dimensión | Nota | Puntos fuertes | Principales defectos | Informe |
|---|---|---|---|---|---|
| 1 | E2E y regresiones | **5** | Node 9,5: tsc, Vitest 112/112 ×3 y 71 nombres conservados | `duo-e2e` 2/8 frente a 6/6 (luego explicado como fragilidad); 4h+2 ayudantes más lento; 4 de 10 mutaciones sin detectar | `r1-e2e-regresiones.json` |
| — | Diagnóstico de regresiones | — | Repetición determinista navegador↔Node con error ≤ 5e-4 m, emulador con 400 escenarios por commit | `duo-e2e`, agarre y teclado son fragilidad de las pruebas; R-C2-01 es regresión del piloto, introducida en `23b8c66` | `diagnostico-regresiones.md` |
| 2 | Física cooperativa y sabotaje | **6** | Estabilidad 8,5; levantar 9; 0 de 252 despegues con una persona de menos; tirar en contra no funciona | retener impide ganar; lámpara frágil; se carga a rastras con menos gente | `r2-fisica-sabotaje.json` |
| 3 | IA auxiliar y modos de 1 a 4 | **4,5** | «La calle» con ayudantes sigue siendo válida (6,5): 7/360 frente a 5/360 derrotas con despistados, heredado | patio con ayudantes: 40 de 334 derrotas; 4h+2 atentos, 0/8; interbloqueo en el asa lateral; ayudantes aparcados el 78–81 % del tiempo | `r3-ia-modos.json` |
| 4 | Diversión y controles | **4,5** | Menú, «Cargados N/M» y avisos con las teclas de cada jugador se entienden (6) | no se dice que hay que soltar; la lámpara hace perder sin aviso; atascos en el empalme de las rampas; opcionales sin sentido (2) | `r4-diversion-controles.json` |
| 5 | Arte, animación y clipping | **6,5** | Coherencia de dibujo y física 8,5; objetos reconocibles 7,5; sin regresión en «La calle» | la cámara sigue al objeto principal (un humano fuera de imagen en el 20 % de los fotogramas); sin sombrero por jugador; la rotura no se ve | `r5-arte-clipping.json` |
| 6 | Rendimiento y contenido | **5,5** | Rendimiento unos 8: el coste por paso no empeora; arranque de 785 ms; memoria estable salvo una fuga de texturas heredada | contenido unos 3: 0 de 4 niveles, ningún asset, sin música, objetos opcionales sin uso | `r6-rendimiento-contenido.json` |
| 7 | Contraste (árbitro) | **5 global** | Reprodujo los puntos disputados con scripts propios | lista consolidada: 11 mayores y 2 menores | `r7-contraste.json` |

Rutas:
- informes: `docs/quality/reviews/ciclo-2/revision-independiente/`;
- capturas clave: `capturas-clave/` (22 JPEG);
- scripts: `scripts/audit/review-c2/<rol>/`.

## 3. Evidencias y discrepancias

### Discrepancias resueltas con datos (no por votación)

| Tema | Postura A | Postura B | Resolución | Estado |
|---|---|---|---|---|
| `duo-e2e`, ¿regresión? | Revisor 1: 2/8 frente a 6/6 (p ≈ 0,009) | Diagnóstico: con la prueba original intercalada, 5/10 frente a 5/10; 400 escenarios emulados, 175 frente a 183 (p = 0,62) | Fragilidad de la prueba en las dos versiones. Con las teclas S+↑ falla siempre (0/139 y 1/141). Agregado del navegador: p = 0,10. | Resuelto. **El 6/6 inicial queda sin explicar** (su worktree ya no existe). |
| Causa del fallo de `duo-e2e` | Implementador: el giro varía con los FPS. Revisor 1: el filo de π/4. | Diagnóstico | Los FPS son iguales (193,9 frente a 195,4 ms por fotograma). El giro antes de tirar va de 0,35 a 1,79 rad. Cuenta en qué fotograma cae la pulsación y qué teclas elige la prueba, que siempre tira en el eje x. | Resuelto |
| R-C2-01: ¿cuánto pesa? | Revisor 1: mediana 58,05 s | Árbitro: 58,05 es la mediana superior; la convencional es 47,45. La distribución es bimodal (4 semillas en unos 36 s y 4 entre 58 y 128 s). 4h+1 atentos MEJORA (72,70 → 41,94 s). | El mecanismo está confirmado por experimento. El piloto con 4 humanos y ayudantes ya era frágil en la base. | Mecanismo resuelto; **peso global abierto** |
| ¿Retener es un fallo? | Física y diversión: defecto nuevo | Árbitro: cumple T-deliver («nadie lo agarra») | Es un defecto de diseño y de comunicación, no de implementación | Necesita una decisión de diseño humana |
| Sombrero por jugador | Arte: mayor | Árbitro: menor (heredado, fuera de la especificación del ciclo 2) | Se registra como P3 | Resuelto |

### Discrepancias que quedan ABIERTAS (falta evidencia)

1. **Lámpara a 3,12 m/s.** El revisor de física da integridad 100; el árbitro da 14 con su script. Probablemente sean métodos distintos (ángulo y punto de impacto). No cambia el defecto C2-01, que a 4,16 m/s rompe la lámpara en las dos mediciones.
2. **Mesa cargada por una sola persona.** La verificación de solo lectura da 13,7 s; el revisor de física, 25,2–28,5 s. Todos coinciden en que se puede.
3. **Tira y afloja.** Según la verificación (P4), en 2 contra 1 no salta «¡Se escapa!» y al que pierde lo arrastran unos 2 m en 8 s. Según el revisor de física, quien tira en contra pierde el agarre en 0,38–0,55 s. Parecen escenarios distintos (quién es la minoría y qué objeto); nadie lo ha medido en las mismas condiciones.
4. **El 6/6 de la base del revisor 1.** Con 36 ejecuciones reales y 400 emuladas sale alrededor de un 45–50 %; sacar 6/6 por azar tiene una probabilidad de ~0,7 %.
5. **Separación numérica residual** entre versiones tras igualar el número de cuerpos (2 de 4 ejecuciones). Hipótesis: el orden de los colliders fijos. No demostrado.
6. **Nota del árbitro para rendimiento y contenido (7, provisional).** No llegó a leer el informe del revisor 6, que estaba truncado en su entrada. El revisor da 5,5 (rendimiento unos 8 y contenido unos 3). **Vale la nota del revisor.**

### Áreas que ningún revisor ha cubierto lo suficiente

- Ninguna persona ha jugado. La diversión real, la sensación de control y la frustración no están medidas (H).
- No se han probado mandos físicos con 3–4 jugadores, ni sonido con altavoces, ni una GPU real: todo es render por software.
- No hay pruebas de navegador con humanos y ayudantes a la vez.
- Accesibilidad: solo se ha mirado el reconocimiento de jugadores en gris.
- La escalera dibujada con peldaños y física de rampa (menor heredado del ciclo 1) no se ha vuelto a medir.

## 4. Lista priorizada de defectos

Notas de la tabla:
- «Origen»: N = nuevo en el ciclo 2; E = empeora en el ciclo 2; H = heredado.
- La confianza es en el mecanismo; entre paréntesis, en el impacto para personas reales.

| ID | P | Defecto | Origen | Evidencia (tipo y ruta) | Reproducción | Impacto en el jugador | Confianza | Dependencias y efectos de corregirlo |
|---|---|---|---|---|---|---|---|---|
| **C2-01** | **P1** | La lámpara obligatoria se rompe de un solo golpe (dv ≥ 2,70 m/s) y se pierde al instante | N | A: `r7` (contraste-node, mando a 0,8 → rota), `r2`, `r4`; C: `items.ts:180` (`impactDv 2.45`, `damage 400`) | `ROOT=$PWD PARTE=lampara npx vite-node scripts/audit/review-c2/contraste/contraste-node.ts` | Se pierde en 2–5 s por un roce o por el tambaleo de un ayudante. Es la causa de casi todas las derrotas del patio. | alta (media) | Debe mantener T-item-3 (que se rompa al caer desde la altura de carga). Va ligado a C2-04. |
| **C2-02** | **P1** | Para que cuente hay que soltar el objeto dentro del camión. No se dice, y al soltar sale «Acercaos… agarradlo». | N | A: `r4` (equipo que no suelta: 0/4 frente a 4/4); C: `game.ts:654`, `hud.ts:179-184`; V: `capturas-clave/director-calle2-camion-tras-soltar.jpg` | `ROOT=$PWD PARTE=retener …contraste-node.ts` | Un grupo que no leyó el menú puede perder por tiempo con el sofá dentro | alta (media) | Es la regla de T-deliver. Un aviso en el HUD solo cierra C2-02; cambiar la regla cierra también C2-03 pero cambia T-deliver. |
| **C2-04** | **P1** | Patio con 4 humanos y ayudantes atentos: derrota determinista (4h/6c 0/6 y 4h/5c 1/6). Un ayudante suelta la mesa, se tambalea y rompe la lámpara cargada. | N | A: `r7` (patio-4h), `r3` (traza «release A4 → wobble → impact lampara3»); V: `capturas-clave/ia-2-*` | `PARTE=patio H=4 C=4,5,6 SEEDS=1-6 …contraste-node.ts` | Con ayudantes, lo ya cargado se destruye | alta (media) | Depende de C2-01 y de R-C2-01 (con el parche del piloto sigue perdiendo). Hay que corregir C2-01 primero y volver a medir. |
| **R-C2-01** | **P1** | Regresión del piloto: `autopilot.ts:533` (tryTime solo cerca) y `:328` (mayEnter cuenta ayudantes que no agarran). Con 4h+2 ayudantes en «La calle», cola de hasta 127,93 s. | N (`23b8c66`) | A: `diagnostico-regresiones.md` §4 (exp-trytime: mediana 35,93; caídas en el camión 23 → 9) | `CFG=4,6,atentos ROOT=$PWD npx vite-node scripts/audit/review-c2/diagnostico/caidas.ts` | Indirecto: la demo y la herramienta con la que se miden T-route, T-roles y help-batch | alta (media en su peso) | Revertir la línea empeora T-roles con 2 jugadores (45,85 → 59,55 s). Hay que usar un criterio de falta de progreso. |
| **C2-05** | **P1** | `e2e:duo` y `e2e:teclado` no sirven como criterio de aceptación: «soltar» pasa ~50 %, el agarre con Espacio se duplica y el piloto de la prueba se atasca | H | A: diagnóstico §1–3; `r7` (duo-tasas) | `python3 -I scripts/audit/review-c2/contraste/duo-tasas.py <diagnostico-evidencias>` | Ninguno directo. Impide vigilar regresiones en el navegador. | alta | Solo scripts (`duo-e2e.cjs:115-234`, `keyboard-e2e.cjs:41-50`). Riesgo: que la prueba arreglada no detecte fallos reales del tambaleo. |
| C2-03 | P2 | Retener: un jugador que agarra un obligatorio dentro del camión impide ganar, y nadie se lo puede quitar (ni 3 contra 1) | N | A: `r2` (retener.log: 19 de 20 sin soltar; «La calle», derrota a los 180 s frente a victoria a 33 s) | `npx vite-node scripts/audit/review-c2/fisica/retener.ts` | El sabotaje se convierte en bloqueo y no en caos cómico | alta (baja) | Misma causa que C2-02. Permitir arrebatar el objeto toca `hand.ts`, común a todo. |
| C2-06 | P2 | Ayudantes con varios objetos en el patio: interbloqueo en el asa lateral al pie de la rampa; aparcados el 78–81 % del tiempo; de 1 a 5 ayudantes el tiempo no baja | N | A: `r3`; C: `bots.ts:199`, `game.ts:217` | `SPAWNS=norte … scripts/audit/review-c2/ia/traza.ts` | Jugar solo con ayudantes en el patio: compañía que no ayuda | media | M4b (el nivel 3 del reparto parece código muerto) y T-roles |
| C2-07 | P2 | Las clases de peso solo valen para levantar: el piano se carga con 2, y la mesa y la nevera con 1, a rastras | N | A: `r2` (trampa.log), verificación; C: `tests/items.test.ts:224-227` | `npx vite-node scripts/audit/review-c2/fisica/trampa.ts` | Se puede saltar la cooperación obligatoria; quita papel al 3.º y al 4.º jugador | alta (H: ¿es trampa o es una opción válida y lenta?) | Cumple T-item-2 al pie de la letra: corregirlo cambia la especificación. Hay que respetar «una sola física». |
| C2-08 | P2 | La cámara, el recorte de lo que tapa y los avisos siguen al objeto principal aunque ya esté cargado; con 4 jugadores, alguien queda fuera de imagen en el 20 % de los fotogramas | N | A: `r5` (63 de 313 fotogramas); C: `world.ts:155`, `hud.ts:179-182`; V: `capturas-clave/arte-1-*` | `node scripts/audit/review-c2/arte/arte-navegador.cjs … encuadre` | Con varios objetos, se pierde de vista al muñeco o al objeto que se lleva | alta | Hay que corregir HUD y cámara juntos. Puede afectar a las capturas de T-hud. |
| C2-09 | P2 | Las pruebas no vigilan lo que falla: humanos con ayudantes, objeto quieto (M2), reparto (M6), el 4.º jugador (M5); las semillas del patio no exploran nada | N | A: `r1` (mutaciones), `r7` | `python3 -I scripts/audit/review-c2/qa/mutar.py M2-entrega-sin-quieto M6-reparto-lejanos M5-cuarto-parado` | Indirecto: C2-04 y R-C2-01 pasaron la integración en verde | alta | Depende de cómo se corrijan R-C2-01 y C2-01 |
| C2-10 | P2 | El 4.º jugador no aporta: frente a 3, un 2,6 % en el patio y nada en «La calle». Con el 4.º inactivo (M5), 30,62 s. | H (objetivo del ciclo 2 no cumplido) | A: `r1`, `r3`, Vitest T-roles | `npx vitest run tests/roles.test.ts` | El 4.º espera o estorba | alta (H) | C2-07 y el diseño de contenido (el piano es opcional y no da nada) |
| C2-13 | P2 | Los objetos opcionales (nevera y piano) no aportan nada: no suman puntos ni estrellas | N | C: `game.ts:609-610`, `main.ts:331-337`; A: verificación (el piloto acaba siempre con 5/7) | lectura | La variedad de objetos no influye en la partida | alta | Afecta a las estrellas y al récord |
| C2-11 | P3 | Coste de diseño de la rampa y la caja de carga: caídas en el camión de 9 a 32, 2–4 s más y atascos en el empalme de las dos rampas | N (`ec1d620`) | A: diagnóstico (9 → 32), `r4` (2/20 frente a 0/20, p ≈ 0,49) | `TRAZA=1 … scripts/audit/review-c2/director/humano.ts calle2 9 1 0` | Posible frustración al final del recorrido | baja (H) | `levels/truck.ts` y `calle.ts`; afecta a T-view y T-deliver |
| C2-14 | P3 | Descargar es instantáneo: con solo agarrar un objeto cargado deja de contar, y uno solo saca los ligeros en 1–1,6 s | N | A: `r2` | `scripts/audit/review-c2/fisica/` | Sabotaje barato | alta | Ligado a C2-02 y C2-03 |
| C2-15 | P3 | Textos del patio que hablan del sofá y del semáforo; dos filas «Caja» indistinguibles; «Estado de la carga 0 %» con un solo objeto roto; récord compartido entre niveles | N | C y A: `r6`, `r4`, verificación | lectura y `r6` | Confusión y una métrica de daño engañosa | alta | HUD y resultados |
| C2-16 | P3 | La rotura no se ve: la lámpara rota es igual que caída, los parches flotan y no hay reacción del muñeco | N | V: `r5`, `capturas-clave/arte-4-*` | `r5` | Falta de retroalimentación | alta | Vista (`itemView`) |
| C2-17 | P3 | Q/E con las manos vacías gira objetos que llevan los ayudantes en otro sitio | N | A: `r3` | `r3` | Efecto sorpresa | media | `game.ts` (giro a ayudantes) |
| C2-12 | P3 | Sin sombrero por jugador (ART_DIRECTION): en gris, J1–J4 solo se distinguen por la etiqueta | H | C: `dollRig.ts:222`; V: `capturas-clave/arte-4-*` | `grep -n Gorra src/view/doll/dollRig.ts` | Legibilidad con 4 jugadores y con daltonismo | alta | Solo vista |
| C2-18 | P3 | Fuga de texturas de GPU al reiniciar: la sombra de cada muñeco no se libera (de 21 a 57 texturas en 10 partidas) | H | A: `r6` | `scripts/audit/review-c2/rendimiento/` | En sesiones largas, más memoria de GPU | alta | Vista |
| C2-19 | P3 | Penetraciones transitorias grandes en choques muy rápidos (≥ 7,7 m/s): hasta 19 cm contra el techo y 37 cm al caer la nevera 3 m; nunca atraviesa | desconocido | A: `r2` | `r2` | Raro en el juego normal | media | Física (CCD) |
| C2-20 | P4 | Varios «¡CARGADO!» a la vez se superponen; el marcador de destino atraviesa los objetos; el rebote escala desde el origen; el sofá recortado pierde volumen; manos en la pantalla de la lámpara | N y H | V: `r5` | `r5` | Pulido visual | alta | Vista |
| H-01 | P2 | Señales de esfuerzo saturadas: llevando bien la caja, rayas el 100 % del tiempo; con el sofá entre dos, el 82 % | H (ciclo 1, P6) | A: verificación (seis-problemas), segunda ronda del ciclo 1 | `scripts/audit/review-c1b/rol-agce/esfuerzo-ruta.ts` | No distinguen «falta ayuda» de «vamos bien» | alta | `dollView.ts:172` |
| H-02 | P2 | Tira y afloja: en 2 contra 1 no salta «¡Se escapa!» por la regla de tiempo | H (ciclo 1, P4) | A: verificación (idéntico bit a bit). **Contradicción abierta** con `r2`. | `scripts/audit/review-c1b/fisica-qa/tira-afloja.ts` | Un duelo de fuerza poco legible | media (contradicción) | `carrier.ts` (gripHold) y `hand.ts` |
| H-03 | P2 | Transporte individual explotable con el sofá: 3,12 m en 3 s agarrando por el respaldo | H (ciclo 1, P3) | A: verificación (82 de 240 combinaciones) | `scripts/audit/review-c1b/fisica-qa/barrido-agarres.ts` | Se reduce la cooperación necesaria | alta | `hand.ts` (elipse lateral); relacionado con C2-07 |
| H-04 | P3 | Contenido muy por debajo del plan: 0 de 4 niveles, ningún asset de Blender y sin música | H | A y C: `r6`, verificación | inventario | No es un juego completo | alta | Es el plan de los ciclos 3–5 |

## 5. Clasificación de los siete puntos señalados

| # | Punto | Clasificación | Justificación (con los resultados de la revisión) |
|---|---|---|---|
| 1 | IA auxiliar: 11 derrotas de 512 frente a 7 | **Bloqueante** (por su mecanismo). La cifra por sí sola: **evidencia insuficiente**. | 11/512 frente a 7/512 no es significativo por sí mismo, y en «La calle» con 40 semillas de despistados sale 7/360 frente a 5/360 (r3: heredado). Pero la revisión **confirma** una regresión de código del piloto, R-C2-01, y fallos nuevos de los ayudantes en el patio (C2-04 y C2-06: 40 de 334 derrotas). Bloquea porque el piloto es la herramienta de medida y la demo, y porque C2-04 es determinista. |
| 2 | Uno solo lleva la mesa al camión en 13,7 s | **Necesario antes de ampliar contenido**, con una decisión de diseño | Confirmado: se puede (r2: 25,2–28,5 s, con el método distinto de la verificación; la cifra exacta queda abierta). No es un fallo de implementación: T-item-2 solo exige que no despegue. Antes de diseñar niveles con «objetos de N personas» hay que decidir si arrastrar despacio es una opción válida o una trampa (C2-07). |
| 3 | `duo-e2e` intermitente (J2 se tambalea sin caer) | **Bloqueante** como herramienta. **No es una regresión del juego.** | Diagnóstico: fragilidad de la prueba en las dos versiones (5/10 y 5/10; 175 y 183 de 400). Sin un e2e fiable no se puede demostrar que las correcciones no rompen nada en el navegador (C2-05). |
| 4 | Esfuerzo y tira y afloja sin señal clara | Esfuerzo: **necesario antes de ampliar contenido** (H-01). Tira y afloja: **no confirmado**; la evidencia es contradictoria (H-02). | El esfuerzo saturado está medido y no cambia con el ciclo 2. Afecta a la prioridad 1 y 2 (comprensión y transporte). En el tira y afloja, la verificación y el revisor de física describen escenarios distintos; falta una medición conjunta. |
| 5 | El 4.º jugador apenas mejora el tiempo | **Necesario antes de ampliar contenido** | Confirmado: un 2,6 %, y con el 4.º inactivo se tarda menos (M5). La solución es de diseño de contenido (objetos u objetivos que pidan 4) y depende de C2-07. No bloquea corregir el núcleo. |
| 6 | Los 4 niveles previstos no existen | **Mejorable más adelante** (ampliación prevista; no es un defecto de regresión) | Confirmado: 0 de 4. Construirlos ahora multiplicaría los P1 abiertos (lámpara, entrega, ayudantes, cámara). Va después del ciclo 2b. |
| 7 | No hay assets reales de Blender | **Mejorable más adelante** | Confirmado: bpy 5.2.2 funciona, pero solo hay un cubo de prueba en `/tmp`. El arte procedural actual es reconocible (r5, 7,5). Depende de que la forma de cada objeto sea estable. |

## 6. Decisión propuesta sobre el ciclo 2

- **El ciclo 2 NO es satisfactorio.** Notas de 4,5 a 6,5, ninguna a 8,5, y cinco P1 abiertos.
- **No revertir.** `657fd30` no es mejor en lo que se mide: tiene la misma fragilidad de los e2e y el mismo piloto frágil con 4 humanos y ayudantes. Lo que el ciclo 2 aporta (`ItemDef`, `LevelDef`, camión abierto y entrega) es la base de los niveles. Las regresiones que viven los jugadores reales son reglas nuevas que se pueden corregir de forma localizada.
- **Siguiente iteración: un ciclo de corrección «2b» antes del ciclo 3.** Solo cierra los P1 y los P2 de experiencia; no añade contenido.
- **Requiere decisión humana antes de implementar:**
  1. la regla de entrega (C2-02 y C2-03);
  2. qué pasa con un objeto frágil obligatorio roto (C2-01);
  3. si arrastrar con menos gente es válido (C2-07).
- **Si se prefiere comparar sin el ciclo 2:** `git revert -m 1 5cab122` deshace la integración. No se recomienda.

## 7. Plan de corrección del ciclo 2b (NO implementado)

Orden según las prioridades del usuario:
1. controles comprensibles;
2. agarre y transporte intuitivos;
3. cooperación sin frustración;
4. IA fiable;
5. estabilidad de 1 a 4 jugadores;
6. solo después, contenido.

**Paso 0 (herramientas de medida), primero porque sin él no se puede demostrar nada.**

### Paso 0 — Pruebas de navegador fiables (C2-05 y C2-09). Sin cambiar mecánicas.

- **Causa:**
  - `duo-e2e.cjs:203-218` elige las teclas según el giro y siempre tira en el eje x;
  - el piloto de la prueba da pulsaciones de 0,87 m frente a una ventana de ±0,2 m;
  - `keyboard-e2e.cjs:41-50` pulsa Espacio dos veces con esperas de reloj.
- **Cambio mínimo:**
  - tirar en el eje real del sofá y fijar su orientación antes del paso de «soltar»;
  - pulsaciones proporcionales a la distancia, con un objetivo fijo, rodeando lo fijo;
  - una sola pulsación de agarre esperando avance de juego (como `tick()`), o comprobando `holding` antes de volver a pulsar;
  - comprobar el aviso aceptando la prioridad de «¡Que se vuelca!»;
  - opcional: un parámetro `?seed=` en `main.ts` (cambio de código del juego, mínimo, que también se revisa).
- **Pruebas nuevas en Node (C2-09):**
  - «La calle» con 4h+2 atentos y con 1h+3 despistados, semillas 1–16, vigilando la mediana y el peor caso;
  - patio con 4h+1 y 4h+2 desde 5 salidas;
  - detectar M2, M5 y M6.
- **Aceptación definida ANTES de implementar:**
  - `duo-e2e` ≥ 19/20 y `keyboard-e2e` 20/20, en `657fd30` y en `5cab122`, con tandas intercaladas;
  - poder de detección: con la mutación «sin tambaleo al soltar» (`releaseKick` anulado), `duo-e2e` falla 20/20;
  - las pruebas nuevas detectan M2, M5 y M6.
- **Riesgo:** una prueba más permisiva que no vea fallos reales. La mutación obligatoria lo cubre.
- **Parada:** si la prueba arreglada no llega al 95 % en `657fd30`, se para y se investiga el juego; nunca se relaja la comprobación.

### Paso 1 — Entrega comprensible (C2-02 y C2-03; también C2-14). Requiere decisión humana.

- **Opciones:**
  - **(A)** Mantener «nadie lo agarra», con un aviso explícito «¡Soltadlo dentro del camión!» y sin el aviso de agarrar después de entregar. Cierra C2-02, pero no C2-03.
  - **(B, recomendada)** Cuenta como cargado lo que está dentro y quieto `winHold` s, aunque alguien lo sujete. Para sacarlo hay que sacarlo físicamente fuera de la caja de carga, no basta con agarrarlo. Cierra C2-02, C2-03 y C2-14 sin tocar la mano blanda.
- **Riesgo:**
  - cambia T-deliver y sus pruebas, que se migran sin relajarlas;
  - un objeto sujeto y quieto en el borde podría contar; se mitiga con el 80 % de la caja envolvente, que ya existe.
- **Aceptación:**
  - el equipo que nunca suelta gana 4/4 (hoy 0/4) en «La calle» y en el patio;
  - el «retenedor» no impide ganar (prueba de r2);
  - la diferencia de tiempos con solo humanos en «La calle» es ≤ 0,5 s;
  - T-deliver migrada pasa;
  - la mutación «sin quieto» se detecta.
- **Parada:** si empeora help-batch (< 40/40), T-route o T-roles.

### Paso 2 — Fragilidad justa (C2-01 y C2-04, y C2-16). Requiere decisión humana sobre perder la partida.

- **Causa:** `impactDv 2.45` y `damage 400` hacen que un roce a ~4 m/s rompa la lámpara de un golpe, y un obligatorio roto hace perder.
- **Cambio mínimo, propuesto:**
  - repartir el daño: un golpe a velocidad de andar deja la lámpara abollada (con una señal visible de frágil y de daño), y se rompe al caer desde la altura de carga o tras varios golpes;
  - un obligatorio roto cuenta como «entregado roto» con penalización de estrellas, en lugar de una derrota inmediata (decisión humana).
  - **No es bajar umbrales para aprobar.** Se redefine qué golpe rompe con un criterio físico (energía y altura) y se mantiene T-item-3.
- **Aceptación:**
  - chocar andando (5,2 m/s) sin carga: integridad ≥ 50 tras 1 golpe;
  - caer desde la altura de carga: rota (T-item-3 intacta);
  - soltarla quieta: integridad 100;
  - patio con 4h+1 y 4h+2 atentos: ≥ 95 % de victorias (6 salidas × 8 semillas; hoy 0/6 y 1/6);
  - patio con 2h humanizado (r4): ≥ 8/10 (hoy 1/10).
- **Riesgo:** que la fragilidad deje de importar. Pruebas de protección: rota al caer y daño acumulado.
- **Parada:** si alguna de las 112 pruebas cambia de resultado sin migrarla de forma justificada.

### Paso 3 — Piloto sin regresión (R-C2-01).

- **Cambio mínimo:**
  - en `autopilot.ts:533`, sustituir «contar solo si está cerca» por **falta de progreso** (distancia al asa que no baja en X s, esté cerca o lejos);
  - en `:322-334`, que `mayEnter` no cuente a los ayudantes que no agarran ni a los que van al mismo objeto.
- **Aceptación:**
  - «La calle», 4h+2 atentos, semillas 1–16: mediana ≤ 38 s y peor caso ≤ 60 s (hoy 47,45/58,05 y 127,93);
  - T-roles con 2 jugadores: mediana ≤ 46,8 s (no puede empeorar más de un 2 % sobre 45,85; revertir la línea da 59,55);
  - T-route y help-batch 40/40;
  - caídas en el camión ≤ 15 en la matriz de 59 partidas (hoy 61).
- **Parada:** si mejora «La calle» a costa del patio o de T-roles.

### Paso 4 — Ayudantes con varios objetos (C2-06).

- **Cambio mínimo:**
  - en `bots.ts:199`, considerar al ayudante bloqueado por falta de progreso de su asa, no solo cuando el objeto va a más de 0,6 m/s;
  - los ayudantes priorizan el objeto pesado que lleva o al que va un humano.
- **Aceptación:**
  - patio con 1h y 1, 3 y 5 atentos: el tiempo baja de forma monótona y es ≥ 15 % menor de 1 a 3 ayudantes;
  - aparcados ≤ 40 % del tiempo;
  - 0 interbloqueos en 5 salidas × 8 semillas.
- **Parada:** derrotas con ayudantes en «La calle» > 7/360 con despistados.

### Paso 5 — Cámara y avisos con varios objetos (C2-08, C2-15 y C2-17).

- **Cambio mínimo:** la cámara encuadra a todos los humanos y a los objetos que llevan, no al objeto principal; los avisos de vuelco y atasco se calculan por objeto agarrado; textos por nivel.
- **Aceptación:**
  - con 4 jugadores en el patio, fotogramas con un humano fuera de imagen ≤ 2 % (hoy 20,1 %);
  - capturas de T-hud sin tapar las pastillas de los jugadores.

### Paso 6 — Cooperación necesaria y señales (C2-07, C2-10, H-01 y H-02). Requiere decisión de diseño.

- **Propuesta, con una sola física:**
  - el borde de la caja de carga tiene un escalón de 10–15 cm: lo pesado hay que alzarlo al final, y arrastrarlo no basta;
  - las señales de esfuerzo dependen de la exigencia por mano, normalizada por `HAND.maxV`, no de la tensión bruta;
  - medición conjunta del tira y afloja para resolver H-02 antes de tocarlo.
- **Aceptación:**
  - con minCarriers−1, ni el piano ni la mesa ni la nevera se cargan en 120 s;
  - con minCarriers, el tiempo de entrega cambia ≤ 10 %;
  - rayas de esfuerzo ≤ 20 % del tiempo con dos llevando bien el sofá y ≥ 80 % con uno solo que no puede.
- **Riesgo:** T-truck y T-view (colliders a 0,00 mm), T-grip y T-coop.
- **Parada:** si cualquier T-grip, T-coop o T-pen falla.

### Después de 2b (no antes)

- Contenido: los niveles 1–4 y un papel para el 4.º jugador (objetos de 4 manos y tareas paralelas).
- Arte en Blender y sombreros por jugador (C2-12).
- Fuga de texturas (C2-18) y pulido visual (C2-20).
- README.

### Condiciones de parada comunes a todo 2b (se miden en cada paso)

- Cualquier prueba de Vitest que falle o cualquier umbral que haya que tocar sin migración justificada → **parar**.
- help-batch < 40/40; T-route con algún fallo; «La calle» con solo humanos y mediana > +5 % → **parar**.
- `duo-e2e` o `keyboard-e2e` (ya arreglados) por debajo del 95 % → **parar**.
- Coste por paso > +20 % (`npm run perf` y `perf:patio`) → **parar**.
- Cualquier mejora en un modo de 1 a 4 jugadores que empeore otro modo por encima de su umbral → **parar** e informar con las cifras de los dos modos.

## 8. Pruebas que faltan

1. **Personas (H), por prioridad (r7):**
   - P1: patio con 2 parejas nuevas (¿rompen la lámpara?, ¿les parece justo?);
   - P1: «La calle» sin instrucciones (¿sueltan el sofá dentro?, ¿cómo reaccionan al aviso rojo?);
   - P1: 4 personas con 1–2 ayudantes en el patio;
   - P2: un «gamberro» que retiene;
   - P2: ¿el 4.º jugador tiene algo que hacer? y ¿llevan el piano entre 3?;
   - P2: jugar solo con 3–5 ayudantes;
   - P3: empalme de las rampas;
   - P3: encuadre con 4 jugadores;
   - P4: sonido y mandos físicos.
2. Mandos físicos con 3–4 jugadores, sonido con altavoces y rendimiento en una GPU real.
3. Resolver las discrepancias abiertas (sección 3): medición conjunta del tira y afloja, la mesa a solas con un único método y la lámpara a 3,12 m/s.
4. Navegador con humanos y ayudantes (cuando el e2e sea fiable).
5. Escalera dibujada frente a la física de rampa (menor del ciclo 1, sin volver a medir).

## 9. Criterios de aceptación del ciclo 2b y riesgos

**Para considerar cerrado el ciclo 2b:**
- los cinco P1 (C2-01, C2-02, C2-04, R-C2-01 y C2-05) cerrados con las métricas de la sección 7;
- ningún P1 nuevo;
- Vitest en verde sin rebajar umbrales;
- `duo-e2e` y `keyboard-e2e` ≥ 95 % en 20 ejecuciones;
- una ronda de revisión independiente con cada dimensión ≥ 7, como paso intermedio. El umbral del proyecto sigue siendo 8,5 y hacen falta dos rondas consecutivas para la aceptación final;
- una prueba humana mínima de la sección 8, P1.

**Riesgos principales:**
1. Cambiar la regla de entrega o la de fragilidad modifica especificaciones aprobadas (T-deliver, T-item-3). Requiere decisión humana y migración documentada de las pruebas.
2. El piloto sustenta las mediciones: un cambio en él puede ocultar o crear regresiones. Hay que medir antes y después con las mismas semillas y salidas.
3. Con el escalón del camión cambian los colliders verificados, así que hay que repetir T-view.
4. Las mediciones con piloto no sustituyen a personas: la diversión sigue sin validar.
