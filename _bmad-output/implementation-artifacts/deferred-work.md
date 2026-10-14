# Trabajo diferido

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-acceso-por-usuario-y-pin.md`
  summary: Los botones de navegación de atenciones, resumen y cierre todavía son destinos visuales sin funcionalidad.
  evidence: La pantalla inicial renderiza los botones, pero las historias posteriores implementarán registro de atenciones, caja diaria y reportes.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-registrar-una-atencion-realizada.md`
  summary: Conectar el runtime de atenciones con SQLite mediante Prisma.
  evidence: Durante este preview las atenciones se mantienen en memoria; la migración SQLite existe, pero un reinicio del proceso todavía pierde los registros.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Agregar limitación de intentos y limpieza periódica de sesiones.
  evidence: La autenticación usa un mapa de sesiones en memoria sin rate limiting ni limpieza periódica; corresponde a la historia de acceso y no es causado por esta implementación.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Persistir sesiones y aplicar el secreto de sesión anunciado.
  evidence: Las sesiones se pierden al reiniciar el proceso y SESSION_SECRET no se consume; es infraestructura de autenticación fuera del alcance de esta historia.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Leer servicios administrados desde el repositorio persistente.
  evidence: El catálogo de atenciones sigue siendo el catálogo inicial en memoria; la administración de servicios pertenece a Epic 2.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Implementar el resumen administrativo real.
  evidence: El endpoint administrativo devuelve un placeholder y pertenece a historias posteriores de reportes.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Recuperar automáticamente la pantalla de acceso ante expiración de sesión.
  evidence: La UI conserva la pantalla autenticada cuando cotización o guardado reciben 401; es un comportamiento transversal de autenticación no requerido por esta historia.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Alinear PATCH con actualizaciones parciales.
  evidence: El endpoint PATCH exige todos los campos editables; la semántica general del endpoint pertenece a la historia de edición previa.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Agregar límites de longitud y tamaño a nombres de clientas.
  evidence: La API solo valida presencia del nombre; es una mejora general de validación no especificada para cancelaciones o ausencias.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Actualizar la documentación histórica que describe persistencia en memoria.
  evidence: Un spec anterior contradice la implementación Prisma actual; no es código ni documentación de esta historia.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Blindar la ventana de edición contra una carrera en el límite de 24 horas.
  evidence: La comprobación y actualización no están condicionadas en una única operación; requiere una decisión transversal sobre concurrencia.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-registrar-cancelaciones-y-ausencias.md`
  summary: Agregar una prueba explícita de expiración de sesión.
  evidence: No existe una regresión automatizada para expiresAt; corresponde al flujo de autenticación, no al registro de estados.

- source_spec: `_bmad-output/implementation-artifacts/spec-rechequeo-entregas-nani.md`
  summary: El cierre mensual compara y envía el mes como MM/YYYY.
  evidence: `formatDisplayMonth` convierte YYYY-MM a MM/YYYY y eso se usa en el control y en el POST; el reemplazo ya estaba en los cambios de pantalla previos a este rechequeo, y el spec no modifica cierres.

- source_spec: `_bmad-output/implementation-artifacts/spec-rechequeo-entregas-nani.md`
  summary: Registrar una venta de producto no respeta una entrega ya enviada.
  evidence: Editar y cancelar la venta devuelven 409 si hay `sentAt`; el alta no lo consulta. Es anterior al rechequeo.

- source_spec: `_bmad-output/implementation-artifacts/spec-rechequeo-entregas-nani.md`
  summary: Una empleada creada desde Equipo no aparece para iniciar sesión.
  evidence: `GET /api/v1/auth/users` sigue devolviendo `ACTIVE_USERS` y no las filas de la base.

- source_spec: `_bmad-output/implementation-artifacts/spec-rechequeo-entregas-nani.md`
  summary: Una base nueva no puede aplicar las migraciones de productos ni de entregas.
  evidence: Ninguna migración versionada crea `Product*` ni `DailyRemittance`; la de recibido solo agrega columnas sobre la tabla que ya existe en la base local.

- source_spec: `_bmad-output/implementation-artifacts/spec-rechequeo-entregas-nani.md`
  summary: El trabajo previo de productos y administración deja huecos de dinero, stock y formularios.
  evidence: Reportes sin productos, cancelar una venta borra las líneas, editar reprecios al costo actual, el modal de edición puede guardar una venta nueva, los errores de edición no se ven en el diálogo, un producto desactivado reaparece, el PATCH de producto acepta datos inválidos, Once suma el mismo importe a NANI y a caja común, el resumen no reparte la venta en efectivo o transferencia, un precio bajo el costo deja comisión negativa, una cantidad no entera se descarta, la ventana de 24 horas no avisa, y un servicio o producto inactivo no se puede quitar en la edición. Nada de eso lo introduce la confirmación de recibido.

- source_spec: `_bmad-output/implementation-artifacts/spec-rechequeo-entregas-nani.md`
  summary: Actividad muestra claves crudas de productos y de empleadas.
  evidence: El mapa de etiquetas no incluye esas acciones; las de recibido sí están. Viene del trabajo anterior.

- source_spec: `_bmad-output/implementation-artifacts/spec-rechequeo-entregas-nani.md`
  summary: El resumen del día de la empleada esconde importes y ya no lista el detalle por empleada.
  evidence: El CSS oculta los spans 3 y 6 del resumen, y el markup del detalle por empleada salió en los cambios de pantalla previos.

- source_spec: `_bmad-output/implementation-artifacts/spec-inicio-base-datos-reales.md`
  summary: El resto de la suite de API sigue asumiendo servicios ya habilitados y escribe en la base de la clienta.
  evidence: Tras dejar las habilitaciones vacías, esas pruebas dependen de filas previas. El spec prohíbe correrlas contra `prisma/data/studiobynani.sqlite`; el arnés compartido ya existía.

- source_spec: `_bmad-output/implementation-artifacts/spec-inicio-base-datos-reales.md`
  summary: Cada arranque reescribe nombre y rol de las cuatro usuarias.
  evidence: El upsert de `onReady` ya actualizaba `displayName` y `role` antes de este inicio.

- source_spec: `_bmad-output/implementation-artifacts/spec-inicio-base-datos-reales.md`
  summary: Un servicio nuevo creado por NANI queda habilitado para todas las usuarias activas.
  evidence: `POST /api/v1/admin/services` conecta `DEFAULT_USERS` activos y este cambio no tocó esa línea.
