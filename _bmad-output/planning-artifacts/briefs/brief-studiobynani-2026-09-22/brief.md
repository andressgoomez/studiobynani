---
title: "Sistema StudioByNani"
status: draft
created: 2026-09-22
updated: 2026-09-22
---

# Product Brief: Sistema StudioByNani

## Resumen ejecutivo

StudioByNani necesita reemplazar el uso principal de una planilla para registrar y analizar las atenciones de su estudio de maquillaje, perfilado, lifting de pestañas y tratamientos de skincare. El sistema permitirá que las empleadas carguen cada atención al momento de realizarla y que NANI, como dueña, controle ingresos, comisiones, gastos y desempeño.

La primera versión será un sistema interno de registro y consulta. La agenda y las reservas seguirán gestionándose en [TuTurno](https://www.tuturno.io/studiobynani). Una integración con TuTurno queda como posibilidad futura, pero no forma parte del alcance inicial.

## Problema

La información operativa y contable se lleva actualmente en una planilla. Esto dificulta registrar atenciones de forma consistente, calcular automáticamente descuentos y comisiones, mantener históricos confiables y obtener estadísticas rápidas por empleada, servicio, medio de pago y período.

El negocio necesita que los datos de cada atención queden asociados a la clienta, el servicio, la empleada responsable, la fecha, la hora y el importe efectivamente cobrado.

## Solución

Una aplicación interna que permita:

- Registrar atenciones realizadas con nombre completo de la clienta.
- Asignar únicamente servicios habilitados para cada empleada.
- Completar automáticamente fecha y hora al guardar.
- Registrar el estado de la atención: realizada, cancelada o ausente.
- Registrar el medio de pago: efectivo o transferencia, sin pagos combinados.
- Calcular automáticamente el importe final, descuento y comisión.
- Registrar gastos de productos, alquiler y servicios.
- Mostrar estadísticas y reportes para que NANI controle el trabajo y el resultado del negocio.

## Reglas de negocio confirmadas

### Empleadas

- NANI realiza servicios y conserva el 100% del importe cobrado.
- LULA recibe el 70% del importe final cobrado.
- LOLA recibe el 60% del importe final cobrado.
- LEDIS recibe el 70% del importe final cobrado.
- Los porcentajes de LULA, LOLA y LEDIS son iguales para todos sus servicios, incluidos los combos.
- JUANITA fue una empleada anterior: queda desactivada para nuevas atenciones, conservando sus registros históricos.
- Cada atención involucra a una sola empleada.

### Precios y descuentos

- Los precios definidos actualmente son precios de transferencia.
- Los servicios de NANI, LULA y LOLA tienen un 10% de descuento pagando en efectivo.
- Los servicios de LEDIS no tienen descuento en efectivo.
- Los servicios de maquillaje tampoco tienen descuento, incluyendo maquillaje social, maquillaje + perfilado y clase de automaquillaje.
- La comisión se calcula sobre el importe final efectivamente cobrado.
- El precio aplicado debe conservarse en cada atención para no alterar históricos cuando cambie el catálogo.

### Catálogo actual

NANI, LULA y LOLA pueden realizar: perfilado de cejas, lash lifting, Combo Ideal, Combo Perfecto x3, laminado de cejas, Combo Full Cejas, combo laminado + lifting, maquillaje social, maquillaje + perfilado de cejas y clase de automaquillaje.

LEDIS puede realizar: limpieza profunda + extracciones, limpieza facial + masajes, limpieza facial + dermaplaning, limpieza facial + drenaje linfático, peeling enzimático, peeling químico, Dermapen Glow, Dermapen Premium, recuperación capilar, Hydra Lips y Experiencia Skincare Educación cutánea y Skincare.

Los precios y duraciones exactos del catálogo vigente se incorporarán como datos configurables, no como valores fijos en el código.

## Usuarios

- **NANI / administradora:** configura precios, servicios, porcentajes y empleadas; registra o corrige información; carga gastos; consulta todos los reportes.
- **LULA, LOLA y LEDIS / empleadas:** cargan sus propias atenciones; no tienen acceso a estadísticas.
- El acceso inicial podrá resolverse con un selector de usuario y un PIN corto, evitando un sistema de contraseñas complejo.

## Reglas de registro y control

- Las empleadas pueden editar sus atenciones durante las 24 horas posteriores al registro.
- Cada empleada puede editar sus propias atenciones dentro de esa ventana.
- Las atenciones no pueden eliminarse.
- Las atenciones se incorporan a los reportes sin aprobación previa de NANI.
- Por ahora solo se guarda el nombre completo de la clienta.
- Las cancelaciones y ausencias no generan cargos.
- La fecha y hora se registran automáticamente al guardar la atención.
- La persona que realiza la atención recibe directamente el pago de la clienta.
- Al cierre diario, LULA entrega a NANI el 30%, LOLA el 40% y LEDIS el 30% del importe final de sus atenciones.
- NANI conserva el 100% de sus propias atenciones.
- Solo NANI puede reabrir un cierre diario confirmado.

## Éxito de la primera versión

- Cada atención realizada puede registrarse sin depender de la planilla.
- Los importes, descuentos y comisiones se calculan de forma consistente.
- NANI puede consultar facturación, comisiones, medios de pago, servicios y desempeño por período.
- Los gastos pueden registrarse y consultarse por categoría.
- NANI puede realizar un cierre de caja diario.
- El cierre diario muestra el total de atenciones, el monto total de cada empleada y el importe que cada empleada debe entregar a NANI.
- Los cambios de precios no modifican los reportes históricos.
- Se reducen errores de carga y cálculos manuales.

## Alcance de la primera versión

Incluye registro de atenciones, clientas por nombre completo, catálogo de servicios, precios históricos, descuentos, comisiones, estados de atención, medios de pago, gastos y reportes administrativos. Los gastos contemplados inicialmente son alquiler, expensas, limpieza, luz e internet, y son responsabilidad de pago de NANI. También incluye cierres de caja diarios y un cálculo de entregas a NANI.

No incluye agenda, reservas, recordatorios, pagos online ni integración con TuTurno. Tampoco incluye por ahora una aplicación para clientas.

## Visión

StudioByNani puede evolucionar hacia una herramienta central de operación del estudio, conectando el registro financiero con la agenda de TuTurno y ofreciendo una visión completa de clientas, servicios, productividad y rentabilidad.

## Preguntas abiertas para el PRD

- ¿Los gastos deben registrar medio de pago desde el MVP?
- ¿Qué datos adicionales de la clienta podrían incorporarse mediante TuTurno en el futuro?
