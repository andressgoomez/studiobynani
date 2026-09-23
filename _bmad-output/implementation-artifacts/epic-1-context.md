# Epic 1 Context: Registrar atenciones sin depender de la planilla

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permitir que NANI y las empleadas activas registren atenciones directamente en el sistema, con acceso según rol, servicios habilitados, cálculos financieros consistentes y consulta de cargas recientes. El epic reemplaza la carga operativa principal en la planilla y conserva un historial confiable de cada atención.

## Stories

- Story 1.1: Acceso por usuario y PIN
- Story 1.2: Registrar una atención realizada
- Story 1.3: Calcular precio, descuento, comisión y entrega
- Story 1.4: Consultar y editar atenciones recientes
- Story 1.5: Registrar cancelaciones y ausencias
- Story 1.6: Usar una interfaz clara y responsive

## Requirements & Constraints

- Solo usuarios activos pueden iniciar sesión mediante selector y PIN corto: NANI, LULA, LOLA y LEDIS. JUANITA permanece inactiva y no debe aparecer.
- Node debe crear la sesión y aplicar permisos en backend; las empleadas solo pueden registrar y consultar sus propias atenciones, sin estadísticas administrativas.
- Una atención vincula la empleada autenticada, el nombre completo de la clienta, un servicio habilitado, un único medio de pago (efectivo o transferencia), estado y fecha/hora generadas por el servidor.
- Los estados son realizada, cancelada y ausente. Canceladas y ausentes conservan el registro, pero tienen precio final, comisión y entrega iguales a cero y no cuentan como facturación.
- Una atención nunca se elimina. La empleada puede editar sus propias atenciones durante las 24 horas desde `createdAt`; luego solo puede consultarlas. Las ediciones válidas recalculan derivados y dejan auditoría.
- Cada atención congela el precio aplicado, descuento, precio final, comisión y entrega, por lo que cambios posteriores del catálogo no alteran históricos.
- El efectivo aplica 10% de descuento a servicios de NANI, LULA y LOLA que no sean maquillaje. LEDIS y todos los servicios de maquillaje no reciben ese descuento. La comisión se calcula sobre el precio final: NANI 100%, LULA 70%, LOLA 60%, LEDIS 70%.
- El objetivo operativo es que las atenciones realizadas se registren sin planilla y que todos los casos financieros coincidan con las reglas configuradas.
- API versionada bajo `/api/v1`, errores consistentes, importes en centavos enteros, validación server-side y trazabilidad de mutaciones.

## Technical Decisions

- Implementar en el monolito modular React + Node/Fastify; React consume la API y no accede directamente a SQLite.
- Atenciones viven en el módulo de atenciones; identidad/permisos en auth; reglas financieras en `packages/domain/settlement`; contratos HTTP compartidos en `packages/contracts`.
- `SettlementService` es la única fuente de precio final, comisión y entrega. Debe redondear en centavos y devolver la versión de regla; los cálculos se ejecutan en servidor dentro de la mutación.
- Usar sesión local HttpOnly y verificar permisos en cada endpoint; no confiar en el rol enviado por el navegador.
- Node genera instantes UTC y calcula `businessDate` con `America/Argentina/Buenos_Aires`; la ventana de edición termina exactamente en `createdAt + 24 horas`.
- Persistir inicialmente en SQLite mediante repositorios compatibles con una futura migración a PostgreSQL. Las mutaciones de atención, derivados y auditoría deben ser transaccionales.
- Usar IDs generados por servidor, fechas ISO 8601, nombres TypeScript en `camelCase` y pruebas unitarias para reglas financieras, además de pruebas API/browser de los flujos principales.

## UX & Interaction Patterns

- Acceso con logo, selector de los cuatro perfiles activos y PIN numérico; el error de PIN debe ser genérico.
- Inicio diferenciado por rol. Para empleadas, “Nueva atención” debe estar a un toque y “Mis atenciones” debe mostrar clienta, servicio, importe, medio de pago, estado y hora.
- Formulario mobile-first en este orden: clienta, servicio, medio de pago, estado, resumen y “Guardar atención”. El selector solo muestra servicios activos y habilitados para la persona autenticada.
- Antes de guardar, mostrar precio base, descuento, precio final, comisión y “Entregar a NANI”. Tras guardar, confirmar brevemente el importe calculado.
- Realizada, cancelada y ausente deben mostrar texto además de color. Dentro de la ventana, mostrar “Podés editar hasta…”; fuera de ella, “La ventana de edición terminó”.
- Una columna en móvil; controles con áreas táctiles mínimas de 44 px, labels visibles, foco en orden visual y errores asociados a sus campos. Conservar datos ingresados ante errores.
- Usar tokens visuales de rojo principal, rosa suave, superficies claras, tipografía de sistema y esquinas suaves; evitar tablas anchas y acciones destructivas.

## Cross-Story Dependencies

- Story 1.1 habilita la identidad y permisos requeridos por las historias 1.2–1.5.
- Story 1.2 depende del catálogo y de las habilitaciones administradas por Epic 2, aunque la API debe validar el servicio recibido aun si el frontend es manipulado.
- Story 1.3 centraliza los cálculos reutilizados por creación y edición de atenciones; Story 1.5 debe forzar la misma regla de importe cero.
- Story 1.4 depende de timestamps oficiales, auditoría y la política de no eliminación; sus cambios deben respetar bloqueos de cierres diarios de Epic 3.
