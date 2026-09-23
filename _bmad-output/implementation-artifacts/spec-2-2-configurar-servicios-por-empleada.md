---
title: 'Configurar servicios por empleada'
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

**Problem:** El catálogo existe, pero la habilitación de servicios por empleada todavía depende de valores iniciales y NANI no puede ajustarla desde la aplicación.

**Approach:** Agregar a la administración de NANI una configuración por empleada para activar o desactivar servicios. La API usará esa relación persistida al listar servicios y al validar nuevas atenciones.

## Boundaries & Constraints

**Always:** Solo NANI puede modificar habilitaciones; conservar cambios en SQLite; servicios inactivos nunca se ofrecen; validar habilitación en backend; no modificar atenciones históricas.

**Never:** Permitir que una empleada modifique sus permisos; eliminar servicios; permitir atenciones con servicios no habilitados.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| LIST | NANI autenticada | Ve empleadas activas y servicios | 401/403 |
| UPDATE | NANI cambia habilitaciones | Relación queda persistida | 400 si inválido |
| EMPLOYEE_LIST | Empleada consulta servicios | Solo ve activos y habilitados | N/A |
| MANIPULATED_CREATE | Empleada envía servicio ajeno | Atención rechazada | 400 |
| EMPLOYEE_UPDATE | Empleada intenta modificar | Sin cambios | 403 |

</frozen-after-approval>

## Code Map

- `apps/api/src/app.ts` -- endpoints de habilitaciones y validación usando relación Prisma.
- `apps/web/src/main.tsx` -- panel NANI de habilitaciones.
- `packages/contracts/src/index.ts` -- contratos de empleadas y habilitaciones.
- `tests/api/attendances.test.ts` -- permisos, persistencia y validación.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/app.ts` -- implementar consulta y actualización de habilitaciones.
- [x] `packages/contracts/src/index.ts` -- agregar contratos de configuración.
- [x] `apps/web/src/main.tsx` -- permitir configurar servicios por empleada.
- [x] `tests/api/attendances.test.ts` -- cubrir cambios y rechazo server-side.

**Acceptance Criteria:**
- Given NANI autenticada, when consulta equipo y servicios, then puede ver las habilitaciones actuales.
- Given NANI cambia habilitaciones, when guarda, then la nueva configuración persiste.
- Given una empleada carga una atención, when consulta servicios, then solo recibe servicios activos y habilitados.
- Given una empleada envía un servicio no habilitado, when guarda, then Node rechaza la operación.
- Given una empleada intenta cambiar habilitaciones, when llama a la API, then recibe 403.

## Implementation Notes

- Las habilitaciones se guardan en la relación Prisma `Service`–`User` y se aplican tanto al listado como a la creación/edición de atenciones.
- El panel administrativo solo aparece para NANI y el backend rechaza cambios de cualquier empleada.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test` -- expected: all tests pass.
- `npm run build` -- expected: API y web compilan.
