---
name: StudioByNani
status: draft
sources:
  - ../../prds/prd-studiobynani-2026-09-22/prd.md
  - ./imports/studio-by-nani-logo.png
updated: 2026-09-22
colors:
  surface: '#FFFFFF'
  surface-subtle: '#FFF4F6'
  ink: '#1F1F1F'
  ink-muted: '#6B6B6B'
  primary: '#D6323A'
  primary-foreground: '#FFFFFF'
  brand-pink: '#E8A7B6'
  brand-pink-soft: '#FBE8EC'
  success: '#2F7D5A'
  warning: '#B7791F'
  danger: '#B33A3A'
  border: '#E5E5E5'
typography:
  heading:
    fontFamily: 'System UI'
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  body:
    fontFamily: 'System UI'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'System UI'
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.3'
rounded:
  sm: 6px
  md: 10px
spacing:
  unit: 4px
  page-mobile: 16px
  page-desktop: 24px
components:
  primary-action:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  status-success:
    background: '#E7F4ED'
    foreground: '{colors.success}'
  status-warning:
    background: '#FFF5DC'
    foreground: '{colors.warning}'
  status-danger:
    background: '#FCEAEA'
    foreground: '{colors.danger}'
---

# StudioByNani — Design Spine

## Brand & Style

StudioByNani debe sentirse claro, cálido y práctico: una herramienta de trabajo diario para un estudio de belleza, no un sistema contable frío. La interfaz prioriza lectura rápida, acciones evidentes y confianza en los importes.

La dirección visual toma como referencia el logo del estudio: rosa suave como superficie de marca y rojo intenso para acciones principales y titulares destacados. El logo debe aparecer en el acceso y en la identidad del encabezado, pero no repetirse en cada tarjeta.

La interfaz evita decoración que compita con el registro de una atención. Los colores de estado se reservan para diferenciar realizado, cancelado, ausente y cierre pendiente.

## Colors

- `{colors.surface}` es la superficie principal.
- `{colors.surface-subtle}` separa áreas secundarias sin crear ruido.
- `{colors.primary}` identifica acciones principales, navegación activa y confirmaciones.
- `{colors.brand-pink}` y `{colors.brand-pink-soft}` conectan la interfaz con el círculo rosa del logo, especialmente en fondos suaves y estados informativos.
- `{colors.success}`, `{colors.warning}` y `{colors.danger}` se utilizan únicamente para estados y mensajes de resultado.
- `{colors.border}` separa campos y tarjetas sin depender de sombras fuertes.

## Typography

Se utiliza tipografía del sistema para cargar rápido y mantener buena legibilidad en celulares. Los títulos deben ser breves; los importes y totales deben tener jerarquía visual clara.

## Layout & Spacing

La experiencia es mobile-first con márgenes de `{spacing.page-mobile}`. En pantallas grandes el contenido se centra y puede expandirse hasta una columna de trabajo cómoda, sin convertir la carga de una atención en una planilla ancha.

## Elevation & Depth

Las tarjetas de resumen pueden usar una sombra tenue o contraste de superficie. La jerarquía principal proviene de espaciado, tamaño de texto y agrupación; no de múltiples niveles de sombra.

## Shapes

Los campos, botones y tarjetas usan esquinas suaves. Los botones principales no deben parecer etiquetas decorativas; los estados pueden usar chips compactos cuando mejoren el escaneo.

## Components

- **Selector de usuario:** muestra los cuatro perfiles activos; JUANITA nunca aparece.
- **PIN:** campo numérico simple, con teclado adecuado en celular.
- **Selector de servicio:** solo muestra servicios habilitados para la empleada.
- **Tarjeta de atención:** muestra clienta, servicio, importe, medio de pago, estado y hora.
- **Tarjeta de resumen:** muestra total de atenciones, importe y comisión o entrega a NANI.
- **Botón de acción principal:** una acción dominante por pantalla, especialmente “Guardar atención” y “Cerrar caja”.
- **Banner de cierre:** comunica si el día está abierto, cerrado o reabierto por NANI.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Mostrar importes con jerarquía y formato consistente | Ocultar el importe final detrás de varios pasos |
| Usar estados de color acompañados por texto | Comunicar estados solo con color |
| Diseñar primero para una mano y pantalla pequeña | Convertir la carga en una tabla horizontal |
| Confirmar acciones irreversibles como cierre | Usar confirmaciones para cada campo simple |
| Mantener el lenguaje cotidiano del negocio | Usar jerga contable innecesaria |
