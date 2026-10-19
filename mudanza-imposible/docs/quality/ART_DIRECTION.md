# Dirección artística — «Maqueta de mudanza»

Documento corto y vinculante para todo asset, nivel e interfaz. Si algo no encaja aquí, no entra en el juego.

## Idea

**El mundo es una maqueta de juguete en una tarde de mudanza.**
- Los porteadores son figuras de goma blanda.
- Los muebles son piezas gruesas, de cantos muy redondeados, que pesan a la vista.
- La arquitectura es un decorado modular cortado como una casa de muñecas.

Lo cómico sale del contraste entre muebles enormes y gente pequeña y torpe, no de chistes visuales pegados encima.

Referencias de *sensación*, nunca de formas concretas:
- figuras de vinilo de diseño;
- maquetas de arquitectura con corte;
- dioramas de stop-motion.

No se copian personajes, paletas ni mapas de ningún juego.

## Personajes: «los porteadores»

- **Proporción de juguete**:
  - la cabeza es el 38–42 % de la altura total (unos 1,3 m de juego);
  - el tronco, de pera, va con peto;
  - las piernas son cortas y las botas grandes.
- **Silueta reconocible desde la cámara cenital**: la decide sobre todo el **sombrero**, uno por jugador:
  - J1: gorra con visera;
  - J2: gorro de lana con pompón;
  - J3: pañuelo con lazo;
  - J4: casco de obra.

  Se distinguen aunque no se vea el color.
- **Color de jugador**: peto, sombrero y aro en el suelo del mismo tono.
  - J1 rojo tomate (#e2483d);
  - J2 turquesa (#1597b8);
  - J3 rosa frambuesa (#d0457f);
  - J4 verde oliva (#5f9c2a).

  Camiseta crema común (#fbf3d9).
- **Cara**:
  - los ojos son grandes (blanco y pupila con brillo) y van en la mitad *superior* de la cabeza, para que se lean desde 53° de inclinación;
  - las cejas exageradas cuentan el esfuerzo, el pánico y la alegría;
  - la boca solo aparece en apuros o en la celebración;
  - la visera nunca tapa los ojos vista desde arriba.
- **Manos**: manoplas grandes, que se leen como «agarra» cuando se cierran sobre un asa.
- **Pies**: botas planas que se apoyan en el suelo real, sin flotar ni hundirse.

## Muebles y objetos

- **Formas gruesas**:
  - chaflán o redondeo del 6–12 % de la dimensión menor;
  - patas cortas y robustas;
  - cojines inflados.

  Nada de cajas perfectas.
- **Lectura desde arriba**: la planta de cada objeto es reconocible (tapa negra del piano, tablero de madera, pantalla cónica de la lámpara, puerta blanca de la nevera con tirador).
- **Material**: un color principal y un acento por objeto.
  - Madera miel (#c98b52), cuero mostaza (#e0a526), tela crema (#efe3c8), metal esmaltado blanco (#f4f1ea) y cartón (#c8a26b).
  - Lo **frágil** lleva pegatina roja y blanca. Lo **pesado** tiene la base oscura y un icono de pesa en la interfaz, no en el modelo.
- **Colliders**: cajas y cápsulas sencillas, definidas en datos (`ItemDef`), nunca la malla visual.

## Paleta y materiales

- **Base cálida**: crema (#fdf6e7), terracota (#c8553d), mostaza (#e0a526), verde salvia (#8fd16a / #6fbf52) y cielo (#9fd8ff).
- **Acentos solo para información**:
  - amarillo señal (#facc15): destino y avisos;
  - rojo (#ef4444): peligro y daño;
  - verde (#22c55e): entregado.
- **Materiales mates**: rugosidad 0,6–0,95. Algo de brillo solo en metal esmaltado, cristal y charol. Nada de PBR realista ni texturas fotográficas: texturas dibujadas en canvas o colores planos con variación suave.
- **Contorno oscuro** (#2a2140) en personajes y objetos transportables, para separarlos del fondo. El decorado no lleva contorno.

## Luz y sombra

- **Sol cálido**, de lado y a unos 45°, con sombras suaves; relleno frío del cielo. Una sombra de contacto bajo cada personaje y cada objeto.
- **Ambiente propio por nivel**, con un ajuste de luz por nivel (no materiales nuevos):

| Nivel | Ambiente |
|---|---|
| 1 · Casa | Mañana dorada |
| 2 · Edificio | Interior con lámparas cálidas; escalera más fría y oscura que los rellanos |
| 3 · Calle | Mediodía brillante, sombras cortas |
| 4 · Almacén | Fluorescente frío con focos de trabajo cálidos sobre la zona de carga |

## Arquitectura y vegetación

- **Kit modular** en retícula de 0,5 m: paredes de 0,2 m, marcos de puerta de color contrastado para que se lea lo estrecha que es una puerta, y suelos con patrón legible (tablas, baldosa, hormigón).
- **Corte de maqueta**: lo que tapa a los jugadores baja hasta un zócalo, no se vuelve translúcido.
- **Vegetación** de bolas facetadas (icosaedros) en dos o tres verdes, siempre fuera del recorrido o con copa que se oculta.

## Interfaz y avisos

- **Paneles crema** con borde oscuro redondeado. Tipografía del sistema en peso 800–900. Números grandes.
- **Iconos de silueta** para los objetos (caja, silla, mesa, sofá, nevera, lámpara, piano) en la lista de carga del camión.
- **Avisos** contextuales, cortos, con verbo y tecla: «J2: Intro para agarrar». Nunca más de uno a la vez.
- **Color de jugador** en todo lo que es suyo: aro, etiqueta y fila del panel.

## Animación y exageración

- **Squash & stretch** en impactos y aterrizajes; anticipación breve al agarrar y al levantar.
- **Esfuerzo**: se nota en el tronco inclinado, los brazos tensos y las cejas.
- **Caídas**: cortas (≤ 1,3 s en el suelo), con estrellas, y se levantan solos.
- **Celebración** al cargar un objeto y al completar el nivel; frustración cómica (cabezazo, brazos al cielo) al romper algo.
- **Nada de cinemáticas** que quiten el control durante la partida.

## Cámara y escala

- **Oblicua**, a unos 53°, con el norte siempre arriba (los controles no cambian de sentido).
- **Encuadra a todos** los jugadores y el objeto que se transporta, con zoom automático dentro de unos límites.
- **Escala**: las puertas miden 1,6 m de hueco; el sofá, 2,2 × 0,9 m; los personajes, unos 1,3 m. Los muebles deben parecer grandes al lado de los personajes.
