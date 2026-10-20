# Ciclo 2 — Objetos, entrega y niveles como datos

Especificación para quien implemente. Ver el contexto en `../QUALITY_STATE.md` (secciones 4, 5 y 9), la dirección artística en `../ART_DIRECTION.md` y la especificación del ciclo anterior en `ciclo-1.md`.

**Regla general:** igual que en el ciclo 1.
- No se rebaja ningún umbral de prueba. Las 71 pruebas actuales siguen pasando con sus umbrales.
- Si un objetivo no se cumple sin trampas, se informa con las mediciones; no se esconde.
- Una sola física para todo: la mano blanda (`src/sim/hand.ts`) y la fuerza de las piernas (`CARRIER`) son las mismas con cualquier objeto. **Ningún objeto lleva código de agarre propio.** Lo que diferencia un piano de una caja son sus datos: masa, forma, rozamiento y asas.
- Nada de desplazar el dibujo para esconder solapes: lo dibujado coincide con los colliders.

## Por qué este ciclo

- **El juego solo tiene un objeto (el sofá)** y una zona de entrega junto a un camión que es un bloque macizo.
- **Con 4 humanos, el 3.º y el 4.º no aportan nada:** la entrega tarda 33,0–33,5 s con 2, 3 o 4 activos. Este mayor de la revisión de diseño del ciclo 1 sigue abierto.
- **Los niveles 1–4 del plan necesitan objetos y niveles descritos como datos.** Construirlos sobre el código actual, con el sofá y el recorrido fijos en el código, los haría frágiles.

## Objetivos medibles

| ID | Objetivo | Cómo se mide |
|---|---|---|
| T-item-1 | **Catálogo `ItemDef`** en `src/sim/items.ts`, solo datos y sin Three.js. Cada definición tiene: `id`, nombre en español, masa, rozamiento, forma (lista de cajas, con o sin borde redondeado, en coordenadas locales), asas (punto local y dirección hacia fuera; su número es el máximo de manos), `minCarriers` (cuántas personas hacen falta para llevarlo en el aire), fragilidad (umbral de golpe y daño, o nada) y clave de dibujo. Al menos 7 definiciones: caja, silla, lámpara de pie (frágil), mesa, sofá, nevera y piano. El sofá reproduce **exactamente** la forma, la masa, el rozamiento y las asas actuales (`SOFA` y `SLOTS`). | Revisión y prueba de que `createItem(sofa)` da los mismos colliders que `createSofa` |
| T-item-2 | **Clases de peso con la misma física.** En llano, con porteadores guiados por la prueba: con `minCarriers` personas, el objeto va en el aire (base a más de 0,1 m del suelo mientras andan) y avanza; con `minCarriers − 1`, no despega del suelo (como mucho lo arrastra). Como mínimo: la caja y la lámpara las lleva una sola persona; la mesa y la nevera necesitan 2; el piano necesita 3 (con 2 no despega) y con 4 va mejor que con 3. Todo sale de los datos (masa y asas) y de `HAND`, sin excepciones por objeto. | Prueba en Node por objeto |
| T-item-3 | **Fragilidad.** La lámpara se rompe (estado `broken` y evento `itemBroken`) si cae desde la altura de carga o recibe un golpe por encima de su umbral. No se rompe si se lleva andando y se deja en el suelo con cuidado. Cada objeto tiene su propia integridad, y el daño total de la partida es la suma. | Prueba en Node |
| T-truck | **El camión es un espacio de verdad:** caja de carga abierta por detrás, con suelo, paredes y techo como colliders separados, y rampa de carga. Ya no es un bloque macizo. Se puede entrar con un objeto, dejarlo dentro y apilar. | Prueba en Node: dos personas suben la mesa por la rampa y la dejan dentro; la caja de carga admite al menos 4 objetos del catálogo a la vez |
| T-deliver | **Entrega con progreso.** Un objeto cuenta como cargado cuando su centro y al menos el 80 % de su caja envolvente están dentro de la caja de carga, nadie lo agarra y lleva `winHold` s quieto. Si se vuelve a sacar, deja de contar. Hay evento `itemLoaded` (y `itemUnloaded`). El nivel define qué objetos son obligatorios. Se gana al cargar todos los obligatorios. Un obligatorio roto hace perder; uno opcional roto solo cuenta como daño. Lista de estados por objeto: `pendiente`, `en camino` (alguien lo lleva), `cargado` y `roto`. | Prueba en Node |
| T-level-1 | **Nivel como datos (`LevelDef`)** en `src/levels/`. Incluye: id, nombre, cajas de colisión y de dibujo, decoración, salidas de los porteadores, objetos (definición, posición, giro, obligatorio u opcional), pose del camión, etapas, puntos de reaparición, ruta de cada objeto para el piloto, límite de tiempo, tráfico y semáforo. `Game`, la vista y el piloto reciben el `LevelDef`. Fuera de los módulos de nivel, nada importa constantes del recorrido (`LEVEL`, `ROUTE`, `ZONE`, `STAGES`, `CHECKPOINTS`, `SOFA_START`…). | `grep` y revisión |
| T-level-2 | **Nivel de referencia:** el recorrido actual pasa a ser un `LevelDef` («La calle», solo con el sofá obligatorio) y se juega igual. Las pruebas de recorrido (T-route con 2, 3 y 4) y las de ayudantes siguen pasando sin tocar sus umbrales, y `e2e:duo` y `e2e:teclado` siguen pasando. En la entrega, el sofá entra **dentro** del camión (rampa y caja de carga) en vez de quedarse en una zona del suelo. | Vitest y Chromium |
| T-level-3 | **Escena de prueba de objetos** («Patio de pruebas»): un `LevelDef` pequeño y llano con el camión y al menos 6 objetos (2 cajas, lámpara, silla, mesa, nevera o piano), varios obligatorios. Se elige con `?nivel=pruebas`. **No es uno de los 4 niveles del juego** y no se presenta como tal. | Revisión y captura |
| T-roles | **El 3.º y el 4.º jugador aportan.** En el patio de pruebas, con el piloto repartiendo a los humanos entre objetos (`PilotCrew` ampliado a varios objetos y a equipos): con 4 humanos se termina al menos un 25 % antes que con 2, y con 3, antes que con 2. Se usa la mediana de 3 configuraciones de salida distintas (posiciones, no solo semillas). | Prueba en Node con los tiempos en la salida |
| T-hud | **Lista de la mudanza en el HUD:** «Cargados N/M», con nombre y estado de cada objeto. Los rotos se marcan. Hay aviso y sonido al cargar un objeto (evento `itemLoaded` → `sfx.ts`, con sonido sintetizado, sin archivos con derechos). | Captura en Chromium a 1280×720 con 2 y 4 jugadores, sin tapar los paneles de jugador |
| T-view | **Dibujo de los objetos a partir de su `ItemDef`:** procedural en Three.js por ahora, según la dirección artística (paleta, maqueta de juguete). Los objetos se reconocen. La caja de carga y la rampa del camión se dibujan donde están sus colliders. Los ayudantes se reparten entre los objetos y buscan el que necesita manos, sin código propio por objeto. | Prueba de coherencia en Node (las cajas dibujadas del camión coinciden con los colliders a menos de 1 cm) y capturas |
| T-perf | `npm run perf` y una medición del coste por paso en el patio de pruebas con todos los objetos. Hay que reportar ambos números. Como referencia, el coste por paso no debe superar 2 veces el del nivel de referencia. | Salida literal |

## Orden de trabajo

Cada paso lleva su commit, con `tsc` y Vitest en verde.

1. **Objetos (simulación):**
   - `items.ts` con el catálogo;
   - `createItem`, que generaliza `createSofa`;
   - `Game` mantiene una lista de objetos, cada uno con su estado e integridad. El sofá del nivel de referencia es uno de ellos; se puede mantener `game.sofa` como atajo si ayuda a no romper nada;
   - fragilidad;
   - pruebas T-item-1, T-item-2 y T-item-3.
2. **Niveles y entrega (simulación y HUD):**
   - `LevelDef`, con «La calle» como nivel de referencia y el «Patio de pruebas»;
   - camión con caja de carga y rampa;
   - lógica de entrega con eventos y lista de estados;
   - lista en el HUD y sonido de carga;
   - pruebas T-truck, T-deliver, T-level-1 y T-level-2 (en Node).
3. **Vista, piloto y papeles:**
   - dibujo de los objetos y del camión abierto;
   - `levelView` y `decor` a partir del `LevelDef`;
   - ayudantes con varios objetos;
   - piloto con varios objetos y equipos;
   - pruebas T-roles y T-view;
   - migración y ejecución de `e2e:duo` y `e2e:teclado`;
   - capturas de T-hud y T-level-3;
   - T-perf.
