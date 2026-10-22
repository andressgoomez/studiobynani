# Reglas financieras y catálogo inicial

## Empleadas

- NANI conserva el 100% del precio final de sus atenciones.
- LULA recibe el 70%; entrega a NANI el 30%.
- LOLA recibe el 60%; entrega a NANI el 40%.
- LEDIS recibe el 70%; entrega a NANI el 30%.
- La comisión se calcula sobre el precio final cobrado.
- La persona que realiza la atención recibe directamente el pago de la clienta.

## Pago y descuentos

- El precio informado en el catálogo es el precio de transferencia.
- La clienta paga el total en efectivo o transferencia; no se permiten pagos combinados.
- Los servicios de NANI, LULA y LOLA que no sean de maquillaje tienen 10% de descuento en efectivo, salvo el perfilado de cejas: en efectivo se cobra $20.000.
- Los servicios de LEDIS no tienen descuento en efectivo.
- Los servicios de maquillaje no tienen descuento, incluyendo maquillaje social, maquillaje + perfilado y clase de automaquillaje.
- Canceladas y ausentes no generan cargo, comisión ni entrega a NANI.

## Catálogo y precios informados

Los precios son configurables y cada atención conserva el precio aplicado. Los siguientes son los valores actuales de transferencia informados:

### Servicios de NANI, LULA y LOLA

- Perfilado de cejas — $22.000 por transferencia; $20.000 en efectivo (el 10% es simbólico, no $19.800) — 30 minutos.
- Lash Lifting — $35.000 — 1 hora.
- Combo Ideal (perfilado de cejas + lash lifting, con o sin tinte) — $46.000 — 1 hora 30 minutos.
- Combo Perfecto x3 (perfilado, laminado + lash lifting, con o sin tinte) — $54.000 — 1 hora 30 minutos.
- Combo Full Cejas (perfilado + laminado y nutrición) — $38.000 — 1 hora.
- Combo laminado de cejas sin perfilado + lifting con tinte — $43.000 — 1 hora.
- Maquillaje social — $100.000 — 1 hora.
- Maquillaje + perfilado de cejas — $120.000 — 1 hora 30 minutos.
- Clase de automaquillaje — $70.000 — 2 horas 30 minutos.

### Servicios de LEDIS

- Limpieza profunda + extracciones — $38.000 — 1 hora 15 minutos.
- Limpieza facial profunda + masajes faciales — $40.000 — 1 hora 15 minutos.
- Limpieza facial + dermaplaning — $45.000 — 1 hora 20 minutos.
- Limpieza facial + drenaje linfático — $40.000 — 1 hora 15 minutos.
- Peeling enzimático — $48.000 — 1 hora 15 minutos.
- Peeling químico — $48.000 — 1 hora 15 minutos.
- Dermapen Glow con activos concentrados — $49.000 — 1 hora 30 minutos.
- Dermapen Premium con exosomas — $59.000 — 1 hora 30 minutos.
- Hydra Lips con Dermapen — $35.000 — 45 minutos.
- Sesión recuperación capilar (Dermapen capilar) — $65.000 — 1 hora 30 minutos.
- Experiencia Skincare: educación cutánea y skincare — $45.000 — 1 hora.

## Fórmulas de liquidación

- `precioFinal = precioTransferencia` cuando el medio de pago es transferencia.
- `precioFinal = min(precioTransferencia, 20000)` para Perfilado de cejas en efectivo. Con el precio actual se descuentan $2.000 y se cobra $20.000. Si el catálogo baja de $20.000, no hay descuento.
- `precioFinal = precioTransferencia * 0,90` para el resto de los servicios que corresponden descuento en efectivo.
- `comisionEmpleada = precioFinal * porcentajeEmpleada`.
- `entregaANani = precioFinal - comisionEmpleada` para LULA, LOLA y LEDIS.
- `entregaANani = 0` para NANI.
- Los resultados se redondean en centavos enteros y se guardan como snapshot de la atención.
