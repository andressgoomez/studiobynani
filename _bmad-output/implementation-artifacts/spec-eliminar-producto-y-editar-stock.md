---
title: 'Eliminar productos del catálogo y editar el stock'
type: 'bugfix'
created: '2026-10-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En Productos, al confirmar Eliminar el producto sigue en Catálogo y reposiciones: la baja solo lo marca inactivo y ese listado vuelve a mostrarlo. Además, Reponer únicamente suma unidades; no se puede dejar el stock en otra cantidad.

**Approach:** Un producto eliminado deja de aparecer en el catálogo y en las ventas nuevas, también después de recargar, y se conserva el historial de ventas. En el catálogo, NANI puede guardar el stock en la cantidad exacta que corresponde, subiéndolo o bajándolo, sin cambiar el costo ni el precio de venta. Reponer sigue siendo la carga de una compra nueva.

</frozen-after-approval>

## Implementation Notes

- Eliminar sigue siendo una baja lógica (`active: false`) para conservar ventas ya registradas. El listado de productos ahora devuelve solo los activos, y el catálogo también los filtra, así que no reaparecen al recargar.
- El stock no es una columna: es compras menos ventas. Guardar un número crea un ajuste de compra por la diferencia, positiva o negativa, sin tocar costo ni precio de venta y sin frenarse por un mes cerrado.
- Archivos: `apps/api/src/app.ts`, `apps/web/src/main.tsx`, `apps/web/src/styles.css`, `tests/api/product-catalog.test.ts`.
- El ajuste de stock se calcula y se guarda en la misma transacción. Si el número no cambia, no se crea otra compra. El tope es 100000. Reponer de un producto ya eliminado responde como no encontrado.
- Al eliminar se limpia la cantidad cargada para la venta. Guardar stock actualiza el número en pantalla aunque falle la recarga, y reponer descarta un stock escrito y no guardado.
- Con stock en cero el campo sigue editable. En pantallas chicas el editor ocupa su propia fila.

## Review Triage Log

- Carrera al guardar el stock: medium. El cálculo y la compra de ajuste quedaban en dos pasos, así que una venta en el medio dejaba otro número del que se confirmaba. Quedó en una transacción.
- Compra negativa y mes cerrado: false. El ajuste no entra en los importes del mes; las compras solo arman el stock. Reponer sigue frenado si el mes está cerrado.
- Cantidad enorme: low. Un entero fuera de rango podía fallar sin mensaje. Ahora se rechaza por encima de 100000.
- Cantidad de venta que queda después de eliminar: medium. El formulario seguía enviando ese producto y la venta fallaba. Se borra esa cantidad y solo se envían productos activos.
- Borrador de stock después de reponer, y aviso de éxito si falla la recarga: medium. El campo podía pisar la compra, o volver al número viejo. Se limpia el borrador y se aplica el stock guardado.
- Stock en cero se veía bloqueado y se cortaba en el celular: medium. El estilo de “sin stock” ponía el cursor de prohibido sobre el editor. El campo queda usable y en pantallas chicas baja a su propia fila.
- Reponer un producto eliminado: medium. La ruta de compras seguía aceptándolo y el stock quedaba oculto. Ahora responde que no existe.
- Sesión ausente en la ruta de stock: low. Después del 401 el manejador intentaba otro 403. Si no hay sesión, termina ahí.
- Etiquetas de actividad: medium para `product.stock_adjusted`, que es nueva; `product.deleted` ya se guardaba sin texto. Las dos quedaron en español.
- Huecos del test: low. Se cubrió stock en cero, stock después de una venta, guardar el mismo número, el tope y reponer un producto eliminado.

