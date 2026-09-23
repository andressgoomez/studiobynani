---
title: 'Usar una interfaz clara y responsive'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f19f7ac927665b4e3b33b9da8faa29c90fa9dd33'
context:
  - 'C:/laragon/www/studiobynani/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La operación diaria debe poder realizarse rápidamente desde la notebook o una pantalla pequeña, con estados comprensibles y controles accesibles.

**Approach:** Ajustar la interfaz existente para mantener el orden lógico de carga, mejorar estados vacíos/cargando/error, diferenciar estados de atención con texto y color, y asegurar controles táctiles y foco accesible.

## Boundaries & Constraints

**Always:** Mantener logo y tokens visuales; usar labels visibles; mostrar texto además de color; controles principales de al menos 44 px; conservar datos ingresados ante errores; diseño mobile-first.

**Never:** Cambiar reglas financieras, permisos, endpoints ni agregar funcionalidades de agenda o turnos.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| MOBILE_FORM | Pantalla menor a 640 px | Formulario en una columna y sin desborde | N/A |
| LOADING | Carga inicial o guardado | Estado visible y botón bloqueado | N/A |
| EMPTY | Sin atenciones recientes | Mensaje claro de vacío | N/A |
| ERROR | API no disponible o validación inválida | Error visible asociado al contexto | Conserva datos |

</frozen-after-approval>

## Code Map

- `apps/web/src/main.tsx` -- estados de carga, vacío, errores, etiquetas y foco.
- `apps/web/src/styles.css` -- responsive, contraste, botones y estados visuales.
- `tests/` -- conservar pruebas API existentes y agregar verificaciones de contratos si aplica.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/main.tsx` -- mejorar estados de carga, vacío, error y accesibilidad.
- [x] `apps/web/src/styles.css` -- ajustar layout mobile-first y controles táctiles.
- [x] `apps/web/index.html` -- confirmar metadatos y lenguaje.

**Acceptance Criteria:**
- Given una pantalla pequeña, when se carga una atención, then los controles se muestran en una columna y son táctiles.
- Given una carga en curso, when se espera respuesta, then se muestra un estado visible y se evita el doble envío.
- Given que no hay atenciones, when se consulta recientes, then se muestra un estado vacío comprensible.
- Given un error de validación, when se muestra, then se conserva lo ingresado y el mensaje es visible.
- Given un estado cancelada o ausente, when se consulta, then aparece texto identificatorio además del color.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test` -- expected: all tests pass.
- `npm run build` -- expected: API and web compile.
