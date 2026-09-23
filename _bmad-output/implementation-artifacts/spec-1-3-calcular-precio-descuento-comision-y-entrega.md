---
title: 'Calcular precio, descuento, comisión y entrega'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f19f7ac927665b4e3b33b9da8faa29c90fa9dd33'
context:
  - 'C:/laragon/www/studiobynani/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La atención ya calcula importes al guardarse, pero la empleada necesita conocer el total cobrado y la entrega a NANI antes de confirmar.

**Approach:** Exponer una cotización server-side para el servicio y medio de pago seleccionados, y mostrar en el formulario precio base, descuento, precio final, comisión y entrega. El servidor seguirá recalculando y congelando los importes al crear la atención.

## Boundaries & Constraints

**Always:** Calcular en centavos enteros en Node; aplicar 10% de descuento en efectivo salvo LEDIS y maquillaje; calcular comisión sobre precio final; mantener la identidad de sesión; usar la misma regla para cotización y guardado.

**Never:** Confiar en importes enviados por React; modificar históricos; aceptar servicios no habilitados; cambiar porcentajes o implementar reportes y cierres.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| TRANSFER | Servicio habilitado + transferencia | Precio base = precio final, descuento cero | N/A |
| CASH_DISCOUNT | Servicio habilitado + efectivo | Descuento del 10% y cálculo sobre precio final | N/A |
| CASH_EXCEPTION | LEDIS o maquillaje + efectivo | Sin descuento | N/A |
| INVALID_SERVICE | Servicio ajeno o inexistente | No cotiza ni guarda | 400 |
| NO_SESSION | Sin sesión | No cotiza | 401 |

</frozen-after-approval>

## Code Map

- `packages/domain/src/index.ts` -- reutilizar `calculateAttendanceAmounts`.
- `apps/api/src/app.ts` -- agregar endpoint protegido de cotización.
- `apps/web/src/main.tsx` -- consultar cotización y mostrar resumen previo.
- `tests/api/attendances.test.ts` -- cubrir ramas financieras en la API.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/app.ts` -- implementar cotización server-side con validación de servicio habilitado.
- [x] `apps/web/src/main.tsx` -- mostrar resumen económico antes de guardar.
- [x] `tests/api/attendances.test.ts` -- cubrir transferencia, efectivo con descuento y excepciones.

**Acceptance Criteria:**
- Given servicio y transferencia, when se cotiza, then el descuento es cero y el total usa el precio vigente.
- Given servicio elegible y efectivo, when se cotiza, then aplica 10% y calcula comisión y entrega sobre el precio final.
- Given LEDIS o maquillaje y efectivo, when se cotiza, then no aplica descuento.
- Given que el precio cambia después, when se consulta una atención guardada, then sus importes no cambian.
- Given que React envía importes alterados, when guarda, then Node ignora esos importes y recalcula.

## Implementation Notes

- La cotización utiliza la misma función server-side que el guardado; los importes enviados por el navegador no son confiables ni se persisten.
- El resumen previo muestra precio base, descuento, total, comisión y entrega a NANI según el medio de pago elegido.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test` -- expected: all tests pass.
- `npm run build` -- expected: API and web compile.
