# Propuesta de cambio de sprint — Caja común de productos Once

- Fecha: 2026-10-14
- Proyecto: studiobynani
- Alcance: menor
- Camino: ajuste directo
- Estado: aprobado el 2026-10-14

## 1. Resumen del problema

Los productos de origen **Once** no dejan comisión a la empleada. En el estudio esa plata entra en la cartuchera de la caja común y se queda ahí. Nani no tiene que recibirla en la entrega del día ni separarla después.

El sistema hoy hace las dos cosas a la vez. En `productFinancials`, una venta Once guarda el total en `commonBoxCents` y, si no vende Nani, también en `amountToNaniCents`. La entrega del día suma ese `amountToNaniCents`, así que la empleada figura debiendo a Nani una plata que ya está en la cartuchera. La misma venta muestra «Entregar a NANI» y «Destino: caja común».

Los productos de proveedor local no entran en este cambio: la empleada se queda con la mitad de la ganancia y el resto sí se entrega a Nani.

## 2. Análisis de impacto

### Checklist

- [x] 1.1 Historia disparadora: no hay historia de productos en el sprint. El comportamiento vive en el código posterior al PRD, en el cálculo de ventas y en la entrega diaria (épica 3, FR19).
- [x] 1.2 Tipo: requisito nuevo surgido del uso real, sobre una regla que el código interpretó mal.
- [x] 1.3 Evidencia: `apps/api/src/app.ts` (`productFinancials` y `owedToNaniCents`); la tarjeta de venta muestra ambos destinos; el resumen ya tiene un total aparte de caja común.
- [x] 2.1 La épica 3 se puede cerrar. Hay que corregir qué entra en la entrega.
- [x] 2.2 No hace falta una épica nueva. Se agrega una historia dentro de la épica 3.
- [x] 2.3 Épica 1 (atenciones) no cambia. Épica 2 no cambia. Épica 4 debe mostrar la caja común aparte cuando el reporte incluya productos.
- [x] 2.4 Ninguna épica queda obsoleta.
- [x] 2.5 El orden de las épicas no cambia.
- [x] 3.1 El PRD no habla de productos. Hay que sumar el requisito. El MVP de atenciones sigue igual.
- [x] 3.2 No cambia el stack ni el esquema. Cambian la regla de liquidación de productos Once y el contrato de la entrega.
- [x] 3.3 La venta Once deja de decir «Entregar a NANI». La caja común sigue visible y separada en el resumen.
- [x] 3.4 Hay que actualizar los tests de entregas que hoy asumen que una venta de producto aumenta lo adeudado a Nani.
- [x] 4.1 Ajuste directo: viable. Esfuerzo bajo. Riesgo bajo.
- [x] 4.2 Rollback: no viable. No hay que deshacer atenciones ni entregas.
- [x] 4.3 Revisión del MVP: no viable como camino. El MVP de atenciones no se achica.
- [x] 4.4 Camino elegido: ajuste directo.

### Épicas

- Épica 3: la entrega a Nani deja de incluir el total de los productos Once.
- Épica 4: si el reporte económico muestra productos, la caja común queda en su propia cifra.
- Épicas 1 y 2: sin cambio.

### Conflictos de artefactos

- PRD: falta la regla de destino de productos Once.
- Arquitectura: `SettlementService` sigue siendo la fuente de las atenciones. La regla de productos Once tiene que quedar explícita al lado del cálculo de ventas.
- UX: etiqueta de la venta y desglose de la entrega.
- Código y tests: fórmula, entregas pendientes y resumen.

### Impacto técnico

- Sin migración de esquema. `amountToNaniCents` y `commonBoxCents` ya existen.
- Una venta puede mezclar líneas Once y locales. Cada línea conserva su destino y la venta suma los dos.
- Las ventas Once ya guardadas, si las hay, hay que corregirlas: `amountToNaniCents` pasa a 0 y `commonBoxCents` queda en el total. Las locales no se tocan.
- Las atenciones y sus porcentajes (LULA 30 %, LOLA 40 %, LEDIS 30 %) no se tocan.

## 3. Camino recomendado

Ajuste directo, esfuerzo bajo, riesgo bajo.

Se cambia la fórmula de los productos Once y se alinean la entrega, el resumen y los textos. No se reabre el plan de atenciones ni se tira atrás trabajo hecho.

## 4. Cambios propuestos

### PRD — sección 4.5, requisito nuevo

OLD: no existe una regla de productos.

NEW:

#### FR-24: Destino de los productos Once

Un producto de origen Once no genera comisión para la empleada. El total de esa línea entra solo en la caja común y queda diferenciado de la entrega a Nani. La empleada no lo incluye en la plata que le pasa a Nani, porque en el estudio ese dinero queda en la cartuchera.

Un producto de proveedor local mantiene su regla actual: la empleada se queda con la mitad de la ganancia y el resto forma parte de la entrega a Nani. Esa plata no entra en la caja común.

Nani, cuando vende cualquiera de los dos, no genera entrega hacia sí misma. Su venta Once sí suma a la caja común.

Rationale: la cartuchera ya separa esa plata. El sistema tiene que reflejarlo para que Nani no la descuente a mano.

### Épicas — inventario y épica 3

OLD: FR19 cubre solo el porcentaje de las atenciones. No hay historia de productos.

NEW:

- **FR24:** El total de un producto Once va solo a la caja común. No entra en la entrega a Nani. El producto local sigue repartiendo la mitad de la ganancia a la empleada y el resto a Nani.
- Cobertura: Épica 3.

Historia nueva:

### Story 3.5: Dejar los productos Once en la caja común

As a empleada o Nani,
I want que la venta de un producto Once quede en la caja común,
So that esa plata no se mezcle con lo que la empleada le entrega a Nani.

**FRs:** FR24.

**Acceptance Criteria:**

**Given** que una empleada vende un producto Once  
**When** la venta queda registrada  
**Then** la comisión de la empleada es cero  
**And** el total entra en la caja común  
**And** el importe a entregar a Nani por esa línea es cero.

**Given** que una empleada vende un producto de proveedor local  
**When** la venta queda registrada  
**Then** ella se queda con la mitad de la ganancia  
**And** el resto entra en la entrega a Nani  
**And** la caja común de esa línea es cero.

**Given** que el día tiene atenciones y ventas Once  
**When** Nani o la empleada miran la entrega  
**Then** lo adeudado incluye las atenciones y los productos locales  
**And** los productos Once aparecen solo en la caja común.

Rationale: la épica 3 es la dueña de las entregas. Esta historia corrige el destino sin reescribir los porcentajes de las atenciones.

### Arquitectura — regla de liquidación

OLD: la única regla escrita es la entrega de atenciones (LULA 30 %, LOLA 40 %, LEDIS 30 %).

NEW: se agrega, sin mover el cálculo de atenciones:

- Una línea de producto Once aporta su total a `commonBoxCents` y cero a `amountToNaniCents` y a la comisión de la empleada.
- Una línea local aporta cero a `commonBoxCents`. La comisión es la mitad de la ganancia, redondeada hacia abajo en centavos, y el resto va a `amountToNaniCents`.
- La entrega del día suma atenciones realizadas y el `amountToNaniCents` de ventas completadas. No suma `commonBoxCents`.

Rationale: el esquema ya tiene los dos campos. Falta dejar escrita la regla para que no vuelva la doble cuenta.

### UX — venta, resumen y entrega

OLD: una venta Once muestra «Entregar a NANI» con el total y también «Destino: caja común». El desglose de la entrega llama «Productos» a todo lo que va a Nani, Once incluido.

NEW:

- La venta Once muestra «Destino: caja común» y no muestra «Entregar a NANI».
- La venta local sigue mostrando «Entregar a NANI» por la parte que corresponde.
- El resumen del día mantiene «Caja común» como cifra propia, separada de lo que cada empleada debe entregar.
- En la entrega, la línea «Productos» incluye solo productos locales.

Rationale: Nani tiene que ver la cartuchera aparte de la plata que le pasan las empleadas.

## 5. Entrega para implementar

Alcance **menor**. Lo implementa el agente de desarrollo.

Tareas:

1. Cambiar `productFinancials` para que Once deje `amountToNaniCents` en 0 y el total en `commonBoxCents`.
2. Corregir las ventas Once ya guardadas que todavía tengan importe a Nani.
3. Confirmar que pendientes, listado y resumen de entregas no suman la caja común.
4. Ajustar las etiquetas de la venta y el desglose de productos en la entrega.
5. Actualizar los tests de esa fórmula y de la entrega.

Criterio de éxito: una venta Once de una empleada aumenta la caja común, no aumenta lo que ella debe entregar, y una venta local sigue yendo a Nani por el resto después de su mitad de ganancia.

No se actualiza `sprint-status.yaml` hasta que esta propuesta esté aprobada. La historia 3.5 entra en backlog en ese momento.
