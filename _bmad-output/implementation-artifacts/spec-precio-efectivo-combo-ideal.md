---
title: 'Precio de efectivo del Combo Ideal en $42.000'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El Combo Ideal sale $46.000 por transferencia y en efectivo el sistema aplica el 10% exacto, así que cobra $41.400. En el estudio se cobra $42.000. Con $41.400 el cierre del día no cierra y la plata que las empleadas entregan a NANI queda más baja.

**Approach:** En efectivo, el Combo Ideal queda en $42.000 (descuento $4.000 sobre los $46.000). La transferencia sigue en $46.000. Comisión y entrega a NANI se calculan sobre esos $42.000. El perfilado sigue en $20.000 en efectivo y el resto de los servicios mantiene el 10% exacto. Las atenciones ya guardadas no se reescriben.

</frozen-after-approval>

## Implementation Notes

- El efectivo del Combo Ideal queda en $42.000: el descuento es la diferencia con el precio de catálogo y no baja de cero. Con el catálogo actual ($46.000) el descuento es $4.000.
- Comisión y entrega a NANI se calculan sobre esos $42.000. LULA entrega $12.600 y LOLA $16.800. LEDIS sigue sin descuento.
- El perfilado sigue en $20.000 en efectivo. El resto de los servicios mantiene el 10% exacto.
- No se modificaron atenciones ya guardadas.
- La cotización se probó en una copia de la base, no en la base real.
- Si el catálogo del Combo Ideal baja de $42.000 no hay descuento; si sube, el efectivo sigue en $42.000. LEDIS no recibe ese tope.

## Review Triage Log

- low — Los tests solo usaban la base de $46.000, así que un descuento fijo de $4.000 y el tope de $42.000 daban el mismo resultado. Se agregaron casos con catálogo de $40.000 y de $50.000.
- false — Las atenciones ya guardadas en $41.400 no se reescriben. Si se editan dentro de la ventana, el servidor recalcula y el efectivo pasa a $42.000. La cotización de LULA ya afirma precio final, comisión y entrega.
- low — No había un caso de LEDIS ni de NANI sobre el Combo Ideal, y el test viejo de LEDIS usa otro servicio. Se afirmó que LEDIS cobra $46.000 y que NANI se queda los $42.000 sin entregar nada.
- false — El nombre sigue diciendo «ef 10%off». El 10% es simbólico; el importe que se cobra en efectivo es $42.000.
- false — El tope está en el id `combo-ideal`. Un servicio nuevo con otro id sigue al 10% exacto. Es el servicio del catálogo, no cualquier nombre parecido.
- low — La lista de «valores actuales» no coincide con el catálogo en código para otros servicios. Es anterior a este cambio. Quedó anotado en el trabajo diferido.
