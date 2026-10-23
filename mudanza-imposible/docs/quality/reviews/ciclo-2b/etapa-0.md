# Ciclo 2b, etapa 0: fiabilidad de las pruebas e2e (duo-e2e y keyboard-e2e)

Rama `rebirth/ciclo-2b` (HEAD 6ccf403 al empezar). **Sin cambios en el código del juego**: solo pruebas e infraestructura de
medición. Nada está en commit: todo queda en el árbol de trabajo para que lo revise el coordinador.

**Veredicto: ETAPA 0 VALIDADA.** duo-e2e 20/20 y 20/20, keyboard-e2e 20/20 y 20/20, mutación detectada 10/10 (solo en «soltar mientras tira»), tsc limpio y vitest 112/112. Configuración: 1280×720.

## 1. Estado

**ETAPA 0 VALIDADA.** Se cumplen todos los criterios, con los guiones finales y a 1280×720:
- duo-e2e: 657fd30 20/20 y 5cab122 20/20;
- keyboard-e2e: 20/20 y 20/20;
- mutación sin tirón al soltar: 10/10 ejecuciones fallan, y todas solo en «soltar mientras tira» («tambaleo false,
  caída false»);
- tsc limpio y vitest 112/112.

Lo que se ha hecho:
- Se ha encontrado la causa del fallo S/↑. Es de la prueba: agarres desplazados del centro del extremo dejan una
  tensión de ~162 N, por debajo de los ~169 N que pide el modelo para caer. El mismo fallo se reproduce idéntico en
  657fd30, así que no es una regresión del ciclo 2.
- Se han corregido la prueba y su piloto.
- Se ha descartado 320×180 como configuración definitiva: cambia el diseño del HUD.

**Reinicio del contenedor.** Hacia las 00:35 UTC del 23-10-2026 el contenedor se reinició y mató los procesos (el disco
se conservó). La tanda de duo-e2e iba por la ejecución 19 de 657fd30, que quedó a medias, sin resultado; su salida
parcial está en `etapa-0-evidencias/tandas/657fd30-duo-19-interrumpida-out.log`.
- Antes de reanudar, comprobé:
  - que los guiones eran idénticos byte a byte: SHA-1 `84adbf6f7faf` y `5552813c9aff`, los mismos de la cabecera del
    resumen;
  - que los `dist/` eran los mismos: mismos bundles `index-DDnIRazG.js`, `index-nU-kwtRH.js` e `index-B7Sd2KKz.js`, y
    la mutación seguía aplicada;
  - que no quedaba ningún servidor ni navegador.
- Volví a levantar `vite preview` en 4211, 4212 y 4213.
- Repetí desde cero las ejecuciones 19 y 20 de cada versión (alternando). Las 18 + 18 ya completadas se conservan.
- Después vinieron las tandas de keyboard-e2e y de la mutación, y tsc/vitest.

La nota también está en el resumen de la tanda.

## 2. Revisión de los scripts (diff 2250cfe → 6ccf403, más los cambios de esta sesión)

### duo-e2e.cjs: las 21 comprobaciones, antes y ahora

Mismo número de comprobaciones (21), mismos umbrales. Ninguna se ha debilitado en su condición; tres se han
reforzado y una tiene la ventana de observación ampliada de forma condicionada (ver la tabla).

| # | Comprobación | Antes (2250cfe) | Ahora | Efecto |
|---|---|---|---|---|
| 1 | el menú propone 2 jugadores y 2 porteadores | igual | igual | = |
| 2 | partida a dos, sin ayudantes | igual | igual | = |
| 3 | los dos se mueven a la vez con teclas distintas (Δz > 0,3) | igual | igual | = |
| 4 | los dos agarran el sofá | `grabBoth()` verdadero | agarran **y** cada uno por un extremo distinto (`opposite`), con el punto agarrado en la cara del extremo y a ≥ 0,15 m de sus cantos (\|x local\| > 0,8 y \|z local\| ≤ 0,3) | **más fuerte** |
| 5 | tirando juntos hacia arriba, el sofá avanza (> 2,5 m en 2,5 s) | igual | igual | = |
| 6 | uno solo lo arrastra a menos de la mitad (solo < 0,5 · juntos) | igual | igual **y** J2 ya no agarra (`j2Free`) | **más fuerte** |
| 7 | aviso «Pesa mucho» | visto en los 2,5 s | visto en los 2,5 s; si no salió y el sofá estuvo inclinado (sofaUp < 0,8, la prioridad documentada de `hud.ts:179-181`), se sigue arrastrando ≤ 3 s más y tiene que salir igualmente. Si no se inclinó, falla sin más. La distancia se sigue midiendo en los 2,5 s | ventana ampliada **solo** cuando la prioridad del HUD lo tapaba; la condición («Pesa mucho» en el HUD con alguien arrastrando solo) es la misma |
| 8 | J2 vuelve a agarrar | igual | igual | = |
| 9 | tirar en sentidos opuestos gira el sofá (> 0,4 rad) | teclas por el filo de π/4 | teclas por el eje real (la de las 8 más parecida a la perpendicular) | = (mismo umbral; escenario correcto en cualquier giro) |
| 10 | soltar mientras tira: J2 se tambalea y cae | tiraban por el eje x del mundo; tambaleo y caída leídos del estado entre fotogramas (`knock === 'balance'`) | tiran por el eje real, corrigiendo cada fotograma; además del estado, cuentan los sucesos del juego de J2 en [t₁, t₁ + 1,5 s] (`wobble`, `fall`) | = (misma ventana; ver abajo por qué no puede pasar con un `stun`) |
| 11 | J2 se levanta solo | igual | igual | = |
| 12 | tras levantarse, J2 vuelve a agarrar | igual | igual | = |
| 13 | correr contra la pared frena sin tumbar | igual | igual | = |
| 14–15 | Retroceso: en juego no reinicia; en la pausa, sí | igual | igual | = |
| 16–21 | parte B (sin NaN, victoria, resultados, título, Intro, sin errores) | igual | igual | = |

**«Soltar mientras tira» y `window.__ev`.** El registro lo escribe la propia prueba envolviendo `Game.step` y guarda
`grab`, `release`, `gripBreak`, `wobble`, `fall`, `stun` y `up`. En el juego, el suceso `fall` solo lo emite
`Game.afterStep` cuando `Carrier.balance` devuelve `'fall'` (`game.ts:569`), y eso solo ocurre en la rama de pérdida de
equilibrio, que llama a `knockDown(…, 'balance')` (`carrier.ts:734`). Un golpe (coche, impacto de más de
`CARRIER.stunDv` = 9 m/s) va por `Game.stun` (`game.ts:513-518`): `knockDown(…, 'car')` y suceso **`stun`**. La prueba
filtra con `/ fall /` sobre «t fall J2», así que un `stun` no cuenta como caída. La lectura del estado exige
`knock === 'balance'`. Sin `fall` de J2 en la ventana, `fell` queda en falso: con solo tambaleo o con tambaleo y `stun`
la comprobación falla. Es exactamente lo que pasó en el fallo original (`13.97 wobble`, `15.35 stun` → «caída false»),
y la mutación sin tirón da «tambaleo false, caída false».

### keyboard-e2e.cjs: las 12 comprobaciones

| Comprobación | Antes | Ahora | Efecto |
|---|---|---|---|
| Partida de 1 jugador con 3 ayudantes | igual | igual | = |
| J1 agarra el sofá con Espacio | `holding` tras un bucle que podía pulsar dos veces | `holding`, con una sola pulsación por intento y espera de 0,15 s de juego antes de mirar | = (se quita la doble pulsación, diagnóstico §3) |
| Los ayudantes agarran asas libres (≥ 3 manos) | igual | igual | = |
| Al agarrar entre varios, el sofá se levanta solo | igual | igual | = |
| Con W el grupo lleva el sofá hacia la calle (> 1,5 m) | igual | igual | = |
| El sofá va levantado (y > 0,5) | igual | igual | = |
| Con Q los ayudantes giran el sofá (> 0,3 rad) | igual | igual | = |
| Espacio suelta el sofá | `!holding` | agarraba antes de pulsar **y** `!holding` | **más fuerte** |
| Esc pausa (el tiempo se detiene) | menú visible tras 400 ms de reloj y t igual en 800 ms | se espera a ver el menú (≤ 10 s) y t igual en 800 ms | = |
| Retroceso en juego no reinicia | fase `playing` y t avanza | igual **y** sin el menú de pausa | **más fuerte** |
| En la pausa, Retroceso reinicia | fase `countdown`, t < 0,01 | igual (antes se espera hasta 10 s a que ocurra) | = |
| Sin errores en la consola | igual | igual | = |

### e2e-piloto.cjs (nuevo, compartido)

Solo lee el estado público y pulsa teclas. Esta sesión le añade un cambio (§5): los tramos de menos de 0,6 m se andan
con un toque de un fotograma.

Notas de la revisión:
- **Comprobación 7** («Pesa mucho»): la ampliación de hasta 3 s solo se aplica si el sofá estuvo inclinado en los 2,5 s,
  que es cuando el HUD da prioridad a «¡Que se vuelca!». Se sigue exigiendo que «Pesa mucho» llegue a mostrarse y la
  distancia se sigue midiendo en los 2,5 s. No cambia lo que se comprueba, solo cuándo se puede observar. Con el arreglo
  del agarre (§5) el sofá apenas se inclina: en las 40 ejecuciones definitivas el aviso salió siempre.
- **El registro `window.__ev`** lo instala la propia prueba (envuelve `Game.step` y no toca la lógica del juego). Ya
  estaba en 2250cfe para el paso 5.
- **keyboard-e2e**: el objetivo de J1 pasa del punto fijo (x + 1,75) al extremo por el eje real del sofá, y la marcha la
  hace el piloto compartido. Las comprobaciones son las mismas.
- **Comprobación de errores**: en ninguna prueba se ha sustituido una comprobación de juego por «sin errores de JS».

## 3. Evaluación del viewport 320×180

**Conclusión: 320×180 NO se acepta como configuración definitiva.** Las tandas definitivas se han hecho a 1280×720.
No cambia la física ni lo que cada comprobación lee del juego, pero sí cambia el diseño del HUD (otra hoja de estilo) y,
con él, si el aviso cabe en pantalla. Por eso no se puede sostener que sea representativo de lo que ve un jugador.

**Física: igual en las dos.** El paso es fijo: `DT = 1/60` (`main.ts:17`), `FixedStep(DT, 5)` y tope de 0,1 s por
fotograma (`main.ts:19` y `:346`; `inputCore.ts:286-292`). La simulación (`src/sim`) no importa nada de la vista ni de la
cámara, y las teclas son ejes del mundo. Comprobado en Node: las entradas grabadas en el navegador se repiten paso a paso
con un error ≤ 9,8e-4 (el redondeo de la grabación) y los mismos sucesos, tanto a 320×180 (`5cab122-duo-320-1`,
`5cab122-duo-4`) como a 1280×720 (`657fd30-duo-1280-1`, `nuevo-5cab122-1`), con `repetir-4d.ts`.

**Cadencia: cambian los FPS, no el régimen de pasos por fotograma.** Medido con `grabador-fotogramas.cjs` (grabador
pasivo: cuenta los fotogramas de `requestAnimationFrame` y los pasos de cada uno, sin llamadas extra de la prueba) sobre
ejecuciones reales de las pruebas (la parte jugada con teclas):

| Ejecución | Viewport | FPS | ms/fotograma | pasos/fotograma (media) | fotogramas con 5 pasos (tope) | juego / reloj |
|---|---|---|---|---|---|---|
| 657fd30 duo | 320×180 | 9,25 | 108 | 4,71 | 86,7 % | 0,705 |
| 5cab122 duo | 320×180 | 9,98 | 100 | 4,64 | 81,1 % | 0,769 |
| 5cab122 duo (caza, caso S/↑) | 320×180 | 8,49 | 118 | 4,75 | 85,2 % | 0,668 |
| 657fd30 teclado | 320×180 | 10,06 | 99 | 4,73 | 76,4 % | 0,696 |
| 5cab122 teclado | 320×180 | 10,29 | 97 | 4,56 | 73,7 % | 0,690 |
| 657fd30 duo | 1280×720 | 5,65 | 177 | 4,89 | 96,2 % | 0,457 |
| 5cab122 duo (*) | 1280×720 | 4,26 | 235 | 4,75 | 92,6 % | 0,335 |
| 5cab122 duo, guion final | 1280×720 | 5,50 | 182 | 4,92 | 97,6 % | 0,448 |
| 657fd30 teclado | 1280×720 | 5,56 | 180 | 4,86 | 95,2 % | 0,421 |
| 5cab122 teclado | 1280×720 | 5,29 | 189 | 4,81 | 92,5 % | 0,397 |

(*) Medida perturbada: mientras corría lancé un barrido en Node (error mío; las demás medidas se tomaron con la máquina
sin otra carga). Datos en `etapa-0-evidencias/medidas/fotogramas.jsonl`.

- A 320×180 el navegador va a unos 10 FPS y a 1280×720 a unos 5,5. En las dos, la gran mayoría de fotogramas llegan al
  tope de 5 pasos (74–87 % frente a 92–98 %) y la media es de 4,6–4,9 pasos por fotograma. Las entradas quedan fijas
  durante ~83 ms de juego en los dos casos.
- La relación juego/reloj pasa de ~0,44 a ~0,71: a 320×180 se pierde menos tiempo por el tope. Las pruebas miden en
  tiempo de juego, así que eso solo cambia la duración (duo: ~3 min frente a ~8–9 min).
- **Frente a un jugador real** (~60 FPS, ~1 paso por fotograma, juego/reloj = 1), ninguna de las dos configuraciones es
  representativa en la granularidad de las entradas: las dos están en el régimen de «máquina lenta», con 5 pasos por
  fotograma. 320×180 no acerca nada a la experiencia real (los fotogramas por debajo del tope son pocos). Tampoco la
  aleja en la física.

**HUD: aquí sí cambia.** `index.html:79` tiene `@media (max-width:700px)`, que oculta `#h-players`, `#h-hint` y
`#h-load .it` y cambia el diseño. Medido con `hud-visible.cjs` en las dos versiones (`medidas/hud-visible.txt`):

| Elemento | 1280×720 | 320×180 |
|---|---|---|
| `#h-warn` («Pesa mucho…») | 539×36 px en y = 96, **dentro** de la ventana | 160×116 px en y = 96: acaba en y = 212 de 180, **se sale de la pantalla** |
| `#pause` | visible, ocupa la ventana | visible, ocupa la ventana |
| `#r-title` («¡Sofá entregado!») | visible, dentro | visible, dentro |
| `#h-players`, `#h-hint` | visibles | ocultos por la media query |

Las comprobaciones leen `textContent` y `style.display`, así que pasan igual en los dos tamaños. Pero «aviso en
pantalla» no es cierto a 320×180: el aviso existe y no cabe. Con esa ventana la prueba ejercita el diseño estrecho, que no
es el de un jugador de escritorio. Con 1280×720 la prueba coincide con lo que ve el jugador. (Hallazgo de interfaz para
etapas posteriores: en pantallas muy bajas el aviso se corta.)

**Control a 1280×720.** Las tandas definitivas (§6) ya son a 1280×720 con los guiones finales, así que hacen de control y
son más que el subconjunto pedido (20 + 20 de cada prueba). Comparación con lo hecho a 320×180:
- 320×180 con el guion anterior (`d87705de2522`): 657fd30 7/7 y 5cab122 6/7 en la tanda parcial; en la «caza» de esta
  sesión (con grabador), 5cab122 2 fallos en 4 y 657fd30 0 en 3. Todos los fallos son de agarre por la esquina (§4), que
  no depende del viewport.
- 320×180 con el guion final: 2 ejecuciones de validación (una por versión), 21/21.
- 1280×720 con el guion final: §6.
No hay ningún tipo de fallo que aparezca solo en un tamaño. Aun así, por lo del HUD la configuración definitiva es
1280×720 y no se reutiliza ninguna ejecución parcial (además, los guiones han cambiado).

## 4. Causa del fallo S/↑ («soltar mientras tira» en 5cab122)

**Veredicto: (a) diseño de la prueba.** El escenario no garantizaba la «plena tensión» de la que habla la comprobación.
No es (b) control de entrada, ni (c) una física rota, ni (d) una regresión del ciclo 2. La causa no son las 8 direcciones
del teclado ni la duración del tirón: es **por dónde agarra cada mano el extremo del sofá**.

**Qué garantiza el juego.** El README dice: «Si uno suelta mientras tira, se tambalea y **puede** acabar en el suelo».
La tabla de resultados del README añade: «Si uno suelta en plena tensión, se cae (2 de 3)». El modelo
(`carrier.ts:683-741`) funciona así:
- al soltar, el tronco recibe `releaseKick · T / (m · h)` hacia atrás, donde T es la tensión sostenida (`forceExp`);
- después, la caída de la fuerza medida le empuja también hacia atrás;
- cae si la inclinación pasa de 0,78 tras 0,4 s de tambaleo (`fallAt`, `stumbleMin`), si pasa de 1,1, o si sigue
  tambaleándose a los 1,4 s.

Réplica 1D de ese modelo (`umbral-tiron.ts`; mismos números en 657fd30 y 5cab122, m = 70 kg):
- **hace falta T ≥ 169 N para caer**;
- con 162 N, tambaleo y se recupera (inclinación máxima 0,63);
- con 246 N, cae a los 0,35 s, igual que en el navegador;
- sin el tirón (la mutación), no cae ni con 1000 N.

La réplica reproduce los tiempos del navegador: 246 N → tambaleo a 0,08 s y caída a 0,35 s (navegador: 0,07 y 0,33–0,35).

**El caso grabado.** Con el guion anterior y el grabador pasivo, a 320×180, se cazó el fallo en `5cab122-duo-4`
(evidencias en `etapa-0-evidencias/caso-S-arriba/`): «tambaleo true, caída false», teclas S/↑, 13°.
- Repetido en Node con la semilla y las entradas grabadas: idéntico (error 9,6e-4; los mismos sucesos).
- Agarres: J1 en (1,10; 0,48; **0,11**) y J2, al volver a agarrar, en (−1,10; **0,66; −0,27**), es decir, en lo alto
  del respaldo y al otro lado del eje. Al soltar, la tensión de J2 es **162 N** (< 169), la inclinación máxima 0,64 y no
  cae.
- Mismas entradas en **657fd30**: 163 N, mismos sucesos (`0.02 r1, 0.12 w1`), sin caída. **No es una regresión**: la
  trayectoria se separa un poco (0,23 m, la perturbación de orden de Rapier ya conocida) y el resultado es el mismo.
- El fallo original (`13.97 wobble`, `15.35 stun`) encaja: sin caída, J2 sigue con ↑ pulsada, sale a la calzada
  (z < 1; el sofá estaba en z ≈ 6,8) y le atropella un coche (`stun`, golpe > 9 m/s). En la repetición del caso cazado
  con J2 en (0,48; −0,27) sale «1.38 s1»: el mismo atropello.

**Qué agarre lo arregla, desde el estado real del navegador** (`repetir-4d.ts` con `GRIP1`/`GRIP2`: misma partida y
mismas entradas; solo cambia el punto agarrado en el último agarre antes del 4d):

| J1 (y, z local) | J2 (y, z local) | T de J2 al soltar | ¿cae? |
|---|---|---|---|
| 0,48; 0,11 | 0,66; −0,27 (grabado) | 162 N | no |
| 0,48; 0,11 | 0,48; −0,27 | 166 N | no (y le atropellan a 1,38 s) |
| 0,66; −0,27 | 0,66; −0,27 | 175 N | sí, por poco (inclinación 0,80) |
| 0,48; 0,11 | 0,48; 0,45 (canto) | 101 N | no |
| 0,48; 0,11 | 0,48; 0,30 | 183 N | sí, por poco |
| 0,48; 0,30 | 0,48; 0,30 | 189 N | sí |
| 0,48; 0,11 | 0,48; −0,10 / 0 / 0,11 / 0,20 | 216 / 243 / 253 / 226 N | sí |
| 0,48; 0,20 | 0,48; 0 | 222 N | sí |
| 0,48; −0,10 | 0,48; 0,10 | 245 N | sí |

Con las manos en el asiento, cerca del centro de la cara y alineadas (|z| ≤ 0,2, |z1 − z2| ≤ 0,2), la tensión es de
216–262 N, con margen sobre los 169. Con una mano en lo alto del respaldo, en un canto o en líneas separadas, tirar
hacia fuera **gira el sofá en vez de tensarlo** y la tensión se queda cerca del umbral o por debajo.

**Por qué agarraba así la prueba.** `Carrier.findGrab` agarra el punto del sofá más cercano a una sonda situada 0,35 m
**por delante** del porteador, a la altura de la mano, hacia donde mira. El piloto pulsaba agarrar mirando hacia donde
dio el último paso: en los registros, 45°–135° respecto al eje, incluso de espaldas (−172°).
- En Node (`agarre-mirada.ts`, 120–150 casos, porteador en la ventana de llegada del piloto, ±0,3 m): sin volverse,
  \|z\| > 0,3 en el 43–45 % de los agarres; volviéndose hacia el centro del extremo, en el 1–4 %.
- En el navegador, los agarres de 10 ejecuciones grabadas (`node/agarres-navegador.txt`) van de \|z\| 0 a 0,45. La
  tensión al soltar va de 190 a 247 N; las más bajas, con agarres desplazados.

**El otro fallo cazado, «Pesa mucho»** (`5cab122-duo-2`, `caso-pesa-mucho/`), tiene la misma causa. J1 había agarrado en
(1,10; 0,48; **0,42**), junto al canto. Arrastrando solo desde ahí, el sofá gira y se vuelca (sofaUp 0,39) y el HUD
muestra, por su prioridad documentada, el aviso de enderezar en vez de «Pesa mucho» durante los 5,5 s.
- Desde el estado grabado, con J1 en \|z\| = 0 / 0,1 / 0,2 / 0,3 (y 0,48), o en el respaldo (0,66; −0,27): sofaUp
  ≥ 0,89 y «Pesa mucho» a los 0,6 s.
- Con 0,42: se vuelca otra vez.
- Arrastrar «por el eje» en vez de con S no lo evita (se vuelca igual).
- Idéntico en 657fd30 (`caso-pesa-mucho/variantes-node.txt`).

**Barridos de control** (sin el agarre como variable, con las dos manos en el centro de la cara):
- `soltar-tension.ts`: 40/40 caen con la dirección exacta y 40/40 con las 8 teclas, en las dos versiones.
- `escena-4d.ts` (pasos 4c + 4d de la prueba, por fotogramas de 5 pasos): sin giro previo, 648/648 en las dos versiones
  (desvío de las teclas de 0 a 22,5°, T 286–298 N); con el giro previo, 1440/1440 en 5cab122.

**Las 8 direcciones del teclado no son la causa**: con 22° de desvío la tensión solo baja de 298 a 286 N.

**¿Puede la prueba evitar esos agarres sin esconder una regresión?** Sí. La comprobación es «soltar **en plena
tensión** → se tambalea y cae». Eso es lo que el juego promete y lo que la prueba debe poner en escena: dos personas
tirando del sofá hacia fuera por sus extremos. Con agarres que convierten el tirón en giro no hay plena tensión, y el
juego no promete caída («puede acabar en el suelo»).
- Elegir agarres buenos no relaja nada: el umbral (caer en 1,5 s), la ventana y la exigencia de un `fall` de equilibrio
  son los mismos.
- La mutación sigue detectándose (§7).
- Un cambio que bajara la tensión con agarres centrados, que subiera el umbral más de un ~25 % o que quitara el tirón
  haría fallar la prueba.
- Queda fuera de esta comprobación (y queda anotado como hallazgo, §10): qué pasa al soltar con agarres desplazados. Ahí
  el juego da solo un tambaleo; es coherente con el «puede», pero hay que vigilarlo.

## 5. Cambios hechos y por qué

Ningún cambio en `src/`, ni en mecánicas, reglas o umbrales del juego. En las pruebas:

1. **`scripts/duo-e2e.cjs` — agarre de los dos (`grabBoth`).** Demostrado necesario en §4 (el caso S/↑ y el de «Pesa
   mucho» vienen de agarres desplazados).
   - Antes de pulsar agarrar, cada uno se vuelve hacia el centro de su extremo, como haría una persona: si su mirada se
     desvía más de 20°, da un toque de un paso de juego en la dirección de teclado más parecida y espera quieto 0,2 s de
     juego (como mucho 2 toques por llegada).
   - Si, aun así, el agarre no es bueno, suelta y vuelve a agarrar, como mucho 5 veces cada uno. Bueno quiere decir: en
     el asiento (y local < 0,55), a \|z\| ≤ 0,25 del centro de la cara y con las dos manos a \|z1 − z2\| ≤ 0,3. Con las
     dos manos, rehace el agarre el que acaba de agarrar.
   - Queda anotado en «Piloto de prueba»: toques, reagarres y puntos locales de cada agarre.
2. **`duo-e2e.cjs` — comprobación 4 más fuerte**: «cada uno por un extremo» exige ahora \|z local\| ≤ 0,3, es decir,
   la mano en la cara del extremo y a ≥ 0,15 m de sus cantos. Antes una mano en la esquina contaba como extremo.
3. **`duo-e2e.cjs` y `keyboard-e2e.cjs` — trazabilidad**: imprimen el navegador (versión y ejecutable), el viewport y la
   semilla de cada partida (`game.opts.seed`). En el 4d, el mensaje incluye la z local de cada agarre. Las comprobaciones
   no cambian.
4. **`scripts/e2e-piloto.cjs` — toques cortos.** Demostrado necesario por la primera tanda definitiva, descartada
   (`/tmp/claude-0/c2b-e0/final-descartada-v1/`, `657fd30-duo-2`: «agarre FALLIDO tras 83 pasos de marcha»).
   - Al volver a agarrar, el porteador estaba a 0,3–0,6 m de su objetivo. `pressTime` pedía 0,10–0,14 s, pero la tecla
     queda pulsada fotogramas enteros (5 pasos): 2 fotogramas, unos 0,86 m. Se pasaba de un lado a otro sin entrar
     nunca en la ventana de 0,3 m.
   - Ahora los tramos de menos de 0,6 m se andan con un toque de un fotograma (≤ 0,22 m).
   - Afecta también al piloto de keyboard-e2e, que se ha vuelto a pasar entero (§6).
5. **Viewport**: las tandas definitivas son a 1280×720 (§3). `tanda.sh` pasa a tener 1280×720 por defecto.
   - Los comentarios de cabecera de duo-e2e y keyboard-e2e todavía dicen que 320×180 «solo cambia lo que cuesta
     dibujar». Es inexacto: también cambia el diseño del HUD.
   - No los he tocado para no cambiar el SHA de los guiones durante las tandas. Conviene corregirlos en el commit; es
     solo un comentario.
6. **Herramientas nuevas** en `scripts/audit/ciclo-2b/etapa-0/`:
   - `grabador-fotogramas.cjs`, `grabar.sh` y `fotogramas.py`: grabación pasiva, FPS y pasos por fotograma;
   - `repetir-4d.ts` y `agarres.ts`: repetición en Node, repetición cruzada y variantes de agarre sobre estados reales;
   - `escena-4d.ts`: pasos 4c y 4d en Node con giro y agarre a elegir;
   - `umbral-tiron.ts`: tensión mínima para caer;
   - `agarre-mirada.ts`: dónde agarra según la mirada;
   - `variante-4b.ts`: arrastre en solitario desde estados reales;
   - `hud-visible.cjs`: cajas del HUD;
   - `tanda-final.sh` y `aceptacion.sh`: las tandas definitivas;
   - `medir.sh` y `cazar.sh`: los lanzadores usados.

Guiones finales (SHA-1, 12 cifras): `duo-e2e.cjs` **84adbf6f7faf**, `keyboard-e2e.cjs` **9f44e750137c**,
`e2e-piloto.cjs` **5552813c9aff**. Con ellos, las tandas parciales anteriores (d87705de2522 / 5d807ba6b670, 320×180) y la
primera tanda definitiva (f80cb9e2c9da) **no cuentan**: todas las tandas de §6 empiezan de cero.

## 6. Resultados de cada tanda

Configuración de todas las tandas definitivas:
- **guiones**: `duo-e2e.cjs` 84adbf6f7faf, `keyboard-e2e.cjs` 9f44e750137c, `e2e-piloto.cjs` 5552813c9aff;
- **viewport** 1280×720;
- **navegador**: Chromium 141.0.7390.37 (`/opt/pw-browsers/chromium` → `chromium-1194/chrome-linux/chrome`, headless)
  con `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`;
- **versiones**: `vite preview` de cada `dist/`: 657fd30 en :4211 (`index-DDnIRazG.js`), 5cab122 en :4212
  (`index-nU-kwtRH.js`) y la mutada en :4213 (`index-B7Sd2KKz.js`);
- **ejecución**: de una en una, alternando versión, con `tanda-final.sh`, sin grabador.

En los resúmenes, cada ejecución lleva semilla, commit, navegador, viewport, código de salida, OK/FALLA, duración y
carga. Están en `etapa-0-evidencias/tandas/`. Los registros completos, en `/tmp/claude-0/c2b-e0/final/<versión>-<prueba>-<i>/out.log`.

| Tanda | 657fd30 | 5cab122 | Criterio | Resultado |
|---|---|---|---|---|
| duo-e2e (21 comprobaciones) | **20/20** | **20/20** | ≥ 19/20 cada una | CUMPLE |
| keyboard-e2e (12 comprobaciones) | **20/20** | **20/20** | 20/20 cada una | CUMPLE |
| duo-e2e en la copia mutada (5cab122 + releaseKick = 0) | — | **0/10 pasan; 10/10 fallan solo en «soltar mientras tira»** | todas fallan, en esa comprobación | CUMPLE |

Líneas de resumen literales:

```
TOTAL 657fd30 duo: pasa 20 de 20 (exit=0)
TOTAL 5cab122 duo: pasa 20 de 20 (exit=0)
TOTAL 657fd30 teclado: pasa 20 de 20 (exit=0)
TOTAL 5cab122 teclado: pasa 20 de 20 (exit=0)
TOTAL mut-releaseKick duo: pasa 0 de 10 (exit=0)
```

- **Clasificación de las FALLA**:
  - duo y teclado: ninguna;
  - mutación: §7;
  - la primera tanda definitiva, descartada (`etapa-0-evidencias/tanda-descartada-v1/`, guion f80cb9e2c9da), tuvo una
    ejecución con FALLA (657fd30-duo-2) por el piloto (oscilación al volver a agarrar). Se arregló en
    `e2e-piloto.cjs` y todas las tandas volvieron a empezar de cero.
- **«Soltar mientras tira» en las 40 ejecuciones de duo**:
  - en todas se tambalea y cae entre 0,26 y 0,50 s después de soltar;
  - z local de los agarres de −0,27 a 0,31 (casi todos |z| ≤ 0,2).
- **Duración media de duo**: 484 s.
- **Reagarres del piloto** (por llamada a `grabBoth`: agarre inicial / J2 vuelve a agarrar / tras levantarse):
  - en 657fd30, 0–10 por llamada; en 5cab122, 0–10;
  - el máximo (5 + 5, los dos agotan los intentos) se alcanzó en el primer agarre de 657fd30-3, -10, -11, -14 y -17 y
    de 5cab122-3 y -18;
  - en esos casos se sigue con el mejor agarre conseguido, siempre dentro del criterio de la comprobación 4;
  - el peor par fue −0,27/0,31 (5cab122-18): cayó a los 0,50 s.

## 7. Mutación (releaseKick = 0)

`mutacion-releaseKick.patch` sobre 5cab122 (`carrier.ts:702`: `const k = 0 * CARRIER.releaseKick / (mass * h)`),
comprobada con `git diff` en `wt-mut` y reconstruida (`index-B7Sd2KKz.js`, distinto de 5cab122). Resultados:
- **10/10 ejecuciones fallan, cada una con una sola FALLA**: «soltar mientras tira: J2 se tambalea y cae — tambaleo
  false, caída false»;
- en todas, antes de soltar, «agarran sí/sí», extremos 1/−1 y agarres buenos (|z| ≤ 0,23);
- en todas, el único suceso de J2 es `release`;
- las otras 20 comprobaciones pasan.

Concuerda con el modelo: sin el tirón, la caída de la fuerza medida no basta para tambalearse
(`umbral-tiron.ts`: «conMutacionKick0», inclinación máxima 0,10).

La prueba distingue exactamente la regresión que vigila: una caída que no ocurre.

## 8. tsc y vitest

En `/home/user/Game-development-2b/mudanza-imposible`, tras las tandas (`etapa-0-evidencias/tandas/tsc.log` y
`vitest.log`):
- `npx tsc --noEmit -p .`: **sin errores** (exit 0);
- `npx vitest run`: **7 ficheros, 112/112 pruebas** (exit 0).

## 9. Decisión

| Criterio | Resultado | Decisión |
|---|---|---|
| Revisión de los tres guiones: ninguna comprobación pierde significado ni poder | 21 + 12 comprobaciones; 4 más fuertes, 1 con ventana condicionada, ninguna más débil | **CUMPLE** |
| «Soltar mientras tira» no puede pasar con solo tambaleo ni con `stun` | exige un suceso `fall` de J2 (solo lo emite el equilibrio) o `knock === 'balance'`; la mutación da «caída false» | **CUMPLE** |
| Viewport: decisión justificada | 320×180 rechazado (HUD distinto, aviso fuera de la pantalla); tandas a 1280×720 | **CUMPLE** |
| Causa del fallo S/↑ demostrada | prueba (agarre desplazado → 162 N < 169 N); idéntico en 657fd30 con las mismas entradas | **CUMPLE** |
| duo-e2e ≥ 19/20 en cada versión | 20/20 y 20/20 | **CUMPLE** |
| keyboard-e2e 20/20 en cada versión | 20/20 y 20/20 | **CUMPLE** |
| Mutación: todas fallan en «soltar mientras tira» (≥ 10) | 10/10, solo esa comprobación | **CUMPLE** |
| tsc / vitest 112/112 | 0 errores / 112/112 | **CUMPLE** |
| Sin cambios en el juego ni umbrales relajados | `git diff` solo en `scripts/` y `docs/` | **CUMPLE** |

**ETAPA 0 VALIDADA.**

## 10. Siguiente paso

1. **Commit** (lo hace el coordinador). Archivos:
   - `scripts/duo-e2e.cjs`, `scripts/keyboard-e2e.cjs` y `scripts/e2e-piloto.cjs`;
   - `scripts/audit/ciclo-2b/etapa-0/*`;
   - este informe y `etapa-0-evidencias/`;
   - actualizar `QUALITY_STATE.md`.
   Conviene corregir en el mismo commit los comentarios de cabecera de los dos e2e sobre 320×180 (§5.5; solo
   comentario). Después habría que comprobar que las pruebas siguen pasando con el nuevo SHA, o dejar constancia de que
   el cambio es solo de comentario.
2. **Pasar a la etapa 1** (piloto, R-C2-01).
3. **Hallazgos para etapas posteriores** (no se ha tocado nada del juego):
   - **H-E0-1, equilibrio**: soltar «tirando» solo tumba con T ≥ ~169 N. Con agarres desplazados (mano en lo alto del
     respaldo o junto a un canto, o manos en líneas separadas), tirar hacia fuera gira el sofá en vez de tensarlo
     (101–175 N) y el jugador solo se tambalea. Es coherente con «puede acabar en el suelo», pero un jugador que agarra
     donde cae la sonda (en lo alto del respaldo, con frecuencia) puede no ver nunca la caída. A decidir en diseño:
     guiar el agarre al asa del extremo o medir la tensión de otra forma. Conviene una prueba en Node del umbral
     (`umbral-tiron.ts` como base).
   - **H-E0-2, agarre**: `findGrab` toma el punto más cercano a una sonda 0,35 m delante, a la altura de la mano. El
     borde superior del respaldo (y 0,66, z −0,27) atrae muchos agarres «de frente»; las asas definidas (y 0,05) no se
     usan para los humanos.
   - **H-E0-3, HUD**: con el sofá volcado por arrastrar solo desde un canto, el aviso de enderezar tapa «Pesa mucho»
     todo el rato. Es la prioridad documentada, pero el jugador no llega a saber que le falta un compañero.
   - **H-E0-4, interfaz**: en pantallas bajas (por ejemplo, 320×180) `#h-warn` se sale de la ventana (acaba en y = 212
     de 180).
   - **H-E0-5, cruce de calle**: si no cae, el jugador que suelta sigue con la tecla pulsada, sale a la calzada desde el
     patio en ~1 s y puede ser atropellado (el `stun` del fallo original).
4. **Coste**: duo-e2e a 1280×720 tarda ~8 min (484 s de media). Si hiciera falta acortarlo, no con un viewport que cambie
   el diseño. Un viewport de escritorio menor (por encima de 700 px de ancho) mantendría el HUD, pero habría que
   medirlo antes.
