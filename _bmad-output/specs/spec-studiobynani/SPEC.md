---
id: SPEC-studiobynani
companions:
  - financial-rules.md
  - ../../planning-artifacts/architecture/architecture-studiobynani-2026-09-22/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/ux-designs/ux-studiobynani-2026-09-22/DESIGN.md
  - ../../planning-artifacts/ux-designs/ux-studiobynani-2026-09-22/EXPERIENCE.md
sources:
  - ../../planning-artifacts/briefs/brief-studiobynani-2026-09-22/brief.md
  - ../../planning-artifacts/prds/prd-studiobynani-2026-09-22/prd.md
---

# Sistema StudioByNani

## Why

StudioByNani necesita reemplazar la planilla como herramienta principal para registrar atenciones y controlar el dinero del negocio. NANI necesita saber qué realizó cada empleada, cuánto se cobró, qué comisión corresponde, cuánto debe recibir el negocio y cómo cerró cada día. La primera versión debe funcionar localmente en la notebook del estudio, ser rápida para las empleadas y conservar una ruta clara hacia una futura aplicación web.

## Capabilities

- **CAP-1**
  - **intent:** Usuarios activos pueden autenticarse y operar según su rol.
  - **success:** NANI puede acceder a administración y reportes; cada empleada solo puede operar sus funciones permitidas; JUANITA no puede iniciar sesión.

- **CAP-2**
  - **intent:** Una empleada puede registrar una atención realizada con clienta, servicio, medio de pago y estado.
  - **success:** Una atención válida queda guardada con fecha/hora del servidor, servicio habilitado, precio aplicado y vínculo con la empleada autenticada.

- **CAP-3**
  - **intent:** El sistema calcula el precio final, la comisión y la entrega correspondiente a NANI.
  - **success:** Para los mismos datos, atención, cierre y reporte muestran exactamente los mismos importes, con reglas de efectivo, transferencia y porcentaje aplicadas.

- **CAP-4**
  - **intent:** Una empleada puede editar sus propias atenciones durante 24 horas, pero ninguna atención puede eliminarse.
  - **success:** Una edición dentro de la ventana recalcula derivados; una edición posterior es rechazada para la empleada; el historial conserva la atención.

- **CAP-5**
  - **intent:** NANI puede administrar empleadas, servicios, precios, habilitaciones, gastos y permisos.
  - **success:** Cambiar el catálogo afecta nuevas atenciones sin modificar precios históricos; solo NANI puede cargar gastos y configurar reglas.

- **CAP-6**
  - **intent:** NANI puede revisar y cerrar la caja diaria, calculando entregas y resultado del día.
  - **success:** El cierre muestra atenciones, monto por empleada, efectivo, transferencias, gastos y entregas a NANI; una reapertura exige NANI, motivo y auditoría.

- **CAP-7**
  - **intent:** NANI puede consultar reportes por período, empleada, servicio, estado, medio de pago y categoría de gasto.
  - **success:** NANI obtiene reportes consistentes con las atenciones y cierres sin cálculos manuales adicionales.

## Constraints

- La primera versión es local-first: React + Node en una notebook y SQLite como archivo local.
- La interfaz se sirve en navegador; el backend Node es la única autoridad para autenticación, permisos, reglas y mutaciones.
- La agenda y las reservas continúan en TuTurno; no forman parte del MVP.
- Los importes se representan como enteros en centavos y las reglas financieras se calculan en servidor.
- Las atenciones no se eliminan; los cierres confirmados solo se reabren por NANI y con auditoría.
- La solución debe poder migrar posteriormente a despliegue web y PostgreSQL sin cambiar el contrato funcional.
- La fecha/hora oficial la genera el servidor con la zona horaria configurada del estudio.
- Debe existir backup local recuperable del archivo SQLite.

## Non-goals

- Agenda, reserva de turnos y recordatorios.
- Integración con la API de TuTurno en la primera versión.
- Portal o aplicación para clientas.
- Pagos online o pagos combinados.
- Estadísticas visibles para empleadas.
- Eliminación de atenciones o cierres.

## Success signal

Durante la operación diaria, las empleadas registran sus atenciones en el sistema y NANI puede cerrar la caja sabiendo cuánto generó cada una, cuánto corresponde entregar al negocio y cuál fue el resultado del día. Los importes del sistema coinciden con las reglas comerciales y los históricos permanecen estables aunque cambien los precios.

## Assumptions

- El sistema se usa inicialmente desde la notebook del estudio mediante `localhost`.
- El acceso MVP usa selector de usuario más PIN corto.
- La persona que realiza la atención recibe el pago de la clienta; el sistema calcula la parte que debe entregar a NANI.
- Los datos adicionales de clientas, como email o teléfono, podrían llegar desde TuTurno en una fase posterior.

## Open Questions

- Qué datos y permisos ofrecerá la futura API de TuTurno.
- Si los gastos deben registrar medio de pago desde el primer MVP.
