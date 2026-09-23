---
title: 'Registrar una atención realizada'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f19f7ac927665b4e3b33b9da8faa29c90fa9dd33'
context:
  - 'C:/laragon/www/studiobynani/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El estudio necesita reemplazar la carga operativa de la planilla y registrar cada atención desde la aplicación, vinculándola con la persona que la realizó.

**Approach:** Incorporar un formulario autenticado para registrar clienta, servicio y medio de pago. El servidor validará la identidad, los servicios habilitados y los datos, generará la fecha y hora, y devolverá las atenciones recientes.

## Boundaries & Constraints

**Always:** Usar NANI, LULA, LOLA y LEDIS; permitir que cada persona registre sus propias atenciones; conservar el nombre completo de la clienta; aceptar únicamente efectivo o transferencia; validar todo en Node; generar fecha/hora en servidor; mostrar solo servicios habilitados; mantener JUANITA fuera del sistema; usar `/api/v1`.

**Never:** Permitir que el navegador elija otra empleada; aceptar pagos combinados; calcular autorizaciones en React; implementar todavía edición, eliminación, cancelaciones, ausencias, liquidaciones o reportes; modificar el acceso ya implementado.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| HAPPY_PATH | Sesión válida, clienta, servicio habilitado y medio válido | Atención realizada creada y visible en recientes | N/A |
| MISSING_DATA | Clienta vacía, servicio ausente o pago ausente | No se crea registro | Error asociado al campo |
| INVALID_SERVICE | Servicio inexistente o no habilitado para la sesión | No se crea registro | 400 genérico de validación |
| INVALID_PAYMENT | Medio distinto de `cash` o `transfer` | No se crea registro | 400 de validación |
| NO_SESSION | Petición sin cookie válida | No se crea registro | 401 no autorizado |

</frozen-after-approval>

## Code Map

- `apps/api/src/app.ts` -- registrar endpoints protegidos de atenciones y reutilizar la sesión actual.
- `packages/contracts/src/index.ts` -- agregar contratos de servicio, creación y listado de atenciones.
- `packages/domain/src/index.ts` -- centralizar catálogo inicial y habilitaciones por usuario.
- `prisma/schema.prisma` -- persistir servicios y atenciones locales.
- `apps/web/src/main.tsx` -- conectar “Nueva atención” y mostrar formulario/resultados.
- `tests/api/auth.test.ts` -- conservar pruebas de acceso; agregar pruebas en `tests/api/attendances.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/index.ts` -- definir contratos de atención y medios de pago.
- [x] `packages/domain/src/index.ts` -- definir catálogo inicial y servicios habilitados.
- [x] `prisma/schema.prisma` y migración -- agregar entidades de servicios y atenciones.
- [x] `apps/api/src/app.ts` -- implementar creación y consulta reciente con autorización server-side.
- [x] `apps/web/src/main.tsx` -- implementar el formulario mobile-first y estados de guardado/error.
- [x] `tests/api/attendances.test.ts` -- cubrir creación, validaciones, permisos y recientes.

**Acceptance Criteria:**
- Given una persona autenticada, when abre Nueva atención, then puede completar clienta, servicio y medio de pago.
- Given una persona autenticada, when consulta servicios, then solo recibe los habilitados para su usuario.
- Given datos válidos, when guarda, then el servidor vincula la atención a la sesión y genera fecha/hora.
- Given una petición manipulada con otra empleada, when intenta crear, then Node ignora esa identidad y usa la sesión.
- Given un dato faltante, when guarda, then recibe un error de validación y no se crea atención.
- Given una atención creada, when consulta recientes, then ve sus propios registros con clienta, servicio, pago, importe base y hora.

## Implementation Notes

- Se agregó el catálogo inicial con precios de transferencia y habilitaciones: NANI, LULA y LOLA comparten servicios de cejas/lifting/maquillaje; LEDIS tiene sus servicios faciales.
- El cálculo de importes quedó centralizado y se muestra en la atención creada; los estados de cancelación y ausencia quedan para la historia 1.5.
- La API mantiene las atenciones en memoria durante este preview; el esquema y la migración SQLite ya están preparados, pero la conexión runtime queda como riesgo para resolver antes de operar con datos reales.

## Spec Change Log

## Review Triage Log

- `medium` — La interfaz de NANI no cargaba servicios; se corrigió para que NANI también pueda registrar sus propias atenciones.
- `medium` — La migración inicial no incluía `Service` ni `Attendance`; se agregó una migración incremental con ambas tablas y la relación de habilitación.
- `low` — Las respuestas de servicios y atenciones no trataban errores HTTP ni asociaban errores de campos; se corrigieron ambos flujos.
- `low` — Los tests no cubrían comisiones y excepciones de descuento; se agregaron casos para LULA, NANI y LEDIS.
- `defer` — La API aún mantiene atenciones en memoria y no instancia Prisma en runtime; la migración está lista, pero la persistencia efectiva debe resolverse antes de utilizar el sistema con datos reales.

## Verification

**Commands:**
- `npm test` -- expected: all API tests pass.
- `npm run build` -- expected: web and API compile successfully.
- `npm run db:generate` -- expected: Prisma client generates successfully.
