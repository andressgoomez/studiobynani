---
title: 'Reordenar servicios arrastrando'
type: 'feature'
created: '2026-10-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4c70aaff5e19f27c74c5e9ef1db2b4031f2bda20'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En Servicios, NANI ve el catálogo siempre ordenado por categoría y nombre. No puede dejar arriba los que usa más. Al registrar o editar una atención, el selector repite ese orden alfabético.

**Approach:** NANI arrastra las filas activas del catálogo, con mouse o con el dedo, y ese orden queda guardado. El selector de una atención nueva o en edición muestra los servicios activos habilitados para quien está logueada, en ese mismo orden relativo. La lista de servicios por empleada usa el mismo orden entre los activos.

**Decisiones:** Un servicio nuevo queda al final de los activos, arriba de los inactivos. Los inactivos van siempre después de todos los activos; NANI no los reordena. Al desactivar, la fila pasa al final de la lista. Al volver a activar, queda al final de los activos.

## Boundaries & Constraints

**Always:**
- Solo NANI guarda el orden (`admin:write`). Una empleada no puede reordenarlo.
- El orden de partida, antes del primer arrastre, es el que ya se ve hoy: activos primero, después categoría y nombre. Nada salta solo al publicar.
- Editar nombre, precio o duración no mueve la fila. Activar la deja al final de los activos. Desactivar la manda al final de la lista.
- Si el guardado falla, la lista vuelve al orden anterior y se muestra el error.
- El arrastre usa un asa aparte de Editar, Desactivar y Eliminar, con área táctil de al menos 44 px.
- Una lista de ids incompleta, duplicada o con un id desconocido no se guarda.

**Never:**
- No cambiar precios, comisiones, habilitaciones ni atenciones ya guardadas.
- No reordenar el reporte «Servicios más realizados» (sigue por cantidad de atenciones).
- No agregar una librería de arrastre.
- No mostrar servicios inactivos o no habilitados en el selector de atención.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Orden guardado | NANI suelta una fila en otra posición | Catálogo, selector y servicios por empleada respetan ese orden al recargar | N/A |
| Selector filtrado | La empleada tiene solo algunos servicios activos | Esos aparecen en el mismo orden relativo del catálogo | N/A |
| Lista inválida | Ids de más, de menos, duplicados o ajenos | El orden anterior no cambia | 400 con mensaje claro |
| Sin permiso | Empleada intenta guardar el orden | Nada cambia | 403 |
| Servicio nuevo | NANI crea un servicio | Queda al final de los activos, arriba de los inactivos | N/A |
| Inactivo | NANI desactiva un servicio | La fila pasa al final de la lista; el selector lo oculta | N/A |
| Reactivado | NANI vuelve a activar un servicio | Queda al final de los activos y vuelve al selector en ese lugar | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` modelo `Service` (líneas 34–45) — no tiene posición. Agregar un entero de orden. Migraciones en `prisma/migrations/` (SQLite). Ejemplo aditivo: `20260923120000_add_service_category`.
- `apps/api/src/app.ts` — `GET /admin/services` ~224 y asignaciones ~289 ordenan activo, categoría y nombre. `GET /attendances/services` ~331 alimenta el alta y `AttendanceEditModal`. `POST` ~228 y `PATCH` ~250 no tocan posición.
- `apps/web/src/main.tsx` — catálogo ~955: tarjetas `service-catalog-card`. `saveCatalogService` ~762. Selector ~932 y modal ~1208 usan el orden del API. Empleadas ~983 filtra activos de `catalog`.
- `apps/web/src/styles.css` ~64 — `.service-catalog-list` es una columna. El asa va ahí.
- `apps/api/src/app.ts` ~1076 — reporte por atenciones. No cambiar.
- `tests/api/attendances.test.ts` — cubre catálogo y selector; no afirma el orden. Extender ahí.
- `packages/contracts/src/index.ts` — `CreateServiceRequest` / `UpdateServiceRequest`. El reorden es un cuerpo nuevo, no un campo de edición.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` y `prisma/migrations/` -- agregar el entero de orden y rellenar las filas con el orden visible de hoy -- para que el primer pantallazo no cambie
- [x] `apps/api/src/app.ts` -- ordenar catálogo, asignaciones y selector por ese entero; guardar solo el orden de los activos; el servicio nuevo y el reactivado quedan al final de los activos; al desactivar, la fila va al final de la lista -- el selector y el catálogo leen la misma fuente
- [x] `apps/web/src/main.tsx` y `apps/web/src/styles.css` -- asa para arrastrar con mouse y dedo solo en las tarjetas activas; al soltar, guardar y, si falla, volver atrás -- Editar, Desactivar y Eliminar no inician el arrastre
- [x] `tests/api/attendances.test.ts` -- cubrir la matriz: orden persistido, selector filtrado, lista inválida, empleada sin permiso, servicio nuevo al final de los activos, desactivar al final y reactivar al final de los activos -- el orden no puede depender de un click manual

**Acceptance Criteria:**
- Given el catálogo en el orden de hoy, when se publica el cambio y NANI todavía no arrastra, then las filas se ven igual que antes.
- Given que NANI soltó las filas en un orden, when recarga Servicios o abre el selector en el alta o en la edición, then ese orden se mantiene.
- Given un servicio inactivo o no habilitado para esa persona, when abre el selector, then no aparece, y los que sí aparecen conservan el orden relativo.

## Implementation Notes

- El orden vive en `Service.sortOrder`. La migración rellena el orden de hoy: activos primero, después categoría y nombre.
- NANI guarda solo la secuencia de activos en `PUT /api/v1/admin/services/order`. Los inactivos quedan detrás, en el orden que ya tenían.
- Un servicio nuevo o reactivado entra al final de los activos. Desactivar o eliminar lo manda al final de la lista. Editar nombre, precio o duración no lo mueve.
- En Servicios, el asa de 44 px está solo en las filas activas y usa el dedo o el mouse. Si el guardado falla, la lista vuelve atrás.
- Los siete casos de la matriz pasaron en `tests/api/attendances.test.ts`. Otros tests de atención fallan en esta base porque los servicios reales no están habilitados para las empleadas; no depende del orden.
- No pude arrastrar la fila en el navegador: en esta sesión no hay herramientas de browser.
- La revisión dejó la lectura del orden dentro de la transacción, ignora un guardado viejo si mientras tanto se creó o se desactivó un servicio, no guarda un gesto cancelado, captura el puntero y da aire al nombre en el celular.
- Un test propio crea el inactivo y cubre alta, reorden, baja, reactivación y eliminar. Otro corre el relleno de la migración. El arranque real comprueba el orden canónico y que un servicio recuperado quede al final de los activos.

## Spec Change Log

## Review Triage Log

- medium — `PUT /api/v1/admin/services/order` leía los activos y escribía el orden en dos pasos. Si en el medio se creaba o desactivaba un servicio, dos filas podían compartir posición. La lectura y la escritura quedaron en la misma transacción; si el conjunto cambió, responde 400 y no escribe.
- low — Un solo gesto no alcanza una fila que está fuera de la pantalla. Se rechaza: soltar y volver a arrastrar llega a cualquier lugar, y hacer que la lista se desplace sola agrega otra maquinaria.
- medium — `pointercancel` usaba el mismo cierre que `pointerup` y guardaba el orden a medias. Si el navegador cancela el gesto, la fila vuelve a donde estaba y no se guarda.
- medium — La respuesta de un arrastre podía pisar un alta, una baja o una eliminación hecha mientras el guardado seguía en vuelo. Esas acciones avanzan una marca y la respuesta vieja se ignora.
- medium — Un segundo dedo reemplazaba el arrastre en curso, y soltar fuera de la ventana podía no guardar. El segundo dedo se ignora y el asa captura el puntero.
- medium — En el celular, `.catalog-card > div:first-child` ya no era el nombre porque el asa es el primer hijo, y el texto se comprimía. `.service-catalog-info` reserva 180 px.
- low — El asa no responde a Enter ni a Espacio. Se rechaza: el pedido es arrastrar con el mouse o con el dedo.
- false — `applyRealStart` ordenaría mal una semilla inactiva y después la marcaría activa. En `INITIAL_SERVICES` no hay ninguna inactiva.
- false — El `create` del upsert de arranque deja `sortOrder` en 0. Ese `create` no se alcanza: el bucle anterior ya inserta el faltante y lo ubica.
- low — Mientras se arrastra, otro cambio del catálogo puede perderse en el movimiento del puntero. Se rechaza: hace falta usar el formulario con otro puntero al mismo tiempo, y el arreglo mezcla dos listas.
- medium — Desactivar, reactivar y reordenar se probaban sin una fila inactiva previa, así que “quedó última” pasaba aunque no se moviera. El test nuevo crea esa ancla y mira las posiciones contra ella.
- medium — Eliminar no pasaba por `DELETE /api/v1/admin/services/:id`. El mismo test lo llama y espera la fila al final, inactiva.
- medium — La migración que rellena el orden de hoy no se ejecutaba en la suite. Un sqlite aparte corre ese `UPDATE` con la columna en cero y espera activos, categoría y nombre.
- medium — `applyRealStart` escribía `sortOrder` y el test no lo leía. Ahora compara ese orden con el canónico.
- medium — Al recrear `laminado-cejas` en el arranque no se miraba la posición. Después de `ready` queda último entre los activos.
- defer — Si el guardado del arrastre falla, la pantalla vuelve atrás solo en el cliente y ningún test lo ejecuta. `npm test` no abre el navegador.

## Verification

**Commands:**
- `npm test` -- expected: la suite pasa, incluidos los casos nuevos de orden
- `npm run db:deploy` -- expected: la migración aplica en la base local sin borrar atenciones

**Manual checks (if no CLI):**
- En Servicios, arrastrar una fila con mouse y, en un ancho de celular, con el dedo. Editar y Desactivar no inician el arrastre.
- Abrir el selector de una atención nueva y confirmar el mismo orden. Recargar y confirmar que no volvió al alfabético.
