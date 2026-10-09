import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient, type DailyRemittance } from '@prisma/client';
import { buildApp } from '../../apps/api/src/app.js';

function businessDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

describe('entregas', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  const clients: PrismaClient[] = [];
  let sharedApp: Awaited<ReturnType<typeof buildApp>> | null = null;
  afterEach(async () => {
    sharedApp = null;
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(clients.splice(0).map((prisma) => prisma.$disconnect()));
  });

  async function authenticated(userId = 'lula') {
    if (!sharedApp) {
      sharedApp = buildApp();
      apps.push(sharedApp);
      await sharedApp.ready();
    }
    const login = await sharedApp.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId, pin: '1234' } });
    const header = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'][0] : login.headers['set-cookie'];
    if (!header) throw new Error(`No se pudo iniciar sesión de ${userId}: ${login.statusCode} ${login.body}`);
    return { app: sharedApp, cookie: header.split(';')[0] };
  }

  function database() {
    const prisma = new PrismaClient();
    clients.push(prisma);
    return prisma;
  }

  async function seedAttendance(prisma: PrismaClient, employeeId: string, when: Date, amountToNaniCents = 660000) {
    const id = randomUUID();
    await prisma.attendance.create({
      data: {
        id,
        employeeId,
        clientName: 'Rechequeo entregas prueba',
        serviceId: employeeId === 'ledis' ? 'limpieza-extracciones' : 'perfilado-cejas',
        paymentMethod: 'transfer',
        status: 'performed',
        baseAmountCents: amountToNaniCents,
        discountCents: 0,
        finalAmountCents: amountToNaniCents,
        commissionCents: 0,
        amountToNaniCents,
        createdAt: when,
        updatedAt: when
      }
    });
    return id;
  }

  async function rememberRemittance(prisma: PrismaClient, date: string, employeeId: string) {
    const remittance = await prisma.dailyRemittance.findUnique({ where: { businessDate_employeeId: { businessDate: date, employeeId } } });
    const audits = await prisma.auditLog.findMany({ where: { entityType: 'DailyRemittance', entityId: `${date}:${employeeId}` }, select: { id: true } });
    return { remittance, auditIds: new Set(audits.map((audit) => audit.id)) };
  }

  async function restoreRemittance(prisma: PrismaClient, date: string, employeeId: string, previous: DailyRemittance | null, auditIds: Set<string>, attendanceIds: string[]) {
    if (attendanceIds.length) {
      await prisma.attendance.deleteMany({ where: { id: { in: attendanceIds } } });
      await prisma.auditLog.deleteMany({ where: { entityType: 'Attendance', entityId: { in: attendanceIds } } });
    }
    if (previous) {
      await prisma.dailyRemittance.upsert({
        where: { businessDate_employeeId: { businessDate: date, employeeId } },
        update: { amountCents: previous.amountCents, sentAt: previous.sentAt, receivedAt: previous.receivedAt, receivedById: previous.receivedById },
        create: { id: previous.id, businessDate: previous.businessDate, employeeId: previous.employeeId, amountCents: previous.amountCents, sentAt: previous.sentAt, receivedAt: previous.receivedAt, receivedById: previous.receivedById }
      });
    } else {
      await prisma.dailyRemittance.deleteMany({ where: { businessDate: date, employeeId } });
    }
    const audits = await prisma.auditLog.findMany({ where: { entityType: 'DailyRemittance', entityId: `${date}:${employeeId}` }, select: { id: true } });
    const created = audits.map((audit) => audit.id).filter((id) => !auditIds.has(id));
    if (created.length) await prisma.auditLog.deleteMany({ where: { id: { in: created } } });
  }

  it('marca enviado con sentAt y sin receivedAt', async () => {
    const employee = await authenticated('lula');
    const nani = await authenticated('nani');
    const prisma = database();
    const when = new Date('2020-06-16T15:00:00.000Z');
    const date = businessDate(when);
    const previous = await rememberRemittance(prisma, date, 'lula');
    const attendanceIds = [await seedAttendance(prisma, 'lula', when, 660000)];
    try {
      const sent = await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } });
      expect(sent.statusCode).toBe(200);
      expect(sent.json().remittance.sentAt).toEqual(expect.any(String));
      expect(sent.json().remittance.receivedAt).toBeNull();
      const listed = await nani.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${date.slice(0, 7)}`, headers: { cookie: nani.cookie } });
      expect(listed.json().remittances).toEqual(expect.arrayContaining([expect.objectContaining({ date, employeeId: 'lula', status: 'enviado', amountCents: 660000 })]));

      await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/mark-received`, headers: { cookie: nani.cookie } });
      attendanceIds.push(await seedAttendance(prisma, 'lula', when, 100));
      const resent = await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } });
      expect(resent.statusCode).toBe(200);
      expect(resent.json().remittance).toMatchObject({ amountCents: 660100, receivedAt: null });
      expect(resent.json().remittance.sentAt).toEqual(expect.any(String));
    } finally {
      await restoreRemittance(prisma, date, 'lula', previous.remittance, previous.auditIds, attendanceIds);
      const restored = await prisma.dailyRemittance.findUnique({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      if (!previous.remittance) expect(restored).toBeNull();
      else expect(restored).toMatchObject({ amountCents: previous.remittance.amountCents, sentAt: previous.remittance.sentAt, receivedAt: previous.remittance.receivedAt, receivedById: previous.remittance.receivedById });
    }
  });

  it('NANI marca recibido cuando el envío cubre lo adeudado y sale de pendientes', async () => {
    const employee = await authenticated('lula');
    const nani = await authenticated('nani');
    const prisma = database();
    const when = new Date('2020-06-17T15:00:00.000Z');
    const date = businessDate(when);
    const previous = await rememberRemittance(prisma, date, 'lula');
    const attendanceIds = [await seedAttendance(prisma, 'lula', when)];
    try {
      const beforePending = await nani.app.inject({ method: 'GET', url: '/api/v1/admin/daily-remittances/pending', headers: { cookie: nani.cookie } });
      expect(beforePending.json().pending).toEqual(expect.arrayContaining([expect.objectContaining({ date, employeeId: 'lula' })]));
      expect((await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } })).statusCode).toBe(200);
      const received = await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/mark-received`, headers: { cookie: nani.cookie } });
      expect(received.statusCode).toBe(200);
      expect(received.json().remittance.receivedAt).toEqual(expect.any(String));
      expect(received.json().remittance.receivedById).toBe('nani');
      expect(received.json().remittance.sentAt).toEqual(expect.any(String));
      const summary = await nani.app.inject({ method: 'GET', url: `/api/v1/admin/daily-summary?date=${date}`, headers: { cookie: nani.cookie } });
      expect(summary.json().remittances).toEqual(expect.arrayContaining([expect.objectContaining({ employeeId: 'lula', receivedAt: received.json().remittance.receivedAt })]));
      const pending = await nani.app.inject({ method: 'GET', url: '/api/v1/admin/daily-remittances/pending', headers: { cookie: nani.cookie } });
      expect(pending.json().pending.some((item: { date: string; employeeId: string }) => item.date === date && item.employeeId === 'lula')).toBe(false);
      const listed = await nani.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${date.slice(0, 7)}`, headers: { cookie: nani.cookie } });
      expect(listed.json().remittances).toEqual(expect.arrayContaining([expect.objectContaining({ date, employeeId: 'lula', status: 'recibido' })]));
      expect(await prisma.auditLog.findFirst({ where: { action: 'remittance.marked_received', entityId: `${date}:lula` } })).toBeTruthy();
      attendanceIds.push(await seedAttendance(prisma, 'lula', when, 100));
      const resent = await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/mark-sent`, headers: { cookie: nani.cookie } });
      expect(resent.statusCode).toBe(200);
      expect(resent.json().remittance.receivedAt).toBeNull();
      expect(resent.json().remittance.amountCents).toBe(660100);
    } finally {
      await restoreRemittance(prisma, date, 'lula', previous.remittance, previous.auditIds, attendanceIds);
    }
  });

  it('quitar recibido vuelve la fila a enviado y conserva el envío', async () => {
    const employee = await authenticated('lula');
    const nani = await authenticated('nani');
    const prisma = database();
    const when = new Date('2020-06-18T15:00:00.000Z');
    const date = businessDate(when);
    const previous = await rememberRemittance(prisma, date, 'lula');
    const attendanceIds = [await seedAttendance(prisma, 'lula', when)];
    try {
      const sent = await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } });
      expect(sent.statusCode).toBe(200);
      const received = await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/mark-received`, headers: { cookie: nani.cookie } });
      expect(received.statusCode).toBe(200);
      const forbidden = await employee.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/clear-received`, headers: { cookie: employee.cookie } });
      expect(forbidden.statusCode).toBe(403);
      const stillReceived = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      expect(stillReceived.receivedAt?.toISOString()).toBe(received.json().remittance.receivedAt);
      const cleared = await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/clear-received`, headers: { cookie: nani.cookie } });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().remittance.receivedAt).toBeNull();
      expect(cleared.json().remittance.sentAt).toBe(received.json().remittance.sentAt);
      expect(cleared.json().remittance.amountCents).toBe(received.json().remittance.amountCents);
      const listed = await nani.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${date.slice(0, 7)}`, headers: { cookie: nani.cookie } });
      expect(listed.json().remittances).toEqual(expect.arrayContaining([expect.objectContaining({ date, employeeId: 'lula', status: 'enviado' })]));
      const pending = await nani.app.inject({ method: 'GET', url: '/api/v1/admin/daily-remittances/pending', headers: { cookie: nani.cookie } });
      expect(pending.json().pending.some((item: { date: string; employeeId: string }) => item.date === date && item.employeeId === 'lula')).toBe(false);
      expect(await prisma.auditLog.findFirst({ where: { action: 'remittance.receipt_cleared', entityId: `${date}:lula` } })).toBeTruthy();
    } finally {
      await restoreRemittance(prisma, date, 'lula', previous.remittance, previous.auditIds, attendanceIds);
    }
  });

  it('no recibe una fila sin envío', async () => {
    const nani = await authenticated('nani');
    const employee = await authenticated('lula');
    const prisma = database();
    const when = new Date('2020-06-19T15:00:00.000Z');
    const date = businessDate(when);
    const previous = await rememberRemittance(prisma, date, 'lula');
    const attendanceIds = [await seedAttendance(prisma, 'lula', when)];
    try {
      await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } });
      await prisma.dailyRemittance.update({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } }, data: { sentAt: null, receivedAt: null, receivedById: null } });
      const before = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      const response = await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/mark-received`, headers: { cookie: nani.cookie } });
      expect(response.statusCode).toBe(409);
      const after = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      expect(after.sentAt).toBeNull();
      expect(after.receivedAt).toBeNull();
      expect(after.amountCents).toBe(before.amountCents);
      expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    } finally {
      await restoreRemittance(prisma, date, 'lula', previous.remittance, previous.auditIds, attendanceIds);
    }
  });

  it('no recibe un envío menor a lo adeudado', async () => {
    const employee = await authenticated('lula');
    const nani = await authenticated('nani');
    const prisma = database();
    const when = new Date('2020-06-20T15:00:00.000Z');
    const date = businessDate(when);
    const previous = await rememberRemittance(prisma, date, 'lula');
    const attendanceIds = [await seedAttendance(prisma, 'lula', when)];
    try {
      await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } });
      await prisma.dailyRemittance.update({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } }, data: { amountCents: 1 } });
      const before = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      const response = await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/mark-received`, headers: { cookie: nani.cookie } });
      expect(response.statusCode).toBe(409);
      const after = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      expect(after.amountCents).toBe(1);
      expect(after.receivedAt).toBeNull();
      expect(after.sentAt?.toISOString()).toBe(before.sentAt?.toISOString());
      expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    } finally {
      await restoreRemittance(prisma, date, 'lula', previous.remittance, previous.auditIds, attendanceIds);
    }
  });

  it('una empleada no puede marcar recibido', async () => {
    const employee = await authenticated('lula');
    const prisma = database();
    const when = new Date('2020-06-21T15:00:00.000Z');
    const date = businessDate(when);
    const previous = await rememberRemittance(prisma, date, 'lula');
    const attendanceIds = [await seedAttendance(prisma, 'lula', when)];
    try {
      await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } });
      const before = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      const response = await employee.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${date}/lula/mark-received`, headers: { cookie: employee.cookie } });
      expect(response.statusCode).toBe(403);
      const after = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
      expect(after.receivedAt).toBeNull();
      expect(after.sentAt?.toISOString()).toBe(before.sentAt?.toISOString());
      expect(after.amountCents).toBe(before.amountCents);
      expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    } finally {
      await restoreRemittance(prisma, date, 'lula', previous.remittance, previous.auditIds, attendanceIds);
    }
  });

  it('incluye la venta de producto completada en lo adeudado', async () => {
    const employee = await authenticated('lula');
    const nani = await authenticated('nani');
    const prisma = database();
    const when = new Date('2020-06-22T15:00:00.000Z');
    const date = businessDate(when);
    const amountToNaniCents = 250000;
    const previous = await rememberRemittance(prisma, date, 'lula');
    const saleId = randomUUID();
    await prisma.productSale.create({
      data: {
        id: saleId, sellerId: 'lula', clientName: 'Rechequeo venta producto', paymentMethod: 'transfer',
        totalCents: amountToNaniCents, profitCents: amountToNaniCents, employeeCommissionCents: 0,
        amountToNaniCents, commonBoxCents: 0, status: 'completed', createdAt: when
      }
    });
    try {
      const pending = await nani.app.inject({ method: 'GET', url: '/api/v1/admin/daily-remittances/pending', headers: { cookie: nani.cookie } });
      expect(pending.json().pending).toEqual(expect.arrayContaining([expect.objectContaining({ date, employeeId: 'lula', amountCents: amountToNaniCents })]));
      const listed = await nani.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${date.slice(0, 7)}`, headers: { cookie: nani.cookie } });
      expect(listed.json().remittances).toEqual(expect.arrayContaining([expect.objectContaining({ date, employeeId: 'lula', amountCents: amountToNaniCents })]));
      const summary = await nani.app.inject({ method: 'GET', url: `/api/v1/admin/daily-summary?date=${date}`, headers: { cookie: nani.cookie } });
      expect(summary.json().employees).toEqual(expect.arrayContaining([expect.objectContaining({ employeeId: 'lula', amountToNaniCents, productAmountToNaniCents: amountToNaniCents })]));
      const sent = await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${date}/mark-sent`, headers: { cookie: employee.cookie } });
      expect(sent.statusCode).toBe(200);
      expect(sent.json().remittance.amountCents).toBe(amountToNaniCents);
    } finally {
      await prisma.productSale.deleteMany({ where: { id: saleId } });
      await restoreRemittance(prisma, date, 'lula', previous.remittance, previous.auditIds, []);
    }
  });

  it('crear o editar una atención anula enviado y recibido', async () => {
    const employee = await authenticated('lula');
    const nani = await authenticated('nani');
    const prisma = database();
    const today = businessDate(new Date());
    const previous = await rememberRemittance(prisma, today, 'lula');
    const attendanceIds: string[] = [];
    try {
      const created = await employee.app.inject({
        method: 'POST', url: '/api/v1/attendances', headers: { cookie: employee.cookie },
        payload: { clientName: 'Rechequeo entregas prueba', serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
      });
      expect(created.statusCode).toBe(201);
      attendanceIds.push(created.json().attendance.id);
      expect((await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${today}/mark-sent`, headers: { cookie: employee.cookie } })).statusCode).toBe(200);
      expect((await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${today}/lula/mark-received`, headers: { cookie: nani.cookie } })).statusCode).toBe(200);

      const edited = await employee.app.inject({
        method: 'PATCH', url: `/api/v1/attendances/${attendanceIds[0]}`, headers: { cookie: employee.cookie },
        payload: { clientName: 'Rechequeo entregas editada', serviceId: 'perfilado-cejas', paymentMethod: 'transfer', status: 'performed' }
      });
      expect(edited.statusCode).toBe(200);
      const afterEdit = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: today, employeeId: 'lula' } } });
      expect(afterEdit.sentAt).toBeNull();
      expect(afterEdit.receivedAt).toBeNull();

      expect((await employee.app.inject({ method: 'POST', url: `/api/v1/daily-remittances/${today}/mark-sent`, headers: { cookie: employee.cookie } })).statusCode).toBe(200);
      expect((await nani.app.inject({ method: 'POST', url: `/api/v1/admin/daily-remittances/${today}/lula/mark-received`, headers: { cookie: nani.cookie } })).statusCode).toBe(200);
      const second = await employee.app.inject({
        method: 'POST', url: '/api/v1/attendances', headers: { cookie: employee.cookie },
        payload: { clientName: 'Rechequeo entregas nueva', serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
      });
      expect(second.statusCode).toBe(201);
      attendanceIds.push(second.json().attendance.id);
      const afterCreate = await prisma.dailyRemittance.findUniqueOrThrow({ where: { businessDate_employeeId: { businessDate: today, employeeId: 'lula' } } });
      expect(afterCreate.sentAt).toBeNull();
      expect(afterCreate.receivedAt).toBeNull();
    } finally {
      await restoreRemittance(prisma, today, 'lula', previous.remittance, previous.auditIds, attendanceIds);
    }
  });

  it('lista el mes para NANI y para la empleada, incluye hoy y rechaza un mes inválido', async () => {
    const lula = await authenticated('lula');
    const lola = await authenticated('lola');
    const nani = await authenticated('nani');
    const prisma = database();
    const newer = new Date('2020-06-16T15:00:00.000Z');
    const older = new Date('2020-06-10T15:00:00.000Z');
    const newerDate = businessDate(newer);
    const olderDate = businessDate(older);
    const month = newerDate.slice(0, 7);
    const today = businessDate(new Date());
    const lulaNewer = await rememberRemittance(prisma, newerDate, 'lula');
    const lulaOlder = await rememberRemittance(prisma, olderDate, 'lula');
    const lolaNewer = await rememberRemittance(prisma, newerDate, 'lola');
    const naniNewer = await rememberRemittance(prisma, newerDate, 'nani');
    const lulaToday = await rememberRemittance(prisma, today, 'lula');
    const attendanceIds = [
      await seedAttendance(prisma, 'lola', newer),
      await seedAttendance(prisma, 'lula', newer),
      await seedAttendance(prisma, 'lula', older),
      await seedAttendance(prisma, 'nani', newer, 50000)
    ];
    let todayAttendanceId = '';
    try {
      const before = await nani.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${today.slice(0, 7)}`, headers: { cookie: nani.cookie } });
      const beforeAmount = (before.json().remittances as Array<{ date: string; employeeId: string; amountCents: number }>).find((row) => row.date === today && row.employeeId === 'lula')?.amountCents ?? 0;
      const created = await lula.app.inject({
        method: 'POST', url: '/api/v1/attendances', headers: { cookie: lula.cookie },
        payload: { clientName: 'Rechequeo entregas hoy', serviceId: 'perfilado-cejas', paymentMethod: 'transfer' }
      });
      expect(created.statusCode).toBe(201);
      todayAttendanceId = created.json().attendance.id;
      const added = created.json().attendance.amountToNaniCents as number;

      const adminList = await nani.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${month}`, headers: { cookie: nani.cookie } });
      expect(adminList.statusCode).toBe(200);
      const adminRows = (adminList.json().remittances as Array<{ date: string; employeeId: string; status: string }>).filter((row) => (row.employeeId === 'lula' || row.employeeId === 'lola') && (row.date === newerDate || row.date === olderDate));
      expect(adminRows.map((row) => `${row.date}:${row.employeeId}`)).toEqual([
        `${newerDate}:lola`,
        `${newerDate}:lula`,
        `${olderDate}:lula`
      ]);
      expect(adminRows.every((row) => row.status === 'pendiente')).toBe(true);
      expect(adminList.json().remittances.some((row: { employeeId: string }) => row.employeeId === 'nani')).toBe(false);

      const lulaList = await lula.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${month}`, headers: { cookie: lula.cookie } });
      expect(lulaList.json().remittances.every((row: { employeeId: string }) => row.employeeId === 'lula')).toBe(true);
      expect(lulaList.json().remittances.some((row: { date: string }) => row.date === newerDate)).toBe(true);

      const todayList = await nani.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${today.slice(0, 7)}`, headers: { cookie: nani.cookie } });
      const todayRow = (todayList.json().remittances as Array<{ date: string; employeeId: string; amountCents: number }>).find((row) => row.date === today && row.employeeId === 'lula');
      expect(todayRow?.amountCents).toBe(beforeAmount + added);
      const lolaTodayList = await lola.app.inject({ method: 'GET', url: `/api/v1/daily-remittances?month=${today.slice(0, 7)}`, headers: { cookie: lola.cookie } });
      expect(lolaTodayList.json().remittances.every((row: { employeeId: string }) => row.employeeId === 'lola')).toBe(true);
      expect(lulaList.json().remittances.some((row: { employeeId: string }) => row.employeeId === 'lola')).toBe(false);

      expect((await nani.app.inject({ method: 'GET', url: '/api/v1/daily-remittances?month=2026-13', headers: { cookie: nani.cookie } })).statusCode).toBe(400);
      expect((await lola.app.inject({ method: 'GET', url: '/api/v1/daily-remittances?month=junio', headers: { cookie: lola.cookie } })).statusCode).toBe(400);
      expect((await nani.app.inject({ method: 'GET', url: '/api/v1/daily-remittances', headers: { cookie: nani.cookie } })).statusCode).toBe(400);
    } finally {
      if (todayAttendanceId) attendanceIds.push(todayAttendanceId);
      await restoreRemittance(prisma, newerDate, 'lula', lulaNewer.remittance, lulaNewer.auditIds, attendanceIds);
      await restoreRemittance(prisma, olderDate, 'lula', lulaOlder.remittance, lulaOlder.auditIds, []);
      await restoreRemittance(prisma, newerDate, 'lola', lolaNewer.remittance, lolaNewer.auditIds, []);
      await restoreRemittance(prisma, newerDate, 'nani', naniNewer.remittance, naniNewer.auditIds, []);
      await restoreRemittance(prisma, today, 'lula', lulaToday.remittance, lulaToday.auditIds, []);
    }
  });
});
