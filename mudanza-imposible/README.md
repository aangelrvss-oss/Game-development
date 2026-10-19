# La Mudanza Imposible · vertical slice físico

Demo jugable en el navegador **para dos personas en el mismo teclado**. Entre los dos hay que llevar un sofá desde una casa hasta un camión de mudanzas. Por el camino hay una calle con tráfico, una puerta estrecha, una escalera con giro de 90° y una rampa de chapa sin barandilla. El sofá pesa: uno solo apenas lo arrastra, y si uno suelta mientras tira, se tambalea y puede acabar en el suelo.

Todo lo que ocurre sale de la simulación física (Rapier). No hay animaciones prefabricadas que muevan el sofá.

![Rampa](docs/capturas/pulido/despues-cerca-rampa.jpg)

Todas las capturas de `docs/capturas/` son reales: Chromium sin interfaz con render por software. Las de `docs/capturas/pulido/` comparan la misma partida antes y después del pase visual (ver [Pase visual](#pase-visual-y-de-animación)).

**Vídeo de una partida a dos (62 s):** [`docs/video/mudanza-imposible-dos-jugadores.mp4`](docs/video/mudanza-imposible-dos-jugadores.mp4). Ver [cómo se ha grabado](#vídeo-de-la-partida-a-dos).

Vídeo anterior, de 1 jugador con ayudantes (40 s): [`docs/video/mudanza-imposible-partida-real.mp4`](docs/video/mudanza-imposible-partida-real.mp4).

## Cómo jugar en 1 minuto (dos jugadores)

```bash
cd mudanza-imposible
npm ci               # instala las versiones exactas del package-lock
npm run dev          # abre http://localhost:5173
```

1. En el menú ya están elegidos **2 jugadores y 2 porteadores** (sin ayudantes). Pulsa **Intro** o «¡A mover!».
2. **J1** (Abuela Moño, aro morado): **WASD** para moverse y **Espacio** para agarrar o soltar.
3. **J2** (Gordo, aro azul): **flechas** para moverse e **Intro** para agarrar o soltar.
4. Cada uno se pone en un extremo del sofá, lo agarran y lo llevan hacia arriba de la pantalla. El aro amarillo en el suelo marca el siguiente objetivo.
5. **Objetivo:** dejar el sofá en la zona verde junto al camión en menos de 3 minutos sin destrozarlo. **Retroceso** reinicia en cualquier momento; en la pantalla final, **Intro** vuelve a empezar.

Para ver una partida completa sin tocar nada, usa «Ver demo automática» o abre `http://localhost:5173/?auto=1` (1 jugador con ayudantes).

Requisitos: Node 20 o superior y un navegador con WebGL (Chrome, Edge o Firefox). No hay servicios externos ni de pago.

Versión de producción: `npm run build` y después `npm run preview`, que sirve en `http://localhost:4173`.

## Partida a dos: física cooperativa

Cuando todos los porteadores son humanos (por defecto, 2 de 2), se activa la física cooperativa (`isCoop` en `src/sim/game.ts`):

| Qué | Cómo funciona |
|---|---|
| **El sofá pesa** | 90 kg nominales (45 con ayudantes) y más roce a rastras. Cada porteador mueve el mueble con una fuerza limitada (200 N, `CARRIER.pullForce`), y en pendiente sostiene además su propio peso. Uno solo apenas lo arrastra (0–0,15 m en 1,5 s en el navegador); los dos juntos lo llevan a unos 2–3 m/s y tarda en arrancar y frenar. Si uno intenta llevarlo solo, la pantalla avisa: «¡Uno solo apenas puede con él! Agarradlo los dos». |
| **Tirar a la contra** | Si cada uno tira hacia un lado, el sofá gira sobre sí mismo (física, sin animación). |
| **Equilibrio** | Modelo del laboratorio de personaje (`../mudanza-imposible-character-lab/`), simplificado: un péndulo invertido que empujan las fuerzas que mide la física. Soltar mientras se tira con fuerza (la tensión desaparece de golpe) o que el compañero o el sofá te arrollen a la carrera te hace **tambalearte** («¡Uy, uy, uy!»: pasos apresurados hacia donde te caes, brazos en molinillo). Si no lo recuperas, **caes** («¡PATAPLOF!») hacia ese lado, sueltas el sofá y te levantas a los 1,3 s. Llevar el sofá con normalidad, agarrarlo (también llegando a la carrera: hay medio segundo para hacerse con el peso), alzarlo o chocar con una pared no tumba a nadie. |
| **Recuperarse** | Nadie se queda bloqueado: el que cae se levanta solo, el sofá volcado se endereza con R (J1) o - (J2), y si el sofá cae fuera del mapa vuelve al último punto. |

Con ayudantes de la máquina se mantiene la física original (sofá ligero, fuerza sin límite y sin pérdidas de equilibrio). Los ayudantes y el piloto automático están ajustados a ella; con la física cooperativa los ayudantes sueltan y reagarran para desatascarse y se caían una y otra vez.

**Por qué esta ruta.** El juego ya tenía partida completa, dos jugadores en un teclado, cronómetro, victoria, reinicio, sonido y pruebas; faltaba que hiciera falta cooperar y que hubiera tropiezos y caídas. Del laboratorio se ha traído el modelo de equilibrio (la física), no el muñeco: depende de datos propios del laboratorio, los personajes del juego ya habían pasado una revisión visual y la prioridad era jugar. La caída reutiliza el estado «tumbado» del juego, ya animado y estable, en lugar de volcar la cápsula física como en el laboratorio.

## Controles

| Acción | J1 (teclado) | J2 (teclado) | Mando (J1–J4) |
|---|---|---|---|
| Moverse | W A S D | Flechas | Stick izquierdo o cruceta |
| Agarrar / soltar | Espacio | Intro | A |
| Alzar (mantener) | Mayús izq. | Mayús dcha. | B o gatillos |
| Girar el sofá (rodeándolo; también tus ayudantes) | Q / E | , / . | LB / RB |
| Enderezar el sofá volcado | R | - | Y |
| Pausa | Esc | | Start |
| Reiniciar | Retroceso | | Start (en resultados) |
| Silenciar | M | | |

**Objetivo:** dejar el sofá en la zona amarilla junto al camión en menos de 3 minutos, sin que su estado llegue a 0 %.

**Estrellas:**
- una por entregar;
- otra si tardas 90 s o menos;
- otra si el sofá llega con un 70 % o más.

**Qué daña el sofá:**

| Causa | Daño |
|---|---|
| Golpe o caída brusca | Proporcional a la violencia |
| Atropello | −12 % |
| Enderezarlo | −3 % |
| Caer fuera del mapa | −15 %, +5 s y reaparece en el último punto |

## El recorrido

| Etapa | Qué pone a prueba |
|---|---|
| Patio | Agarrar y coordinarse. El sofá sale atravesado: hay que girarlo. |
| Calle | Dos carriles con coches y un semáforo cuyo ciclo es: verde para coches 8 s, ámbar 1,6 s, rojo total 1,4 s, verde para peatones 6 s. Si algo se queda en la calzada, los coches pitan, frenan a 3,2 m/s y lo empujan. |
| Portal | Puerta de 1,6 m. El sofá mide 2,2 × 0,9 m: solo pasa de largo, y los porteadores de los lados chocan con el marco. |
| Escalera | Rampa de 20° con peldaños visuales. Arriba, un rellano obliga a girar 90°. |
| Pasillo de arriba y terraza | Las paredes que tapan la acción se recortan hasta un zócalo, como en una maqueta. |
| Rampa | Chapa resbaladiza, 17° y sin barandilla. Si soltáis el sofá, baja deslizándose; si se cae por un lado, recibe daño (y a veces ahorra camino). |
| Entrega | El sofá tiene que reposar dentro de la zona 1 s. |

## Decisiones técnicas

- **Stack:** Vite 7, TypeScript, Three.js 0.179 y Rapier 0.19 (`rapier3d-compat`, WASM).
  - El repositorio solo tenía el motor por turnos de «A la de tres», que no sirve para física en tiempo real. Lo he dejado intacto en `../a-la-de-tres/` y he creado esta demo aislada.
  - Rapier es determinista, rápido (unos 0,1–0,16 ms por paso con 2–6 porteadores) y funciona igual en Node que en el navegador, así que la física se puede probar sin interfaz.
- **Simulación separada del dibujo:** `src/sim/` no importa Three.js ni el DOM. El bucle del navegador avanza la física a paso fijo (60 Hz) y luego dibuja.
- **Agarre:** articulación de rótula entre la mano del porteador y el punto del sofá que agarra.
  - Por eso el sofá gira, se inclina o se atasca según desde dónde y hacia dónde tira cada uno.
  - La mano empieza en el punto agarrado y sube a su altura a 1,4 m/s, para evitar tirones.
  - Si la mano y el punto se separan más de 0,55 m (dos personas tirando en sentidos opuestos, un golpe), el agarre se suelta («¡Se escapa!»).
- **Muñecas:** una rótula no hace par, así que con dos personas por los extremos el sofá giraba sobre su eje largo sin parar. He añadido un par estabilizador proporcional al número de manos. Deja inclinarlo, pero no voltearlo con facilidad. Es una ayuda física deliberada y está documentada en `game.ts` (`wristAssist`).
- **Porteadores:** cápsulas dinámicas con rotación bloqueada, controladas por velocidad objetivo con una aceleración máxima. Así responden al instante, pero pueden ser arrastrados por el sofá o por otros.
- **Recuperación sin reiniciar:**
  - **R** endereza el sofá.
  - Si cae fuera del mapa, reaparece en el último punto.
  - Un porteador que se queda lejos vuelve junto al sofá.
  - Se limitan las velocidades extremas del sofá para que un conflicto del solver no lo lance por los aires.
- **Ayudantes de la máquina** (`bots.ts`): son deliberadamente simples.
  - Van a un asa libre e imitan, con 0,17 s de retraso, cómo se mueven los humanos que cargan.
  - Acompañan los giros que se piden con Q/E.
  - Si empujan contra algo sin avanzar, sueltan el asa y vuelven a agarrar al poco. Así pasan la puerta.
  - En modo «Despistados» reaccionan más tarde y se desvían.
- **Piloto automático** (`autopilot.ts`): conoce la ruta y lleva al jugador 1. Sirve para el modo demo y para comprobar con la física real que el nivel se puede completar. No es una IA de juego.
- **Cámara:** cenital oblicua (unos 53°) con el norte siempre arriba, centrada en el sofá con un poco de adelanto y de peso hacia los humanos.
  - Se aleja si el grupo se dispersa.
  - Las paredes que tapan la acción se recortan hasta un zócalo opaco (corte de maqueta). Ventanas, toldos y el dintel de la puerta se ocultan; las jambas quedan a la vista para que se lea lo estrecha que es la puerta.
  - No gira, para que las direcciones de los controles no cambien y quien mira una grabación entienda el recorrido como en un mapa.
- **Aspecto:** todo es geometría procedural y texturas dibujadas en canvas al arrancar (sin modelos, imágenes ni texturas de terceros), con un estilo de juguete coherente con el concepto visual previo: abuelas, enano, gordo, alien y perro salchicha, y sofá crema con asas rojas y azules. Detalle en [Pase visual](#pase-visual-y-de-animación).
- **Sonido:** sintetizado con WebAudio, sin archivos.

## Estructura

```
mudanza-imposible/
  index.html            menú, interfaz, pausa y resultados (DOM + CSS)
  src/main.ts           bucle de juego, menú, eventos → sonido/efectos/mensajes
  src/sim/              simulación (sin Three.js)
    level.ts            geometría del recorrido, etapas y puntos de paso
    sofa.ts             cuerpo del sofá, asas y utilidades de rotación
    carrier.ts          porteador: movimiento, agarre, alzar, soltar y equilibrio
    traffic.ts          coches, carriles y semáforo
    bots.ts             ayudantes de la máquina
    autopilot.ts        piloto automático (demo y pruebas)
    game.ts             estado de la partida, daños, recuperación, victoria/derrota
  src/view/             dibujo con Three.js (escena, sofá, personajes, coches, efectos, cámara)
    textures.ts         texturas procedurales (asfalto, baldosa, ladrillo, tablas, tejas, chapa, tela, fachadas)
  src/input/input.ts    teclado (2 jugadores) y mandos (hasta 4)
  src/audio/sfx.ts      sonidos sintetizados
  src/ui/hud.ts         interfaz durante la partida
  tests/sim.test.ts     pruebas de la física sin navegador (Vitest)
  scripts/              simulación por consola, rendimiento, pruebas en Chromium, capturas y vídeo
    stills.cjs          capturas fijas en momentos fijos de una partida automática (?capture=1)
    record.cjs          graba la partida real fotograma a fotograma con su sonido
    video-cards.cjs     rótulos del vídeo
    make-video.sh       monta el MP4 (ffmpeg)
    duo-e2e.cjs         partida a dos en Chromium de principio a fin (npm run e2e:duo)
    record-duo.cjs      graba la partida a dos fotograma a fotograma con su sonido
    make-video-duo.sh   monta el MP4 de la partida a dos
  docs/capturas/        capturas reales (pulido/: antes y después del pase visual)
  docs/video/           vídeo de una partida real
```

## Pruebas ejecutadas y resultados reales

Todas se ejecutaron en este entorno (contenedor Linux sin GPU) el 18-10-2026, la última vez después del segundo ciclo de pulido visual.

### 1. `npm test`: 26 de 26 pruebas pasan

(19-10-2026; las 18 anteriores siguen pasando sin cambiar ningún umbral)

| Grupo | Qué comprueban |
|---|---|
| Dos jugadores sin ayudantes (física cooperativa, 8 pruebas nuevas) | La física cooperativa solo se activa sin ayudantes. Uno solo lleva el sofá menos de 3,2 m en 3 s y los dos, más del doble. Tirar a la contra lo gira (>0,5 rad) sin velocidades absurdas. Soltar mientras se tira con fuerza: tambaleo y caída, y a los 1,3 s se levanta. Llevarlo juntos (andar y alzar) no desequilibra a nadie, ni agarrarlo llegando a la carrera (esta prueba falla si se quita el margen tras agarrar). Chocar a la carrera con el compañero desequilibra a los dos, y contra una pared no. Dos jugadores llevados por el piloto automático completan el recorrido, todas las etapas en orden. |
| Sofá y agarre | En reposo no se mueve ni vibra (<2 cm en 3 s). Los ayudantes agarran y, con el jugador, levantan el sofá (>0,6 m) y lo sacan del patio. Agarrar y soltar funcionan. |
| Puerta estrecha | De lado se queda en la fachada; de largo pasa. |
| Tráfico | El semáforo da paso a los peatones solo después del ámbar y del rojo total. Un coche pita, golpea, daña (−12 %) y desplaza el sofá que está en su carril. Un porteador atropellado queda mareado. |
| Recuperación | Enderezar. Reaparecer al caer fuera del mapa (−15 %). Un porteador perdido vuelve junto al sofá. |
| Partida completa | Con el piloto automático se entrega el sofá con 2 porteadores atentos, 4 atentos y 4 despistados, pasando por todas las etapas en orden. Se pierde al agotar el tiempo. |
| Rampa | Un sofá soltado en la chapa resbala más de 2,5 m. |
| Datos del nivel | Todas las cajas tienen dimensiones válidas. |

### 2. `npm run sim`: piloto automático con física real, configuraciones variadas

| Porteadores | Ayudantes | Resultado | Tiempo | Estado del sofá |
|---|---|---|---|---|
| 2 | atentos | entregado | 35,6 s | 100 % |
| 3 | atentos | entregado | 36,0 s | 100 % |
| 4 | atentos | entregado | 36,0 s | 100 % |
| 4 | despistados | entregado | 46,5 s | 97 % |
| 4 | despistados | entregado | 62,6 s | 99 % |
| 5 | atentos | entregado | 102,4 s | 100 % |
| 6 | despistados | entregado | 77,7 s | 81 % |
| 6 | atentos (semilla 1) | **tiempo agotado** | 180 s | — |

El último caso es la última medición de una configuración que, en ejecuciones anteriores de la sesión, a veces sí se completaba. Con 6 porteadores el grupo es muy ancho y el piloto automático se atasca girando en el rellano.

### 3. Pruebas en Chromium (Playwright, render por software)

Repetidas el 19-10-2026 con la versión final de la partida a dos: todas pasan. Las tres anteriores fijan ahora en la URL su escenario de 1 jugador con ayudantes, porque el menú propone por defecto 2 jugadores.

| Prueba | Resultado |
|---|---|
| `e2e:duo` (partida a dos de principio a fin; 20 comprobaciones) | **Pasa las 3 últimas ejecuciones seguidas.** Con teclas reales: <br>• El menú propone 2 jugadores sin ayudantes e Intro empieza la partida. <br>• Los dos se mueven a la vez (W y flecha abajo: ±1,8 m). <br>• Agarran a la vez con Espacio e Intro. <br>• Juntos llevan el sofá 2,5–3,2 m en 1,5 s; uno solo, 0–0,3 m en 2,5 s, con el aviso en pantalla. <br>• Tirando de través cada uno hacia un lado, el sofá gira 0,5–1,6 rad. <br>• Si J2 suelta mientras tira, se tambalea y cae; se levanta solo y vuelve a agarrar. <br>• Correr contra la valla frena sin tumbar. <br>• Retroceso reinicia. <br>Con el piloto automático llevando a los dos (modo captura, misma física y dibujo): <br>• Victoria en 46,4 s con el sofá al 100 %, sin valores no numéricos ni velocidades disparadas. <br>• Pantalla de resultados «¡Sofá entregado!»; Intro (tecla real) empieza otra partida desde cero. <br>• Sin errores de página ni de consola. <br>Capturas en [`docs/capturas/duo/`](docs/capturas/duo/). |
| `e2e:smoke` (demo automática con 4 porteadores) | La partida se completa en 36,0 s con el sofá al 100 %. Sin errores de página. Queda un aviso benigno de la propia Rapier («deprecated parameters»). Unas 280 llamadas de dibujo y 48 000 triángulos por fotograma (antes del pase visual: 114 y 18 000). |
| `e2e:teclado` (teclas reales) | Agarrar con Espacio, que los ayudantes agarren, llevar el sofá con W (3,5 m), levantarlo (0,83 m), girarlo con Q (0,59–0,75 rad), alzarlo con Mayús (+0,56 m), soltarlo, pausar con Esc y reiniciar con Retroceso. Todo OK en las 3 últimas ejecuciones. Ver la nota sobre la resolución adaptable en [Rendimiento](#rendimiento). |
| `e2e:dos` (dos jugadores en el mismo teclado, sin ayudantes) | Los dos agarran, avanzan juntos y, si tiran en direcciones opuestas, el sofá gira por pura física. Con la física cooperativa: 1,61 m y 0,83 rad (antes 3,5–3,6 m y 1,4–1,5 rad, con el sofá ligero). |

Con `e2e:duo` las primeras ejecuciones fallaban de forma intermitente: el giro salía corto y el aviso de «uno solo» a veces no aparecía. Los dos casos eran fallos de la propia prueba: a veces tiraba a lo largo del eje del sofá y esperaba demasiado poco. Pero esa investigación destapó un fallo real del juego: agarrar el sofá llegando a la carrera hacía tambalearse. Se ha corregido con medio segundo para hacerse con el peso, y hay una prueba de Vitest que falla sin esa corrección.

Para ejecutarlas hace falta Playwright con Chromium, que no está en las dependencias. Con la demo servida en el puerto 4173:

```bash
NODE_PATH=$(npm root -g) npm run e2e:teclado
```

### Rendimiento

| Medida | Valor |
|---|---|
| Física (`npm run perf`) | 0,11 ms por paso con 2–4 porteadores y 0,16 ms con 6 (el presupuesto es de 16,7 ms) |
| Carga (Chromium local) | Aproximadamente 1 MB transferido (gzip). Menú listo en 1,9–2,8 s, con render por software |
| Imagen en este contenedor (render por software, sin GPU) | Unos 6 fotogramas reales por segundo con 4 porteadores a 1280×720, con la resolución adaptable al mínimo (la mitad). Antes del pase visual eran unos 4–5 a resolución completa |
| Coste por fotograma a resolución completa en este contenedor | 360 ms con sombras; 240 ms sin ellas; 180 ms sin personajes ni sofá; 54 ms a media resolución. Limita la cantidad de píxeles, no el número de objetos |

**No he podido medir los fps con una tarjeta gráfica real.** Unas 280 llamadas de dibujo y 48 000 triángulos deberían ir fluidos en un ordenador normal, pero queda por comprobar.

- **Ojo con la cifra `fps` de `__mudanza.fps()`:** el bucle limita cada fotograma a 0,1 s, así que en este contenedor marca unos 11 aunque los fotogramas reales sean menos. Para medir, cuenta fotogramas (`renderInfo().frame`) en un intervalo de tiempo real.
- **Resolución adaptable** (`WorldView.adapt`): si los fotogramas tardan más de 1/28 s, baja la densidad de píxeles por pasos hasta la mitad; si sobra margen, la sube. Es para móviles modestos y render por software.
  - Sin ella, el pase visual dejaba el contenedor en unos 3 fotogramas por segundo.
  - Con eso, `e2e:teclado` fallaba: mantiene las teclas un tiempo real fijo, y avanzaba menos tiempo de juego. La física no había cambiado.
- **Geometría estática fundida por material** (`mergeStatic` en `levelView.ts`): de 327 a unas 250 llamadas de dibujo. Personajes y sofá siguen siendo la mayor parte (unas 34 por personaje).

## Pase visual y de animación

La revisión se hizo sobre capturas reales del juego en ejecución, con encuadres y tiempos de partida iguales antes y después (`scripts/stills.cjs`).

Hubo dos ciclos:
1. Primer pase propio.
2. Tres revisiones independientes, todas de solo lectura: dirección de arte, arte técnico con estabilidad del juego, y QA visual con encargo de buscar defectos, no de aprobar. Después, un segundo pase con sus hallazgos.

No se han tocado las reglas físicas ni el recorrido.

**Dirección visual.**
- Juguete de plástico mate y fieltro, con contorno azul marino.
- Los personajes y el sofá llevan los colores más saturados; el suelo queda en valores medios.
- Rojo, azul y amarillo se reservan para el juego: asas, objetivo y peligro.
- Luz cálida de tarde con un relleno frío.

| Área | Antes | Ahora |
|---|---|---|
| Personajes | Cilindros sin piernas, brazos de palo y cara apenas visible | Silueta propia para cada uno: moño y gafas, rulos y bata, calvo tostado con bigote, cíclope con antenas, casco y barba, salchicha de cuatro patas. Piernas y zapatos, cara con ojos, cejas y boca, y contorno de dibujo animado |
| Animación | Balanceo al andar y estrellas | Ver la lista de abajo |
| Sofá | Crema liso, asas como bloques y patas | Tela con trama, ribete, zócalo de madera, capitoné, dos cojines de color, cinchas de mudanza como asas, cojines que se bambolean con la inercia y rebote al golpear (deformación limitada al volumen del colisionador) |
| Entorno | Cajas de colores planos | Texturas procedurales (asfalto, baldosa, ladrillo, tablas, tejas, chapa lagrimada), barrio de fondo con ventanas y persianas, toldos, farolas, bancos, papeleras, boca de incendios, valla de estacas, gnomo de jardín y camión abierto con cajas dentro |
| Objetivo | Diamante flotante que tapaba coches y escaleras | Aro en el suelo con una flecha pequeña; se apaga solo cuando el sofá está encima |
| Paredes que tapan | Translúcidas: un personaje detrás parecía transparente | Corte de maqueta hasta un zócalo opaco |
| Efectos | Polvo y estrellas | Polvo al pisar a la carrera y al aterrizar, ondas de choque, confeti al entregar, sudor al hacer fuerza; textos sobre placa de color («¡CATAPUM!», «¡ATASCO!», «¡ENTREGADO!») |
| Cámara | 52°, más lejos | 53° y más cerca: las cabezas tapan menos el sofá |

**Animación procedural ligada al estado real** (`carrierView.ts`, todo depende de datos de la simulación):
- Paso hacia delante o lateral según la velocidad real, respecto a hacia dónde mira.
- Pataleo en el sitio si quiere andar (`wantVel`) y no avanza.
- Inclinación según la dirección del tirón del agarre: hacia atrás si el sofá tira de él, hacia el sofá si empuja, de lado si el tirón es lateral.
- Temblor y sudor cuando el agarre está cerca de soltarse; además gira la cabeza hacia la cámara para que se le vea la cara de esfuerzo.
- Traspié solo con el suceso `gripBreak`, hacia atrás o hacia delante según hacia dónde tiraba.
- Atropello (`stunned`): pirueta en un solo sentido, caída de espaldas en la dirección del golpe, pataleo con estrellas y, al acabar el mareo, se levanta de un salto.
- Pose en el aire (`grounded` = falso) y aplastamiento con polvo al aterrizar.

### Revisión visual: defectos encontrados y estado

| Defecto (revisión independiente) | Estado |
|---|---|
| Un personaje detrás de la pared del pasillo de arriba parecía transparente | Corregido: corte de maqueta |
| Los ojos pasaban casi la mitad del tiempo cerrados (error en el parpadeo) | Corregido |
| La pirueta del atropello giraba hacia un lado y volvía | Corregido: un solo sentido y caída según el golpe |
| Inclinación siempre hacia atrás, también al empujar | Corregido |
| Casi nunca se veían caras | Mejorado: miran a cámara al hacer fuerza o tropezar |
| La cabeza calva de Gordo se confundía con el sofá crema | Corregido: piel tostada y cerco de pelo |
| Rueda negra asomando dentro de la caja del camión y rótulo del techo cortado | Corregido |
| Tejados demasiado llamativos alrededor de la escalera y peldaños poco legibles | Mejorado: tejas más apagadas y canto claro en cada peldaño |
| Farolas como trazos negros que cruzaban la imagen | Corregido: pintadas, con globo y sin las de la acera cercana |
| El aviso «pulsa ESPACIO» aparecía mientras el jugador estaba mareado | Corregido |
| Textos flotantes poco legibles o superpuestos («¡CATAPUM!» con «-1%») | Mejorado: placa de color, más altos y sin texto de daño tras un atropello |
| Patas del sofá hundidas en el suelo y deformación que sacaba el sofá 11 cm de su colisionador | Corregido |
| Fugas de memoria de vídeo en las estrellas y al reiniciar | Corregido |

Pendientes, por orden de impacto:
1. **En el plano general, el grupo sigue siendo pequeño en la pantalla de un móvil.** Con cuatro porteadores, las cabezas del lado de la cámara tapan parte del sofá.
2. **El atropello se entiende por el efecto, no por la causa.** El coche es cinemático: no frena ni rebota y atraviesa al grupo. Además, nada une el semáforo en rojo con el golpe. Arreglarlo bien toca el tráfico (física), así que se ha dejado.
3. **Los textos de teclado** («WASD», «ESPACIO») no tienen equivalente táctil, porque no hay controles táctiles.
4. **Personajes:** algunos se meten en el brazo del sofá al inclinarse mucho. Las manos no se cierran sobre el asa y no hay dedos.
5. **La puerta estrecha:** con la fachada recortada se lee el hueco, pero el apretón contra el marco no se percibe tanto como en un juego comercial.
6. **Rendimiento:** unas 34 llamadas de dibujo por personaje y sombras de todo el nivel en cada fotograma. Es aceptable para una demo, pero conviene fundir más mallas antes de llegar a 6–10 jugadores.

## Vídeo de la partida a dos

[`docs/video/mudanza-imposible-dos-jugadores.mp4`](docs/video/mudanza-imposible-dos-jugadores.mp4): 62 s, 10 MB, 1280×720 a 30 fps, H.264 High 4.0 con AAC y `faststart`.

- **Cómo se graba.** La demo real en Chromium, en modo captura (`?capture=1`): cada fotograma avanza 1/30 s de juego y después se captura, así que va a velocidad real aunque el contenedor dibuje despacio. El sonido son los efectos del propio juego, renderizados fuera de línea.
- **Tramo 1 (9 s).** J1 y J2 con el teclado del juego: agarran a la vez (Espacio e Intro), tiran juntos, tiran a la contra (el sofá gira), cada uno tira hacia su lado y J2 suelta sin dejar de tirar: «¡Uy, uy, uy!» y «¡PATAPLOF!». J1 sigue solo y apenas lo mueve («¡Uno solo apenas puede con él!»). **Las pulsaciones las envía un script de Playwright, no dos personas**, pero entran por el mismo teclado que usaría un jugador.
- **Tramo 2.** El piloto automático del juego lleva a J1 y a J2 (sin ayudantes, con la física cooperativa) por la calle, el portal, la escalera y la rampa hasta el camión: entregado en 63,4 s, con el sofá al 100 % y 3 estrellas. Se corta la espera en la acera con el semáforo en rojo (un rótulo lo indica). No se ha acelerado nada.
- **Reproducir:** con la demo servida en :4173, `NODE_PATH=$(npm root -g) node scripts/record-duo.cjs` y después `scripts/make-video-duo.sh`.
- **Una primera toma se descartó.** En ella el tramo de teclado empujaba el sofá hasta la calle con el semáforo en rojo. Los coches lo atropellaron varias veces y el piloto tardó un minuto en sacarlo: entregado en 102,6 s con el sofá al 10 %. Sirvió para comprobar que la partida no se bloquea, pero no como vídeo corto. En la toma buena, el tramo de teclado se queda en el patio.

## Vídeo de la partida real (1 jugador con ayudantes)

[`docs/video/mudanza-imposible-partida-real.mp4`](docs/video/mudanza-imposible-partida-real.mp4): 40 s, 7,7 MB, 1280×720 a 30 fps, H.264 High 4.0 con AAC y `faststart`. Se reproduce en Android.

- **Cómo se graba.** Es la demo real en Chromium, en modo captura (`?capture=1`): cada fotograma avanza exactamente 1/30 s de juego y después se captura. El contenedor no tiene GPU y dibuja despacio; así el vídeo va a velocidad real.
- **Qué no tiene.** Ni aceleración ni cámara lenta. Solo se cortan dos tiempos muertos: la espera en la acera hasta que el semáforo se pone verde y el pasillo de arriba.
- **Sonido.** Los efectos sintetizados del propio juego, registrados durante la partida y renderizados fuera de línea con WebAudio.
- **Toma 1.** J1 con teclado agarra el sofá y avanza con W sin esperar al semáforo: un coche se lleva al grupo por delante. Las pulsaciones las envía un script de Playwright, no una persona, pero entran por el mismo sistema de teclado que usa un jugador.
- **Toma 2.** El piloto automático del juego, de la casa al camión: recogida, cruce en verde, portal, escalera, rampa y entrega al 100 % en 36 s.
- **Reproducir:**
  ```bash
  node scripts/record.cjs                  # con la demo servida en :4173
  node scripts/video-cards.cjs
  scripts/make-video.sh
  ```
  Los dos primeros necesitan Playwright (`NODE_PATH=$(npm root -g)`); el tercero, ffmpeg.

**Publicación.** El vídeo está en una página privada de claude.ai creada desde esta sesión, solo para su propietario: https://claude.ai/artifact/Bo3j9ipvmdz9wpVPxfqtqC. También está en este repositorio, en `docs/video/`. No se ha publicado la demo web jugable: no tiene controles táctiles, así que en el móvil solo se puede ver el vídeo.

## Recursos externos

No se ha incorporado ningún recurso externo: modelos, texturas, sonidos, animaciones o imágenes generadas. Las texturas se dibujan en canvas al arrancar y el sonido se sintetiza.

Se revisaron dos archivos aportados:
- `open-source-games` (CC0) es una lista de enlaces a juegos.
- `Claude-Code-Game-Studios` (MIT) son definiciones de agentes.

Ninguno contiene recursos 3D utilizables. Del segundo solo se tomó como referencia el reparto de papeles para las revisiones (dirección de arte, arte técnico, QA); no se ha instalado.

## Qué está hecho, qué es provisional y qué no existe

**Implementado y probado**
- Partida completa: inicio con cuenta atrás, recorrido, victoria y derrota (destrozado o tiempo), resultados, reinicio instantáneo y pausa.
- Sofá físico:
  - colisiona, se atasca en la puerta y se inclina si una parte alza y otra no;
  - cae si se suelta y resbala por la rampa;
  - se daña con golpes, caídas y atropellos (con parches de cinta visibles).
- Porteadores con agarre por rótula, alzar, soltar, mareo por atropello y retorno si se pierden.
- Tráfico en movimiento con semáforo, frenada, pitidos y empujones.
- **Partida a dos en el mismo teclado como modo por defecto**, con física cooperativa: sofá pesado (uno solo apenas lo arrastra), fuerza de tiro limitada, giros por tirar a la contra, tambaleos y caídas por soltar tirando o por choques, y levantarse solo.
- 1 jugador con 1–5 ayudantes (física original); mandos para J1–J4.
- Interfaz:
  - tiempo, etapas y estado del sofá;
  - avisos de vuelco y atasco, y semáforo de peatones;
  - mensajes de eventos e indicador del siguiente objetivo;
  - menú y resultados con estrellas y mejor tiempo.
- Sonidos de agarre, soltar, golpe, atropello, pitido, mareo, tambaleo, caída, etapa, victoria y derrota.

**Provisional**
- La «inteligencia» de los ayudantes: imitan al jugador y no toman decisiones propias. No pierden el equilibrio y, con ayudantes, se usa la física original: con la cooperativa soltaban y reagarraban para desatascarse, se caían una y otra vez y la partida se perdía.
- Las constantes de la física cooperativa (`CARRIER.pullForce`, `releaseKick`, `deadZone`, `shoveGain`, `SOFA.coopMass`, `coopFriction`): ajustadas con simulaciones y con el piloto automático, **no con personas**. Pueden resultar demasiado blandas o demasiado castigadoras.
- La ayuda de muñecas y sus constantes: `RULES.wristK`, `wristDamp` y los umbrales de daño, sin ajustar con jugadores.
- Los mandos están implementados con la asignación estándar, pero **no se han probado con un mando físico**. Las pruebas automáticas solo usan teclado.
- Las animaciones son procedurales (ver [Pase visual](#pase-visual-y-de-animación)). No hay animación esquelética ni caídas tipo muñeco de trapo: el porteador sigue siendo una cápsula física y el cuerpo dibujado reacciona a su estado.
- La escalera física es una rampa lisa con peldaños dibujados encima.

**No existe todavía**
- Multijugador en red, servidores o cuentas (fuera de alcance, a propósito).
- Más de 4 jugadores humanos (el motor admite 6 porteadores).
- Más niveles o muebles, y obstáculos móviles distintos de los coches.
- Repeticiones o cámara de espectador, y música.

## Evaluación crítica del potencial de diversión

Las comprobaciones de arriba son técnicas. Que la demo sea divertida es una **hipótesis sin validar: nadie la ha jugado todavía**.

| Pregunta | Lo que sé y lo que no |
|---|---|
| ¿Qué puede hacer divertido el movimiento? | Que el sofá responda a dónde y hacia dónde tira cada persona: dos personas que no se ponen de acuerdo lo hacen girar (comprobado en `e2e:dos`), y uno que alza sin el otro lo inclina. La gracia depende de que esa causa se vea y se entienda; los brazos, los puntos de agarre de colores y el aro rojo de vuelco intentan que se vea. Falta comprobarlo con gente. |
| ¿Qué momentos inesperados pueden surgir? | Un atropello en mitad del paso de cebra. El sofá atravesado contra el marco de la puerta. El grupo que suelta en la rampa y ve el sofá bajar solo. Caerse por el lado de la rampa, que daña pero acorta camino. Un porteador atropellado que suelta y desequilibra al resto. Los he visto aparecer en las simulaciones, no en partidas humanas. |
| ¿Qué decisiones toma el jugador? | Esperar al semáforo o arriesgarse; por qué lado agarrar; cuándo soltar para pasar la puerta; cuándo girar en la escalera; ir por la rampa con cuidado o saltar por el lado. |
| ¿Qué errores pueden parecer injustos? | Que se escape el agarre sin entender por qué (hay aviso, pero hay que verlo con gente). Que un ayudante de la máquina empuje mal. Atropellos que no se vieron venir: hay pitido y aviso, pero a 10 m/s es poco margen. |
| ¿Qué momentos dan clip? | Atropellos, el sofá resbalando por la rampa y atascos en la puerta. |
| ¿Qué puede aburrir? | Con 1 jugador y ayudantes, el núcleo social (discutir y coordinarse) **no existe**: los ayudantes copian lo que haces. Por eso la partida a dos es ahora el modo por defecto y el sofá exige a los dos. El patio y el pasillo superior son tramos de transición sin decisión. El recorrido completo dura solo 36 s con el piloto automático y algo más con personas; puede quedarse corto. |

**Lo que la demo no valida:** la diversión con amigos reales, la comunicación por voz, el caos de 4–10 personas y la comprensión de los controles por alguien nuevo. Para eso hacen falta sesiones con personas.

## Tres mejoras prioritarias para la siguiente iteración

1. **Probarla con 2–4 personas en un mismo ordenador**, con teclado y mandos, y grabar las sesiones. Antes de añadir nada, hay que medir dónde se ríen, dónde se frustran y si entienden por qué gira o se escapa el sofá.
2. **Agarre más expresivo y más legible:** que se vea cuánta fuerza hace cada uno (barras o tensión visible en los brazos), un «tirón» corto y que alzar y bajar se note más. Es lo que hace que los errores se entiendan y no parezcan injustos.
3. **Un segundo tramo con decisión real:** por ejemplo, un ascensor pequeño (hay que poner el sofá de pie) o un atajo arriesgado. Con eso se comprueba si el sistema da variedad sin animaciones prefabricadas, antes de invertir en red para 4–10 jugadores.

## Problemas conocidos

- **Partida a dos:**
  - **No la ha jugado ninguna persona.** Todo lo de arriba son pulsaciones enviadas por scripts y el piloto automático.
  - **Teclados que no registran tantas teclas a la vez.** Algunos teclados no admiten más de unas pocas pulsaciones simultáneas (por ejemplo, WASD, flechas y las dos Mayús). Es una limitación del teclado, no del juego. Con un mando para cada uno no pasa.
  - **Velocidad del piloto con dos.** Con dos porteadores y la física cooperativa, el piloto automático tarda 46 s (34 s sin el límite de fuerza). La escalera es el tramo más lento.
  - **Las caídas no usan física de cuerpo.** La cápsula sigue de pie y el muñeco dibujado cae hacia donde se desequilibró. Es la solución estable más sencilla.
  - **El modelo de equilibrio está simplificado** respecto al del laboratorio: no hay tropiezos con bordillos ni torpeza al arrancar y frenar (con la aceleración arcade del juego daba tambaleos constantes).

- Con 6 porteadores, el piloto automático a veces se atasca en el giro del rellano. Para personas también es el punto más difícil.
- La consola muestra un aviso de Rapier («deprecated parameters for the initialization function») que viene de la propia librería. No afecta.
- Con 1 jugador, los ayudantes solo giran si se lo pides con Q/E; si no, imitan tu movimiento y el sofá se traslada sin girar.
- Los peldaños dibujados no coinciden al milímetro con la rampa física: los pies pueden parecer un poco hundidos o flotando en la escalera.
- Los coches son cinemáticos y no frenan al chocar: en un atropello el coche atraviesa al grupo y sigue (ver defectos pendientes).
- Los mandos no se han probado con hardware real.
