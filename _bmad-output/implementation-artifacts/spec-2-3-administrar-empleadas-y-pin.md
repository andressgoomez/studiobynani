---
title: 'Administrar empleadas y PIN'
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

**Problem:** NANI necesita controlar quién puede usar el sistema y actualizar los PIN sin borrar el historial de una empleada.

**Approach:** Agregar una sección administrativa de equipo para listar empleadas, activar o desactivar el acceso y establecer un PIN numérico de cuatro dígitos. La API aplicará el estado en el login.

## Boundaries & Constraints

**Always:** Solo NANI puede administrar; PIN de exactamente cuatro dígitos; desactivar impide nuevas sesiones; conservar atenciones históricas; no mostrar PINs.

**Never:** Permitir que una empleada modifique usuarios; eliminar usuarios o atenciones; devolver PINs en respuestas; mostrar JUANITA como empleada activa.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| LIST | NANI autenticada | Ve empleadas activas e inactivas | 401/403 |
| CHANGE_PIN | PIN válido | PIN nuevo permite login | 400 si inválido |
| DISABLE | Empleada activa | No puede iniciar nuevas sesiones | N/A |
| EMPLOYEE_ADMIN | Empleada intenta cambiar | Sin cambios | 403 |
| HISTORY | Empleada desactivada | Atenciones permanecen | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/app.ts` -- endpoints de equipo, hash de PIN y validación de login.
- `packages/contracts/src/index.ts` -- contratos administrativos.
- `apps/web/src/main.tsx` -- panel de equipo para NANI.
- `tests/api/auth.test.ts` -- login y permisos.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/app.ts` -- implementar listado, activación/desactivación y cambio de PIN.
- [x] `packages/contracts/src/index.ts` -- agregar contratos.
- [x] `apps/web/src/main.tsx` -- agregar solapa Equipo.
- [x] `tests/api/auth.test.ts` -- cubrir PIN nuevo, desactivación y 403.

**Acceptance Criteria:**
- Given NANI autenticada, when consulta Equipo, then ve empleadas sin PINs.
- Given NANI establece un PIN válido, when la empleada inicia sesión, then puede usar el PIN nuevo.
- Given NANI desactiva una empleada, when intenta iniciar sesión, then el acceso se rechaza.
- Given una empleada intenta administrar el equipo, when llama a la API, then recibe 403.
- Given una empleada es desactivada, when NANI consulta sus registros, then el historial permanece.

## Implementation Notes

- Los PIN se almacenan hasheados y nunca se incluyen en las respuestas del panel.
- La inicialización de usuarios conserva cambios administrativos persistidos en SQLite.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test` -- 18 tests pass.
- `npm run build` -- API y web compilan.
