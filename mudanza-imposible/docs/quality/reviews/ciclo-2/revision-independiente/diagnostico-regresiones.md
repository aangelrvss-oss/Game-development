# Diagnóstico independiente del ciclo 2 de «La Mudanza Imposible»

Código revisado: 5cab122 (el mismo código que 23b8c66 y que el worktree `-rc2` en 04da4c4). Referencia: 657fd30. Pasos intermedios: a84984f, ec1d620 y 23b8c66.

Solo diagnóstico: no he cambiado ningún archivo del repositorio, ni pruebas ni umbrales. Mis scripts están en `/home/user/Game-development-rc2/mudanza-imposible/scripts/audit/review-c2/diagnostico/` y los registros en `/tmp/claude-0/review-c2/diagnostico/`. He borrado los worktrees temporales y he parado los servidores; `ps` no muestra ningún proceso vite, chromium ni e2e.

## Resumen

| # | Pregunta | Veredicto | Confianza | ¿Bloquea? |
|---|---|---|---|---|
| 1 | duo-e2e: 6/6 en la base frente a 2/8 en c2 | **FRAGILIDAD DEL TEST**. Con mis datos, las dos versiones fallan igual. El 6/6 del revisor 1 no lo reproduzco. | alta (que no es una regresión); media (por qué salió 6/6) | No bloquea el código. Sí invalida e2e:duo como criterio de aceptación (T-level-2) mientras siga así. |
| 2 | Agarre fallido: «los dos agarran» y «J2 vuelve a agarrar» | **FRAGILIDAD DEL TEST**, anterior al ciclo 2 | alta | No |
| 3 | keyboard-e2e: «Con W» avanza 0 m | **FRAGILIDAD DEL TEST** (doble pulsación de Espacio con un estado ya viejo). No he medido diferencias de tasa entre versiones. | alta (mecanismo); baja (tasa) | No |
| 4 | 4 humanos con 2 ayudantes: más lento y más caídas en el camión | **REGRESIÓN DE CÓDIGO** en el piloto automático (`Autopilot`), de **23b8c66**. Se suma a un coste propio del diseño de ec1d620. | alta | Sí, conviene corregirla antes de la siguiente iteración (detalles en §4). |

Datos principales:

- **duo-e2e original, sin tocar, 10 + 10 ejecuciones intercaladas** (partes A1–A5): pasa la base 5/10 y pasa c2 5/10. Con mi copia instrumentada, 3/6 y 3/6. En la emulación en Node, emparejada con el mismo ruido de reloj, «soltar» pasa en 175/400 (base) y en 183/400 (c2), Fisher p = 0,62.
- Con el mismo guion de entradas, la física es idéntica hasta que un porteador empuja el sofá. A partir de ec1d620, las 8 piezas fijas del camión cambian el orden interno de Rapier y las trayectorias se separan de forma caótica (perturbación inicial de 1e-4 m). Esto no inclina el resultado hacia ningún lado. El revisor 1 vio «trazas idénticas» porque su guion no tiene ese contacto.
- **Causa de §4**: autopilot.ts:533 (`if (d < WALK.tryNear) this.tryTime += dt;`). Un piloto que pierde el sofá lejos y queda atrapado contra un muro no cambia nunca de asa: se queda varado entre 15 y 45 s. Cambiando solo esa línea, 4h/6c vuelve a 35,9–43,2 s (mediana 35,93) y las caídas en el camión de esa configuración bajan de 23 a 9. Se suma `mayEnter` (autopilot.ts:328): cuenta a los ayudantes que no agarran como «gente en el carril», y en la semilla 1 eso supone 58 s de espera.

## Método

1. **Árboles**: worktrees temporales de 657fd30, a84984f, ec1d620 y 23b8c66, cada uno con `npm run build` y servido con `vite preview` en los puertos 4201–4204. Las pruebas de navegador se ejecutaron una detrás de otra, nunca en paralelo, y alternando versiones.
2. **Copia instrumentada** de duo-e2e (`duo-instr.cjs`): registra las entradas de cada paso de física, los pasos de cada fotograma y el estado en cada fase. Añade algunas llamadas `evaluate`, así que la usé solo para entender el mecanismo, no para medir tasas.
3. **Grabador pasivo** (`grabador-pasivo.cjs`, cargado con `node -r`): ejecuta el **duo-e2e y el keyboard-e2e originales sin modificarlos**. En la página envuelve `Game.step` y manda entradas y estado por `console.log`, sin añadir ninguna llamada a la página. Así salen las tasas limpias.
4. **Repetición en Node** (`repetir.ts`, `repetir-rec.ts`): repite en Node las entradas grabadas en Chromium. Reproduce el navegador con un error ≤ 5e-4, que es solo el redondeo del registro, y los mismos sucesos. Luego las **repetí en la otra versión** (repetición cruzada) y busqué el primer paso en que se separan (`divergencia.ts`).
5. **Emulador** (`duo-emulado.ts`): reproduce la lógica de duo-e2e de A2 a A5 en Node, con un reloj de pared simulado. La duración y los pasos de cada fotograma salen de 3.623 fotogramas reales grabados (mediana de 192 ms y 4,77 pasos por fotograma). Hice 400 escenarios por versión, emparejados por semilla de ruido.
6. **«La calle» en Node** (`caidas.ts`, `sueltos.ts`, `espera-carril.ts`, `traza-calle.ts` y `regresion.ts` del revisor 1) en los cuatro commits. Además, tres experimentos de una sola línea en worktrees desechables (los parches están en `diff-exp-*.patch`). Son experimentos para confirmar la causa, no arreglos propuestos.

---

## 1. duo-e2e: 6/6 frente a 2/8

**Veredicto: FRAGILIDAD DEL TEST** (b). No es una regresión de código (a). El 6/6 de la base en las tandas del revisor 1 no lo he podido reproducir: puede ser azar o algo de su entorno (c) que ya no se puede comprobar.

### Evidencias

**a) Tasas con la prueba sin tocar.** Ejecutadas con `tanda-orig.sh 1 10 …`; resultado en `tanda-orig1.txt` y `resumen-orig1.jsonl`.

```
base soltar OK 5 / 10   todo A1-A5 OK 5
c2   soltar OK 5 / 10   todo A1-A5 OK 5
```

Con la copia instrumentada (`tanda1.txt`), la base pasa 3/6 y c2 3/6. Juntando todo lo mío, 8/16 frente a 8/16 (Fisher p = 1,0). Juntándolo con lo del revisor 1, 14/22 frente a 10/24 (p = 0,155).

Si la tasa real ronda el 44 %, la probabilidad de sacar 6/6 es 0,0073 y la de sacar ≤ 2/8 es 0,20. Su worktree de la base (`/tmp/claude-0/review-c2/qa/base`) ya no existe, así que no he podido revisarlo.

**b) Los FPS son iguales.** En la escena de keyboard-e2e, la mediana de ms por fotograma es 193,9 en la base y 195,4 en c2 (p90: 321 y 343). En duo, entre 183 y 196 ms por fotograma y entre 4,67 y 4,87 pasos por fotograma en las dos.

El juego avanza como mucho **5 pasos (0,083 s) por fotograma** (`inputCore.ts:286`, `maxSteps = 5`, y `main.ts:346`, tope de 0,1 s). Las esperas de la prueba se miden en tiempo de juego, así que el resultado depende de en qué fotograma cae cada pulsación. Eso es igual en las dos versiones.

**c) Navegador y Node coinciden.** `repetir.ts` sobre cualquier ejecución da `error máximo frente al navegador 4.94e-4`, que es el redondeo a 3 decimales del registro. Lo que cambia de una ejecución a otra son solo las entradas, es decir, el reloj.

**d) Repetición cruzada.** Mismas entradas en la otra versión (`cruce-*.txt`):
- en 8 de 12 ejecuciones, el resultado es idéntico;
- en 4 se separa: base-4 en 23b8c66, y c2-2, c2-4 y c2-6 en 657fd30.

`divergencia.ts` localiza el primer paso distinto:
- c2-2: paso 90, diferencia de 5,26e-4 m, con J1 en x = 1,386 empujando el extremo del sofá y sin ningún suceso de agarre;
- base-4: paso 282, 1,02e-2 m.

Por commits:
- 657fd30 frente a a84984f: «sin diferencias»;
- a84984f frente a ec1d620: diferencia en el mismo paso;
- ec1d620 frente a 23b8c66: «sin diferencias».

**La separación entra en ec1d620.** `orden.ts`:
- 657fd30 y a84984f: `cuerpos 65 colliders 68`;
- ec1d620 y 23b8c66: `cuerpos 73 colliders 76`, con el mismo sofá y los mismos porteadores (masa, rozamiento, CCD y amortiguación idénticos);
- `fijos.ts`: los colliders del patio son idénticos a precisión completa; solo cambian los del camión (el bloque pasa a ser 8 piezas, `game.ts:278` con `truckBoxes`).

Experimento `exp-orden`: añadir 8 cuerpos fijos de relleno a 657fd30 antes del sofá hace que c2-2 y c2-4 salgan **idénticos** a ec1d620. c2-6 y base-4 siguen separándose: probablemente por el orden intercalado de los colliders fijos, sin demostrar.

Conclusión: es una perturbación numérica legítima, efecto del orden de creación en Rapier. Cambia cada ejecución, pero no el reparto de resultados.

**e) Emulador: 400 escenarios emparejados por versión** (`resumen-emulado.py`):

```
657fd30: grab1=393/400 aviso=359/400 soltar=175/400 regrab2=371/400 | teclas A 261 (soltar OK 175), S 139 (soltar OK 0)
a84984f: idéntico a 657fd30 (400/400 escenarios iguales)
ec1d620: grab1=389/400 aviso=353/400 soltar=183/400 regrab2=371/400 | teclas A 258 (soltar OK 181), S 142 (soltar OK 1)
23b8c66: idéntico a ec1d620
657fd30 vs 23b8c66: escenarios idénticos 276/400; soltar OK 175 vs 183 (discordantes 36); Fisher p=0.619
```

**f) Mecanismo de la fragilidad.**
- `duo-e2e.cjs:203-205` elige las teclas de «sentidos opuestos» según el giro (π/4).
- `:216-218` tira siempre **en el eje x**, sea cual sea la orientación del sofá.
- La caída depende de la tensión al soltar (`carrier.ts:683-741`, `releaseKick`).

Con las teclas S + ↑, «soltar» no pasa nunca:
- navegador: 7 de 7 ejecuciones con S fallan;
- emulador: 0/139 en la base y 1/142 en c2.

Con A + →, pasa en torno al 67–70 %. El giro antes de tirar no está en el filo de π/4, como suponía duo-filo.ts (ese guion agarra en la salida, sin andar): varía mucho, de 0,35 a 1,79 rad en el navegador, según por dónde agarra cada uno tras andar.

**g) Un fallo nuevo del mismo tipo.** «aviso en pantalla: Pesa mucho» falló 2 veces en c2 y 0 en la base (navegador; Fisher p = 0,47). En el emulador falla en 41/400 (base) y 47/400 (c2).
- Mecanismo: `hud.ts:180-181`. Con el sofá inclinado (`sofaUp < 0,8`) el HUD muestra «¡Que se vuelca!», que tiene prioridad sobre «Pesa mucho».
- En 34 de 41 (base) y 36 de 47 (c2) de esos fallos, el `sofaUp` mínimo fue < 0,8.
- Es anterior al ciclo 2.

### Qué tocaría un arreglo
- Solo `scripts/duo-e2e.cjs`. Por ejemplo:
  - tirar y elegir las teclas según el eje real del sofá, no según el eje x ni el filo de π/4;
  - fijar la orientación antes del paso 4d;
  - comprobar el aviso aceptando la prioridad del HUD.
- Riesgo: si se cambia el criterio sin fijar la orientación, la comprobación puede quedar sin poder para detectar fallos reales del tambaleo.

---

## 2. Agarre fallido («los dos agarran» y «J2 vuelve a agarrar»)

**Veredicto: FRAGILIDAD DEL TEST**, anterior al ciclo 2. Confianza: alta.

### Evidencias

- **El agarre no ha cambiado.** a84984f (`tryGrabAny(grabbables.filter(freeHand))` en `game.ts:428`, `maxHands`, `createItem`) da escenarios **idénticos a 657fd30 en 400/400**. Con 2 porteadores y un sofá de 6 asas, el filtro no tiene efecto.
- **«Los dos agarran» falla poco y por igual.** Emulador: 7/400 en la base y 11/400 en c2 (p = 0,48). Navegador:
  - en mis 36 ejecuciones nunca falla;
  - el tiempo hasta agarrar varía en las dos versiones (base de 1,7 a 13,2 s; c2 de 1,77 a 17,1 s);
  - el revisor 1 tuvo 1 caso en c2 (b-4, con 21 rodeos).

  Traza en el emulador (`TRACE=1 … SEED0=38`): J1 se pasa del objetivo una y otra vez y empuja el sofá, que va corriendo hacia −x (0,00 → −0,28 → −0,46 → −1,13 → −1,58). El objetivo se mueve y se agotan las 120 iteraciones. Es el piloto de la prueba:
  - cada pulsación dura ≥ 2 fotogramas, es decir, ≥ 0,167 s a 5,2 m/s (`CARRIER.walkSpeed`), unos 0,87 m;
  - la ventana de llegada es de ±0,2 m (`duo-e2e.cjs:149-151`);
  - no esquiva el sofá.
- **«J2 vuelve a agarrar» es una cascada.** Emulador: 29/400 en las dos versiones. En los 29 casos, «soltar» había fallado y J2 acabó en el lado −x (`j2x < 0`).
  - Si J2 no se cae, sigue corriendo con la tecla pulsada y termina en x de −5,4 a −6,9, detrás de la alfombra fija de (−4,9; 7,4), que es igual en las dos versiones (`estado-*.txt`).
  - El piloto no la rodea: hay hasta 10 «rodeos» seguidos «J2 bloqueado en (−5,42, …)».
  - En el navegador pasó también **en la base** (base-3 instrumentada: «FALLA tras levantarse, J2 vuelve a agarrar», con 10 rodeos), igual que en c2-1 y en c2-duo-b-2 del revisor 1.

### Qué tocaría un arreglo
- `grabBoth` en `duo-e2e.cjs:115-166`: pulsaciones más cortas o andar en proporción a la distancia, un objetivo que no se mueva y rodear los objetos fijos.
- Riesgo: más tiempo de prueba. No toca el juego.

---

## 3. keyboard-e2e: «Con W» avanza Δz = 0

**Veredicto: FRAGILIDAD DEL TEST** (doble pulsación). La tasa por versión no la he podido distinguir: NO CONCLUYENTE en ese punto.

### Evidencias

**a) Tasas.** Original con el grabador pasivo, intercalado 8 + 8 (`tanda-teclado1.txt`): la base pasa 8/8 y c2 7/8. c2-3 falla con «Δz = -0.00 m en 2.55 s de juego». Junto con el revisor 1: 0/11 frente a 2/11 fallos, Fisher p ≈ 0,48.

**b) Mecanismo.** Sucesos grabados en c2-3:

```
paso 185 t=0.150 ev=['g1','g2','g3']           (agarran los 3 ayudantes)
paso 190 t=0.233 grabJ1=1 ev=['g0'] J1h=1      (1.ª pulsación: J1 agarra)
paso 195 t=0.317 grabJ1=1 ev=['r0'] J1h=0      (2.ª pulsación, en el fotograma siguiente: J1 SUELTA)
```

El bucle de `keyboard-e2e.cjs:41-50` funciona así:
1. pulsa Espacio y espera 150 ms de reloj;
2. lee `st()`; si el fotograma que procesa la pulsación (cada ~195 ms) aún no ha llegado, ve `holding=false`;
3. vuelve a pulsar; si entretanto ha llegado ese fotograma, esta segunda pulsación suelta el sofá;
4. la lectura siguiente puede ver todavía el estado de agarre y salir del bucle.

Por eso la comprobación «J1 agarra» da OK y luego «Con W» no mueve nada: los ayudantes solo imitan a un humano que agarra.

**c) El juego no influye.** `repetir-rec.ts` reproduce c2-3 en Node con la semilla grabada (`semilla 613165834: sucesos iguales true, error máx 9.88e-4`). **Con las mismas entradas y la misma semilla en 657fd30, la secuencia es idéntica**: `185:g1+g2+g3 190:g0 195:r0`. Es decir, la base falla igual con esa misma secuencia de entradas.

**d) Lo que no he podido descartar.** No he medido el tiempo de JavaScript por fotograma, que es lo que alarga la ventana del fallo. Las duraciones de fotograma son iguales.

### Qué tocaría un arreglo
- Solo el bucle de agarre de `keyboard-e2e.cjs`: pulsar una vez y esperar avance de juego (como el `tick()` de duo-e2e), no 150 ms de reloj, o comprobar `holding` antes de volver a pulsar.

---

## 4. 4 humanos con 2 ayudantes atentos: más lento y con caídas en el camión

**Veredicto: REGRESIÓN DE CÓDIGO**, introducida en **23b8c66**, en el piloto (`src/sim/autopilot.ts`). Sobre ella hay un coste del diseño de ec1d620 (entregar dentro del camión, subiendo la rampa). Confianza: alta.

### Evidencias

**a) Comparación por commits.** `caidas.ts` con CFG = 4,6,atentos y semillas 1–8:

| Commit | Tiempos (s) | Tramo final (desde x ≥ 22) | Caídas con x ≥ 22 |
|---|---|---|---|
| 657fd30 = a84984f | 31,3–76,77; mediana 33,87 | ≈ 2 s | 2 |
| ec1d620 | 34,52–76,9; mediana 38,77 | 5,3–8,8 s | 10 (7 humanas, dentro de la caja de carga) |
| 23b8c66 | 35,27–**127,93**; mediana 58,05 | 5,2–**90,4 s** | 23 |

Matriz completa de `regresion.ts calle` (59 partidas), caídas en el camión: **9 → 32 (ec1d620) → 61 (23b8c66)**. Las 23 que añade ec1d620 se reparten así: 4h/6c +8 y 1h/4c despistados +11; las demás configuraciones, poca cosa.

**b) Mecanismo 1: pilotos varados** (`sueltos.ts`). En todas las versiones, J3, J4 y A5 pierden el sofá hacia t ≈ 14 s, junto a la acera (z ≈ −13). Racha más larga sin agarrar, semillas 1–8:

| Versión | Manos medias | Racha de J3 (s) | Racha de J4 (s) |
|---|---|---|---|
| 657fd30 | 3,75–4,95 | 4,7–7,3 | 7,8–16,6 |
| 23b8c66 | **2,98–4,51** | **3,1–44,5** | **8,6–27,3** |

- En la traza de la semilla 7, J4 se queda quieto en (2,9; −13,0) de t = 28 a 42, entre el prop fijo de (3,7; −12,85) y el muro de z = −13,5. J3 queda en (1,1; −26) junto a la escalera.
- Causa: `autopilot.ts:533`, `if (d < WALK.tryNear) this.tryTime += dt;`. En 657fd30 contaba siempre, y a los 3 s cambiaba de asa, lo que cambiaba la dirección en línea recta y desatascaba.
- Experimento `exp-trytime` (solo esa línea, como en 657fd30):
  - 4h/6c: **35,9–43,2 s (mediana 35,93), integridad mínima 93**;
  - caídas en el camión de esa configuración: 23 → 9; en toda la matriz, 61 → 41;
  - racha de J4: 7,8–12,4 s; manos medias: 4,32–4,6.

**c) Mecanismo 2: espera en la entrada del carril** (`espera-carril.ts`). El comentario de `autopilot.ts:320` dice: «Con un solo objeto («La calle»), nunca espera». En la práctica:
- `mayEnter` (`:328`) solo excluye a los del equipo y a quien agarra el sofá, así que **cuenta a los ayudantes que no agarran**;
- 4h/6c, semilla 1: espera «people» de **58,12 s**, 54 de ellos con humanos agarrando el sofá. La traza muestra `gate=people` de t = 42 a 90, con A4 y A5 sin agarrar junto al sofá;
- también hay esperas de 1–10 s en 1h/4c, 2h/4c y 3h/5c.

Experimento `exp-carril` (que los ayudantes no cierren el carril): solo arregla la semilla 1 (127,93 → 58,05 s). Con `exp-ambos`, igual que con `exp-trytime`. **El mecanismo 1 es el principal.**

**d) Alcance.**
- Afecta al piloto: a la demo (`main.ts`, con `new Autopilot(0)` en «La calle»), a la parte B de duo-e2e y a todas las mediciones de Node que usan `Autopilot`. Con la línea de 657fd30, 1h/4c despistados semilla 4 baja de 90,08 a 63,3 s.
- Los porteadores que llevan personas reales no usan el piloto. Para ellos, lo que cuenta es el coste de ec1d620 (rampa y caja de carga: caídas en el camión de 9 a 32), y eso pide una prueba con jugadores.

### ¿Bloquea?
**Sí, conviene corregirlo antes de la siguiente iteración.**
- Es la herramienta con la que se miden T-route, T-roles y help-batch.
- La demo puede tardar 90 s o más.
- Ninguna prueba vigila la combinación de humanos con ayudantes.

### Qué tocaría un arreglo y qué podría romperse
- **`autopilot.ts:533`** (cuándo se da un asa por inalcanzable): volver a la regla de 657fd30 rompe lo que esa línea arreglaba en el patio. Con `exp-trytime`, Vitest sigue pasando 112/112, pero las medianas de T-roles pasan a «2 → 59.55 s; 3 → 30.38; 4 → 30.62», frente a 45,85, 31,68 y 30,85: la de 2 jugadores empeora 14 s.
  - Opciones: medir la falta de progreso en vez de la cercanía, o que `walk()` rodee también lo fijo.
- **`autopilot.ts:322-334`** (`mayEnter`): que los ayudantes que van al mismo objeto no cuenten. Riesgo: en el patio, los ayudantes aparcados (`BOT.park`) o los que salen del camión dejarían de proteger el carril, y pueden volver los bloqueos que ese reparto evitaba (M4b y T-roles).
- Si se quiere bajar el coste de ec1d620 (rampa y caja de carga): `levels/truck.ts` y `RULES.loadFraction` o `winHold`. Riesgo: T-deliver y T-view, con colliders verificados a 0,00 mm.

---

## Tabla final

| # | Hallazgo | Veredicto | Commit | Confianza | Bloquea | Zona de un arreglo |
|---|---|---|---|---|---|---|
| 1 | duo-e2e «soltar»: ~45–50 % de éxito en **las dos** versiones (5/10 y 5/10 sin tocar; 175/400 y 183/400 emulado) | FRAGILIDAD DEL TEST | — (la separación numérica viene de ec1d620 y no inclina el resultado) | alta | No (sí como gate) | `duo-e2e.cjs:203-234` |
| 1b | «aviso Pesa mucho» falla ~10–12 % en las dos (prioridad de «¡Que se vuelca!») | FRAGILIDAD DEL TEST | anterior | alta | No | `duo-e2e.cjs:188` (o `hud.ts:180`) |
| 2 | «los dos agarran» y «J2 vuelve a agarrar» | FRAGILIDAD DEL TEST | anterior | alta | No | `duo-e2e.cjs:115-166` |
| 3 | keyboard «Con W» Δz = 0 por doble Espacio | FRAGILIDAD DEL TEST (tasa: NO CONCLUYENTE) | anterior | alta / baja | No | `keyboard-e2e.cjs:41-50` |
| 4 | 4h/6c: mediana 33,87 → 58,05 s, caídas en el camión 9 → 61 | REGRESIÓN DE CÓDIGO (piloto) + coste de diseño | 23b8c66 (+ ec1d620) | alta | Sí | `autopilot.ts:533` y `:322-334` |

## Lo que queda sin concluir

1. **El 6/6 de la base del revisor 1.** Con mis 36 ejecuciones y 400 emuladas por versión, la tasa es igual (~45–50 %). Sacar 6/6 por azar tiene una probabilidad de ~0,7 %. Su worktree de la base ya no existe; no puedo descartar algo de su entorno (otro build, otra carga de la máquina).
2. **Separación residual tras igualar el número de cuerpos.** 2 de 4 ejecuciones siguen separándose. Creo que es el orden intercalado de los colliders fijos, pero no lo he demostrado.
3. **Tasa del fallo de keyboard por versión.** 0/11 frente a 2/11 no se puede distinguir (p ≈ 0,48). No he medido el tiempo de JavaScript por fotograma.
4. **7 de 41 fallos del aviso** emulados no se explican por la inclinación del sofá.
5. **El emulador simplifica**: fotogramas instantáneos y latencia de Playwright uniforme de 2 a 12 ms. Su tasa (44–46 %) cuadra con la del navegador (50 %), pero no está validado en todo.
6. **Cambios de los ayudantes en 23b8c66** (asa más alejada, aparcar, `stow`): no los he aislado uno a uno. El experimento indica que no son la causa principal en 4h/6c. Tampoco he medido el efecto con personas reales en vez del piloto.

## Archivos y comandos para reproducir

Scripts (en `/home/user/Game-development-rc2/mudanza-imposible/scripts/audit/review-c2/diagnostico/`):
- `duo-instr.cjs` y `tanda-duo.sh`: copia instrumentada de duo-e2e.
- `grabador-pasivo.cjs`, `correr-parteA.sh`, `tanda-orig.sh` y `rec-a-json.py`: duo-e2e original con grabación pasiva.
- `tanda-teclado.sh` y `repetir-rec.ts`: keyboard-e2e original, y repetición con búsqueda de la semilla.
- `repetir.ts`, `divergencia.ts`, `orden.ts`, `fijos.ts` y `estado-inicial.ts`: determinismo y repetición cruzada.
- `duo-emulado.ts` y `resumen-emulado.py`: emulador emparejado.
- `caidas.ts`, `sueltos.ts`, `espera-carril.ts` y `traza-calle.ts`: «La calle» con ayudantes.
- `resumen-duo.py`: resumen de las ejecuciones instrumentadas.

Registros (en `/tmp/claude-0/review-c2/diagnostico/`):
- tandas: `tanda1.txt`, `tanda-orig1.txt`, `resumen-orig1.jsonl` y `tanda-teclado1.txt`;
- ejecuciones: `runs/`, `runs-orig/` y `runs-teclado/`, con `out.log`, `rec.jsonl` y `duo-instr.json`;
- emulador: `emulado-<commit>.jsonl` y `frames-pool.json`;
- repetición cruzada: `cruce-*.txt`;
- «La calle»: `caidas-*.txt`, `sueltos-*.txt`, `espera-carril-c2.txt`, `traza-c2-s1.txt`, `traza-c2-s7.txt` y `regresion-{657fd30,ec1d620,23b8c66,exp-trytime}.txt`;
- experimentos: `vitest-exp-trytime.log` y `diff-exp-*.patch`.

Comandos (con un worktree de cada commit en `$W/wt-<sha>` y su `node_modules` enlazado):

```bash
# Navegador (nunca dos a la vez): build + preview en 4201 (657fd30) y 4204 (23b8c66)
D=…/scripts/audit/review-c2/diagnostico; W=/tmp/claude-0/review-c2/diagnostico
$D/tanda-orig.sh 1 10 base:4201:$W/wt-657fd30 c2:4204:$W/wt-23b8c66
for d in $W/runs-orig/*; do python3 -I $D/rec-a-json.py $d; done
$D/tanda-teclado.sh 1 8 base:4201:$W/wt-657fd30 c2:4204:$W/wt-23b8c66
# Repetición del fallo de teclado en la base con la semilla de c2
(cd $W/wt-657fd30/mudanza-imposible && SEED=613165834 ROOT=$PWD REC=$W/runs-teclado/c2-3 npx vite-node $D/repetir-rec.ts)
# Separación entre commits con las mismas entradas
A=$W/wt-a84984f/mudanza-imposible B=$W/wt-ec1d620/mudanza-imposible JSON=$W/runs/c2-2/duo-instr.json npx vite-node $D/divergencia.ts
# Emulador emparejado (en cada árbol) y resumen
ROOT=$PWD FRAMES=$W/frames-pool.json N=400 SEED0=1 npx vite-node $D/duo-emulado.ts > $W/emulado-<sha>.jsonl
python3 -I $D/resumen-emulado.py $W 657fd30 a84984f ec1d620 23b8c66
# «La calle» 4h/6c por commit y causa
CFG=4,6,atentos ROOT=$PWD npx vite-node $D/caidas.ts   # y sueltos.ts, espera-carril.ts
SEED=1 T0=28 T1=128 PASO=2 ROOT=$PWD npx vite-node $D/traza-calle.ts
# Experimento: aplicar diff-exp-trytime.patch en un worktree de 23b8c66 y repetir caidas.ts / regresion.ts calle / vitest
```
