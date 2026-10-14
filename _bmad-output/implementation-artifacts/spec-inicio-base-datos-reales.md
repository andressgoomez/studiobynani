---
title: 'Inicio de la base para uso real'
type: 'chore'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
baseline_commit: '3e27bbb89ea6ada15a1c8b686fc2d4637ac979d6'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La base mezcla el catálogo con atenciones, ventas y productos de prueba. La clienta tiene que abrir el sistema en cero.

**Approach:** Un inicio de una sola corrida, con copia previa, deja a NANI, LULA, LOLA y LEDIS, borra todo el movimiento y carga el catálogo publicado en TuTurno. NANI asigna servicios, carga productos y cambia los PIN.

## Boundaries & Constraints

**Always:**
- Copia con `scripts/backup-db.ts` antes de mutar. Si falla, no hay writes.
- Conservar las cuatro usuarias, sus roles y el PIN `1234`, para que NANI pueda entrar y cambiarlos.
- Borrar atenciones, ventas, compras, productos, gastos, cierres, entregas, sesiones, auditoría y todo servicio que no esté en el catálogo de inicio. El catálogo de productos queda vacío.
- No asignar servicios a ninguna empleada. `onReady` tampoco vuelve a conectarlos.
- El catálogo son los 23 servicios con precio de [TuTurno](https://www.tuturno.io/studiobynani), con el nombre, el precio, la duración y la categoría publicados el 2026-10-13. El precio se guarda en centavos. Los tres que no tienen categoría usan `Cejas, pestañas, makeup`. No entran «Día completo 3hs», «día completo» ni «Día completo 8hs».
- No cambiar esquema, migraciones ni la regla de comisión y descuento.

**Never:**
- No borrar el archivo SQLite ni correr `db:reset-demo`.
- No sembrar atenciones, productos ni gastos.
- No verificar con la suite de API: escribe en esta misma base.
- No crear a JUANITA.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inicio | Base actual y copia exitosa | 4 usuarias, 23 servicios sin empleadas asignadas, cero atenciones, ventas, productos, gastos, cierres y entregas | Si la copia falla, no hay writes |
| Arranque posterior | API `onReady` | No pisa precio, categoría, PIN ni habilitaciones que NANI haya cambiado, y no asigna empleadas | N/A |
| Servicio fuera del catálogo | Id de prueba o servicio que ya no está publicado | Se elimina, porque no queda movimiento que lo referencie | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/index.ts` — reemplazar `INITIAL_SERVICES` por el catálogo con precio de TuTurno y `enabledFor: []`. Conservar ids ya usados (`perfilado-cejas`, `lash-lifting`, `combo-ideal`, `combo-perfecto-x3`, `combo-full-cejas`, `combo-laminado-lifting`, `maquillaje-social`, `maquillaje-perfilado`, `clase-automaquillaje`, `limpieza-extracciones`, `limpieza-masajes`, `limpieza-dermaplaning`, `limpieza-drenaje`, `peeling-enzimatico`, `peeling-quimico`, `dermapen-glow`, `dermapen-premium`, `hydra-lips`, `recuperacion-capilar`, `experiencia-skincare`). Sumar `laminado-cejas` ($22.000, 30 min), `perfi-tinte` ($30.000, 45 min) y `prueba-maquillaje` ($50.000, 60 min). Precios que cambian respecto del seed viejo: maquillaje + perfilado $125.000; limpiezas $40.000, $45.000, $48.000 y $45.000; peelings $48.000; Dermapen Glow $55.000; Dermapen Premium $65.000; Hydra Lips $38.000. Maquillaje social dura 90 min. No tocar `commissionRates` ni `hashPin`.
- `apps/api/src/app.ts` — `onReady` (L123–147) hoy conecta `enabledFor` al crear. Tiene que crear el servicio sin empleadas y no actualizar precio ni categoría si ya existe.
- `scripts/backup-db.ts` — copia previa. Reutilizar.
- `scripts/reset-demo-attendances.ts` — no ejecutarlo.
- `package.json` — agregar `db:start-real`.
- `tests/api/attendances.test.ts` — espera `limpieza-extracciones` a $38.000 y una empleada ya habilitada. Al cambiar precio y dejar las habilitaciones vacías, esa prueba deja de describir el catálogo. Ajustar la expectativa al precio nuevo y habilitar el servicio solo dentro de la prueba.
- `prisma/data/studiobynani.sqlite` — archivo a limpiar. No correr `npm test` después.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/index.ts` -- reemplazar el catálogo inicial por los servicios con precio de TuTurno, sin empleadas -- para que un arranque no reviva el catálogo viejo ni asigne solas
- [x] `apps/api/src/app.ts` -- crear servicios sin conectar empleadas y no pisar ediciones ya guardadas -- NANI configura las habilitaciones
- [x] `scripts/start-real-db.ts` -- backup, borrar el movimiento, dejar las cuatro usuarias y el catálogo sin asignar -- la base de la clienta arranca en cero
- [x] `package.json` -- script `db:start-real`
- [x] `tests/api/attendances.test.ts` -- alinear el precio esperado de la limpieza y habilitar el servicio dentro de la prueba -- la suite no depende de asignaciones previas

**Acceptance Criteria:**
- Given la base actual, when corre el inicio y la copia sale bien, then quedan las cuatro usuarias con PIN `1234`, ningún servicio tiene empleadas, y no hay atenciones, ventas, productos, gastos, cierres ni entregas.
- Given el catálogo publicado, when termina el inicio, then hay 23 servicios activos con ese nombre, precio en centavos, duración y categoría, y no existen los tres «día completo» ni un servicio de prueba.
- Given NANI cambia un precio o una habilitación, when la API vuelve a arrancar, then ese cambio sigue igual.

## Implementation Notes

- `npm run db:start-real` dejó 4 usuarias, 23 servicios, 0 asignaciones y 0 filas de movimiento. Los PIN `1234` entran. Copia: `prisma/backups/studiobynani-20261014-012535.sqlite`.
- `tests/api/start-real-db.test.ts` cubre la copia fallida, el borrado del servicio ajeno y el rearranque que no pisa precio, categoría, PIN ni habilitación. Corrió contra una base temporal y pasó.
- No se corrió la suite de API contra la base de la clienta.

## Spec Change Log

## Review Triage Log

- false — Nombres sucios de TuTurno. El bloque congelado pide el nombre publicado; corregirlos sería cambiar el spec.
- false — Categoría sin emoji en tres servicios. El spec fija el texto `Cejas, pestañas, makeup` para los que no traían categoría.
- false — El texto «10% off» en el nombre. Es el nombre publicado; el descuento lo sigue calculando la regla.
- false — NANI no puede retirar un servicio. El alta lo desactiva y `onReady` no pisa `active`.
- false — La copia ignora `DATABASE_URL`. El comando apunta la base y la copia al mismo archivo `prisma/data/studiobynani.sqlite`.
- low — Copia rasgada o dos corridas en el mismo segundo. Hace falta que la API esté escribiendo o que el script se lance dos veces en un segundo; el arreglo agrega lock y checkpoint.
- low — La prueba temporal no cierra Prisma si una aserción falla. Solo aparece si esa prueba falla, y el archivo es temporal.
- medium — `prueba-maquillaje` toma 10% en efectivo porque `isMakeup` no reconoce ese id. El arreglo es incluirlo en la excepción que ya cubre el maquillaje.
- high — Una segunda corrida de `db:start-real` borra el trabajo de NANI y vuelve los PIN a `1234`.
- high — La pantalla de habilitaciones solo lista `EMPLOYEE`, así que NANI no puede asignarse sus propios servicios después del arranque en cero.
- medium — En la prueba de atenciones, conectar a NANI queda fuera del `try` y el `expect` del restore puede saltear el rollback.
- medium — La prueba de inicio no cubre el update de un servicio ya existente, ni ventas, cierres, sesiones, auditoría ni una usuaria extra, ni que una copia exitosa dispare el reset.
- defer — El resto de la suite de API sigue asumiendo habilitaciones previas y escribe en la base de la clienta. Eso ya era así; este inicio no debe correrla.
- defer — `onReady` sigue reescribiendo `displayName` y `role`. Ese update ya estaba antes de este cambio.
- defer — Crear un servicio desde administración conecta a todas las usuarias activas. Esa línea no la tocó este cambio.

## Verification

**Commands:**
- `npm run db:start-real` -- expected: imprime el backup, 4 usuarias, 23 servicios, 0 empleadas asignadas y 0 filas de movimiento
- Lectura de `verifyPin('1234')` para las cuatro usuarias -- expected: las cuatro entran con ese PIN

**Manual checks (if no CLI):**
- No correr `npm test` contra esta base después del inicio.
