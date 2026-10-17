---
title: 'Resumen del día propio'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Al entrar, NANI ve el resumen del estudio: atenciones y facturación de todas, más las tarjetas «para NANI · atenciones» y «para NANI · productos», y un detalle de clientas que incluye el trabajo de las empleadas. Eso no es su día. Las empleadas tienen que ver lo mismo en clave propia.

**Approach:** El resumen del día (tarjetas y detalle de clientas) muestra solo el trabajo de quien está logueada: atenciones realizadas propias y total facturado propio de ese día, más sus productos y su caja común. Esas dos tarjetas «para NANI» no aparecen. Entregas, reportes y cierres siguen como están.

</frozen-after-approval>

## Implementation Notes

Decisiones (el usuario no las pidió aparte; no cambian el resultado que describió):

- Las tarjetas salen de la fila `dailySummary.employees` con `employeeId === user.id`, nunca de `totals`, también para NANI. Si no hay fila, ceros y detalle vacío.
- Se quitan del resumen «para NANI · atenciones» y «para NANI · productos». Se conservan productos vendidos, productos facturados y caja común, con los números de esa fila. La API ya manda `productQuantity` en cada empleada; el tipo de `employees` en la UI no lo declara: agregarlo.
- Las empleadas siguen viendo «me queda · atenciones», «me queda · productos» y «mi total del día»: es su plata, calculada sobre su fila (hoy sale de `totals`, que para ellas ya es solo su fila).
- Título «Mi resumen del día» para todas. Bajada: «Tus atenciones y tu facturación del día seleccionado.»
- «Ver detalle de clientas» se muestra a todas y lista solo sus atenciones. Hoy el payload trae `employeeName` y no `employeeId`: agregar `employeeId` en `GET /api/v1/admin/daily-summary` (campo extra, no rompe tests) y filtrar en la UI. En cada fila no hace falta repetir el nombre de la empleada.
- No tocar agregados `totals` ni `employees` del endpoint, `productFinancials`, remesas, `DailyRemittanceOverview`, `DailyRemittanceSelf`, reportes ni cierres. Esos siguen siendo el total del estudio y lo que hay que entregar.

Archivos: `apps/web/src/main.tsx` (tipo `DailySummary`, bloque `day-summary` ~1063). `apps/api/src/app.ts` (mapa de `attendances` ~894–907, sumar `employeeId`).

Hecho: las tarjetas usan la fila de `user.id`. NANI no renderiza «para NANI». Las empleadas siguen teniendo en el DOM «me queda» y «mi total» porque `styles.css` esconde `nth-child(3)` y `nth-child(6)` y pinta el último; sacar esos spans les ocultaría productos y el total. El detalle filtra por `employeeId` y se muestra a todas. `tsc` del web pasó. `once-common-box` pasó. Dos tests de remesas fallan al crear una atención (400 en vez de 201); el cambio no toca ese POST.

## Review Triage Log

- Sin tests del filtro propio — low, rechazado. No hay harness de UI y el POST de atenciones ya devuelve 400 en dos tests de remesas por el estado de la base; un test nuevo no es una corrección chica y estable.
- El JSON de admin sigue trayendo todas las clientas — low, rechazado. La pantalla ya no las muestra. NANI es admin y Entregas/Reportes siguen usando el total del estudio. Abrir DevTools no es el uso normal.
- Deploy a medias deja el detalle vacío — false. `employeeId` y el filtro van en el mismo cambio. Solo pasa si se publica la web sin la API.
- `employeeId` fuera de `packages/contracts` — false. El resumen diario nunca tuvo tipo compartido; vive en `DailySummary` de `main.tsx`.
- El CSS `nth-child` puede ocultar mal — false. Con empleada siguen 8 spans: realizadas, facturadas, me queda atenciones, productos vendidos, productos facturados, me queda productos, caja común, mi total. Los puestos 3 y 6 siguen siendo «me queda». NANI no usa `.employee-menu`.
- NANI ya no ve el total del estudio en Atenciones — false. Es el pedido. Entregas sigue con lo que debe cada empleada y Reportes con el total.
- El spec queda sin trackear — low. Se commitea junto con el código.
