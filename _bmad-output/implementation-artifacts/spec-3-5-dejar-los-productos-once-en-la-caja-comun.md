---
title: 'Dejar los productos Once en la caja común'
type: 'feature'
created: '2026-10-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-14.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Una venta de producto Once no deja comisión a la empleada y en el estudio esa plata queda en la cartuchera de la caja común. El sistema igual la suma a lo que la empleada debe entregarle a Nani, así que el mismo importe aparece en los dos lugares.

**Approach:** El total de cada línea Once entra solo en la caja común. La entrega a Nani sigue sumando atenciones y productos de proveedor local. No hay ventas guardadas para corregir.

</frozen-after-approval>

## Implementation Notes

- La base no tenía ventas de productos, así que no se reescribieron filas viejas. Las ventas nuevas y las editadas usan la fórmula nueva.
- `productFinancials` deja `amountToNaniCents` en 0 para Once, también si vende Nani. El total sigue en `commonBoxCents`. Los productos locales no cambian.
- La pantalla del resumen sí había que tocarla: «me queda · productos» restaba solo lo adeudado a Nani, así que el total Once parecía plata de la empleada. Ahora esa cifra resta también la caja común, y el resumen muestra «caja común» aparte.
- La entrega del día ya sumaba `amountToNaniCents` y no `commonBoxCents`, así que Once sale solo de lo adeudado.

## Review Triage Log

- Histórico de ventas Once sin reescribir — false. `ProductSale` estaba vacía antes del cambio; no hay filas con el importe viejo.
- El resumen contaba Once como plata de la empleada y no mostraba la caja común — high, corregido. «me queda · productos» y «mi total del día» restan `commonBoxCents`. El resumen muestra la caja común.
- El test no cubre entregas, venta de Nani, edición ni redondeo — low, rechazado. La entrega lee `amountToNaniCents`, y el test fija ese campo en 0. Sumar esos casos es más que una corrección chica.
- La línea de venta no guarda el origen — defer. Editar ya recalculaba con el origen actual del producto antes de este cambio.
- El test escribe en la base del estudio — low, rechazado. Es el mismo patrón que las pruebas de entregas, y la limpieza corrió.
- Los artefactos no coinciden en el backfill y el estado del sprint — false. La tabla vacía hace innecesario el backfill. El sprint pasó a `in-progress` y después a `review` porque la propuesta ya estaba aprobada.
