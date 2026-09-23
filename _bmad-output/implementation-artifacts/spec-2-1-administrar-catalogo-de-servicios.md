---
title: 'Administrar el catálogo de servicios'
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

**Problem:** Los precios y servicios están definidos en código, por lo que NANI no puede actualizar el catálogo cuando el estudio cambia su oferta.

**Approach:** Crear una sección administrativa protegida donde NANI pueda consultar, crear, editar, activar y desactivar servicios. Las atenciones existentes conservarán sus importes históricos.

## Boundaries & Constraints

**Always:** Solo NANI puede administrar; validar importes en centavos y duración positiva; conservar servicios históricos; mantener habilitaciones actuales al editar; impedir que servicios inactivos aparezcan en nuevas atenciones.

**Never:** Permitir cambios a empleadas; borrar servicios; modificar importes de atenciones ya guardadas; administrar todavía PINs o asignaciones detalladas por empleada.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| LIST | NANI autenticada | Ve catálogo activo e inactivo | 401/403 |
| UPDATE | Datos válidos | Actualiza servicio para nuevas atenciones | N/A |
| CREATE | Nombre, precio y duración válidos | Crea servicio activo | N/A |
| INVALID | Precio cero, duración inválida o nombre vacío | No modifica | 400 por campo |
| DISABLE | Servicio existente | Queda inactivo sin borrarse | N/A |
| EMPLOYEE | Empleada intenta administrar | Operación rechazada | 403 |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` y `prisma/migrations/` -- categoría y persistencia del catálogo.
- `apps/api/src/app.ts` -- endpoints administrativos protegidos.
- `packages/contracts/src/index.ts` -- contratos de servicio.
- `apps/web/src/main.tsx` -- sección de catálogo visible para NANI.
- `tests/api/attendances.test.ts` -- cobertura de permisos, CRUD y efecto en nuevas atenciones.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` y migración -- agregar categoría y soportar catálogo editable.
- [x] `apps/api/src/app.ts` -- implementar listado, creación, edición y activación/desactivación.
- [x] `packages/contracts/src/index.ts` -- actualizar contratos.
- [x] `apps/web/src/main.tsx` -- agregar gestión de catálogo para NANI.
- [x] `tests/api/attendances.test.ts` -- cubrir reglas y permisos.

**Acceptance Criteria:**
- Given NANI autenticada, when abre catálogo, then ve servicios activos e inactivos con nombre, precio, duración y categoría.
- Given NANI guarda datos válidos, when crea o edita un servicio, then queda disponible para nuevas atenciones.
- Given NANI desactiva un servicio, when una empleada carga una atención, then no puede seleccionarlo.
- Given una atención histórica, when cambia el servicio, then sus importes permanecen sin cambios.
- Given una empleada intenta administrar el catálogo, when solicita la operación, then Node responde 403.

## Implementation Notes

- El catálogo ahora se administra desde la sección de NANI y sus cambios se guardan en SQLite.
- Las atenciones existentes conservan los importes almacenados; los cambios afectan solamente nuevas atenciones.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test` -- expected: all tests pass.
- `npm run build` -- expected: API y web compilan.
