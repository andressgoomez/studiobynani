# Epic 3 Context: Controlar caja y liquidaciones diarias

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

NANI registra los gastos del estudio, revisa lo generado en el día y cierra o reabre la caja sin calcular a mano lo que cada empleada debe entregarle. El cierre deja un resultado trazable y un respaldo local recuperable. La plata de los productos Once queda en la caja común y no se mezcla con esa entrega.

## Stories

- Story 3.1: Registrar gastos del negocio
- Story 3.2: Revisar y cerrar la caja diaria
- Story 3.3: Reabrir un cierre diario
- Story 3.4: Respaldar y recuperar la información local
- Story 3.5: Dejar los productos Once en la caja común

## Requirements & Constraints

- Solo NANI registra gastos, cierra y reabre la caja. Las empleadas no acceden a estas operaciones ni a estadísticas administrativas.
- Un gasto lleva categoría, importe, fecha y descripción. Las categorías iniciales son alquiler, expensas, limpieza, luz e internet. Importe inválido o categoría faltante se rechazan y el error se muestra. El medio de pago del gasto no es obligatorio en el MVP. Esos gastos los paga NANI y aparecen en el resumen del día.
- El cierre de un día abierto muestra total de atenciones, monto por empleada, efectivo, transferencias, gastos, resultado y lo que cada empleada debe entregar a NANI. NANI puede obtener ese cierre sin cálculos manuales.
- Quien realiza la atención cobra a la clienta. La entrega al negocio se calcula sobre el precio final de las atenciones realizadas: LULA 30 %, LOLA 40 %, LEDIS 30 %. NANI conserva el 100 % de las suyas. Canceladas y ausentes aportan cero.
- Un producto Once no deja comisión a la empleada. El total de esa línea entra solo en la caja común y no en la entrega a NANI. Un producto local deja a la empleada la mitad de la ganancia y el resto va a NANI; esa línea no entra en la caja común. Si vende NANI, no hay entrega hacia sí misma; su venta Once sí suma a la caja común.
- Una venta puede mezclar líneas Once y locales. Cada línea conserva su destino y la venta suma ambos. Lo adeudado del día incluye atenciones realizadas y productos locales; los productos Once aparecen solo en la caja común.
- Confirmar el cierre congela el día. Una carga nueva no puede alterar en silencio un cierre confirmado. Solo NANI puede reabrirlo, con un motivo, y queda registro de usuario, fecha, hora y motivo.
- NANI puede crear un backup manual y el sistema también copia al confirmar un cierre. La copia es un SQLite consistente en una carpeta configurable, con retención de versiones que no borra la base activa. La restauración se comprueba abriendo la copia en una instancia de verificación.

## Technical Decisions

- React solo presenta resultados. Node valida, calcula y persiste. Los importes son enteros en centavos, nunca `float`.
- `SettlementService` sigue siendo la única fuente de precio final, comisión y entrega de las atenciones. Redondea en centavos y devuelve la versión de regla. La regla de productos Once queda al lado del cálculo de ventas y no cambia los porcentajes de las atenciones.
- Una línea Once aporta su total a `commonBoxCents` y cero a `amountToNaniCents` y a la comisión. Una línea local aporta cero a `commonBoxCents`; la comisión es la mitad de la ganancia, redondeada hacia abajo en centavos, y el resto va a `amountToNaniCents`. La entrega del día suma atenciones realizadas y el `amountToNaniCents` de ventas completadas. No suma `commonBoxCents`.
- No hay migración de esquema. Las ventas Once ya guardadas que todavía tengan importe a NANI se corrigen: `amountToNaniCents` pasa a 0 y `commonBoxCents` queda en el total. Las ventas locales no se tocan.
- El cierre tiene estado abierto o cerrado. Confirmarlo crea un snapshot de totales y bloquea mutaciones de ese `businessDate`. Reabrirlo exige motivo y auditoría; después el sistema recalcula y guarda una nueva versión del cierre.
- `Expense` y `DailyClose` pertenecen a Cierres. `SettlementSnapshot` pertenece a Liquidación. Otros módulos acceden por casos de uso. Cierre, reapertura y demás mutaciones críticas son transaccionales e idempotentes.
- Node genera el tiempo con un reloj central y calcula `businessDate` en `America/Argentina/Buenos_Aires`. El backup usa una operación consistente de SQLite, retención configurable y un chequeo de salud local. Carpeta, retención, ruta de SQLite y zona horaria salen de variables de entorno.

## UX & Interaction Patterns

- El inicio de NANI muestra el resumen del día, las entregas y si la caja está abierta, cerrada o reabierta. Gastos y Cierre diario se abren desde ahí.
- El resumen separa total generado, comisión de la empleada, entrega a NANI y caja común. La caja común es una cifra propia, aparte de lo que cada empleada debe entregar.
- Una venta Once muestra «Destino: caja común» y no muestra «Entregar a NANI». Una venta local sigue mostrando «Entregar a NANI» por la parte que corresponde. En el desglose de la entrega, «Productos» incluye solo productos locales.
- Cerrar caja es la acción principal de esa pantalla y exige revisar el resumen antes de confirmar. Usar «Entregar a NANI», «Total del día» y «Caja cerrada». Los importes llevan moneda y separadores locales.
- Con la caja abierta se ve el resumen y «Cerrar caja». Cerrada, los totales quedan bloqueados y solo NANI ve «Reabrir caja». Reabierta, se muestran motivo, usuario y fecha. Los errores de validación quedan junto al campo y no borran lo cargado.
- Mobile-first: una columna, áreas táctiles de al menos 44 px, teclado numérico en importes, labels visibles y estados que no dependan solo del color.

## Cross-Story Dependencies

- La entrega de atenciones usa el precio final, el estado, el medio de pago y la empleada que ya calcula la épica 1. Una edición válida de una atención recalcula la entrega solo mientras ese día sigue abierto.
- La épica 2 no cambia. La épica 4 debe usar el mismo cálculo de liquidación; si el reporte económico muestra productos, la caja común queda en su propia cifra. El reporte de gastos consume los gastos registrados aquí.
- La historia 3.5 corrige qué entra en la entrega de la historia 3.2. No reescribe los porcentajes de las atenciones.
- El backup de la historia 3.4 corre al confirmar el cierre de la historia 3.2, además del backup manual. Reabrir en la historia 3.3 vuelve a permitir cambios y obliga a recalcular el snapshot.
