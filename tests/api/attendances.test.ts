import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { calculateAttendanceAmounts } from '@studiobynani/domain';
import { buildApp } from '../../apps/api/src/app.js';

describe('atenciones', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => { await Promise.all(apps.map((app) => app.close())); apps.length = 0; });

  async function authenticated(userId = 'lula') {
    const app = buildApp(); apps.push(app); await app.ready();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId, pin: '1234' } });
    const header = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'][0] : login.headers['set-cookie'];
    return { app, cookie: header?.split(';')[0] };
  }

  it('devuelve solo servicios habilitados para la sesión', async () => {
    const { app, cookie } = await authenticated('ledis');
    const response = await app.inject({ method: 'GET', url: '/api/v1/attendances/services', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().services.every((service: { id: string }) => service.id.startsWith('limpieza-') || service.id.startsWith('peeling-') || service.id.startsWith('dermapen-') || service.id === 'hydra-lips' || service.id === 'recuperacion-capilar' || service.id === 'experiencia-skincare')).toBe(true);
  });

  it('cotiza transferencia y efectivo con las reglas financieras del servidor', async () => {
    const { app, cookie } = await authenticated('lula');
    const transfer = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
    });
    expect(transfer.statusCode).toBe(200);
    expect(transfer.json().quote).toMatchObject({
      baseAmountCents: 2200000, discountCents: 0, finalAmountCents: 2200000,
      commissionCents: 1540000, amountToNaniCents: 660000
    });

    const cash = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'perfilado-cejas', paymentMethod: 'cash' }
    });
    expect(cash.statusCode).toBe(200);
    expect(cash.json().quote).toMatchObject({
      discountCents: 200000, finalAmountCents: 2000000, commissionCents: 1400000, amountToNaniCents: 600000
    });
    expect(calculateAttendanceAmounts('lola', { id: 'perfilado-cejas', name: 'Perfilado', baseAmountCents: 2200000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 200000, finalAmountCents: 2000000, commissionCents: 1200000, amountToNaniCents: 800000
    });
    expect(calculateAttendanceAmounts('lula', { id: 'laminado-cejas', name: 'Laminado', baseAmountCents: 2200000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 220000, finalAmountCents: 1980000
    });

    const comboTransfer = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'combo-ideal', paymentMethod: 'transfer' }
    });
    expect(comboTransfer.statusCode).toBe(200);
    expect(comboTransfer.json().quote).toMatchObject({
      baseAmountCents: 4600000, discountCents: 0, finalAmountCents: 4600000
    });
    const comboCash = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'combo-ideal', paymentMethod: 'cash' }
    });
    expect(comboCash.statusCode).toBe(200);
    expect(comboCash.json().quote).toMatchObject({
      discountCents: 400000, finalAmountCents: 4200000, commissionCents: 2940000, amountToNaniCents: 1260000
    });
    expect(calculateAttendanceAmounts('lola', { id: 'combo-ideal', name: 'Combo Ideal', baseAmountCents: 4600000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 400000, finalAmountCents: 4200000, commissionCents: 2520000, amountToNaniCents: 1680000
    });
    expect(calculateAttendanceAmounts('nani', { id: 'combo-ideal', name: 'Combo Ideal', baseAmountCents: 4600000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 400000, finalAmountCents: 4200000, commissionCents: 4200000, amountToNaniCents: 0
    });
    expect(calculateAttendanceAmounts('ledis', { id: 'combo-ideal', name: 'Combo Ideal', baseAmountCents: 4600000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 0, finalAmountCents: 4600000
    });
    expect(calculateAttendanceAmounts('lula', { id: 'combo-ideal', name: 'Combo Ideal', baseAmountCents: 4000000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 0, finalAmountCents: 4000000
    });
    expect(calculateAttendanceAmounts('lula', { id: 'combo-ideal', name: 'Combo Ideal', baseAmountCents: 5000000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 800000, finalAmountCents: 4200000
    });

    const perfectoTransfer = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'combo-perfecto-x3', paymentMethod: 'transfer' }
    });
    expect(perfectoTransfer.statusCode).toBe(200);
    expect(perfectoTransfer.json().quote).toMatchObject({
      baseAmountCents: 5400000, discountCents: 0, finalAmountCents: 5400000,
      commissionCents: 3780000, amountToNaniCents: 1620000
    });
    const perfectoCash = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'combo-perfecto-x3', paymentMethod: 'cash' }
    });
    expect(perfectoCash.statusCode).toBe(200);
    expect(perfectoCash.json().quote).toMatchObject({
      discountCents: 600000, finalAmountCents: 4800000, commissionCents: 3360000, amountToNaniCents: 1440000
    });
    expect(calculateAttendanceAmounts('lola', { id: 'combo-perfecto-x3', name: 'Combo Perfecto', baseAmountCents: 5400000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 600000, finalAmountCents: 4800000, commissionCents: 2880000, amountToNaniCents: 1920000
    });
    expect(calculateAttendanceAmounts('nani', { id: 'combo-perfecto-x3', name: 'Combo Perfecto', baseAmountCents: 5400000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 600000, finalAmountCents: 4800000, commissionCents: 4800000, amountToNaniCents: 0
    });
    expect(calculateAttendanceAmounts('ledis', { id: 'combo-perfecto-x3', name: 'Combo Perfecto', baseAmountCents: 5400000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 0, finalAmountCents: 5400000, commissionCents: 3780000, amountToNaniCents: 1620000
    });
    expect(calculateAttendanceAmounts('lula', { id: 'combo-perfecto-x3', name: 'Combo Perfecto', baseAmountCents: 4500000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 0, finalAmountCents: 4500000
    });
    expect(calculateAttendanceAmounts('lula', { id: 'combo-perfecto-x3', name: 'Combo Perfecto', baseAmountCents: 4800000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 0, finalAmountCents: 4800000, commissionCents: 3360000, amountToNaniCents: 1440000
    });
    expect(calculateAttendanceAmounts('lula', { id: 'combo-perfecto-x3', name: 'Combo Perfecto', baseAmountCents: 6000000 }, 'cash', 'performed')).toMatchObject({
      discountCents: 1200000, finalAmountCents: 4800000, commissionCents: 3360000, amountToNaniCents: 1440000
    });
  });

  it('no descuenta maquillaje en la cotización y rechaza servicio ajeno', async () => {
    const { app, cookie } = await authenticated('nani');
    const makeup = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'maquillaje-social', paymentMethod: 'cash' }
    });
    expect(makeup.statusCode).toBe(200);
    expect(makeup.json().quote).toMatchObject({ discountCents: 0, finalAmountCents: 10000000 });

    const invalid = await app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie },
      payload: { serviceId: 'limpieza-extracciones', paymentMethod: 'transfer' }
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('crea una atención usando la identidad de la sesión y calcula importes', async () => {
    const { app, cookie } = await authenticated();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie },
      payload: {
        clientName: '  Ana Pérez  ', serviceId: 'perfilado-cejas', paymentMethod: 'cash', employeeId: 'lola',
        baseAmountCents: 1, discountCents: 1, finalAmountCents: 1, commissionCents: 1, amountToNaniCents: 1
      }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().attendance).toMatchObject({
      employeeId: 'lula', clientName: 'Ana Pérez', baseAmountCents: 2200000,
      discountCents: 200000, finalAmountCents: 2000000, commissionCents: 1400000, amountToNaniCents: 600000
    });
  });

  it('no descuenta maquillaje ni servicios de LEDIS en efectivo', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const nani = await authenticated('nani');
    const listed = await nani.app.inject({ method: 'GET', url: '/api/v1/admin/service-assignments', headers: { cookie: nani.cookie } });
    const originalServiceIds = listed.json().assignments.find((assignment: { employeeId: string }) => assignment.employeeId === 'ledis').serviceIds;
    const serviceId = 'limpieza-extracciones';
    expect((await nani.app.inject({
      method: 'PATCH', url: '/api/v1/admin/service-assignments/ledis', headers: { cookie: nani.cookie },
      payload: { serviceIds: [...new Set([...originalServiceIds, serviceId])] }
    })).statusCode).toBe(200);

    const createdAttendanceIds: string[] = [];
    let restoreStatus = 0;
    try {
      await prisma.user.update({ where: { id: 'nani' }, data: { services: { connect: { id: 'maquillaje-social' } } } });
      const makeup = await nani.app.inject({
        method: 'POST', url: '/api/v1/attendances', headers: { cookie: nani.cookie },
        payload: { clientName: 'Ana Pérez', serviceId: 'maquillaje-social', paymentMethod: 'cash' }
      });
      createdAttendanceIds.push(makeup.json().attendance.id);
      expect(makeup.json().attendance).toMatchObject({ discountCents: 0, finalAmountCents: 10000000, commissionCents: 10000000, amountToNaniCents: 0 });

      const ledis = await authenticated('ledis');
      const facial = await ledis.app.inject({
        method: 'POST', url: '/api/v1/attendances', headers: { cookie: ledis.cookie },
        payload: { clientName: 'Ana Pérez', serviceId, paymentMethod: 'cash' }
      });
      createdAttendanceIds.push(facial.json().attendance.id);
      expect(facial.json().attendance).toMatchObject({ discountCents: 0, finalAmountCents: 4000000, commissionCents: 2800000, amountToNaniCents: 1200000 });
    } finally {
      try {
        restoreStatus = (await nani.app.inject({
          method: 'PATCH', url: '/api/v1/admin/service-assignments/ledis', headers: { cookie: nani.cookie },
          payload: { serviceIds: originalServiceIds }
        })).statusCode;
      } finally {
        await prisma.user.update({ where: { id: 'nani' }, data: { services: { disconnect: { id: 'maquillaje-social' } } } });
        if (createdAttendanceIds.length) await prisma.attendance.deleteMany({ where: { id: { in: createdAttendanceIds } } });
        await prisma.$disconnect();
      }
      expect(restoreStatus).toBe(200);
    }
  });

  it('registra canceladas y ausentes sin importes y rechaza estados inválidos', async () => {
    const { app, cookie } = await authenticated('lula');
    const before = await app.inject({ method: 'GET', url: '/api/v1/attendances/recent', headers: { cookie } });
    expect(before.statusCode).toBe(200);
    for (const [status, clientName] of [['cancelled', 'Cliente cancelada'], ['absent', 'Cliente ausente']] as const) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/attendances', headers: { cookie },
        payload: { clientName, serviceId: 'perfilado-cejas', paymentMethod: 'cash', status }
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().attendance).toMatchObject({
        clientName, status, baseAmountCents: 0, discountCents: 0, finalAmountCents: 0,
        commissionCents: 0, amountToNaniCents: 0
      });
    }
    const recent = await app.inject({ method: 'GET', url: '/api/v1/attendances/recent', headers: { cookie } });
    expect(recent.json().attendances.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientName: 'Cliente cancelada', status: 'cancelled', finalAmountCents: 0 }),
      expect.objectContaining({ clientName: 'Cliente ausente', status: 'absent', finalAmountCents: 0 })
    ]));

    const invalid = await app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie },
      payload: { clientName: 'Cliente inválida', serviceId: 'perfilado-cejas', paymentMethod: 'cash', status: 'unknown' }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields.status).toBeTruthy();
    const after = await app.inject({ method: 'GET', url: '/api/v1/attendances/recent', headers: { cookie } });
    expect(after.json().attendances.some((attendance: { clientName: string }) => attendance.clientName === 'Cliente inválida')).toBe(false);
  });

  it('rechaza datos faltantes, servicio ajeno y peticiones sin sesión', async () => {
    const { app, cookie } = await authenticated();
    expect((await app.inject({ method: 'POST', url: '/api/v1/attendances', headers: { cookie }, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/attendances', headers: { cookie }, payload: { clientName: 'Ana', serviceId: 'limpieza-extracciones', paymentMethod: 'transfer' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/attendances/quote', payload: { serviceId: 'perfilado-cejas', paymentMethod: 'transfer' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/attendances/recent' })).statusCode).toBe(401);
  });

  it('lee una atención persistida después de recrear la instancia de la API', async () => {
    const first = await authenticated('lula');
    const created = await first.app.inject({
      method: 'POST',
      url: '/api/v1/attendances',
      headers: { cookie: first.cookie },
      payload: { clientName: 'Persistencia SQLite', serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
    });
    expect(created.statusCode).toBe(201);
    const createdAttendance = created.json().attendance;
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);

    const second = await authenticated('lula');
    const recent = await second.app.inject({
      method: 'GET',
      url: '/api/v1/attendances/recent',
      headers: { cookie: second.cookie }
    });
    expect(recent.statusCode).toBe(200);
    expect(recent.json().attendances).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: createdAttendance.id, clientName: 'Persistencia SQLite' })
    ]));
  });

  it('permite editar una atención propia reciente y recalcula sus importes', async () => {
    const { app, cookie } = await authenticated('lula');
    const created = await app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie },
      payload: { clientName: 'Cliente original', serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
    });
    const id = created.json().attendance.id;
    const detail = await app.inject({ method: 'GET', url: `/api/v1/attendances/${id}`, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ canEdit: true, attendance: { id, clientName: 'Cliente original' } });

    const updated = await app.inject({
      method: 'PATCH', url: `/api/v1/attendances/${id}`, headers: { cookie },
      payload: { clientName: 'Cliente corregida', serviceId: 'perfilado-cejas', paymentMethod: 'cash', status: 'cancelled', finalAmountCents: 1 }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().attendance).toMatchObject({
      clientName: 'Cliente corregida', status: 'cancelled', baseAmountCents: 0, discountCents: 0, finalAmountCents: 0,
      commissionCents: 0, amountToNaniCents: 0
    });
    expect(updated.json().attendance.updatedAt).toBeTruthy();

    const invalid = await app.inject({
      method: 'PATCH', url: `/api/v1/attendances/${id}`, headers: { cookie },
      payload: { clientName: 'No debe cambiar', serviceId: 'perfilado-cejas', paymentMethod: 'cash', status: 'unknown' }
    });
    expect(invalid.statusCode).toBe(400);
    const unchanged = await app.inject({ method: 'GET', url: `/api/v1/attendances/${id}`, headers: { cookie } });
    expect(unchanged.json().attendance).toMatchObject({ clientName: 'Cliente corregida', status: 'cancelled', finalAmountCents: 0 });
  });

  it('rechaza una edición inválida sin modificar la atención', async () => {
    const { app, cookie } = await authenticated('lula');
    const created = await app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie },
      payload: { clientName: 'Cliente protegida', serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
    });
    const id = created.json().attendance.id;

    const invalid = await app.inject({
      method: 'PATCH', url: `/api/v1/attendances/${id}`, headers: { cookie },
      payload: { clientName: '', serviceId: 'servicio-inexistente', paymentMethod: 'cash' }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields).toMatchObject({
      clientName: expect.any(String)
    });

    const unchanged = await app.inject({ method: 'GET', url: `/api/v1/attendances/${id}`, headers: { cookie } });
    expect(unchanged.json().attendance).toMatchObject({
      clientName: 'Cliente protegida',
      finalAmountCents: 2200000
    });
  });

  it('rechaza editar una atención vencida o ajena y nunca la elimina', async () => {
    const owner = await authenticated('lula');
    const created = await owner.app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie: owner.cookie },
      payload: { clientName: 'Atención vencida', serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
    });
    const id = created.json().attendance.id;
    const prisma = new PrismaClient();
    await prisma.attendance.update({ where: { id }, data: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    await prisma.$disconnect();

    const expired = await owner.app.inject({
      method: 'PATCH', url: `/api/v1/attendances/${id}`, headers: { cookie: owner.cookie },
      payload: { clientName: 'No debe cambiar', serviceId: 'perfilado-cejas', paymentMethod: 'cash' }
    });
    expect(expired.statusCode).toBe(403);

    const other = await authenticated('lola');
    expect((await other.app.inject({ method: 'GET', url: `/api/v1/attendances/${id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404);
    expect((await other.app.inject({
      method: 'PATCH', url: `/api/v1/attendances/${id}`, headers: { cookie: other.cookie },
      payload: { clientName: 'No debe cambiar', serviceId: 'perfilado-cejas', paymentMethod: 'cash' }
    })).statusCode).toBe(404);
    expect((await owner.app.inject({ method: 'DELETE', url: `/api/v1/attendances/${id}`, headers: { cookie: owner.cookie } })).statusCode).toBe(405);
  });

  it('permite a NANI administrar el catálogo sin alterar importes históricos', async () => {
    const nani = await authenticated('nani');
    const employee = await authenticated('lula');
    const denied = await employee.app.inject({
      method: 'GET', url: '/api/v1/admin/services', headers: { cookie: employee.cookie }
    });
    expect(denied.statusCode).toBe(403);
    const invalid = await nani.app.inject({
      method: 'POST', url: '/api/v1/admin/services', headers: { cookie: nani.cookie },
      payload: { name: '', category: 'Pruebas', baseAmountCents: 0, durationMinutes: 0 }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields).toMatchObject({
      name: expect.any(String), baseAmountCents: expect.any(String), durationMinutes: expect.any(String)
    });

    const created = await nani.app.inject({
      method: 'POST', url: '/api/v1/admin/services', headers: { cookie: nani.cookie },
      payload: { name: 'Servicio catálogo test', category: 'Pruebas', baseAmountCents: 12345, durationMinutes: 40 }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().service).toMatchObject({
      name: 'Servicio catálogo test', category: 'Pruebas', baseAmountCents: 12345, durationMinutes: 40, active: true
    });
    const serviceId = created.json().service.id;

    const attendance = await employee.app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie: employee.cookie },
      payload: { clientName: 'Histórica catálogo', serviceId, paymentMethod: 'transfer' }
    });
    expect(attendance.statusCode).toBe(201);
    expect(attendance.json().attendance).toMatchObject({ baseAmountCents: 12345, finalAmountCents: 12345 });

    const updated = await nani.app.inject({
      method: 'PATCH', url: `/api/v1/admin/services/${serviceId}`, headers: { cookie: nani.cookie },
      payload: { baseAmountCents: 99999, category: 'Actualizada' }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().service).toMatchObject({ baseAmountCents: 99999, category: 'Actualizada' });

    const recent = await employee.app.inject({
      method: 'GET', url: '/api/v1/attendances/recent', headers: { cookie: employee.cookie }
    });
    expect(recent.json().attendances).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientName: 'Histórica catálogo', baseAmountCents: 12345, finalAmountCents: 12345 })
    ]));

    const disabled = await nani.app.inject({
      method: 'PATCH', url: `/api/v1/admin/services/${serviceId}`, headers: { cookie: nani.cookie },
      payload: { active: false }
    });
    expect(disabled.statusCode).toBe(200);
    const unavailable = await employee.app.inject({
      method: 'POST', url: '/api/v1/attendances/quote', headers: { cookie: employee.cookie },
      payload: { serviceId, paymentMethod: 'transfer' }
    });
    expect(unavailable.statusCode).toBe(400);
  });

  it('permite a NANI persistir habilitaciones y las valida en el servidor', async () => {
    const nani = await authenticated('nani');
    const employee = await authenticated('lola');
    const listed = await nani.app.inject({
      method: 'GET', url: '/api/v1/admin/service-assignments', headers: { cookie: nani.cookie }
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().employees).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'lola', role: 'EMPLOYEE' })]));
    const originalServiceIds = listed.json().assignments.find((assignment: { employeeId: string }) => assignment.employeeId === 'lola').serviceIds;
    const serviceId = 'limpieza-extracciones';

    const denied = await employee.app.inject({
      method: 'PATCH', url: '/api/v1/admin/service-assignments/lola', headers: { cookie: employee.cookie },
      payload: { serviceIds: [serviceId] }
    });
    expect(denied.statusCode).toBe(403);

    const assigned = await nani.app.inject({
      method: 'PATCH', url: '/api/v1/admin/service-assignments/lola', headers: { cookie: nani.cookie },
      payload: { serviceIds: [serviceId] }
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json()).toEqual({ employeeId: 'lola', serviceIds: [serviceId] });
    expect((await employee.app.inject({ method: 'GET', url: '/api/v1/attendances/services', headers: { cookie: employee.cookie } })).json().services)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: serviceId })]));

    const unassigned = await nani.app.inject({
      method: 'PATCH', url: '/api/v1/admin/service-assignments/lola', headers: { cookie: nani.cookie },
      payload: { serviceIds: originalServiceIds }
    });
    expect(unassigned.statusCode).toBe(200);
    const rejected = await employee.app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie: employee.cookie },
      payload: { clientName: 'Servicio no habilitado', serviceId, paymentMethod: 'transfer' }
    });
    expect(rejected.statusCode).toBe(400);
  });

  async function catalogServices(session: Awaited<ReturnType<typeof authenticated>>) {
    const response = await session.app.inject({ method: 'GET', url: '/api/v1/admin/services', headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    return response.json().services as Array<{ id: string; active: boolean; name: string }>;
  }

  async function selectorIds(session: Awaited<ReturnType<typeof authenticated>>) {
    const response = await session.app.inject({ method: 'GET', url: '/api/v1/attendances/services', headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    return (response.json().services as Array<{ id: string }>).map((service) => service.id);
  }

  async function saveOrder(session: Awaited<ReturnType<typeof authenticated>>, serviceIds: string[]) {
    return session.app.inject({
      method: 'PUT', url: '/api/v1/admin/services/order', headers: { cookie: session.cookie },
      payload: { serviceIds }
    });
  }

  async function deleteService(id: string) {
    const prisma = new PrismaClient();
    try { await prisma.service.delete({ where: { id } }); }
    finally { await prisma.$disconnect(); }
  }

  it('guarda el orden de los activos y lo repite en catálogo, selector y servicios por empleada', async () => {
    const nani = await authenticated('nani');
    const before = await catalogServices(nani);
    const activeIds = before.filter((service) => service.active).map((service) => service.id);
    const inactiveIds = before.filter((service) => !service.active).map((service) => service.id);
    const enabledBefore = await selectorIds(nani);
    expect(activeIds.length).toBeGreaterThan(1);
    const reordered = [...activeIds].reverse();
    try {
      const saved = await saveOrder(nani, reordered);
      expect(saved.statusCode).toBe(200);
      const catalog = await catalogServices(nani);
      expect(catalog.filter((service) => service.active).map((service) => service.id)).toEqual(reordered);
      expect(catalog.filter((service) => !service.active).map((service) => service.id)).toEqual(inactiveIds);
      expect(await selectorIds(nani)).toEqual(reordered.filter((id) => enabledBefore.includes(id)));
      const assignments = await nani.app.inject({ method: 'GET', url: '/api/v1/admin/service-assignments', headers: { cookie: nani.cookie } });
      expect(assignments.statusCode).toBe(200);
      expect((assignments.json().services as Array<{ id: string; active: boolean }>).filter((service) => service.active).map((service) => service.id)).toEqual(reordered);
    } finally {
      expect((await saveOrder(nani, activeIds)).statusCode).toBe(200);
    }
  });

  it('conserva el orden relativo en el selector de una empleada con solo algunos servicios', async () => {
    const nani = await authenticated('nani');
    const employee = await authenticated('lola');
    const before = await catalogServices(nani);
    const activeIds = before.filter((service) => service.active).map((service) => service.id);
    expect(activeIds.length).toBeGreaterThan(2);
    const listed = await nani.app.inject({ method: 'GET', url: '/api/v1/admin/service-assignments', headers: { cookie: nani.cookie } });
    const originalServiceIds = listed.json().assignments.find((assignment: { employeeId: string }) => assignment.employeeId === 'lola').serviceIds as string[];
    const kept = [activeIds[0], activeIds[2]];
    const reordered = [...activeIds];
    const moved = reordered.splice(reordered.indexOf(activeIds[2]), 1)[0];
    reordered.splice(reordered.indexOf(activeIds[0]), 0, moved);
    try {
      expect((await nani.app.inject({
        method: 'PATCH', url: '/api/v1/admin/service-assignments/lola', headers: { cookie: nani.cookie },
        payload: { serviceIds: kept }
      })).statusCode).toBe(200);
      expect(await selectorIds(employee)).toEqual(kept);
      expect((await saveOrder(nani, reordered)).statusCode).toBe(200);
      const selector = await selectorIds(employee);
      expect(selector).toEqual([activeIds[2], activeIds[0]]);
      expect(selector).not.toContain(activeIds[1]);
      for (const service of before.filter((item) => !item.active)) expect(selector).not.toContain(service.id);
    } finally {
      const restored = await saveOrder(nani, activeIds);
      const assignments = await nani.app.inject({
        method: 'PATCH', url: '/api/v1/admin/service-assignments/lola', headers: { cookie: nani.cookie },
        payload: { serviceIds: originalServiceIds }
      });
      expect(restored.statusCode).toBe(200);
      expect(assignments.statusCode).toBe(200);
    }
  });

  it('rechaza una lista incompleta, duplicada o con un id desconocido y no cambia el orden', async () => {
    const nani = await authenticated('nani');
    const catalog = await catalogServices(nani);
    const before = catalog.map((service) => service.id);
    const activeIds = catalog.filter((service) => service.active).map((service) => service.id);
    const inactiveId = catalog.find((service) => !service.active)?.id;
    const message = 'Indicá cada servicio activo una sola vez, sin repetidos ni ids desconocidos.';
    const attempts = [
      [...activeIds, 'servicio-que-no-existe'],
      activeIds.slice(1),
      [...activeIds, activeIds[0]],
      ...(inactiveId ? [[...activeIds, inactiveId]] : [])
    ];
    try {
      for (const serviceIds of attempts) {
        const rejected = await saveOrder(nani, serviceIds);
        expect(rejected.statusCode).toBe(400);
        expect(rejected.json().error.message).toBe(message);
        expect((await catalogServices(nani)).map((service) => service.id)).toEqual(before);
      }
      const notAList = await nani.app.inject({
        method: 'PUT', url: '/api/v1/admin/services/order', headers: { cookie: nani.cookie },
        payload: { serviceIds: 'perfilado-cejas' }
      });
      expect(notAList.statusCode).toBe(400);
      expect(notAList.json().error.message).toBe(message);
      expect((await catalogServices(nani)).map((service) => service.id)).toEqual(before);
    } finally {
      expect((await saveOrder(nani, activeIds)).statusCode).toBe(200);
    }
  });

  it('no deja que una empleada guarde el orden', async () => {
    const nani = await authenticated('nani');
    const employee = await authenticated('lula');
    const before = (await catalogServices(nani)).map((service) => service.id);
    const activeIds = (await catalogServices(nani)).filter((service) => service.active).map((service) => service.id);
    const denied = await employee.app.inject({
      method: 'PUT', url: '/api/v1/admin/services/order', headers: { cookie: employee.cookie },
      payload: { serviceIds: [...activeIds].reverse() }
    });
    expect(denied.statusCode).toBe(403);
    expect((await catalogServices(nani)).map((service) => service.id)).toEqual(before);
  });

  it('ubica un servicio nuevo al final de los activos y no lo mueve al editar nombre, precio o duración', async () => {
    const nani = await authenticated('nani');
    const created = await nani.app.inject({
      method: 'POST', url: '/api/v1/admin/services', headers: { cookie: nani.cookie },
      payload: { name: 'Orden servicio nuevo', category: 'Pruebas', baseAmountCents: 1500, durationMinutes: 15 }
    });
    expect(created.statusCode).toBe(201);
    const serviceId = created.json().service.id as string;
    try {
      const catalog = await catalogServices(nani);
      const activeIds = catalog.filter((service) => service.active).map((service) => service.id);
      expect(activeIds.at(-1)).toBe(serviceId);
      expect(catalog.slice(catalog.findIndex((service) => service.id === serviceId) + 1).every((service) => !service.active)).toBe(true);
      const order = catalog.map((service) => service.id);
      const updated = await nani.app.inject({
        method: 'PATCH', url: `/api/v1/admin/services/${serviceId}`, headers: { cookie: nani.cookie },
        payload: { name: 'Orden servicio editado', baseAmountCents: 1800, durationMinutes: 20 }
      });
      expect(updated.statusCode).toBe(200);
      expect((await catalogServices(nani)).map((service) => service.id)).toEqual(order);
    } finally {
      await deleteService(serviceId);
    }
  });

  it('manda un servicio desactivado al final de la lista y lo oculta en el selector', async () => {
    const nani = await authenticated('nani');
    const created = await nani.app.inject({
      method: 'POST', url: '/api/v1/admin/services', headers: { cookie: nani.cookie },
      payload: { name: 'Orden servicio a desactivar', category: 'Pruebas', baseAmountCents: 1500, durationMinutes: 15 }
    });
    const serviceId = created.json().service.id as string;
    try {
      const disabled = await nani.app.inject({
        method: 'PATCH', url: `/api/v1/admin/services/${serviceId}`, headers: { cookie: nani.cookie },
        payload: { active: false }
      });
      expect(disabled.statusCode).toBe(200);
      const catalog = await catalogServices(nani);
      expect(catalog.at(-1)?.id).toBe(serviceId);
      expect(catalog.at(-1)?.active).toBe(false);
      expect(await selectorIds(nani)).not.toContain(serviceId);
    } finally {
      await deleteService(serviceId);
    }
  });

  it('al volver a activar deja el servicio al final de los activos y en el selector', async () => {
    const nani = await authenticated('nani');
    const created = await nani.app.inject({
      method: 'POST', url: '/api/v1/admin/services', headers: { cookie: nani.cookie },
      payload: { name: 'Orden servicio a reactivar', category: 'Pruebas', baseAmountCents: 1500, durationMinutes: 15 }
    });
    const serviceId = created.json().service.id as string;
    try {
      expect((await nani.app.inject({
        method: 'PATCH', url: `/api/v1/admin/services/${serviceId}`, headers: { cookie: nani.cookie },
        payload: { active: false }
      })).statusCode).toBe(200);
      const enabled = await nani.app.inject({
        method: 'PATCH', url: `/api/v1/admin/services/${serviceId}`, headers: { cookie: nani.cookie },
        payload: { active: true }
      });
      expect(enabled.statusCode).toBe(200);
      const catalog = await catalogServices(nani);
      expect(catalog.filter((service) => service.active).at(-1)?.id).toBe(serviceId);
      expect(catalog.slice(catalog.findIndex((service) => service.id === serviceId) + 1).every((service) => !service.active)).toBe(true);
      expect((await selectorIds(nani)).at(-1)).toBe(serviceId);
    } finally {
      await deleteService(serviceId);
    }
  });

  it('deja el inactivo detrás al crear, reordenar, desactivar, reactivar y eliminar', async () => {
    const nani = await authenticated('nani');
    const originalActive = (await catalogServices(nani)).filter((service) => service.active).map((service) => service.id);
    const createdIds: string[] = [];
    const create = async (name: string) => {
      const response = await nani.app.inject({
        method: 'POST', url: '/api/v1/admin/services', headers: { cookie: nani.cookie },
        payload: { name, category: 'Pruebas de orden', baseAmountCents: 1500, durationMinutes: 15 }
      });
      expect(response.statusCode).toBe(201);
      const id = response.json().service.id as string;
      createdIds.push(id);
      return id;
    };
    try {
      const alpha = await create('Orden ancla inactiva');
      const beta = await create('Orden fila a eliminar');
      expect((await nani.app.inject({
        method: 'PATCH', url: `/api/v1/admin/services/${alpha}`, headers: { cookie: nani.cookie },
        payload: { active: false }
      })).statusCode).toBe(200);
      let catalog = await catalogServices(nani);
      expect(catalog.at(-1)?.id).toBe(alpha);
      expect(catalog.filter((service) => service.active).at(-1)?.id).toBe(beta);

      const gamma = await create('Orden fila nueva');
      catalog = await catalogServices(nani);
      expect(catalog.filter((service) => service.active).at(-1)?.id).toBe(gamma);
      expect(catalog.at(-1)?.id).toBe(alpha);

      const activeIds = catalog.filter((service) => service.active).map((service) => service.id);
      const reordered = [gamma, ...activeIds.filter((id) => id !== gamma)];
      expect((await saveOrder(nani, reordered)).statusCode).toBe(200);
      catalog = await catalogServices(nani);
      expect(catalog.filter((service) => service.active).map((service) => service.id)).toEqual(reordered);
      expect(catalog.at(-1)?.id).toBe(alpha);

      const rejected = await saveOrder(nani, [...reordered, alpha]);
      expect(rejected.statusCode).toBe(400);
      expect((await catalogServices(nani)).map((service) => service.id)).toEqual(catalog.map((service) => service.id));

      const removed = await nani.app.inject({
        method: 'DELETE', url: `/api/v1/admin/services/${beta}`, headers: { cookie: nani.cookie }
      });
      expect(removed.statusCode).toBe(200);
      catalog = await catalogServices(nani);
      expect(catalog.at(-1)?.id).toBe(beta);
      expect(catalog.at(-2)?.id).toBe(alpha);
      expect(catalog.find((service) => service.id === beta)?.active).toBe(false);

      expect((await nani.app.inject({
        method: 'PATCH', url: `/api/v1/admin/services/${alpha}`, headers: { cookie: nani.cookie },
        payload: { active: true }
      })).statusCode).toBe(200);
      catalog = await catalogServices(nani);
      expect(catalog.filter((service) => service.active).at(-1)?.id).toBe(alpha);
      expect(catalog.at(-1)?.id).toBe(beta);
    } finally {
      for (const id of createdIds) await deleteService(id);
      expect((await saveOrder(nani, originalActive)).statusCode).toBe(200);
    }
  });
});
