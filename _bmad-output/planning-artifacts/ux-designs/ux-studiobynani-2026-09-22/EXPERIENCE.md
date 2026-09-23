---
name: StudioByNani
status: draft
sources:
  - ../../prds/prd-studiobynani-2026-09-22/prd.md
  - ./DESIGN.md
updated: 2026-09-22
---

# StudioByNani — Experience Spine

## Foundation

Aplicación web responsive, mobile-first, para uso interno del estudio. Las empleadas priorizan una carga rápida desde el celular; NANI necesita además una vista cómoda para revisar el día y consultar históricos.

La identidad visual se define en `DESIGN.md`. Los componentes deben usar sus tokens, por ejemplo `{colors.primary}`, `{rounded.md}` y `{spacing.page-mobile}`.

El sistema no gestiona turnos ni reservas. Esas funciones continúan en TuTurno.

## Information Architecture

| Superficie | Acceso | Propósito |
|---|---|---|
| Acceso | Al abrir el sistema | Mostrar el logo del estudio, seleccionar usuario activo e ingresar PIN |
| Inicio empleada | Luego del acceso | Ver resumen propio y comenzar una atención |
| Nueva atención | Inicio empleada | Registrar clienta, servicio, pago y guardar |
| Mis atenciones | Inicio empleada | Consultar y editar atenciones propias dentro de 24 horas |
| Inicio NANI | Luego del acceso | Ver resumen diario, entregas y estado de caja |
| Cierre diario | Inicio NANI | Revisar importes, gastos y confirmar o reabrir caja |
| Reportes | Inicio NANI | Consultar períodos, empleadas, servicios y medios de pago |
| Configuración | Inicio NANI | Administrar servicios, precios, comisiones y empleadas |
| Gastos | Inicio NANI | Registrar y consultar gastos |

Navegación móvil: barra inferior o menú compacto con las acciones del rol. La pantalla de carga de atención debe estar a un toque del inicio de empleada.

## Voice and Tone

| Usar | Evitar |
|---|---|
| “Guardar atención” | “Enviar transacción” |
| “Total del día” | “Agregado diario” |
| “Entregar a NANI” | “Pasivo de liquidación” |
| “Editar disponible hasta…” | “Mutación temporal permitida” |
| “Caja cerrada” | “Cierre ejecutado satisfactoriamente” |

Los mensajes deben ser breves, directos y útiles para actuar. Los importes deben mostrarse siempre con moneda y separadores locales.

## Component Patterns

| Componente | Uso | Reglas de comportamiento |
|---|---|---|
| Selector de usuario | Acceso | Solo muestra NANI, LULA, LOLA y LEDIS activos. JUANITA queda oculta. |
| PIN | Acceso | Teclado numérico en móvil. Error sin revelar si el usuario existe. |
| Formulario de atención | Nueva atención | Orden: clienta, servicio, medio de pago, estado, resumen y guardar. |
| Servicio | Formulario | Solo aparecen servicios habilitados para la persona autenticada. |
| Medio de pago | Formulario | Opciones exclusivas: efectivo o transferencia. |
| Estado | Formulario | Realizada por defecto; cancelada o ausente no generan cargo. |
| Ventana de edición | Mis atenciones | Muestra cuánto tiempo queda para editar. |
| Resumen diario | Inicio NANI | Separa total generado, comisión de empleada y entrega a NANI. |
| Cierre | Inicio NANI | Requiere revisión y confirmación explícita. |
| Reapertura | Cierre | Solo NANI puede reabrir; requiere motivo y deja registro. |

## State Patterns

| Estado | Tratamiento |
|---|---|
| Cargando | Skeleton o indicador localizado; conservar contexto de pantalla. |
| Sin atenciones | “Todavía no hay atenciones registradas hoy.” Mostrar acción para crear una. |
| Guardado | Confirmación breve con importe final y comisión/entrega calculada. |
| Error de validación | Mostrar el error junto al campo y conservar los datos cargados. |
| Atención editable | Mostrar “Podés editar hasta {fecha y hora}”. |
| Atención bloqueada | Mostrar “La ventana de edición terminó”. |
| Caja abierta | Resumen visible y acción “Cerrar caja”. |
| Caja cerrada | Totales bloqueados; solo NANI ve “Reabrir caja”. |
| Caja reabierta | Mostrar motivo, usuario y fecha de reapertura. |

## Interaction Primitives

- Tocar o hacer clic en una tarjeta abre su detalle.
- El botón principal queda visible sin desplazamiento cuando sea posible.
- Guardar una atención evita duplicados deshabilitando temporalmente el botón.
- Si se abandona una atención con datos sin guardar, pedir confirmación.
- El cierre diario requiere revisar un resumen antes de confirmarse.
- No usar acciones destructivas: las atenciones nunca se eliminan.
- Los campos numéricos deben abrir teclado numérico en celular.

## Accessibility Floor

- Contraste suficiente entre texto y fondo; no comunicar estados solo con color.
- Áreas táctiles de al menos 44 px.
- Orden de foco igual al orden visual.
- Labels visibles para todos los campos, no solo placeholders.
- Errores anunciados y asociados al campo correspondiente.
- La navegación y las acciones deben ser utilizables con teclado en pantallas grandes.

## Responsive & Platform

| Vista | Comportamiento |
|---|---|
| Móvil | Una columna, acciones principales fijas o cercanas al final del formulario, teclado numérico para PIN/importes. |
| Tablet | Una columna amplia con resumen lateral solo cuando no reduzca la legibilidad. |
| Escritorio | Navegación lateral o superior y paneles de resumen para NANI; evitar tablas excesivamente anchas. |

## Key Flows

### Flow 1 — LULA registra una atención

1. LULA abre el sistema y selecciona su nombre.
2. Ingresa su PIN corto.
3. Toca “Nueva atención”.
4. Escribe el nombre completo de la clienta.
5. Selecciona uno de sus servicios habilitados.
6. Selecciona efectivo o transferencia.
7. El sistema muestra precio base, descuento si corresponde, precio final y comisión de LULA.
8. LULA guarda.
9. **Clímax:** el sistema confirma el registro y muestra cuánto corresponde entregar a NANI en el cierre.

Error: si el servicio no está habilitado o falta un dato, el formulario explica el problema sin borrar lo cargado.

### Flow 2 — NANI cierra la caja

1. NANI inicia sesión.
2. Abre “Cierre diario”.
3. Revisa total de atenciones, monto por empleada, efectivo, transferencias, gastos y entregas.
4. El sistema muestra a LULA, LOLA y LEDIS cuánto deben entregar a NANI según sus porcentajes.
5. NANI confirma el cierre.
6. **Clímax:** el día queda cerrado con un resumen guardado y los importes dejan de cambiar silenciosamente.

Si encuentra un error, NANI puede reabrir la caja indicando un motivo. El sistema deja registro de la reapertura.

### Flow 3 — Una empleada edita una atención

1. La empleada abre “Mis atenciones”.
2. Selecciona una atención creada hace menos de 24 horas.
3. Edita los datos permitidos.
4. El sistema recalcula precio final, comisión y entrega a NANI.
5. **Clímax:** la atención muestra la nueva hora de modificación y el nuevo resumen calculado.

Si pasaron 24 horas, la atención se muestra en modo consulta y la empleada no puede modificarla.

## Open UX Items

- Confirmar identidad visual real del estudio y reemplazar los tokens propuestos en `DESIGN.md`.
- Confirmar si el cierre debe mostrar una constancia imprimible o descargable.
- Definir qué campos exactos pueden editarse dentro de las 24 horas.
