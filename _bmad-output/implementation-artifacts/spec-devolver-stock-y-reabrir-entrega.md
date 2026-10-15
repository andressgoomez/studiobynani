---
title: 'Devolver el stock al cancelar y reabrir la entrega si hay una venta nueva'
type: 'bugfix'
created: '2026-10-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Al cancelar una venta de producto la pantalla promete devolver el stock. Además, si la empleada ya marcó la entrega y después vende un producto local, esa plata entra en el día pero la entrega sigue figurando como enviada o recibida por el importe anterior.

**Approach:** Cancelar quita las unidades de la venta para que el stock disponible vuelva a contarlas. Una venta que suma plata para NANI, hecha después de marcar la entrega, deja esa entrega otra vez pendiente, igual que una atención nueva. Una venta solo de Once no cambia la entrega. No se toca el alta de empleadas.

</frozen-after-approval>

## Implementation Notes

- Cancelar ya borraba las líneas de la venta, así que el stock vuelve solo. Quedó cubierto con una prueba: después de cancelar, esa unidad se puede vender de nuevo.
- Una venta con plata para NANI, de una empleada, borra enviado y recibido de la entrega de ese día. Una venta solo de Once no la toca. La pantalla de la entrega se actualiza porque la venta ya recarga el resumen.
- Las pruebas que venden un producto local de LULA restauran la entrega del día para no pisar un envío real.
- La reapertura queda en la misma transacción que la venta y usa la fecha de esa venta.

## Review Triage Log

- Reapertura fuera de la venta: medium. Si fallaba el paso siguiente, la venta quedaba y la entrega seguía cerrada. Ahora se limpia enviado y recibido en la misma transacción, con la fecha de la venta.
- Cancelar con la entrega todavía enviada: false. Esa prohibición ya estaba, igual que editar. El stock vuelve cuando la cancelación sí se permite; la prueba vende de nuevo la unidad.
- Cancelar después de reabrir no devuelve el recibido: false. La entrega queda pendiente y el importe que se muestra es el que sigue adeudado, no el envío viejo. Una atención hace lo mismo.
- La prueba de stock no miraba la plata: low. Se agregó que la venta cancelada queda en cero y sin líneas. No hace falta otro caso de cantidad.
- Carrito mixto y venta rechazada: false para el rechazo, porque el stock se controla antes y un error deshace la transacción. El mixto sigue el mismo criterio: si hay plata para NANI, se reabre. La prueba ahora mira receivedById y que el nuevo envío incluya esa plata.
- Las pruebas se pisan la entrega de LULA: false con la suite en serie. Cada prueba restaura la fila al terminar.
- No hay auditoría propia de la reapertura: low. Una atención nueva tampoco la escribe; queda el registro de la venta. No vale un evento nuevo.
