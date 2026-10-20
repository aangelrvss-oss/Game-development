# Estado de calidad — Project Rebirth

Documento persistente de la transformación. Cada ciclo **lo lee al empezar y lo actualiza al terminar**. Nada se marca como hecho sin una evidencia que se pueda repetir.

## 1. Referencia y protección

| Elemento | Valor | Estado |
|---|---|---|
| Rama de trabajo | `ccr-3fc93559-wz951a` (GitHub `aangelrvss-oss/Game-development`) | Publicada |
| Commit de referencia (checkpoint) | `08547f8dd12f57aed91400d5a6102d8e8a2d3130` | Es ancestro de la rama remota: se recupera con `git checkout 08547f8 -- mudanza-imposible` o `git worktree add <dir> 08547f8` |
| Etiqueta anotada `rebirth-baseline-08547f8` | Creada en el contenedor y apunta a `08547f8` | **No publicada.** `git push origin refs/tags/…` devuelve HTTP 403: la política de Git de esta sesión no deja publicar etiquetas. Decisión pendiente (sección 7). |
| Etiqueta ligera `checkpoint/rebirth-0` | Solo en el contenedor, apunta a `08547f8` | Sustituida por la anotada; no es necesaria |
| Entorno | Sesión remota de Claude Code en un contenedor efímero en la nube; 4 CPU, sin GPU; Chromium con render por software | Lo que no esté en commit se pierde al reclamarse el contenedor |
| Blender | `bpy` 5.2.2 (PyPI) sin interfaz en `~/blender-venv`, instalado con `assets-src/blender/setup.sh`. Probado: modela, aplica modificadores, exporta GLB y guarda `.blend`. | El binario oficial no se puede descargar (download.blender.org bloqueado, 403) |

## 2. Dirección artística

[`ART_DIRECTION.md`](ART_DIRECTION.md), «Maqueta de mudanza», en el commit `6d6bc5b`. Es la propuesta vigente: el usuario autorizó la transformación con ella, pero aún no la ha validado visualmente.

## 3. Línea base (19-10-2026, código de juego = `08547f8`)

### Pruebas automáticas (salidas literales en [`baseline/`](baseline/))

| Prueba | Resultado |
|---|---|
| `tsc --noEmit` | OK |
| `vitest run` | 29/29 |
| `npm run build` | OK |
| `npm run perf` | 0,13–0,19 ms por paso con 2–6 porteadores (con varios agentes ejecutándose en paralelo) |
| `npm run sim` (1 humano y ayudantes) | 2/3/4 atentos: entregado en 35,6, 36,0 y 35,9 s, al 100 %. Despistados (semillas 1–4): 96 %, 28 %, roto y 92 %. 6 despistados: 87 %. |
| Reproducción de la auditoría (`scripts/audit/agentes/verify.ts`) | 4 humanos agarrando: el sofá vuelca (sofaUp mínimo −1,00, integridad 84, 2 caídas). Uno solo alzando: 4,85 m en 3 s, con el extremo libre a 2,08 m. Piloto a dos: gana en 42,4 s con 7 retrocesos. |

### Pruebas en el navegador (Chromium por software; salidas en [`baseline/navegador.txt`](baseline/navegador.txt))

| Prueba | Resultado |
|---|---|
| `e2e:smoke` (4 porteadores, demo automática) | Gana en 35,9 s, sofá al 100 %. 289 llamadas de dibujo y 62 800 triángulos. Solo el aviso de Rapier. |
| `e2e:dos` | 3,68 m juntos y 1,27 rad de giro. OK. |
| `e2e:teclado` | Todo OK, incluido «Mayús alza 0,56 m». |
| `e2e:duo` | **19/20.** Falla «J2 se levanta solo»: tras la caída provocada, a los 1,5 s sigue en el suelo. Es un fallo intermitente previo, sobre el código de referencia sin cambios; se investiga en el ciclo 1. Victoria a los 42,4 s, sin errores de consola. |

### Pendientes de validación humana

- Nadie ha jugado nunca la demo; todas las pruebas usan scripts.
- Que se entienda el objetivo y los controles sin ayuda, y si alzar se entiende (el usuario dice que no lo entendió).
- Diversión, gracia de las caídas y legibilidad del caos.
- Mandos reales (Gamepad API) y teclados reales con 2–4 personas (fantasmas de teclas).
- Rendimiento con una tarjeta gráfica real.

## 4. Auditoría

- **Informes íntegros:** en [`audit/`](audit/00-indice.md): 6 auditores, el revisor de completitud y el JSON original.
- **Verificación independiente, hallazgo por hallazgo:** en [`audit/08-verificacion.md`](audit/08-verificacion.md), con scripts en `scripts/audit/verif-*/`.
  - **94 hallazgos:** 86 CONFIRMADOS, 8 PARCIALES, 0 refutados, 0 no reproducidos.
  - **Los 6 críticos están confirmados con medición.** Se agrupan en 5: el de entrada aparece en dos áreas.
  - **Parciales, casi siempre por gravedad exagerada:**
    - fisica-10: recolocar a los porteadores alejados;
    - niveles-15: un cuerpo fijo por caja, una optimización sin coste medible;
    - ui-audio-07: alzar no se entiende; el aviso sí aparece en la escalera;
    - ui-audio-11: la física cambia según el número de jugadores; el menú lo indica;
    - ui-audio-13, -18 y -20: menores correctos con matices;
    - reutilizable-03: jugadores solo distinguibles por color; los sombreros son una especificación nueva.

Defectos críticos según los auditores, sin duplicados, con su verificación:

| ID | Defecto | Verificación |
|---|---|---|
| C1 | Con 4 jugadores (física cooperativa) el sofá vuelca solo y se rompe; con 3 es leve | **CONFIRMADO**: `verify.ts`, caso A |
| C2 | El agarre es una mordaza rígida: uno solo alza y lleva el sofá; la masa no se nota en vertical | **CONFIRMADO**: `verify.ts`, caso B |
| C3 | Se pierden pulsaciones de agarrar y enderezar en los fotogramas sin paso de física; Start solo pausa bien en el mando de J1 | **CONFIRMADO leyendo el código** (`input.ts:73`, `main.ts:240-253`); no reproducido con hardware |
| C4 | `visOff` desplaza el muñeco para esconder penetraciones y contradice la cápsula física | **CONFIRMADO**: el código lo hace por diseño (`dollView.ts`, `pushOut`) y lo escribí yo en el ciclo anterior |
| C5 | Nada demuestra que el nivel se complete con 3 o 4 jugadores (0/8 medidos) | **CONFIRMADO** (qa-01 en `08-verificacion.md`) |

Matices de la verificación sobre los críticos:
- **C1:** depende de que los cuerpos toquen el sofá al agarrar (con los contactos desactivados en memoria no vuelca). Pierde un 16–24 % en 3 s. Con 3 jugadores solo se inclina.
- **C2:** la masa real del sofá «90 kg» es de 66,5 kg, porque la densidad se calcula sobre cajas que se solapan.
- **C3:** a 144 Hz se pierde el 58 % de las pulsaciones; medido con el `InputManager` real en Node, sin hardware.

**Mayores:** 35 en total, en `audit/0*.md`. Los 10 problemas estructurales del revisor (`audit/07-revisor-completitud.md`, sección 4) son la base del plan.

## 5. Conflictos de la auditoría resueltos (fase 1)

1. **No se desactiva el choque cuerpo-objeto al agarrar.** El informe de física lo proponía, pero revertiría la corrección de colisiones (prueba `sim.test.ts`, «no lo atraviesa», < 3 cm). La mordaza rígida no la causa el contacto en sí, sino la combinación de rótula sin límite de fuerza, contacto y rotación bloqueada. La solución es una **mano blanda con fuerza limitada**, manteniendo el contacto.
2. **Se quita la tecla de alzar del bucle básico.** Lo pide el usuario, y la auditoría midió que en llano no hace falta: a dos suben la escalera sin alzar en 3,95 s, frente a 3,48 s alzando.
   - Agarrar levanta automáticamente lo que la fuerza de quien agarra permite. Uno solo levanta un extremo y arrastra; dos llevan el objeto en el aire.
   - La escalera se supera porque la carga va en el aire, no por una tecla.
   - El aviso del HUD pasa a «Pesa mucho: falta alguien en el otro extremo».
   - La propuesta de `LevelDef` del informe de niveles (`action:'lift'`, `when:'notLifted'`) queda descartada.
3. **Una sola física.** Masa del sofá, fuerza por persona, contacto al agarrar y equilibrio iguales con humanos y con ayudantes. Las diferencias que hagan falta, por ejemplo que la IA de los ayudantes no se caiga, se aíslan en la IA y se documentan, no en la física.
4. **Nada de desplazar el dibujo para esconder solapes.** La cápsula física tiene la anchura del muñeco, y la caída usa un collider tumbado de verdad.
5. **Las pruebas existentes se migran, no se rebajan.** Las que comprueban una mecánica eliminada (la escalera sin alzar) se sustituyen por la nueva regla («uno solo no la sube; dos sí, sin tecla») y se registra el cambio. Ningún umbral se relaja para hacer pasar una prueba.

## 6. Plan de ciclos (máximo 8)

| Ciclo | Objetivo | Estado |
|---|---|---|
| 0 | Diagnóstico: auditoría protegida, línea base, dirección artística, checkpoint, estado persistente | **Cerrado** el 19-10-2026, ~21:05 UTC |
| 1 | **Núcleo fiable**: entradas sin pérdidas (incluidos mandos y 4 jugadores); mano blanda con fuerza limitada y física única; alzado automático; cápsula a la anchura del muñeco y caída física sin `visOff`; pruebas de partida completa con 2, 3 y 4 jugadores. Especificación: [`cycles/ciclo-1.md`](cycles/ciclo-1.md) | **Implementado, revisado y corregido** (`7b67f61`: tsc OK, Vitest 71/71, `e2e:duo` 21/21, `e2e:teclado` OK). Crítico cerrado. Falta la segunda ronda de revisión (verificación de la corrección), que abre el ciclo 2. Un mayor (3.º y 4.º jugador sin papel) pasa al ciclo 2. |
| 2 | Sistema de objetos (`ItemDef`) con objetos de varias manos y entrega en el camión con progreso; nivel como datos (`LevelDef`) con el recorrido actual como nivel de referencia; papel real para el 3.º y el 4.º jugador. Especificación: [`cycles/ciclo-2.md`](cycles/ciclo-2.md) | **Implementado e integrado, PENDIENTE DE REVISIÓN INDEPENDIENTE**: commit de integración `5cab122` (20-10-2026). Revisión independiente en curso. Sin corrección. **No es satisfactorio todavía**: hay mayores abiertos (sección 9). |
| 3 | Nivel 1 completo («Una casa imposible»), con aprendizaje integrado | Pendiente |
| 4 | Personajes y assets con Blender (muebles, camión) siguiendo la dirección artística | Pendiente |
| 5 | Niveles 2–4 (escaleras, calle, almacén) | Pendiente |
| 6 | Interfaz, menús de selección de nivel, cámara cooperativa, audio reactivo y música | Pendiente |
| 7–8 | QA adversarial, rendimiento, vídeo y demo lista | Pendiente |

**Criterio de parada:**
- cero críticos conocidos;
- pruebas en verde sin rebajar umbrales;
- dos rondas consecutivas de revisión sin regresiones graves y con al menos 8,5/10 en cada dimensión evaluable;
- 4 niveles completos;
- una partida completa validada;
- un vídeo nuevo;
- la lista de pruebas humanas pendiente.

O bien se llega al ciclo 8, o una regresión crítica sin resolver obliga a parar.

## 7. Decisiones pendientes del usuario

1. **Publicar la etiqueta `rebirth-baseline-08547f8`.** Desde esta sesión no es posible (HTTP 403).
   - **Recomendación:** créala desde tu clon con `git fetch origin && git tag -a rebirth-baseline-08547f8 08547f8dd12f57aed91400d5a6102d8e8a2d3130 -m "Project Rebirth: línea base" && git push origin rebirth-baseline-08547f8`.
   - Mientras tanto, el commit está protegido como ancestro de la rama publicada.

## 8. Bucle

- **Mecanismo:** `/loop` en modo autorregulado.
  - Cada iteración ejecuta o integra un único ciclo y programa la siguiente con `ScheduleWakeup`, como latido de respaldo de 30 minutos.
  - La señal principal es el aviso de fin del flujo de agentes del ciclo.
- **Estado:** reactivado el 19-10-2026 a las ~21:00 UTC, después de cerrar y proteger el ciclo 0.
- **Ciclo actual:** 2, integrado como `5cab122` y PENDIENTE DE REVISIÓN INDEPENDIENTE. No se empieza el ciclo 3 sin decisión humana.
- **DETENIDO el 20-10-2026 a las ~08:15 UTC por petición del usuario (revisión humana).**
  - `ScheduleWakeup` se paró y canceló el despertar pendiente; no queda ninguno programado.
  - Se esperó a que el agente del paso 3 hiciera su commit (`23b8c66`, árbol limpio, sin bloqueos de Git) y después se detuvo el flujo `wf_a0c2d6f7-d64`. En ese momento solo corrían dos revisores de solo lectura.
  - No ha empezado ningún ciclo nuevo.
  - Para retomar el ciclo 2 en su revisión: `Workflow({scriptPath: <script rebirth-ciclo-2>, resumeFromRunId: "wf_a0c2d6f7-d64"})`. Las 5 llamadas terminadas (2 de re-revisión y 3 de implementación) vuelven de caché, y los revisores y la corrección se ejecutan de nuevo.
- **Límite:** 8 ciclos completos.
- **Se detiene:**
  - cuando se cumple el criterio de la sección 6;
  - ante una regresión crítica;
  - ante un bloqueo que necesite una decisión humana;
  - o si el usuario lo pide.
- **Verificación:** la respuesta de `ScheduleWakeup` confirma el próximo despertar; no hay ningún otro proceso ni cron.

## 9. Registro de ciclos

- **Ciclo 0** (19-10-2026, cerrado):
  - auditoría con 7 agentes;
  - verificación independiente de los 94 hallazgos;
  - línea base automática y de navegador (`e2e:duo` 19/20 con un fallo previo);
  - dirección artística;
  - Blender sin interfaz;
  - etiqueta anotada local, cuya publicación está bloqueada por la política (HTTP 403);
  - todo en commits y publicado.
  - **Incidencia:** 3 verificadores fallaron por el límite de uso de la sesión («resets 8:30pm UTC») y se repitieron con éxito. **Riesgo para los ciclos siguientes:** el límite de uso puede interrumpir flujos largos; si ocurre, se reanuda el flujo (los agentes terminados quedan en caché) y se registra.
- **Ciclo 1** (19–20-10-2026, en curso):
  - **Pasos implementados en el worktree `rebirth/ciclo-1`** (informes de los implementadores en [`reviews/ciclo-1/`](reviews/ciclo-1/)):
    - `d328602`: mano blanda y física única. Uno solo arrastra el sofá 1,12 m en 3 s; dos lo llevan 6,90 m y suben la escalera en 3,87 s sin tecla; 4 jugadores, 0 vuelcos; con ayudantes, 39/40.
    - `a3dae8f`: entradas retenidas, 4 jugadores y mandos por índice (18 pruebas nuevas).
    - `eadedff`: muñeco a escala 0,891 = cápsula de 1,38 m, caída con collider tumbado y `visOff` eliminado.
    - `e0a1711`: piloto para 2, 3 y 4 humanos (unos 32 s, 0 caídas), `lastDist` corregido y e2e sin Mayús (`duo-e2e` 20/20).
  - **Incidencia:** el contenedor se reinició (~23:50 UTC) durante la revisión. El disco se conservó, pero se perdieron las revisiones de diseño, QA y arte en curso.
    - Para protegerlo, el ciclo se integró en la rama publicada (`e0d8561`) tras validar tsc, Vitest 62/62 y build.
    - El flujo se reanudó desde caché (`wf_5b4f2ec4-c74`).
  - **Revisión de física (rol B), [`reviews/ciclo-1/revision-fisica.json`](reviews/ciclo-1/revision-fisica.json): 5/10.**
    - Confirma que la mordaza ha desaparecido, que la física es idéntica bit a bit entre modos, que es estable de 10 a 250 kg y que se completa con 2, 3 y 4 jugadores.
    - **CRÍTICO:** piernas, brazos y manos del muñeco se dibujan desplazados hacia el origen del mundo (`DOLL_SCALE` aplicada dos veces). Es una regresión introducida en `eadedff`.
    - **Mayores:** tirando de lado, uno solo mueve el sofá demasiado deprisa (T-grip-2); y la correa hace inalcanzable «¡Se escapa!» en un tira y afloja.
    - Además, 4 menores.
    - **No se avanza al ciclo 2 hasta corregir el crítico.**
  - **Revisión de QA (rol F), [`reviews/ciclo-1/revision-qa.json`](reviews/ciclo-1/revision-qa.json): 6,5/10.**
    - Confirma: tsc limpio; Vitest 62/62 en 4 ejecuciones (2 barajadas); `sim-run` 112/112 frente a 94/112 de la línea base; a 144 Hz en Chromium, 40/40 pulsaciones llegan una sola vez.
    - **Mayores:** el bucle de `main.ts` no estaba probado; T-phys-unify no medía la fuerza de los ayudantes; «¡Se escapa!» sin prueba positiva; un desplazamiento visual de 15 cm no se detectaba; T-grip-2 de lado; `duo-e2e` usaba un contador privado del juego como oráculo.
    - Además, 7 menores (teletransportes sin comprobar el sitio, coste por paso duplicado, pulsaciones de la cuenta atrás descartadas, caídas de ayudantes en grupos grandes…).
  - **Revisión de diseño y producto (roles A y G), [`reviews/ciclo-1/revision-diseno.json`](reviews/ciclo-1/revision-diseno.json): 4/10.**
    - Confirma: sin tecla de alzar; la mano sube sola; uno solo arrastra un extremo y entre dos va en el aire; el aviso «Pesa mucho» nombra la tecla del compañero libre; cooperar es imprescindible.
    - **Crítico:** el mismo de las extremidades.
    - **Mayores:** el esfuerzo no se ve desde la cámara; el 3.º y el 4.º humanos no aportan nada; Retroceso reiniciaba la partida al instante.
    - Además, 8 menores (menú, mando en la pausa, J4 tapado a 720p, README desfasado…).
  - **Revisión de arte y animación (roles C y E), [`reviews/ciclo-1/revision-arte.json`](reviews/ciclo-1/revision-arte.json): 3/10.**
    - Confirma: tronco y cabeza dentro de la cápsula, de pie y tumbado; el collider se tumba de verdad.
    - **Crítico:** el mismo de las extremidades.
    - **Mayores:** el aviso «Pesa mucho» se quedaba en pantalla; los ayudantes no cabían en su cápsula (el perro tumbado, vertical).
    - Además, 7 menores (escalera dibujada con peldaños y física de rampa, botas en el sofá, animación de levantarse más larga que la física…).
  - **Corrección (`f8efb59`, integrada en `7b67f61`), [`reviews/ciclo-1/informe-correccion.json`](reviews/ciclo-1/informe-correccion.json):**
    - **Crítico cerrado:** caderas, hombros, tobillos y manos pasan al espacio del grupo (`CharacterRig.local`). Separación de las piernas al cuerpo: 0,03–0,05 m, antes hasta 4,89 m. La prueba nueva, a 43 m del origen, falla con el código anterior (5,27 m).
    - **Mayores cerrados**, cada uno con una prueba que falla sin la corrección:
      - elipse lateral de la mano (`HAND.lateral` 0,45): uno solo, como máximo 1,26 m en 3 s en cualquier dirección;
      - la correa cede en un tira y afloja: «¡Se escapa!» a los 0,55 s;
      - el ayudante arrastra como un humano (0,64 frente a 0,72 m);
      - el aviso «Pesa mucho» dura 1 s como máximo;
      - Retroceso solo reinicia desde la pausa;
      - `stepFrame` compartido por `main.ts` y las pruebas;
      - T-coh-1 comprueba los pies en el extremo del eje de la cápsula;
      - `duo-e2e` mide por su cuenta el tiempo que no cabe de pie;
      - el esfuerzo se ve desde la cámara de juego;
      - los ayudantes caben en su cápsula (`TiltFit` compartido).
    - **Pruebas:** tsc OK; Vitest 71/71 (9 nuevas); `e2e:duo` 21/21; `e2e:teclado` OK.
    - **Pendiente:**
      - el 3.º y el 4.º humanos no aportan (33,0–33,5 s con 2, 3 o 4 activos): requiere objetos de varias manos o tareas paralelas, así que **pasa al ciclo 2**;
      - las botas de los ayudantes sobresalen 6–9 cm.
    - **Costes medidos de la elipse lateral:** entre dos, el sofá de lado recorre 4,47 m en lugar de 6,29; una caja de 90 kg de lado va al 74 % de la velocidad de carga; con 3 humanos, el giro mínimo es 1,85 rad (el umbral es 0,5).
    - **Menores que siguen abiertos:**
      - escalera dibujada con peldaños y física de rampa;
      - contactos sueltos de hasta 4,4 cm (la línea base daba 6,1 cm);
      - teletransportes sin comprobar el sitio;
      - coste por paso duplicado.
- **Ciclo 2** (20-10-2026; implementado, integrado y PENDIENTE DE REVISIÓN INDEPENDIENTE): ver [`cycles/ciclo-2.md`](cycles/ciclo-2.md) y su guion de agentes [`cycles/ciclo-2.workflow.js`](cycles/ciclo-2.workflow.js).
  - Flujo de agentes `wf_a0c2d6f7-d64` lanzado sobre `5505243`, en este orden:
    1. segunda ronda de revisión del ciclo 1 (2 revisores, worktree `Game-development-r1b`); si encuentra un crítico, el flujo se detiene;
    2. implementación en 3 pasos (worktree `Game-development-c2`, rama local `rebirth/ciclo-2`);
    3. revisión independiente con 3 revisores;
    4. corrección.
  - Si el contenedor se reinicia, se reanuda con `resumeFromRunId`.
  - **Segunda ronda de revisión del ciclo 1** (sobre `5505243`, que tiene el mismo código que `f8efb59`; los scripts están en `scripts/audit/review-c1b/`). **Sin críticos**, así que el flujo siguió con la implementación.
    - **Física y QA (roles B y F), [`reviews/ciclo-1/segunda-ronda-fisica-qa.json`](reviews/ciclo-1/segunda-ronda-fisica-qa.json): 6,5/10** (antes, 5 y 6,5).
      - De las afirmaciones de la corrección: 15 confirmadas, 4 parciales y 1 refutada.
      - Confirma que el crítico está cerrado (con la mutación, 5,27 m); que las pruebas nuevas detectan 14 de 18 mutaciones; Vitest 71/71 en 5 ejecuciones, 3 barajadas; física idéntica bit a bit entre humanos y ayudantes; recorridos con 2, 3 y 4 humanos 48/48.
      - **Mayores:**
        1. **Regresión de la corrección.** La elipse lateral, sumada a la correa que cede, pierde 7 de 512 partidas con despistados o mixtas; el árbol anterior no perdía ninguna. En el lote mixto se pasa de 112/112 a 110/112, y aparecen partidas de 58 y 77 s. Se refuta el «siempre al 100 %» del informe.
        2. **`e2e:duo` inestable:** 20/21 en 1 de 2 ejecuciones («J2 se tambalea y cae» depende del giro del sofá).
        3. **T-grip-2 se burla** agarrando por el respaldo: uno solo, 3,12 m en 3 s. Es anterior a la corrección; la prueba solo mira el extremo.
        4. **Tira y afloja a medias:** en 2 contra 1 el que pierde es arrastrado 1 m sin «¡Se escapa!», y la prueba positiva se suelta por la regla «de golpe», no por la de tiempo.
    - **Diseño, producto, arte y animación (roles A, G, C y E), [`reviews/ciclo-1/segunda-ronda-diseno-arte.json`](reviews/ciclo-1/segunda-ronda-diseno-arte.json): 6,5/10** (antes, 4 y 3).
      - De las afirmaciones: 8 confirmadas y 3 parciales.
      - Confirma, midiendo en el mundo hasta 40,8 m del origen, que el crítico está cerrado; que Retroceso y el aviso «Pesa mucho» están corregidos; y que los ayudantes caben (≤ 2,8 cm).
      - **Mayores:**
        1. el 3.º y el 4.º jugador siguen sin aportar (objetivo del ciclo 2);
        2. las señales de esfuerzo están saturadas: con dos cargando bien, rayas el 82 % del tiempo, así que no distinguen «falta ayuda» de «vamos bien».
      - **Menores:**
        - regresión: la ayuda tapa la pastilla de J4 (60–139 px a 1280×720);
        - el perro pierde su silueta;
        - TiltFit deja rígidos al perro y al enano;
        - el aviso «Pesa mucho» no sale a tirones, con dos en el mismo extremo ni con uno quieto;
        - con mando no se puede reiniciar;
        - siguen abiertos los menores de menú, resultados y README;
        - la etiqueta J# salta;
        - levantarse dura 0,85 s en el dibujo y 0,6 s en la física.
    - **Esta ronda no es satisfactoria (6,5 < 8,5).** Los 6 mayores pasan al agente de corrección del ciclo 2, junto con los de su propia revisión.
  - **Implementación** (informes literales en [`reviews/ciclo-2/`](reviews/ciclo-2/)):
    - `a84984f`: catálogo `ItemDef` con 7 objetos y una sola física. **Hallazgo:** el sofá pesa 66,46 kg y no 90, porque Rapier pesa la caja redondeada por su caja interior. Es así desde antes del proyecto.
    - `ec1d620`: `LevelDef` («La calle» y «Patio de pruebas»), camión con caja de carga y rampa, entrega con progreso y lista «Cargados N/M». La entrega dentro del camión añade unos 2 s a «La calle».
    - `23b8c66`: objetos dibujados de forma procedural, ayudantes y piloto por equipos. T-roles: medianas 45,85, 31,68 y 30,85 s con 2, 3 y 4 humanos.
    - `80b4d53`: evidencias. Son las 8 capturas a 1280×720 de [`reviews/ciclo-2/capturas/`](reviews/ciclo-2/capturas/) y el guion del flujo.
  - **Pausa por revisión humana** (~08:15–10:50 UTC): el flujo se detuvo antes de su revisión y su corrección, que no llegaron a ejecutarse.
  - **Verificación de solo lectura** sobre `c52a81c` frente a `23b8c66`, en [`reviews/verificacion-pausa/`](reviews/verificacion-pausa/):
    - **Pruebas en Node:** tsc limpio; Vitest 71/71 frente a 112/112, también barajado; las 71 pruebas anteriores siguen con el mismo nombre; **ningún umbral rebajado** (solo adaptaciones de API); build correcta.
    - **Coste del ciclo 2 en «La calle»:** la entrega es 2–6 s más lenta y las caídas de porteadores pasan de 24 a 48 en 30 partidas (28 en la zona del camión).
    - **Los seis mayores del ciclo 1:**
      - **P1** regresión con ayudantes: **EMPEORADO**, 11/512 perdidas frente a 7/512. Hay derrotas nuevas con atentos: el sofá se queda atascado al pie de la rampa del camión.
      - **P2** `e2e:duo` inestable: **ABIERTO**. La reproducción en Node da lo mismo en las dos versiones, 62/85.
      - **P3** transporte individual explotable: **EMPEORADO**. El sofá sigue igual (3,12 m en 3 s), y la mesa la mueve uno solo 4,88 m en 3 s y la mete en el camión del patio en 13,7 s; la nevera, en 23,6 s.
      - **P4** tira y afloja: **ABIERTO**. No cambia: en 2 contra 1 no salta «¡Se escapa!» y la regla de tiempo nunca actúa.
      - **P5** utilidad del 3.º y el 4.º jugador: **PARCIAL**. En el patio, el 3.º acorta un 30,9 %, pero el 4.º solo un 2,6 % más (en 2 de 3 salidas tarda más que con 3). En «La calle» no aportan.
      - **P6** señales de esfuerzo: **ABIERTO**. No cambian, y con la caja salen «rayas» el 100 % del tiempo llevándola bien.
    - **Contenido:**
      - **Niveles:** de los 4 niveles del plan no existe ninguno. «La calle» es el recorrido mezclado de siempre y el patio es una escena de prueba. El nivel solo se elige por URL; el menú no tiene selector.
      - **Objetos:** la nevera y el piano, opcionales, no aportan nada a la partida.
      - **Récord:** el mejor tiempo se comparte entre niveles.
      - **README:** está desfasado.
      - **Sombreros:** no hay sombreros distintos por jugador.
      - **Blender:** solo se ha usado en una prueba de instalación (un cubo en `/tmp`). No se ha creado ningún asset `.glb` ni `.blend`.
  - **Pruebas antes de integrar**, sobre `23b8c66`:
    - `npx tsc --noEmit -p .`: exit 0.
    - `npx vitest run --maxWorkers=1`: «Test Files 7 passed (7) · Tests 112 passed (112)».
    - `npm run build`: correcta; el JS ocupa 2.940,64 kB (1.030,74 kB con gzip).
    - `keyboard-e2e`: «TODO OK», a 10,6 FPS con render por software.
    - `duo-e2e`: **1 de 2 en verde.** La otra ejecución dio «FALLA soltar mientras tira: J2 se tambalea y cae — tambaleo true, caída false». Es P2, abierto desde `f8efb59` e idéntico en `c52a81c`: el resultado depende del giro que tenga el sofá al soltar, que en el navegador varía con los FPS. No se ha tocado ni la prueba ni el umbral.
  - **Integración:**
    - Merge `--no-ff` `5cab122`, «CICLO 2 — PENDIENTE DE REVISIÓN INDEPENDIENTE».
    - Primer padre: `b7c54df`, sobre la referencia revisada `657fd30`. Segundo padre: `80b4d53`.
    - El código es idéntico a `23b8c66`: el diff sin documentación ni auditoría sale vacío.
    - Sobre el árbol integrado: tsc OK y Vitest 112/112.
    - Para comparar: `git diff 657fd30 5cab122`. Para deshacer: `git revert -m 1 5cab122`.
  - **Siguiente paso:**
    1. Revisión independiente del ciclo 2 con revisores que no lo implementaron (diversión y controles, física cooperativa y sabotaje, IA y modos de 1 a 4, estabilidad e2e y regresiones, arte y clipping, rendimiento y contenido).
    2. Después, prueba humana.
    - No se corrige nada ni se empieza el ciclo 3 sin decisión humana.
  - **Revisión independiente en curso** (desde ~10:55 UTC): flujo `wf_5062ee7a-d85` sobre el worktree desprendido `Game-development-rc2` en `04da4c4`.
    - 6 revisores que no implementaron nada (e2e y regresiones; física y sabotaje; IA y modos de 1 a 4; diversión y controles; arte y clipping; rendimiento y contenido) y un árbitro de contraste.
    - Solo miden; no corrigen.
    - Si el contenedor se reinicia, se reanuda con `resumeFromRunId`.
  - **Revisor 1, e2e y regresiones: 5/10.** [`reviews/ciclo-2/revision-independiente/r1-e2e-regresiones.json`](reviews/ciclo-2/revision-independiente/r1-e2e-regresiones.json).
    - **Resultados:** `duo-e2e` 2/8 en el ciclo 2 frente a 6/6 en `657fd30`, y `keyboard-e2e` 2/3 frente a 3/3. En la configuración de 4 humanos con 2 ayudantes atentos, la mediana pasa de 33,87 a 58,05 s. Hay 4 de 10 mutaciones sin detectar.
    - **Flujo:** se detuvo después de este revisor para hacer el diagnóstico; reanudarlo mantiene su resultado en caché.
  - **Diagnóstico de regresiones** (agente independiente, sin cambios en el juego), [`reviews/ciclo-2/revision-independiente/diagnostico-regresiones.md`](reviews/ciclo-2/revision-independiente/diagnostico-regresiones.md):
    1. **`duo-e2e`: FRAGILIDAD DEL TEST, no es una regresión.** Con la prueba original y tandas intercaladas pasan 5/10 en la base y 5/10 en el ciclo 2. En 400 escenarios emulados, 175 frente a 183 (p = 0,62).
       - Con las teclas S+↑ el paso «soltar» no pasa nunca, porque la prueba tira en el eje x sea cual sea la orientación del sofá.
       - El 6/6 del revisor 1 no se ha podido reproducir.
       - El ciclo 2 (`ec1d620`) cambia el orden interno de Rapier: añade 8 piezas fijas del camión. Eso altera cada ejecución sin inclinar el resultado.
       - **Consecuencia:** `e2e:duo` no sirve como criterio de aceptación mientras siga así.
    2. **Agarre fallido: FRAGILIDAD DEL TEST, anterior al ciclo 2.** Es el piloto de la prueba (pulsaciones de 0,87 m frente a una ventana de ±0,2 m y la alfombra fija). El agarre del juego da escenarios idénticos en `657fd30` y en `a84984f`.
    3. **`keyboard-e2e` «Con W» Δz = 0: FRAGILIDAD DEL TEST.** Una doble pulsación de Espacio con un estado viejo (`keyboard-e2e.cjs:41-50`). La misma secuencia de entradas falla igual en la base. La tasa por versión no es concluyente.
    4. **REGRESIÓN DE CÓDIGO CONFIRMADA en el piloto automático, introducida en `23b8c66` (confianza alta). BLOQUEANTE para la siguiente iteración. Identificador: R-C2-01.**
       - `autopilot.ts:533` solo cuenta el tiempo para dar un asa por inalcanzable cuando el piloto está cerca. Un piloto atrapado lejos no cambia nunca de asa y se queda varado entre 15 y 45 s.
       - Con solo esa línea como en `657fd30`, 4h/6c vuelve a 35,9–43,2 s y las caídas en el camión de esa configuración bajan de 23 a 9. Pero la mediana de T-roles con 2 jugadores empeora de 45,85 a 59,55 s, así que no basta con revertir.
       - Se suma `mayEnter` (`autopilot.ts:322-334`): cuenta a los ayudantes que no agarran como «gente en el carril», lo que supone 58 s de espera en la semilla 1.
       - Hay además un coste propio del diseño de `ec1d620`: las caídas en el camión pasan de 9 a 32.
       - **Alcance:** afecta a la demo, a la parte B de `duo-e2e` y a todas las mediciones que usan el piloto. A los jugadores reales solo les afecta el coste de la rampa y la caja de carga.
    - **No se ha corregido nada.**
