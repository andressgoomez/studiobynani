---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/briefs/brief-studiobynani-2026-09-22/brief.md
  - _bmad-output/planning-artifacts/prds/prd-studiobynani-2026-09-22/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-studiobynani-2026-09-22/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-studiobynani-2026-09-22/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-studiobynani-2026-09-22/EXPERIENCE.md
  - _bmad-output/specs/spec-studiobynani/SPEC.md
  - _bmad-output/specs/spec-studiobynani/financial-rules.md
---

# StudioByNani - Implementation Breakdown

## Overview

Este documento contiene el inventario de requisitos que se utilizará para dividir StudioByNani en épicas e historias implementables. Las historias deberán respetar el PRD, la UX, la arquitectura y las reglas financieras.

## Requirements Inventory

### Functional Requirements

- **FR1:** Usuarios activos pueden iniciar sesión mediante selector de usuario y PIN corto.
- **FR2:** NANI puede administrar catálogo, empleadas, permisos, reportes, gastos y cierres.
- **FR3:** LULA, LOLA y LEDIS pueden cargar sus propias atenciones, sin acceso a estadísticas administrativas.
- **FR4:** Una empleada puede registrar una atención con nombre completo de clienta, servicio habilitado y medio de pago.
- **FR5:** Una atención puede tener estado realizada, cancelada o ausente; canceladas y ausentes no generan cargo ni comisión.
- **FR6:** La empleada puede editar sus propias atenciones dentro de las 24 horas posteriores; NANI puede corregir fuera de la ventana.
- **FR7:** Ninguna atención puede eliminarse.
- **FR8:** Cada atención conserva el precio aplicado al momento del registro.
- **FR9:** Servicios de NANI, LULA y LOLA que no sean maquillaje aplican 10% de descuento en efectivo.
- **FR10:** Servicios de LEDIS y todos los servicios de maquillaje no aplican descuento en efectivo.
- **FR11:** La comisión se calcula sobre el precio final: NANI 100%, LULA 70%, LOLA 60%, LEDIS 70%.
- **FR12:** Cada atención registra exactamente efectivo o transferencia; no se permiten pagos combinados.
- **FR13:** NANI puede crear, editar, activar y desactivar servicios sin alterar históricos.
- **FR14:** NANI puede habilitar servicios por empleada.
- **FR15:** NANI puede activar y desactivar empleadas sin eliminar históricos.
- **FR16:** NANI puede registrar gastos con categoría, importe, fecha y descripción; categorías iniciales: alquiler, expensas, limpieza, luz e internet.
- **FR17:** NANI puede cerrar caja diariamente viendo atenciones, montos por empleada, efectivo, transferencias, gastos, entregas a NANI y resultado.
- **FR18:** Los cierres se conservan; solo NANI puede reabrir uno confirmado, con motivo y auditoría.
- **FR19:** El sistema calcula entregas a NANI: LULA 30%, LOLA 40%, LEDIS 30%; NANI conserva sus atenciones.
- **FR20:** NANI puede filtrar atenciones por fecha, empleada, servicio y estado.
- **FR21:** NANI puede consultar facturación, efectivo, transferencias, comisiones y resultado por período.
- **FR22:** NANI puede consultar cantidad de atenciones, servicios y facturación por empleada.
- **FR23:** NANI puede consultar gastos por categoría y período.

### NonFunctional Requirements

- **NFR1 Seguridad:** permisos aplicados en el backend; el frontend no decide autorizaciones.
- **NFR2 Integridad:** atenciones, precios, liquidaciones y cierres conservan trazabilidad.
- **NFR3 Usabilidad:** la carga de una atención requiere pocos pasos y funciona en pantallas pequeñas.
- **NFR4 Consistencia financiera:** cálculos centralizados en `SettlementService`, importes en centavos enteros y reglas versionadas.
- **NFR5 Tiempo:** el servidor genera instantes UTC y calcula `businessDate` con la zona del estudio.
- **NFR6 Persistencia:** SQLite local con capa de repositorio preparada para PostgreSQL futuro.
- **NFR7 API:** contratos versionados bajo `/api/v1`, esquemas compartidos y errores consistentes.
- **NFR8 Auditoría:** registrar creación, edición, reapertura de cierres y cambios administrativos.
- **NFR9 Backups:** backup consistente y recuperable del archivo SQLite con copias rotativas.
- **NFR10 Operación:** npm workspaces, `package-lock.json`, logs estructurados y endpoint de salud local.
- **NFR11 Responsive/accessibility:** mobile-first, áreas táctiles mínimas de 44 px, labels visibles, foco y errores accesibles.

### Additional Requirements

- Arquitectura: monolito modular React + Node; un proceso local sirve frontend y API.
- Stack base: Node.js 24 LTS, React 19, Vite 8, TypeScript, Fastify, Prisma y SQLite.
- Estructura: `apps/web`, `apps/api`, `packages/domain`, `packages/contracts`, `prisma` y `tests`.
- La persona que realiza la atención recibe el pago; el sistema calcula la entrega al negocio.
- Atenciones canceladas y ausentes tienen importe, comisión y entrega iguales a cero.
- Cerrar caja crea snapshot y bloquea mutaciones del día hasta reapertura.
- Cualquier reapertura exige NANI, motivo y registro de auditoría.
- Cada entidad tiene un único módulo propietario.
- La futura integración con TuTurno y datos como teléfono/email queda fuera del MVP.
- La aplicación inicia localmente en la notebook y debe poder desplegarse posteriormente en la web.

### UX Design Requirements

- **UX-DR1:** Implementar tokens visuales basados en el logo: rojo principal, rosa suave, superficies claras, tipografía de sistema y esquinas suaves.
- **UX-DR2:** Mostrar logo en el acceso y encabezado sin repetirlo en cada tarjeta.
- **UX-DR3:** Crear acceso con selector de usuario y PIN numérico corto.
- **UX-DR4:** Crear inicio diferenciado para NANI y empleadas según rol.
- **UX-DR5:** Crear formulario mobile-first en este orden: clienta, servicio, medio de pago, estado, resumen y guardar.
- **UX-DR6:** Filtrar servicios según habilitación de la empleada autenticada.
- **UX-DR7:** Mostrar precio base, descuento, precio final, comisión y entrega calculada antes de guardar.
- **UX-DR8:** Mostrar ventana restante de edición de 24 horas y bloquear la edición al vencer.
- **UX-DR9:** Mostrar estados realizada, cancelada y ausente con texto y color accesible.
- **UX-DR10:** Crear resumen diario de NANI con atenciones, monto por empleada, pagos, gastos y entregas.
- **UX-DR11:** Crear flujo de cierre con revisión y confirmación explícita.
- **UX-DR12:** Crear reapertura exclusiva de NANI con motivo visible y auditoría.
- **UX-DR13:** Diseñar estados de carga, vacío, guardado, error de validación, caja abierta/cerrada/reabierta.
- **UX-DR14:** Mantener áreas táctiles de al menos 44 px, labels visibles, foco en orden visual y errores asociados a campos.
- **UX-DR15:** Diseñar responsive para móvil, tablet y escritorio, evitando tablas anchas en la carga.
- **UX-DR16:** Usar lenguaje cotidiano: “Guardar atención”, “Total del día”, “Entregar a NANI” y “Caja cerrada”.

### FR Coverage Map

FR1: Epic 1 - Acceso simple por usuario y PIN.
FR2: Epic 2 - Administración de servicios, equipo y permisos.
FR3: Epic 1 - Operación de empleadas sin acceso a estadísticas.
FR4: Epic 1 - Registro de atenciones.
FR5: Epic 1 - Estados de atención y ausencia de cargos.
FR6: Epic 1 - Edición temporal de atenciones.
FR7: Epic 1 - Conservación histórica sin eliminación.
FR8: Epic 1 - Precio aplicado congelado.
FR9: Epic 1 - Descuento en efectivo.
FR10: Epic 1 - Excepciones de descuento.
FR11: Epic 1 - Comisiones por empleada.
FR12: Epic 1 - Medio de pago único.
FR13: Epic 2 - Administración del catálogo.
FR14: Epic 2 - Habilitación de servicios por empleada.
FR15: Epic 2 - Activación y desactivación de empleadas.
FR16: Epic 3 - Registro de gastos.
FR17: Epic 3 - Cierre diario de caja.
FR18: Epic 3 - Reapertura auditada por NANI.
FR19: Epic 3 - Entregas de cada empleada a NANI.
FR20: Epic 4 - Reporte de atenciones.
FR21: Epic 4 - Reporte económico.
FR22: Epic 4 - Reporte de desempeño.
FR23: Epic 4 - Reporte de gastos.

## Planned Epics

### Epic 1: Registrar atenciones sin depender de la planilla

Las empleadas pueden iniciar sesión, registrar atenciones, aplicar precios y descuentos, y consultar sus cargas recientes.
**FRs covered:** FR1, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12.

### Epic 2: Administrar servicios y equipo

NANI puede gestionar servicios, precios, duraciones, habilitaciones y empleadas activas.
**FRs covered:** FR2, FR13, FR14, FR15.

### Epic 3: Controlar caja y liquidaciones diarias

NANI puede registrar gastos, revisar lo generado por cada empleada, calcular entregas y cerrar o reabrir la caja.
**FRs covered:** FR16, FR17, FR18, FR19.

### Epic 4: Consultar estadísticas del negocio

NANI puede consultar reportes por período, empleada, servicio, estado, medio de pago y gasto.
**FRs covered:** FR20, FR21, FR22, FR23.

## Epic 1: Registrar atenciones sin depender de la planilla

Las empleadas pueden iniciar sesión, registrar atenciones, aplicar precios y descuentos, y consultar sus cargas recientes.

### Story 1.1: Acceso por usuario y PIN

As a empleada o administradora,
I want seleccionar mi usuario e ingresar un PIN corto,
So that acceder únicamente a las funciones correspondientes a mi rol.

**FRs:** FR1, FR3.

**Acceptance Criteria:**

**Given** que el sistema está abierto  
**When** una persona ve la pantalla de acceso  
**Then** se muestran NANI, LULA, LOLA y LEDIS como usuarios activos  
**And** JUANITA no aparece.

**Given** que una persona selecciona un usuario e ingresa el PIN correcto  
**When** confirma el acceso  
**Then** Node crea una sesión válida  
**And** muestra la pantalla correspondiente al rol.

**Given** que el PIN es incorrecto  
**When** intenta ingresar  
**Then** el acceso es rechazado  
**And** se muestra un mensaje genérico sin revelar información sensible.

**Given** que una empleada inició sesión  
**When** accede al sistema  
**Then** no puede consultar estadísticas administrativas ni funciones exclusivas de NANI.

### Story 1.2: Registrar una atención realizada

As a empleada,
I want registrar una atención con los datos de la clienta, servicio y pago,
So that dejar constancia del trabajo realizado.

**FRs:** FR4, FR12.

**Acceptance Criteria:**

**Given** que la empleada inició sesión  
**When** abre “Nueva atención”  
**Then** puede ingresar el nombre completo de la clienta  
**And** solo puede seleccionar servicios habilitados para ella.

**Given** que selecciona un servicio  
**When** visualiza el formulario  
**Then** el sistema muestra el precio vigente de transferencia y la duración configurada.

**Given** que selecciona el medio de pago  
**When** elige una opción  
**Then** solo puede elegir efectivo o transferencia  
**And** no puede combinar ambos medios.

**Given** que completa los datos obligatorios  
**When** guarda la atención  
**Then** el servidor registra la fecha y hora  
**And** vincula la atención con la empleada autenticada  
**And** la atención aparece en sus atenciones recientes.

**Given** que falta un dato obligatorio  
**When** intenta guardar  
**Then** el sistema muestra el error junto al campo  
**And** conserva los datos ya ingresados.

### Story 1.3: Calcular precio, descuento, comisión y entrega

As a empleada,
I want ver el cálculo económico de la atención antes de guardarla,
So that saber cuánto cobró la clienta y qué importe corresponde entregar a NANI.

**FRs:** FR8, FR9, FR10, FR11.

**Acceptance Criteria:**

**Given** que la atención es realizada y el pago es por transferencia  
**When** el sistema calcula el importe  
**Then** usa el precio vigente de transferencia  
**And** calcula comisión y entrega a NANI.

**Given** que el pago es en efectivo y el servicio admite descuento  
**When** el sistema calcula el importe  
**Then** aplica el 10% de descuento  
**And** calcula comisión y entrega sobre el precio final.

**Given** que el servicio es de LEDIS o de maquillaje  
**When** el pago es en efectivo  
**Then** no aplica descuento  
**And** calcula sobre el precio completo.

**Given** que se muestra el resumen  
**When** la empleada lo revisa  
**Then** ve precio base, descuento, precio final, comisión y entrega a NANI.

**Given** que cambia posteriormente el precio del catálogo  
**When** se consulta una atención ya guardada  
**Then** sus importes permanecen sin cambios.

### Story 1.4: Consultar y editar atenciones recientes

As a empleada,
I want consultar y corregir mis atenciones recientes,
So that pueda resolver errores de carga sin alterar el historial.

**FRs:** FR6, FR7, FR8.

**Acceptance Criteria:**

**Given** que la empleada abre “Mis atenciones”  
**When** consulta sus registros  
**Then** ve clienta, servicio, importe, estado, pago, fecha y hora.

**Given** que una atención propia fue creada hace menos de 24 horas  
**When** la abre  
**Then** puede editar los campos permitidos  
**And** ve cuánto tiempo queda para editar.

**Given** que guarda una edición válida  
**When** el servidor procesa el cambio  
**Then** recalcula los importes derivados  
**And** registra `updatedAt` y auditoría.

**Given** que pasaron 24 horas  
**When** la empleada abre la atención  
**Then** puede consultarla  
**And** no puede editarla ni eliminarla.

### Story 1.5: Registrar cancelaciones y ausencias

As a empleada,
I want registrar una atención cancelada o una ausencia,
So that quede constancia sin generar ingresos inexistentes.

**FRs:** FR5.

**Acceptance Criteria:**

**Given** que la empleada crea un registro  
**When** selecciona cancelada o ausente  
**Then** el estado queda guardado con fecha y hora.

**Given** que el estado es cancelada o ausente  
**When** se calcula el resumen  
**Then** el precio final, comisión y entrega a NANI son cero.

**Given** que una atención está cancelada o ausente  
**When** aparece en reportes  
**Then** se identifica por su estado  
**And** no incrementa la facturación.

### Story 1.6: Usar una interfaz clara y responsive

As a empleada,
I want cargar atenciones desde la notebook o un celular con una interfaz clara,
So that pueda trabajar rápido y sin errores de lectura o interacción.

**UX-DRs:** UX-DR1, UX-DR2, UX-DR5, UX-DR9, UX-DR13, UX-DR14, UX-DR15.

**Acceptance Criteria:**

**Given** que una persona abre el sistema  
**When** ve la pantalla de acceso  
**Then** se muestra el logo de StudioByNani  
**And** se aplican los tokens visuales de rojo, rosa suave, superficies claras y tipografía definida.

**Given** que una empleada usa una pantalla pequeña  
**When** carga una atención  
**Then** la interfaz se muestra en una columna  
**And** los controles principales tienen áreas táctiles de al menos 44 px.

**Given** que un campo requiere información  
**When** se muestra el formulario  
**Then** tiene un label visible  
**And** los errores se asocian visualmente al campo correspondiente.

**Given** que se muestra un estado como cancelada, ausente o caja cerrada  
**When** la empleada o NANI lo consulta  
**Then** el estado incluye texto además de color.

## Epic 2: Administrar servicios y equipo

NANI puede gestionar servicios, precios, duraciones, habilitaciones y empleadas activas.

### Story 2.1: Administrar el catálogo de servicios

As a NANI,
I want crear, editar, activar y desactivar servicios,
So that el catálogo refleje la oferta actual del estudio.

**FRs:** FR13.

**Acceptance Criteria:**

**Given** que NANI abre Configuración  
**When** consulta Servicios  
**Then** ve nombre, precio de transferencia, duración, categoría y estado.

**Given** que NANI crea o edita un servicio  
**When** guarda datos válidos  
**Then** el servicio queda disponible para nuevas atenciones.

**Given** que NANI desactiva un servicio  
**When** una empleada crea una atención  
**Then** el servicio no aparece como opción  
**And** las atenciones históricas lo conservan.

### Story 2.2: Configurar servicios por empleada

As a NANI,
I want definir qué servicios puede realizar cada empleada,
So that el sistema evite cargas incorrectas.

**FRs:** FR14.

**Acceptance Criteria:**

**Given** que NANI edita una empleada  
**When** selecciona servicios habilitados  
**Then** la configuración queda guardada.

**Given** que una empleada inicia una atención  
**When** abre el selector de servicios  
**Then** solo ve servicios activos y habilitados para ella.

**Given** que una empleada intenta enviar un servicio no habilitado manipulando la petición  
**When** Node valida la solicitud  
**Then** rechaza la operación.

### Story 2.3: Administrar empleadas y PIN

As a NANI,
I want activar, desactivar y actualizar el PIN de una empleada,
So that controle quién puede utilizar el sistema.

**FRs:** FR2, FR15.

**Acceptance Criteria:**

**Given** que NANI administra el equipo  
**When** desactiva una empleada  
**Then** no puede iniciar nuevas sesiones  
**And** sus atenciones históricas permanecen disponibles para NANI.

**Given** que NANI crea o reactiva una empleada  
**When** guarda un PIN válido  
**Then** puede iniciar sesión con ese usuario.

**Given** que NANI cambia un PIN  
**When** la empleada intenta usar el PIN anterior  
**Then** el acceso es rechazado.

## Epic 3: Controlar caja y liquidaciones diarias

NANI puede registrar gastos, revisar lo generado por cada empleada, calcular entregas y cerrar o reabrir la caja.

### Story 3.1: Registrar gastos del negocio

As a NANI,
I want registrar gastos del estudio,
So that el resultado diario contemple las salidas de dinero.

**FRs:** FR16.

**Acceptance Criteria:**

**Given** que NANI abre Gastos  
**When** crea un gasto  
**Then** puede seleccionar alquiler, expensas, limpieza, luz o internet  
**And** ingresar importe, fecha y descripción.

**Given** que el importe es inválido o falta una categoría  
**When** NANI guarda  
**Then** el sistema rechaza el gasto y muestra el error.

**Given** que el gasto se guarda  
**When** NANI consulta el día  
**Then** el gasto aparece en el resumen y reporte correspondiente.

### Story 3.2: Revisar y cerrar la caja diaria

As a NANI,
I want revisar y cerrar la caja de un día,
So that conozca el resultado y las entregas que corresponden.

**FRs:** FR17, FR19.

**Acceptance Criteria:**

**Given** que el día está abierto  
**When** NANI abre Cierre diario  
**Then** ve total de atenciones, monto por empleada, efectivo, transferencias, gastos y resultado.

**Given** que existen atenciones de LULA, LOLA o LEDIS  
**When** NANI revisa el resumen  
**Then** ve respectivamente 30%, 40% y 30% como entregas a NANI.

**Given** que NANI confirma el cierre  
**When** el servidor procesa la operación  
**Then** crea un snapshot del día  
**And** bloquea nuevas mutaciones para ese día.

### Story 3.3: Reabrir un cierre diario

As a NANI,
I want reabrir un cierre confirmado indicando un motivo,
So that pueda corregir una carga excepcional sin perder trazabilidad.

**FRs:** FR18.

**Acceptance Criteria:**

**Given** que un cierre está confirmado  
**When** NANI selecciona Reabrir  
**Then** debe ingresar un motivo.

**Given** que el motivo es válido  
**When** confirma la reapertura  
**Then** el día vuelve a estado abierto  
**And** se registra usuario, fecha, hora y motivo.

**Given** que una empleada intenta reabrir el cierre  
**When** solicita la operación  
**Then** Node la rechaza por permisos.

### Story 3.4: Respaldar y recuperar la información local

As a NANI,
I want crear y conservar backups de la información,
So that una falla de la notebook no elimine el historial del negocio.

**NFRs:** NFR2, NFR6, NFR9, NFR10.

**Acceptance Criteria:**

**Given** que NANI ejecuta un backup manual o confirma un cierre  
**When** el sistema crea la copia  
**Then** genera un archivo SQLite consistente en la carpeta configurada.

**Given** que existen varias copias  
**When** se aplica la retención configurada  
**Then** se conservan las versiones permitidas sin borrar la base activa.

**Given** que se prueba una restauración  
**When** se abre la copia en una instancia de verificación  
**Then** los datos y cierres se pueden consultar.

## Epic 4: Consultar estadísticas del negocio

NANI puede consultar reportes por período, empleada, servicio, estado, medio de pago y gasto.

### Story 4.1: Consultar atenciones

As a NANI,
I want filtrar las atenciones registradas,
So that pueda revisar el trabajo realizado.

**FRs:** FR20.

**Acceptance Criteria:**

**Given** que NANI abre Reporte de atenciones  
**When** selecciona fechas, empleada, servicio o estado  
**Then** el sistema muestra únicamente los registros coincidentes.

**Given** que no existen coincidencias  
**When** se aplica un filtro  
**Then** muestra un estado vacío claro sin error.

### Story 4.2: Consultar ingresos, comisiones y entregas

As a NANI,
I want consultar el resultado económico por período,
So that pueda controlar facturación y liquidaciones.

**FRs:** FR21.

**Acceptance Criteria:**

**Given** que NANI selecciona un período  
**When** abre Reporte económico  
**Then** ve facturación, efectivo, transferencias, comisiones y entregas a NANI.

**Given** que filtra por empleada  
**When** aplica el filtro  
**Then** el sistema recalcula los totales con el mismo SettlementService.

**Given** que cambia un precio del catálogo  
**When** consulta un período histórico  
**Then** los importes históricos no cambian.

### Story 4.3: Consultar desempeño y gastos

As a NANI,
I want consultar desempeño por empleada y gastos por categoría,
So that pueda evaluar el negocio y sus costos.

**FRs:** FR3, FR22, FR23.

**Acceptance Criteria:**

**Given** que NANI selecciona un período  
**When** abre Desempeño  
**Then** ve cantidad de atenciones, servicios y facturación por empleada.

**Given** que NANI selecciona una categoría de gasto  
**When** consulta Gastos  
**Then** ve los importes agrupados por categoría y período.

**Given** que una empleada inicia sesión  
**When** intenta abrir reportes administrativos  
**Then** el sistema rechaza el acceso.

