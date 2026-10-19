# Ciclo 1 — Núcleo jugable fiable

Especificación para quien implemente. Ver el contexto en `../QUALITY_STATE.md` (secciones 4 y 5) y los informes de `../audit/`.

**Regla general:** no se rebaja ningún umbral de prueba. Una prueba que comprueba una mecánica eliminada (alzar con Mayús) se sustituye por la de la mecánica nueva, y el cambio se documenta en el commit. Si un objetivo no se cumple sin trampas, se informa con las mediciones; no se esconde.

## Objetivos medibles

| ID | Objetivo | Cómo se mide |
|---|---|---|
| T-input-1 | Una pulsación de agarrar, enderezar o pausar no se pierde aunque el fotograma no ejecute ningún paso de física | Prueba en Node de la lógica de pulsaciones y paso fijo, sin DOM |
| T-input-2 | Hasta 4 jugadores. Teclado: J1 `WASD` + `Espacio`; J2 flechas + `Intro`; J3 `IJKL` + `U` (u otra que no colisione); J4 teclado numérico `8 4 5 6` + `0`. Mandos asignados por `Gamepad.index`, con Start y pausa en cada mando. Desde el menú se puede empezar con el mando (A o Start). | Prueba de asignación de dispositivos sin DOM y revisión de código |
| T-input-3 | No hay tecla de alzar en el bucle básico (se quita `lift` de las teclas y del HUD). Q/E (girar) solo es opcional para pedir giros a los ayudantes. | Revisión y `grep` |
| T-grip-1 | **Mano blanda:** el agarre no es una rótula rígida. En cada paso se aplica un impulso tipo resorte-amortiguador entre la mano del porteador y el punto agarrado, limitado por persona (fuerza horizontal y vertical máximas). El impulso se aplica en el punto del objeto, con el opuesto en el porteador. Si la exigencia supera el límite durante un tiempo y la mano se separa más que `gripBreak`, se suelta («¡Se escapa!»). El choque cuerpo-objeto **sigue activo** al agarrar. | Revisión y las pruebas siguientes |
| T-grip-2 | **Sofá a solas** (masa real única, ~90 kg): uno solo levanta un extremo y lo arrastra **despacio**: entre 0,3 y 1,5 m en 3 s desde parado en llano. No puede subirlo por la escalera en 20 s. | Prueba en Node |
| T-grip-3 | **Sofá entre dos:** lo llevan levantado (la base del sofá a más de 0,1 m del suelo mientras andan), a más de 2,5 veces la distancia de uno solo en 3 s. Lo suben por la escalera en menos de 8 s **sin ninguna tecla de alzar**. | Prueba en Node |
| T-grip-4 | **Objeto ligero:** una caja de prueba de 10 kg, creada en la prueba con la misma API genérica de agarre (sin código específico del sofá), la lleva una sola persona levantada a más del 70 % de su velocidad de carga | Prueba en Node |
| T-coop-3/4 | Con 3 y 4 humanos agarrando desde sus posiciones de salida y desde posiciones variadas (no basta con cambiar la semilla, que no altera nada en cooperativa), quietos, andando a lo largo, de lado y girando: `sofaUp ≥ 0,7` en todo momento, 0 caídas, integridad 100 y nadie se suelta salvo tirando en sentidos opuestos | Prueba en Node |
| T-phys-unify | **Una sola física:** misma masa y rozamiento del sofá, misma fuerza por persona, mismo choque al agarrar y mismo equilibrio con humanos que con ayudantes. Si alguna diferencia es imprescindible (por ejemplo, que la IA de los ayudantes no se caiga), se aísla en la IA y se documenta en el código y en el commit. | Revisión de código y las pruebas del modo con ayudantes |
| T-help | Modo con ayudantes: las pruebas actuales (2 y 4 atentos, 4 despistados) siguen ganando sin tocar sus umbrales. `npm run sim` con despistados, semillas 1–8: al menos 7 de 8 entregas, como en la línea base. | Vitest y `scripts/sim-run.ts` |
| T-route | Recorrido completo con piloto automático para **2, 3 y 4 humanos** (`Autopilot` ampliado a N humanos), dentro del tiempo y con todas las etapas en orden | Prueba en Node |
| T-auto-lift | **Alzado automático:** al agarrar, la mano va a la altura de carga sin tecla. Feedback visible: aviso contextual «Pesa mucho: falta alguien en el otro extremo» (o equivalente) cuando uno solo arrastra un objeto pesado, y esfuerzo visible en el muñeco. Se elimina `needsLiftAtStairs` y su aviso. | Revisión, prueba de la condición del aviso y captura |
| T-coh-1 | **Sin `visOff`:** se elimina el desplazamiento visual que esconde solapes. La cápsula física tiene la anchura real del tronco del muñeco (medirla en `dollRig.ts`; unos 0,36 m de radio) o el muñeco se ajusta a la cápsula. Lo dibujado y lo físico coinciden. | Revisión y `scripts/sofa-contact-check.cjs` |
| T-coh-2 | **Caída física:** al caer, el collider del porteador se tumba de verdad (`setRotationWrtParent` y `setTranslationWrtParent`) hacia una dirección libre comprobada con consultas de forma, y el muñeco se dibuja con esa misma pose. Al levantarse, vuelve a la cápsula de pie cuando hay sitio. | Prueba en Node: cuerpo tumbado sin solaparse más de 3 cm con el sofá ni con paredes en 6 direcciones |
| T-pen | La prueba de penetración (< 3 cm agarrando, girando y llevando) sigue pasando | Vitest |
| T-e2e | Los scripts de navegador se migran a los controles nuevos (sin Mayús); `e2e:duo` y `e2e:teclado` pasan | Chromium |

## Orden de trabajo (cada paso con su commit y `tsc` y Vitest en verde)

1. **Física:**
   - mano blanda genérica, que funciona con cualquier cuerpo agarrable y no solo con el sofá;
   - física única;
   - alzado automático;
   - se quita `lift` de `PlayerInput`;
   - pruebas T-grip, T-coop, T-help y T-pen.
2. **Entradas:**
   - pulsaciones retenidas hasta que la física las consume;
   - 4 jugadores en teclado y mando;
   - Start por mando;
   - menú manejable con el mando;
   - pruebas T-input.
3. **Coherencia entre dibujo y física:**
   - cápsula a la anchura del muñeco;
   - caída con collider tumbado;
   - se quita `visOff`;
   - pruebas T-coh.
4. **Pruebas y scripts:**
   - piloto para N humanos y T-route;
   - migración de los scripts de navegador;
   - ejecución de `e2e:duo` y `e2e:teclado`.
