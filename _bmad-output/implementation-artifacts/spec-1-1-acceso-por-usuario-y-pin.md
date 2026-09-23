---
title: 'Acceso por usuario y PIN'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f19f7ac927665b4e3b33b9da8faa29c90fa9dd33'
context:
  - 'C:/laragon/www/studiobynani/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** StudioByNani no tiene todavía una aplicación operativa. Las personas del estudio necesitan identificarse de forma simple para que el sistema muestre la experiencia y permisos correctos.

**Approach:** Crear la base local React + Node de la aplicación y un acceso con selector de usuario activo más PIN corto. El backend debe crear la sesión y aplicar los permisos; la interfaz no puede decidir el rol.

## Boundaries & Constraints

**Always:** Ejecutar localmente en la notebook mediante `localhost`; usar NANI, LULA, LOLA y LEDIS como usuarios activos; mantener JUANITA desactivada; validar el PIN y el rol en Node; usar sesión HttpOnly; aplicar los tokens visuales del logo y diseño responsive.

**Never:** Permitir acceso seleccionando solamente el nombre; mostrar JUANITA como opción activa; confiar en un rol enviado por React; implementar recuperación de contraseña, autenticación externa o despliegue web en esta historia.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Usuario activo + PIN correcto | Sesión creada y pantalla inicial del rol | N/A |
| DISABLED_USER | JUANITA o usuario desactivado + PIN | Acceso rechazado | Mensaje genérico de acceso inválido |
| WRONG_PIN | Usuario activo + PIN incorrecto | No se crea sesión | Mensaje genérico sin revelar el motivo |
| EMPTY_PIN | Usuario activo sin PIN | No se envía o procesa el formulario | Validación visible del PIN |
| SESSION_CHECK | Sesión válida o ausente | Rol válido o regreso al acceso | API rechaza recursos sin sesión |

</frozen-after-approval>

## Code Map

- `package.json` -- nuevo workspace npm para ejecutar frontend, API y comandos locales.
- `apps/web/` -- nueva aplicación React/Vite; pantalla de acceso, selector, PIN y navegación inicial por rol.
- `apps/api/` -- nueva API Node/Fastify; usuarios activos, validación de PIN, sesión HttpOnly y autorización.
- `packages/contracts/` -- contratos compartidos de acceso, sesión, usuario y errores.
- `packages/domain/` -- reglas de autenticación y permisos sin dependencia de React o Fastify.
- `prisma/schema.prisma` -- modelo mínimo de usuario activo y credencial local; no crear entidades de atenciones todavía.
- `_bmad-output/planning-artifacts/architecture/architecture-studiobynani-2026-09-22/ARCHITECTURE-SPINE.md` -- decisiones obligatorias de stack, límites y seguridad.
- `_bmad-output/planning-artifacts/ux-designs/ux-studiobynani-2026-09-22/DESIGN.md` -- tokens visuales y logo.
- `_bmad-output/planning-artifacts/ux-designs/ux-studiobynani-2026-09-22/EXPERIENCE.md` -- flujo de acceso, estados y accesibilidad.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `apps/web/`, `apps/api/`, `packages/contracts/` y `packages/domain/` -- crear workspace React + Vite + TypeScript y Node + Fastify ejecutable localmente -- no existe código previo.
- [x] `prisma/schema.prisma` -- crear el modelo mínimo de usuario activo y migración SQLite -- persistir únicamente lo necesario para autenticación.
- [x] `apps/api/` y `packages/domain/` -- implementar validación de usuarios activos, PIN, sesión HttpOnly y permisos de rol -- Node es la autoridad.
- [x] `apps/web/` -- implementar pantalla de acceso, selector de usuario, PIN, estados de error y destinos iniciales por rol -- respetar UX responsive y tokens.
- [x] `tests/` -- cubrir acceso correcto, PIN incorrecto, usuario desactivado, sesión ausente y permisos -- evitar regresiones en la primera historia.

**Acceptance Criteria:**
- Given que la aplicación local está abierta, when se muestra el acceso, then aparecen NANI, LULA, LOLA y LEDIS, y JUANITA no aparece.
- Given un usuario activo y PIN correcto, when confirma el acceso, then Node crea una sesión HttpOnly y la UI muestra el inicio correspondiente al rol.
- Given un PIN incorrecto o usuario desactivado, when intenta ingresar, then no se crea sesión y se muestra un mensaje genérico.
- Given una empleada autenticada, when solicita una función administrativa, then la API rechaza la operación aunque el cliente altere el rol enviado.
- Given una sesión ausente o expirada, when solicita un recurso protegido, then la API responde no autorizado y la UI vuelve al acceso.
- Given una pantalla móvil, when se usa el acceso, then los controles son legibles, tienen áreas táctiles de al menos 44 px y el PIN abre teclado numérico.

## Implementation Notes

- Se creó la base React + Fastify y el esquema SQLite. Los usuarios iniciales se cargan desde el dominio durante esta historia; la administración persistida de usuarios queda para la Épica 2.
- Las sesiones se mantienen en memoria durante el MVP local y expiran junto con la cookie HttpOnly; no se requiere persistencia de sesiones para esta historia.
- El entorno disponible usa Node 20.14, por lo que Vite quedó en la línea 6 compatible con el entorno actual; la arquitectura mantiene Node 24 como runtime objetivo de producción.

## Spec Change Log

## Review Triage Log

- `medium` — La sesión en memoria no verificaba su vencimiento, por lo que una cookie retenida podía seguir autorizando recursos protegidos; se corrigió validando `expiresAt` y eliminando sesiones vencidas.
- `medium` — El flujo web no manejaba errores de red al cargar usuarios, iniciar sesión o restaurar sesión; se corrigió mostrando estados y mensajes de error.
- `low` — Los cuerpos de login con PIN no textual podían provocar un error interno; se corrigió validando el tipo antes de aplicar la expresión regular.
- `low` — El comando de generación de Prisma no tenía sus dependencias declaradas; se agregaron `prisma` y `@prisma/client` compatibles con Node 20.
- `false` — La ausencia de doctype y metadatos en `index.html` fue corregida durante la revisión; no queda pendiente en esta historia.
- `defer` — Los botones de navegación de atenciones, resumen y cierre todavía son destinos visuales sin funcionalidad; corresponden a las historias posteriores de registro, caja y reportes.

## Design Notes

El PIN será numérico de 4 dígitos para mantener el acceso rápido en la notebook y el celular. Esta elección no cambia el contrato de permisos; debe poder modificarse desde administración en una historia posterior.

## Verification

**Commands:**
- `npm install` -- expected: SUCCESS, lockfile generado sin errores.
- `npm run build` -- expected: SUCCESS para web y API.
- `npm test` -- expected: SUCCESS con casos de acceso y permisos.

**Manual checks (if no CLI):**
- Abrir `http://localhost`, ver el logo y los cuatro usuarios activos.
- Ingresar con cada PIN de prueba y comprobar que NANI accede al inicio administrativo y las empleadas al inicio de carga.
- Intentar acceder a una ruta administrativa desde una sesión de empleada y comprobar rechazo.
