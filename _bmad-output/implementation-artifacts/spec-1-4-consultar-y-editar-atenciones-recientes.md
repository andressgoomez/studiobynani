---
title: 'Consultar y editar atenciones recientes'
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

**Problem:** Las atenciones recientes pueden consultarse, pero todavía no se pueden corregir cuando una empleada comete un error de carga.

**Approach:** Permitir editar una atención propia durante las 24 horas posteriores a su creación, recalculando sus importes en el servidor. Las atenciones nunca se eliminan y, pasada la ventana, quedan solo para consulta.

## Boundaries & Constraints

**Always:** Autorizar por sesión; permitir editar únicamente registros propios a empleadas; usar `createdAt + 24 horas`; recalcular precio, descuento, comisión y entrega server-side; registrar `updatedAt`; conservar el historial sin borrado.

**Never:** Permitir eliminar; editar atenciones ajenas; confiar en fechas o importes del navegador; permitir edición luego de 24 horas; cambiar precios históricos de otras atenciones.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| RECENT_EDIT | Registro propio menor a 24 h | Actualiza datos y derivados | N/A |
| EXPIRED_EDIT | Registro propio de 24 h o más | No modifica | 403 |
| OTHER_USER | Registro de otra persona | No revela ni modifica | 404 |
| INVALID_EDIT | Datos o servicio inválido | No modifica | 400 con campos |
| NO_DELETE | Petición DELETE | Nunca borra | 405 o 404 |

</frozen-after-approval>

## Code Map

- `apps/api/src/app.ts` -- endpoints de detalle y edición, permisos y ventana temporal.
- `packages/contracts/src/index.ts` -- contrato de actualización y campos editables.
- `apps/web/src/main.tsx` -- acción de editar, formulario y tiempo restante.
- `tests/api/attendances.test.ts` -- pruebas de edición, vencimiento, permisos y no eliminación.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/app.ts` -- implementar detalle y actualización protegidos.
- [x] `packages/contracts/src/index.ts` -- definir request de edición.
- [x] `apps/web/src/main.tsx` -- permitir editar registros propios dentro de 24 horas.
- [x] `tests/api/attendances.test.ts` -- cubrir edición válida, vencida, ajena y eliminación.

**Acceptance Criteria:**
- Given una atención propia menor a 24 horas, when la empleada la abre, then ve cuánto tiempo queda y puede editarla.
- Given una edición válida, when se guarda, then el servidor recalcula todos los importes y actualiza `updatedAt`.
- Given una atención de 24 horas o más, when intenta editar, then la API rechaza y la UI indica que la ventana terminó.
- Given una empleada intenta editar una atención ajena, when solicita el recurso, then la API no la revela ni modifica.
- Given cualquier usuario intenta eliminar una atención, when envía DELETE, then el servidor no la elimina.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- `false` — La supuesta corrupción de codificación proviene de la representación del diff del revisor; los archivos fuente se leen y compilan correctamente como UTF-8.
- `defer` — Las observaciones sobre `.env`, estados de specs de persistencia, documentación de historias previas y `deferred-work.md` son preexistentes y ajenas a esta historia.
- `defer` — La recuperación visual de sesiones expiradas y la cobertura adicional de autenticación pertenecen al flujo de acceso; no cambian el contrato de edición de atenciones.
- `defer` — La pantalla administrativa y su resumen no forman parte de la consulta/edición propia de esta historia.
- `false` — El hallazgo de una operación `updateMany` inexistente no aplica al código actual; la actualización usa `prisma.attendance.update` después de validar la ventana.
- `patch` — La UI podía conservar el botón de edición hasta un nuevo render después de vencer la ventana; ahora actualiza el reloj cada segundo y recalcula la habilitación.
- `defer` — La condición de carrera teórica entre la validación y la escritura requiere una política transaccional adicional no definida por este spec; la API conserva la validación server-side y rechaza solicitudes que ya llegan vencidas.

## Verification

**Commands:**
- `npm test` -- 14 tests pass.
- `npm run build` -- API and web compile successfully.
