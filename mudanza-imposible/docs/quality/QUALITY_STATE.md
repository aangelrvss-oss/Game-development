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
- **Verificación propia, hallazgo por hallazgo:** en [`audit/08-verificacion.md`](audit/08-verificacion.md) (*en curso*).

Defectos críticos según los auditores, sin duplicados, con su verificación:

| ID | Defecto | Verificación |
|---|---|---|
| C1 | Con 4 jugadores (física cooperativa) el sofá vuelca solo y se rompe; con 3 es leve | **CONFIRMADO**: `verify.ts`, caso A |
| C2 | El agarre es una mordaza rígida: uno solo alza y lleva el sofá; la masa no se nota en vertical | **CONFIRMADO**: `verify.ts`, caso B |
| C3 | Se pierden pulsaciones de agarrar y enderezar en los fotogramas sin paso de física; Start solo pausa bien en el mando de J1 | **CONFIRMADO leyendo el código** (`input.ts:73`, `main.ts:240-253`); no reproducido con hardware |
| C4 | `visOff` desplaza el muñeco para esconder penetraciones y contradice la cápsula física | **CONFIRMADO**: el código lo hace por diseño (`dollView.ts`, `pushOut`) y lo escribí yo en el ciclo anterior |
| C5 | Nada demuestra que el nivel se complete con 3 o 4 jugadores (0/8 medidos) | **CONFIRMADO** (consecuencia de C1 y del piloto); se verifica de nuevo en `08-verificacion.md` |

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
| 0 | Diagnóstico: auditoría protegida, línea base, dirección artística, checkpoint, estado persistente | En curso: falta la verificación hallazgo por hallazgo y la línea base de navegador |
| 1 | **Núcleo fiable**: entradas sin pérdidas (incluidos mandos y 4 jugadores); mano blanda con fuerza limitada y física única; alzado automático; cápsula a la anchura del muñeco y caída física sin `visOff`; pruebas de partida completa con 2, 3 y 4 jugadores | Siguiente |
| 2 | Sistema de objetos (`ItemDef`) y entrega en el camión con progreso; nivel como datos (`LevelDef`) con el recorrido actual como nivel de referencia | Pendiente |
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

- **Mecanismo:** `/loop` en modo autorregulado (`ScheduleWakeup`).
- **Estado:** detenido a petición del usuario el 19-10-2026 a las 19:38 UTC; no hay despertares pendientes.
- **Reanudación:** se reanuda cuando el ciclo 0 esté cerrado y protegido, sin pasar de 8 ciclos.

## 9. Registro de ciclos

- **Ciclo 0** (19-10-2026, en curso):
  - Hecho:
    - auditoría con 7 agentes, protegida en el repositorio;
    - línea base automática;
    - dirección artística;
    - Blender sin interfaz;
    - etiqueta anotada local.
  - Pendiente: verificación hallazgo por hallazgo y línea base de navegador.
