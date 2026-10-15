---
title: 'NANI cambia su propio PIN'
type: 'bugfix'
created: '2026-10-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NANI puede cambiar el PIN de LULA, LOLA y LEDIS desde Equipo, pero no tiene forma de cambiar el suyo. En el sitio publicado su PIN sigue siendo el inicial.

**Approach:** En Equipo, NANI cambia su propio PIN con el mismo criterio que el de las empleadas: cuatro dígitos, guardado hasheado y nunca visible. Después entra con el PIN nuevo. Las empleadas siguen sin administrar usuarios.

</frozen-after-approval>

## Implementation Notes

- El control quedó en Equipo, arriba de las empleadas, con el texto "Tu acceso".
- Reutiliza el mismo endpoint de PIN. Si la sesión es NANI y el id es el suyo, actualiza su usuario admin. Una empleada sigue recibiendo 403.
- NANI no puede desactivarse: el cambio de estado sigue limitado a empleadas.
- El PIN nuevo queda hasheado, la respuesta no lo devuelve y la sesión actual sigue abierta.
- Al reiniciar, el arranque no pisa un PIN ya guardado.
- En Actividad, el cambio propio se lee como "Cambió su PIN".
- Probado el ingreso con el PIN nuevo y la vuelta al PIN anterior en el celular local. El PIN local quedó otra vez en 1234.
- Para el PIN propio se pide el actual y repetir el nuevo. Si no coinciden, no se guarda.
- El cambio y el registro de actividad se guardan juntos. Las otras sesiones de NANI se cierran; la que usó para cambiarlo sigue abierta.

## Review Triage Log

- high — Sin el PIN actual ni una repetición, un error dejaba a NANI afuera y nadie podía devolverlo. Se piden las dos cosas y, si fallan, el PIN no cambia.
- medium — El PIN se escribía antes del registro de actividad. Ahora las dos escrituras van juntas.
- medium — Otra sesión ya abierta seguía adentro después del cambio. Esas sesiones se cierran.
- low — El test no comprobaba que la vuelta al PIN anterior hubiera salido bien, ni que un intento ajeno lo dejara igual. Ahora lo comprueba.
- low — No se agregó una prueba de reinicio. Al arrancar solo se actualizan nombre y rol, no el PIN guardado.
- low — El texto de Equipo hablaba solo de las empleadas. Ahora dice que ahí también está el PIN de NANI.
- low — El campo nuevo podía recibir el PIN guardado por el navegador. Quedó marcado como PIN nuevo.
