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
