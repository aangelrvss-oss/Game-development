# Auditoría inicial — índice

Flujo de agentes `rebirth-audit` (`wf_9501e555-672`), lanzado el 19-10-2026 a las 19:17 UTC y terminado a las ~20:00 UTC: 7 agentes, 0 errores, 254 llamadas a herramientas. Todos en solo lectura; el árbol de trabajo quedó limpio.
Commit auditado: `08547f8dd12f57aed91400d5a6102d8e8a2d3130` (más dos commits de documentación y del script de Blender que no tocan el juego).

| Informe | Área | Críticos | Mayores | Menores | Acoplamientos |
|---|---|---|---|---|---|
| [01-fisica.md](01-fisica.md) | Núcleo jugable y física | 3 | 7 | 6 | 24 |
| [02-niveles.md](02-niveles.md) | Niveles y contenido | 0 | 2 | 13 | 19 |
| [03-vista.md](03-vista.md) | Render, personajes y animación | 1 | 7 | 7 | 12 |
| [04-ui-audio.md](04-ui-audio.md) | Interfaz, menús, audio y bucle | 1 | 10 | 13 | 14 |
| [05-qa.md](05-qa.md) | Pruebas y scripts | 1 | 6 | 6 | 20 |
| [06-reutilizable.md](06-reutilizable.md) | Laboratorio, a-la-de-tres y referencias | 0 | 3 | 8 | 15 |
| [07-revisor-completitud.md](07-revisor-completitud.md) | Revisión cruzada y 10 problemas estructurales | — | — | — | — |

Archivos de soporte:
- `informes-originales.json`: la salida completa del flujo, tal cual (fuente de verdad de estas transcripciones).
- `rebirth-audit.workflow.js`: el script que lanzó a los agentes (prompts y esquema de salida).
- `08-verificacion.md`: verificación propia de cada hallazgo (CONFIRMADO / REFUTADO / NO REPRODUCIDO), con scripts reproducibles en `scripts/audit/`.
