---
title: "PRD - Sistema StudioByNani"
status: draft
created: 2026-09-22
updated: 2026-09-22
---

# PRD: Sistema StudioByNani

## 0. Propósito del documento

Este documento define la primera versión funcional del sistema interno de StudioByNani. Sirve como base para UX, arquitectura, historias de usuario e implementación. El PRD se basa en el Product Brief ubicado en `_bmad-output/planning-artifacts/briefs/brief-studiobynani-2026-09-22/brief.md`.

## 1. Visión

StudioByNani tendrá un sistema simple y confiable para registrar atenciones ya realizadas, calcular automáticamente descuentos y comisiones, registrar gastos y permitir que NANI controle el funcionamiento económico del estudio.

Las empleadas cargarán sus propias atenciones al momento de finalizarlas. NANI tendrá una vista administrativa con reportes de facturación, comisiones, medios de pago, gastos y cierres diarios de caja.

[ASSUMPTION: La primera versión será una aplicación web interna accesible desde computadora y celular.]

## 2. Usuarios objetivo

### 2.1 Trabajos por realizar

- **NANI:** controlar ingresos, comisiones, gastos, caja y productividad sin depender de cálculos manuales.
- **LULA, LOLA y LEDIS:** registrar sus atenciones de forma rápida y correcta.

### 2.2 No usuarios en v1

- Clientas: no utilizarán el sistema.
- Personal de agenda: la agenda y las reservas continuarán en TuTurno.
- JUANITA: permanecerá desactivada y solo existirá como referencia histórica.

### 2.3 Recorridos principales

- **UJ-1. Una empleada registra una atención realizada.** La empleada inicia sesión, selecciona su servicio habilitado, ingresa el nombre completo de la clienta, confirma el medio de pago y guarda. El sistema registra automáticamente fecha y hora, calcula el precio final y la comisión, y muestra confirmación.
- **UJ-2. NANI controla el resultado del día.** NANI consulta el total de atenciones del día, el monto total generado por cada empleada, los ingresos por medio de pago y los gastos. El sistema calcula el importe que corresponde entregar a NANI y NANI ejecuta el cierre diario de caja.
- **UJ-3. NANI consulta el desempeño histórico.** NANI filtra por período, empleada o servicio y consulta facturación, cantidad de atenciones, comisiones y medios de pago.
- **UJ-4. Una empleada corrige una carga reciente.** Dentro de las 24 horas posteriores al registro, la empleada edita los datos permitidos. El sistema conserva la atención y recalcula los importes derivados. Luego del plazo, la empleada no puede modificarla.

## 3. Glosario

- **Atención:** registro de un servicio realizado, asociado a una única empleada y una clienta.
- **Clienta:** persona identificada inicialmente por nombre completo.
- **Servicio:** prestación disponible en el catálogo, con precio, duración y empleadas habilitadas.
- **Precio de transferencia:** precio base vigente del servicio cuando el medio de pago es transferencia.
- **Precio final:** importe efectivamente cobrado, luego de aplicar las reglas de descuento.
- **Comisión:** porcentaje de la empleada calculado sobre el precio final.
- **Gasto:** salida de dinero del negocio, inicialmente alquiler, expensas, limpieza, luz o internet.
- **Cierre diario:** consolidación de los ingresos, gastos y diferencias correspondientes a un día.
- **Empleada activa:** NANI, LULA, LOLA o LEDIS. JUANITA está inactiva.

## 4. Funcionalidades

### 4.1 Acceso y permisos

**Descripción:** El sistema distingue a NANI como administradora y a las empleadas como cargadoras de atenciones.

**Requisitos funcionales:**

#### FR-1: Inicio de sesión
Cada usuario activo debe poder iniciar sesión mediante un selector de nombre y un PIN corto. [ASSUMPTION: Para mantener la experiencia simple, no se utilizarán contraseñas complejas en el MVP.]

**Consecuencias verificables:**
- Un usuario no autenticado no puede acceder a datos del negocio.
- Un usuario inactivo no puede iniciar sesión.
- El sistema no permite acceder seleccionando solamente el nombre sin un segundo factor local, como el PIN.

#### FR-2: Permisos de administradora
NANI puede configurar el catálogo, administrar empleadas, consultar reportes, cargar gastos y realizar cierres diarios.

#### FR-3: Permisos de empleada
LULA, LOLA y LEDIS pueden cargar sus propias atenciones y no pueden consultar estadísticas administrativas.

### 4.2 Registro de atenciones

**Descripción:** Las empleadas registran atenciones finalizadas. Cada registro corresponde a una única empleada y un único servicio.

#### FR-4: Crear atención
Una empleada puede crear una atención seleccionando un servicio que tenga habilitado, ingresando el nombre completo de la clienta y el medio de pago.

**Consecuencias verificables:**
- La atención se guarda con fecha y hora automáticas.
- La empleada no puede asignarse un servicio no habilitado.
- La atención queda vinculada a la empleada autenticada.

#### FR-5: Estado de atención
El sistema permite registrar una atención como realizada, cancelada o ausente.

**Consecuencias verificables:**
- Una cancelación o ausencia no genera cargo.
- Una cancelación o ausencia no genera comisión.

#### FR-6: Editar atención
La empleada que registró una atención puede editarla durante las 24 horas posteriores a su creación. Cualquier empleada puede editar sus propias atenciones dentro de esa ventana. NANI puede corregir una atención fuera de ese plazo.

#### FR-7: Prohibir eliminación
Ningún usuario puede eliminar una atención. Los datos deben conservarse para auditoría e históricos.

### 4.3 Precios, descuentos y comisiones

**Descripción:** El sistema calcula el importe final a partir del servicio y el medio de pago, conservando el precio aplicado en la atención.

#### FR-8: Precio histórico
El sistema conserva en cada atención el precio vigente aplicado al momento de registrarla.

#### FR-9: Descuento en efectivo
Para servicios de NANI, LULA y LOLA que no sean de maquillaje, el efectivo aplica un descuento del 10% sobre el precio de transferencia.

#### FR-10: Excepciones de descuento
Los servicios de LEDIS y todos los servicios de maquillaje no aplican descuento en efectivo.

#### FR-11: Cálculo de comisión
El sistema calcula la comisión sobre el precio final cobrado:
- NANI: 100%.
- LULA: 70%.
- LOLA: 60%.
- LEDIS: 70%.

#### FR-12: Medio de pago
La atención debe registrar exactamente un medio de pago: efectivo o transferencia. No se permiten pagos combinados.

### 4.4 Catálogo y configuración

**Descripción:** NANI administra los servicios, precios, duraciones y habilitaciones.

#### FR-13: Administrar servicios
NANI puede crear, editar, activar y desactivar servicios sin modificar los precios históricos de atenciones ya registradas.

#### FR-14: Habilitar servicios por empleada
NANI puede definir qué servicios pueden realizar NANI, LULA, LOLA y LEDIS.

#### FR-15: Administrar empleadas
NANI puede activar o desactivar empleadas. Desactivar una empleada no elimina sus atenciones históricas.

### 4.5 Gastos y cierre de caja

**Descripción:** NANI registra las salidas del negocio y consolida diariamente la caja. La persona que realiza una atención recibe directamente el pago de la clienta; al cierre, cada empleada entrega a NANI la parte que corresponde al negocio.

#### FR-16: Registrar gasto
Únicamente NANI puede registrar un gasto con categoría, importe, fecha y descripción. Las categorías iniciales son alquiler, expensas, limpieza, luz e internet. El medio de pago puede registrarse, pero no es un dato prioritario del MVP.

#### FR-17: Cierre diario
NANI puede cerrar la caja de un día y consultar:
- el total de atenciones realizadas;
- el monto total generado por cada empleada;
- el total de efectivo y transferencias;
- los gastos del día;
- el monto que cada empleada debe entregar a NANI;
- el resultado general del día.

#### FR-18: Historial de cierres
El sistema conserva los cierres diarios y no permite que una nueva carga altere silenciosamente un cierre ya realizado. Solo NANI puede reabrir un cierre confirmado.

#### FR-19: Control de dinero a entregar
El sistema debe mostrar el importe que cada empleada debe entregar a NANI, considerando el importe final cobrado y el porcentaje que corresponde al negocio:
- LULA entrega el 30% del importe final de sus atenciones.
- LOLA entrega el 40% del importe final de sus atenciones.
- LEDIS entrega el 30% del importe final de sus atenciones.
- NANI conserva el 100% de sus propias atenciones.

La persona que realiza la atención es quien recibe directamente el pago de la clienta. No es necesario registrar un receptor de pago separado.

### 4.6 Reportes administrativos

**Descripción:** NANI consulta información consolidada para controlar el negocio.

#### FR-20: Reporte de atenciones
NANI puede filtrar atenciones por fecha, empleada, servicio y estado.

#### FR-21: Reporte económico
NANI puede consultar facturación, efectivo, transferencias, comisiones y resultado por período.

#### FR-22: Reporte de desempeño
NANI puede consultar cantidad de atenciones, servicios realizados y facturación por empleada.

#### FR-23: Reporte de gastos
NANI puede consultar gastos por categoría y período.

## 5. Requisitos no funcionales

- **Seguridad:** cada usuario debe acceder únicamente a las operaciones permitidas por su rol.
- **Integridad:** las atenciones, precios aplicados, comisiones y cierres deben conservar trazabilidad.
- **Usabilidad:** registrar una atención debe requerir pocos pasos y funcionar en pantallas pequeñas.
- **Consistencia:** los cálculos deben usar reglas centralizadas, no fórmulas duplicadas en cada pantalla.
- **Disponibilidad:** el sistema debe permitir la carga durante el horario habitual del estudio.

## 6. No objetivos

- Agenda y reserva de turnos.
- Integración con TuTurno en la primera versión.
- Aplicación o portal para clientas.
- Pagos online.
- Pagos combinados.
- Acceso de empleadas a estadísticas administrativas.
- Eliminación de atenciones.

## 7. Alcance MVP

### 7.1 Incluido

- Inicio de sesión y roles.
- Registro, edición temporal e historial de atenciones.
- Catálogo de servicios y habilitación por empleada.
- Precios, descuentos y comisiones.
- Medios de pago.
- Gastos iniciales.
- Cierre diario de caja.
- Reportes para NANI.

### 7.2 Fuera del MVP

- Agenda, reservas y recordatorios, porque se gestionan en TuTurno.
- Datos adicionales de clientas, hasta evaluar una integración futura.
- Integración API con TuTurno.
- Reportes para empleadas.

## 8. Métricas de éxito

- **SM-1:** El 100% de las atenciones realizadas se registra en el sistema y no en la planilla después de la adopción. Valida FR-4.
- **SM-2:** Los cálculos de precio final y comisión coinciden con las reglas configuradas en todos los casos de prueba. Valida FR-9 a FR-12.
- **SM-3:** NANI puede obtener el cierre diario sin cálculos manuales adicionales. Valida FR-17.
- **SM-4:** NANI puede consultar desempeño por empleada y período. Valida FR-21.

## 9. Preguntas abiertas

1. ¿Qué datos adicionales podrían incorporarse desde TuTurno en el futuro?

## 10. Índice de supuestos

- §1: La primera versión será una aplicación web interna accesible desde computadora y celular.
- §4.1: El acceso se resolverá con selector de usuario y PIN corto, sujeto a validación durante UX.
- §9: Las preguntas restantes pueden resolverse durante UX o arquitectura.
