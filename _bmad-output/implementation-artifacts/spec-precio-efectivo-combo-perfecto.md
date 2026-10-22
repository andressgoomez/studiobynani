---
title: 'Precio de efectivo del Combo Perfecto en $48.000'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El Combo Perfecto sale $54.000 por transferencia y en efectivo el sistema aplica el 10% exacto, así que cobra $48.600. En el estudio se cobra $48.000. Con $48.600 el cierre del día no cierra y la plata que las empleadas entregan a NANI queda más baja.

**Approach:** En efectivo, el Combo Perfecto queda en $48.000 (descuento $6.000 sobre los $54.000). La transferencia sigue en $54.000. Comisión y entrega a NANI se calculan sobre esos $48.000. El perfilado sigue en $20.000, el Combo Ideal en $42.000, y el resto de los servicios mantiene el 10% exacto. Las atenciones ya guardadas no se reescriben.

</frozen-after-approval>

## Implementation Notes

- El efectivo del Combo Perfecto (`combo-perfecto-x3`) queda en $48.000. Con el catálogo actual ($54.000) el descuento es $6.000. Si el catálogo baja de $48.000, no hay descuento.
- Comisión y entrega a NANI se calculan sobre esos $48.000. LULA entrega $14.400 y LOLA $19.200. LEDIS sigue sin descuento.
- El perfilado sigue en $20.000 y el Combo Ideal en $42.000. El resto de los servicios mantiene el 10% exacto.
- No se modificaron atenciones ya guardadas.
- La cotización se probó en una copia de la base, no en la base real.
- Si el catálogo sube, el efectivo sigue en $48.000 y la comisión se calcula sobre ese importe. En $48.000 justos el descuento es cero.

## Review Triage Log

- false — Las atenciones ya guardadas no se reescriben. Si se editan dentro de la ventana, el servidor recalcula con la misma función y el efectivo pasa a $48.000. Un día cerrado conserva el importe guardado.
- false — El alta usa la misma `calculateAttendanceBundleAmounts` que la cotización. La cotización de LULA ya afirma descuento, precio final, comisión y entrega.
- low — La transferencia, el catálogo de $60.000 y LEDIS no afirmaban comisión ni entrega. Se agregaron esos importes. Un tope que cobrara la comisión sobre el precio de catálogo ya no pasa.
- low — Faltaba el caso de catálogo en $48.000 justos. Quedó afirmado: descuento cero, comisión y entrega sobre $48.000.
- false — Un combo con otro servicio suma cada línea con la misma función. El tope solo aplica al id `combo-perfecto-x3`.
- false — Cancelada y ausente salen en cero antes de mirar el servicio. Esa salida no depende de este id.
- low — La lista de precios sigue distinta del catálogo en otros servicios. Es anterior a este cambio y quedó en el trabajo diferido.
