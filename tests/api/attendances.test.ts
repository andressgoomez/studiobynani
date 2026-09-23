import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
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
    expect(cash.json().quote).toMatchObject({ discountCents: 220000, finalAmountCents: 1980000 });
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
      discountCents: 220000, finalAmountCents: 1980000, commissionCents: 1386000, amountToNaniCents: 594000
    });
  });

  it('no descuenta maquillaje ni servicios de LEDIS en efectivo', async () => {
    const nani = await authenticated('nani');
    const makeup = await nani.app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie: nani.cookie },
      payload: { clientName: 'Ana Pérez', serviceId: 'maquillaje-social', paymentMethod: 'cash' }
    });
    expect(makeup.json().attendance).toMatchObject({ discountCents: 0, finalAmountCents: 10000000, commissionCents: 10000000, amountToNaniCents: 0 });

    const ledis = await authenticated('ledis');
    const facial = await ledis.app.inject({
      method: 'POST', url: '/api/v1/attendances', headers: { cookie: ledis.cookie },
      payload: { clientName: 'Ana Pérez', serviceId: 'limpieza-extracciones', paymentMethod: 'cash' }
    });
    expect(facial.json().attendance).toMatchObject({ discountCents: 0, finalAmountCents: 3800000, commissionCents: 2660000, amountToNaniCents: 1140000 });
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
});
