---
title: 'Precio de efectivo del perfilado en $20.000'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El perfilado de cejas sale $22.000 por transferencia y, en efectivo, el sistema aplica el 10% exacto y cobra $19.800. En el estudio el 10% es simbólico: cobran $20.000. Con $19.800 el cierre del día no cierra y la plata que las empleadas entregan a NANI queda más baja.

**Approach:** En efectivo, el perfilado de cejas queda en $20.000 (descuento $2.000 sobre los $22.000). La transferencia sigue en $22.000. Comisión y entrega a NANI se calculan sobre esos $20.000. El resto de los servicios, incluido el laminado a $22.000, mantiene el 10% exacto. Las atenciones ya guardadas no se reescriben.

</frozen-after-approval>

## Implementation Notes

- El efectivo del perfilado queda en $20.000: el descuento es la diferencia con el precio de catálogo y no baja de cero. Con el catálogo actual ($22.000) el descuento es $2.000.
- Comisión y entrega a NANI se calculan sobre esos $20.000. LULA entrega $6.000 y LOLA $8.000.
- LEDIS sigue sin descuento. El laminado, también a $22.000, sigue con el 10% exacto ($19.800).
- No se modificaron atenciones ya guardadas.
- La verificación del endpoint se hizo sobre una copia de la base. Una corrida anterior contra la base real dejó una atención y un servicio de prueba; ambos se borraron, junto con su auditoría.
- Las reglas de pago y la fórmula quedaron alineadas con el piso: si el catálogo del perfilado baja de $20.000, se cobra el precio de catálogo.

## Review Triage Log

- medium — En «Pago y descuentos» seguía diciendo que todo servicio no maquillaje tiene 10% en efectivo, y eso contradecía la excepción del perfilado. Se corrigió esa viñeta.
- low — La fórmula decía descuento fijo de $2.000 y no el piso cuando el catálogo baja de $20.000. El código ya hacía `max(0, base − 2_000_000)`. Se reescribió la fórmula para que coincida.
- false — El nombre sigue diciendo «ef 10% off» y el precio de efectivo no es una columna del catálogo. El 10% es simbólico y el efectivo de ese servicio queda en $20.000; no hace falta otro campo.
- false — Faltan casos de LOLA, LEDIS, varios servicios y edición en la API. Cotización y alta de LULA pasan por la API, y el resto usa la misma `calculateAttendanceAmounts` que cotizar, guardar y editar.
- false — Las atenciones ya guardadas no se reescriben. Si se editan dentro de la ventana, el servidor recalcula y el efectivo pasa a $20.000. Un día cerrado no se toca.
