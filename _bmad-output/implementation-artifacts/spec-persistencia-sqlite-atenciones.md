---
title: 'Persistencia SQLite de atenciones'
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

**Problem:** Las atenciones registradas actualmente viven en memoria y se pierden al reiniciar Node, lo que impide usar el sistema con datos reales.

**Approach:** Conectar el módulo de atenciones con SQLite mediante Prisma, aplicar la migración al iniciar el entorno local y conservar la validación y los cálculos actuales del servidor.

## Boundaries & Constraints

**Always:** Mantener `/api/v1`, permisos server-side, precios congelados, consultas por empleada y el comportamiento actual de la interfaz.

**Never:** Migrar todavía usuarios/sesiones, cambiar reglas financieras, borrar datos existentes ni implementar reportes o cierres.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| CREATE_AND_RESTART | Atención válida y reinicio del proceso | La atención sigue disponible | Error explícito si SQLite no está disponible |
| EMPTY_DATABASE | Primera ejecución local | Se crea la estructura requerida | Migración idempotente |
| NO_SESSION | Petición sin sesión | No se escribe ni consulta | 401 |

</frozen-after-approval>

## Code Map

- `apps/api/src/app.ts` -- reemplazar el almacenamiento en memoria de atenciones por repositorio Prisma.
- `prisma/schema.prisma` -- modelos Service, Attendance y relaciones.
- `prisma/migrations/` -- migraciones SQLite ejecutables.
- `package.json` -- comandos locales para aplicar migraciones antes de levantar la app.
- `tests/api/attendances.test.ts` -- verificar persistencia entre instancias.

## Tasks & Acceptance

**Execution:**
- [ ] `apps/api/src/app.ts` -- persistir y consultar atenciones mediante Prisma.
- [ ] `package.json` -- agregar comando de migración local.
- [ ] `tests/api/attendances.test.ts` -- verificar lectura de un registro persistido.

**Acceptance Criteria:**
- Given una base SQLite disponible, when se crea una atención válida, then queda almacenada en SQLite.
- Given que Node se reinicia, when la misma empleada consulta recientes, then ve la atención previamente creada.
- Given una petición sin sesión, when intenta consultar o crear, then recibe 401 y no altera SQLite.

## Implementation Notes

- Prisma se inicializa al levantar la API, crea o actualiza usuarios y servicios iniciales de forma idempotente, y las atenciones se guardan y consultan desde SQLite.
- `npm run dev` aplica automáticamente las migraciones antes de iniciar API y web.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run db:deploy` -- expected: migrations applied successfully.
- `npm test` -- expected: all tests pass.
- `npm run build` -- expected: web and API compile.
