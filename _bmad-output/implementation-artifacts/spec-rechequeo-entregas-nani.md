---
title: 'Rechequeo de entregas a NANI'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'dispatch'
baseline_commit: '687d3cf1ca3868ec957dfef400bdeb8953339b8c'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cuando una empleada marca el dinero como enviado, NANI solo ve ese aviso si abre ese día. No hay un paso en el que ella confirme que el dinero llegó, ni un lugar donde ver pendiente, enviado y recibido sin cambiar la fecha una por una.

**Approach:** La empleada sigue marcando Enviado. NANI marca Recibido cuando el dinero está en su cuenta; si no llegó, la fila queda en Enviado. Una pestaña Entregas lista el mes, una fila por empleada y día, con esos tres estados. NANI ve a todas; cada empleada ve solo las suyas.

## Boundaries & Constraints

**Always:**
- Recibido lo marca solo NANI, y solo si esa entrega ya está enviada y el monto enviado cubre lo adeudado del día.
- Quitar recibido vuelve la fila a Enviado y queda en la auditoría. No borra el envío.
- Crear o editar una atención del día anula enviado y recibido de esa empleada, igual que hoy anula el enviado.
- Marcar enviado de nuevo actualiza el monto al adeudado actual y anula un recibido anterior.
- Lo adeudado sigue siendo atenciones realizadas más ventas de productos completadas, sin contar a NANI.

**Never:**
- Un estado rechazado, un comprobante, ni un calendario visual de grilla.
- Que la empleada confirme la recepción.
- Cambiar comisiones, cierres, el bloqueo de ventas ya enviadas, ni el aviso de días anteriores todavía sin enviar.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empleada envía | Día con deuda y sin enviado | `sentAt` cargado, `receivedAt` vacío, estado enviado | N/A |
| NANI recibe | Enviado y sin faltante | `receivedAt` y `receivedById` cargados, estado recibido | N/A |
| NANI quita recibido | Ya recibido | `receivedAt` vacío, el envío sigue | N/A |
| Recibir sin envío | Sin `sentAt` | No cambia la fila | 409 |
| Recibir con faltante | Enviado por menos de lo adeudado | No cambia la fila | 409 |
| Empleada intenta recibir | Sesión EMPLOYEE | No cambia la fila | 403 |
| Atención nueva o editada | El día ya estaba enviado o recibido | `sentAt` y `receivedAt` quedan vacíos | N/A |
| Lista del mes | Admin o empleada, `month=YYYY-MM` | Filas con deuda en ese mes; la empleada solo ve las suyas; incluye hoy | 400 si el mes no es `YYYY-MM` |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` `DailyRemittance` (líneas 80-91) -- agregar `receivedAt DateTime?` y `receivedById String?`. La tabla ya existe en la base local; ninguna migración versionada la crea.
- `apps/api/src/app.ts` -- reutilizar `POST /api/v1/daily-remittances/:date/mark-sent` (812), `POST .../admin/.../mark-sent` (866) y el limpiado de `sentAt` al crear (403) o editar (1106) una atención. El resumen diario (747-756) debe devolver también `receivedAt`. `GET /api/v1/admin/daily-remittances/pending` (833) no se reescribe: sigue siendo solo lo no enviado de días anteriores.
- `apps/web/src/main.tsx` -- `DailySummary.remittances` (12), `PendingRemittance` (21), `markRemittance` (425), `markPendingRemittance` (437), pestañas (861), `DailyRemittanceOverview` (1165) y `DailyRemittanceSelf` (1179). El reset de API no tiene botón y sigue sin tenerlo.
- `apps/web/src/styles.css` -- extender `.remittance-bar`, `.remittance-sent` y `.pending-remittance` (líneas 19 y 25). No rediseñar el resto.
- `tests/api/attendances.test.ts` -- patrón a copiar: `buildApp()`, login con PIN `1234`, `inject`. No hay tests de entregas.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` y `prisma/migrations/20261008223000_add_remittance_receipt/migration.sql` -- columnas anulables `receivedAt` y `receivedById` -- la confirmación no reescribe filas viejas
- [x] `apps/api/src/app.ts` -- devolver `receivedAt` en el resumen; al marcar enviado, guardar el adeudado actual y vaciar `receivedAt`; `POST /api/v1/admin/daily-remittances/:date/:employeeId/mark-received` y `POST .../clear-received`; extender el `updateMany` de atenciones para vaciar también `receivedAt`; `GET /api/v1/daily-remittances?month=` -- NANI confirma y ambas ven el mes
- [x] `apps/web/src/main.tsx` y `apps/web/src/styles.css` -- pestaña Entregas con filtro de mes y filas Pendiente / Enviado / Recibido; en el día, NANI ve Recibido o Quitar recibido, y la empleada ve si NANI ya confirmó -- el rechequeo se usa sin buscar fecha por fecha
- [x] `tests/api/remittances.test.ts` -- cubrir la matriz de arriba, borrando la fila de prueba al final -- el flujo no queda solo en la pantalla

**Acceptance Criteria:**
- Given una empleada con deuda del día, when marca el dinero enviado, then NANI ve esa fila como Enviado en Entregas y en el día, con el monto, y todavía no como Recibido.
- Given esa fila enviada y completa, when NANI marca Recibido, then pasa a Recibido y sale del aviso de pendientes; cuando quita la confirmación, vuelve a Enviado.
- Given el mes en curso, when NANI abre Entregas, then ve una fila por empleada y día con deuda, de hoy y de días anteriores, distinguida en pendiente, enviado o recibido.

## Implementation Notes

`npm test` corre los archivos en serie (`--no-file-parallelism`) porque la API de pruebas y estos tests comparten el SQLite local; en paralelo el login a veces no devolvía cookie.

Las filas de `DailyRemittance` de prueba se borran, o se restaura la fila que ya existía.

## Spec Change Log

## Review Triage Log

- `medium` — `apps/web/src/main.tsx` tarjetas del día y lista Entregas: si `sentAt` está puesto y el monto enviado es menor a lo adeudado, se muestra Recibido y se oculta Marcar enviado. Recibido responde 409 y el día de hoy no vuelve a aparecer en pendientes, así que no hay forma de actualizar el envío.
- `medium` — `loadMonthRemittances` trata un 401 como error genérico y no llama `onLogout`, a diferencia del resto de las cargas. Con el idle de 7 minutos la pestaña Entregas queda adentro de una sesión vencida.
- `medium` — `tests/api/remittances.test.ts` no crea una venta de producto. Quitar esa suma de `owedToNaniCents`, de la lista, de pendientes y del resumen deja los tests en verde. Evidencia de la capa de verificación, disposición `patch`.
- `medium` — el upsert de NANI en mark-sent sí vacía `receivedAt` (`app.ts` update), pero ningún test pega a esa ruta. Sacar el vaciado no rompe los tests. Disposición `patch`.
- `medium` — clear-received exige ADMIN en `app.ts`, y el test de empleada solo cubre mark-received. Una empleada podría quitar el recibido sin que falle un test. Disposición `patch`.
- `false` — la lista Entregas no tiene Marcar enviado en filas pendientes: el botón sigue en la barra del día cuando no hay `sentAt`. El hueco real es solo el faltante con `sentAt` ya puesto.
- `low` rechazado — carrera entre el chequeo y el update de mark-received: en el uso de una sola persona el clic no se pisa, y el arreglo pide una transacción nueva.
- `low` rechazado — la lista y lo adeudado leen el historial completo: con el volumen del estudio no se nota, y el arreglo es reescribir las consultas.
- `low` rechazado — los tests de entregas usan el SQLite compartido: es el mismo patrón que el resto de `tests/api`.
- `low` rechazado — un segundo mensaje de éxito puede borrarse por el timer anterior: es molesto y breve, y el arreglo agrega otro control de timer.
- `low` rechazado — fecha inválida en el resumen o en ventas recientes: el filtro de la pantalla es `input type="date"` y no manda un valor mal formado.
- `defer` — cierre mensual compara y envía `MM/YYYY`: el cambio de `report.from.slice(0, 7)` a `formatDisplayMonth` ya estaba en el trabajo sin commitear de la pantalla, y este spec no toca cierres.
- `defer` — `POST /api/v1/product-sales` no frena una venta después de enviado: el bloqueo existe en editar y cancelar, y es anterior a este rechequeo.
- `defer` — `GET /api/v1/auth/users` devuelve `ACTIVE_USERS`, así que una empleada nueva no aparece en el acceso. Es del alta de equipo, no de las entregas.
- `defer` — no hay migración que cree productos ni `DailyRemittance`; el alta de columnas de recibido asume la tabla que ya está en la base local.
- `defer` — reportes, stock al cancelar, reprecio al editar, el modal que deja el formulario cargado, errores de edición ocultos, el borrado lógico que reaparece, el PATCH de producto que acepta datos inválidos, la doble cuenta de productos de Once, el efectivo y la transferencia que no suman la venta, la comisión negativa si el precio queda bajo el costo, las cantidades fraccionarias que se descartan, la ventana de 24 horas en silencio, los productos inactivos en la edición y los servicios que ya no están en el selector: son del trabajo de productos y administración que ya estaba modificado antes de este rechequeo.
- `defer` — Actividad muestra la clave cruda de acciones de productos y empleadas: faltan etiquetas anteriores, no las de recibido.
- `defer` — el resumen de la empleada esconde los spans 3 y 6, y el detalle por empleada del día salió del markup en el mismo trabajo previo de la pantalla.

## Design Notes

Estados de cada fila: pendiente si no hay `sentAt`; enviado si hay `sentAt` y no hay `receivedAt`; recibido si hay `receivedAt`. La lista ordena por fecha descendente y después por nombre. El mes por defecto es el actual, con el mismo control de mes que Gastos. Auditoría: `remittance.marked_received` y `remittance.receipt_cleared`.

## Verification

**Commands:**
- `npx prisma migrate deploy` -- expected: aplica `20261008223000_add_remittance_receipt`
- `npm test` -- expected: los tests de entregas y los existentes pasan

**Manual checks (if no CLI):**
- Con `lula` / `1234`, marcar enviado un día con deuda y ver el texto de espera. Con `nani` / `1234`, abrir Entregas, marcar Recibido y quitarlo. Recargar y comprobar que el estado se mantiene.
