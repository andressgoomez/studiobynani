---
title: 'Registrar cancelaciones y ausencias'
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

**Problem:** El estudio necesita conservar el registro de una cancelación o ausencia aunque no haya cobro, para que el historial operativo no quede incompleto.

**Approach:** Permitir crear y editar atenciones con estado realizada, cancelada o ausente. Los estados cancelada y ausente conservarán clienta, servicio, fecha y pago informado, pero tendrán importes derivados iguales a cero.

## Boundaries & Constraints

**Always:** Validar estado en Node; conservar el registro; mostrar texto además de color; calcular cero para precio final, comisión y entrega cuando no sea realizada; respetar permisos y ventana de edición.

**Never:** Generar cargos por cancelaciones o ausencias; eliminarlas; alterar el precio histórico de una atención realizada; confiar en cálculos del navegador.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| CANCELLED | Estado cancelada | Registro creado con importes cero | N/A |
| ABSENT | Estado ausente | Registro creado con importes cero | N/A |
| INVALID_STATUS | Estado desconocido | No crea ni modifica | 400 |
| EDIT_STATUS | Atención propia dentro de 24 h | Permite cambiar estado y recalcula | N/A |
| REPORT_LABEL | Atención no realizada | Se identifica claramente por texto | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/app.ts` -- aceptar estado y forzar importes cero para estados no realizados.
- `apps/web/src/main.tsx` -- selector de estado y resumen coherente.
- `tests/api/attendances.test.ts` -- cubrir creación y edición de canceladas/ausentes.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/app.ts` -- habilitar estados cancelada y ausente con cálculo cero.
- [x] `apps/web/src/main.tsx` -- incorporar estado al formulario y mostrarlo en recientes.
- [x] `tests/api/attendances.test.ts` -- cubrir estados e importes cero.

**Acceptance Criteria:**
- Given que se selecciona cancelada, when se guarda, then queda registrada y todos los importes son cero.
- Given que se selecciona ausente, when se guarda, then queda registrada y todos los importes son cero.
- Given una atención no realizada, when se consulta, then muestra “Cancelada” o “Ausente” y no se presenta como ingreso.
- Given un estado inválido, when se envía al servidor, then se rechaza sin modificar datos.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- `patch` — `apps/web/src/main.tsx`: al cambiar servicio, medio de pago o estado se conservaba brevemente una cotización anterior y el formulario podía mostrarla mientras recalculaba. Se limpió la cotización antes de solicitar la nueva.
- `false` — La revisión señaló que un estado inválido podía modificar datos, pero la validación de estado ocurre antes de `prisma.attendance.update`; la prueba agregada confirma que la atención permanece sin cambios.
- `false` — La revisión señaló que cancelar o ausentarse no tenía etiqueta textual; la UI renderiza “Cancelada” o “Ausente” y “No es ingreso · importes $0”.
- `defer` — Rate limiting, limpieza y persistencia de sesiones son problemas preexistentes del flujo de autenticación, no causados por esta historia.
- `defer` — Leer el catálogo persistido y calcular el resumen administrativo pertenecen a Epic 2 y a las historias posteriores de reportes.
- `defer` — Recuperar automáticamente la pantalla de acceso ante 401 es una mejora transversal de autenticación.
- `defer` — La semántica de actualización parcial de PATCH y los límites de longitud del nombre pertenecen a validación/edición general, no al cambio de estados.
- `defer` — La documentación histórica sobre persistencia en memoria y la prueba explícita de expiración de sesión son deuda de historias anteriores.
- `defer` — Condicionar la actualización a la ventana de 24 horas en una sola operación requiere una decisión transversal de concurrencia; no fue introducida por este cambio.

## Verification

**Commands:**
- `npm test` -- expected: all tests pass.
- `npm run build` -- expected: API and web compile.
