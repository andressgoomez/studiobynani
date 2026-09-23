import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ACTIVE_USERS, type Attendance, type ChangeEmployeePinRequest, type CreateAttendanceRequest, type CreateServiceRequest, type LoginRequest, type SessionUser, type UpdateAttendanceRequest, type UpdateEmployeeStatusRequest, type UpdateServiceRequest } from '@studiobynani/contracts';
import { calculateAttendanceAmounts, can, DEFAULT_USERS, hashPin, INITIAL_SERVICES, verifyPin } from '@studiobynani/domain';

const SESSION_COOKIE = 'studiobynani_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ATTENDANCE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
type StoredSession = SessionUser & { expiresAt: number };
const sessions = new Map<string, StoredSession>();

function invalid(reply: FastifyReply) {
  return reply.code(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o PIN inválido.' } });
}

function getSession(request: FastifyRequest): SessionUser | undefined {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

function validation(reply: FastifyReply, fields: Record<string, string>) {
  return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.', fields } });
}

function businessDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | undefined> {
  const session = getSession(request);
  if (!session) {
    await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida.' } });
    return undefined;
  }
  return session;
}

export function buildApp(): FastifyInstance {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const databasePath = path.join(projectRoot, 'prisma', 'data', 'studiobynani.sqlite');
  mkdirSync(path.dirname(databasePath), { recursive: true });
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === 'file:./data/studiobynani.sqlite') {
    process.env.DATABASE_URL = `file:${databasePath}`;
  }
  const prisma = new PrismaClient();
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.addHook('onReady', async () => {
    await prisma.$transaction(async (transaction) => {
      for (const user of DEFAULT_USERS) {
        await transaction.user.upsert({
          where: { id: user.id },
          update: { displayName: user.displayName, role: user.role },
          create: { id: user.id, displayName: user.displayName, role: user.role, active: user.active, pinHash: user.pinHash }
        });
      }
      for (const service of INITIAL_SERVICES) {
        await transaction.service.upsert({
          where: { id: service.id },
          update: {},
          create: {
            id: service.id,
            name: service.name,
            category: service.category,
            baseAmountCents: service.baseAmountCents,
            durationMinutes: service.durationMinutes,
            active: service.active,
            employees: { connect: service.enabledFor.map((id) => ({ id })) }
          }
        });
      }
    });
  });
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  app.get('/api/v1/health', async () => ({ status: 'ok' }));

  app.get('/api/v1/auth/users', async () => ({ users: ACTIVE_USERS }));

  app.post<{ Body: LoginRequest }>('/api/v1/auth/login', async (request, reply) => {
    const body = request.body ?? ({} as LoginRequest);
    if (typeof body.userId !== 'string' || typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin)) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.', fields: { pin: 'Ingresá un PIN de 4 dígitos.' } }
      });
    }
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user || !user.active || !verifyPin(body.pin, user.pinHash)) return invalid(reply);

    const sessionId = randomBytes(32).toString('base64url');
    const sessionUser: StoredSession = {
      id: user.id as SessionUser['id'], displayName: user.displayName, role: user.role as SessionUser['role'], sessionId,
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    sessions.set(sessionId, sessionUser);
    return reply.setCookie(SESSION_COOKIE, sessionId, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: SESSION_TTL_MS / 1000
    }).send({ user: { id: user.id, displayName: user.displayName, role: user.role } });
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) sessions.delete(token);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });

  app.get('/api/v1/auth/session', async (request, reply) => {
    const session = await requireSession(request, reply);
    return session ? { user: { id: session.id, displayName: session.displayName, role: session.role } } : undefined;
  });

  function serviceResponse(service: { id: string; name: string; category: string; baseAmountCents: number; durationMinutes: number; active: boolean; employees?: { id: string }[] }) {
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      baseAmountCents: service.baseAmountCents,
      durationMinutes: service.durationMinutes,
      active: service.active,
      enabledFor: (service.employees ?? []).map((employee) => employee.id)
    };
  }

  function serviceValidation(body: Partial<CreateServiceRequest & UpdateServiceRequest>, requireAll: boolean) {
    const fields: Record<string, string> = {};
    if (requireAll || body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) fields.name = 'Ingresá un nombre.';
    }
    if (requireAll || body.category !== undefined) {
      if (typeof body.category !== 'string' || !body.category.trim()) fields.category = 'Ingresá una categoría.';
    }
    if (requireAll || body.baseAmountCents !== undefined) {
      if (!Number.isInteger(body.baseAmountCents) || Number(body.baseAmountCents) <= 0) fields.baseAmountCents = 'El precio debe ser mayor a cero en centavos.';
    }
    if (requireAll || body.durationMinutes !== undefined) {
      if (!Number.isInteger(body.durationMinutes) || Number(body.durationMinutes) <= 0) fields.durationMinutes = 'La duración debe ser positiva.';
    }
    if (body.active !== undefined && typeof body.active !== 'boolean') fields.active = 'Indicá si el servicio está activo.';
    return fields;
  }

  app.get('/api/v1/admin/services', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'admin:read')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const persisted = await prisma.service.findMany({ include: { employees: true }, orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] });
    return { services: persisted.map(serviceResponse) };
  });

  app.post<{ Body: Partial<CreateServiceRequest> }>('/api/v1/admin/services', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'admin:write')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const body = request.body ?? {};
    const fields = serviceValidation(body, true);
    if (Object.keys(fields).length) return validation(reply, fields);
    const created = await prisma.service.create({
      data: {
        id: randomUUID(),
        name: body.name!.trim(),
        category: body.category!.trim(),
        baseAmountCents: body.baseAmountCents!,
        durationMinutes: body.durationMinutes!,
        active: true,
        employees: { connect: DEFAULT_USERS.filter((user) => user.active).map((user) => ({ id: user.id })) }
      },
      include: { employees: true }
    });
    return reply.code(201).send({ service: serviceResponse(created) });
  });

  app.patch<{ Params: { id: string }; Body: UpdateServiceRequest }>('/api/v1/admin/services/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'admin:write')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const body = request.body ?? {};
    const fields = serviceValidation(body, false);
    if (Object.keys(fields).length) return validation(reply, fields);
    const existing = await prisma.service.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Servicio no encontrado.' } });
    const updated = await prisma.service.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.category !== undefined ? { category: body.category.trim() } : {}),
        ...(body.baseAmountCents !== undefined ? { baseAmountCents: body.baseAmountCents } : {}),
        ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
        ...(body.active !== undefined ? { active: body.active } : {})
      },
      include: { employees: true }
    });
    return { service: serviceResponse(updated) };
  });

  app.get('/api/v1/admin/service-assignments', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:read')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const [employees, persisted] = await Promise.all([
      prisma.user.findMany({ where: { active: true, role: 'EMPLOYEE' }, include: { services: { select: { id: true } } }, orderBy: { displayName: 'asc' } }),
      prisma.service.findMany({ include: { employees: { select: { id: true } } }, orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] })
    ]);
    return {
      employees: employees.map((employee) => ({
        id: employee.id,
        displayName: employee.displayName,
        role: employee.role
      })),
      services: persisted.map(serviceResponse),
      assignments: employees.map((employee) => ({
        employeeId: employee.id,
        serviceIds: employee.services.map((service) => service.id)
      }))
    };
  });

  app.patch<{ Params: { employeeId: string }; Body: { serviceIds?: unknown } }>('/api/v1/admin/service-assignments/:employeeId', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:write')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const serviceIds = request.body?.serviceIds;
    if (!Array.isArray(serviceIds) || serviceIds.some((serviceId) => typeof serviceId !== 'string')) {
      return validation(reply, { serviceIds: 'Indicá una lista válida de servicios.' });
    }
    const employee = await prisma.user.findFirst({ where: { id: request.params.employeeId, active: true, role: 'EMPLOYEE' } });
    if (!employee) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'La empleada no es válida.' } });
    const uniqueServiceIds = [...new Set(serviceIds)];
    const services = await prisma.service.findMany({ where: { id: { in: uniqueServiceIds } }, select: { id: true } });
    if (services.length !== uniqueServiceIds.length) return validation(reply, { serviceIds: 'Hay servicios inválidos.' });
    const updated = await prisma.user.update({
      where: { id: employee.id },
      data: { services: { set: uniqueServiceIds.map((id) => ({ id })) } },
      include: { services: { select: { id: true } } }
    });
    return { employeeId: updated.id, serviceIds: updated.services.map((service) => service.id) };
  });

  app.get('/api/v1/attendances/services', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const persisted = await prisma.service.findMany({
      where: { active: true, employees: { some: { id: session.id } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    return { services: persisted.map((service) => ({ ...service, enabledFor: [session.id] })) };
  });

  app.post<{ Body: { serviceId?: unknown; paymentMethod?: unknown; status?: unknown } }>('/api/v1/attendances/quote', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'attendance:write:own')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const body = request.body ?? {};
    const fields: Record<string, string> = {};
    if (typeof body.serviceId !== 'string' || !body.serviceId) fields.serviceId = 'Elegí un servicio.';
    if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'transfer') fields.paymentMethod = 'Elegí efectivo o transferencia.';
    if (body.status !== undefined && body.status !== 'performed' && body.status !== 'cancelled' && body.status !== 'absent') fields.status = 'Elegí un estado válido.';
    if (Object.keys(fields).length) return validation(reply, fields);
    if (await prisma.dailyClosure.findFirst({ where: { businessDate: businessDate(new Date()), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'DAY_CLOSED', message: 'El cierre del día ya fue confirmado por NANI.' } });
    }
    if (await prisma.monthlyClosure.findFirst({ where: { month: businessDate(new Date()).slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'MONTH_CLOSED', message: 'El cierre mensual ya fue confirmado por NANI.' } });
    }

    const service = await prisma.service.findFirst({ where: { id: body.serviceId as string, active: true, employees: { some: { id: session.id } } } });
    if (!service) return validation(reply, { serviceId: 'El servicio no está habilitado para tu usuario.' });

    return {
      quote: {
        serviceId: service.id,
        serviceName: service.name,
        ...calculateAttendanceAmounts(session.id, service, body.paymentMethod as 'cash' | 'transfer', (body.status ?? 'performed') as 'performed' | 'cancelled' | 'absent')
      }
    };
  });

  app.post<{ Body: Partial<CreateAttendanceRequest> }>('/api/v1/attendances', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'attendance:write:own')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const body = request.body ?? {};
    const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
    const fields: Record<string, string> = {};
    if (!clientName) fields.clientName = 'Ingresá el nombre completo de la clienta.';
    if (typeof body.serviceId !== 'string' || !body.serviceId) fields.serviceId = 'Elegí un servicio.';
    if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'transfer') fields.paymentMethod = 'Elegí efectivo o transferencia.';
    if (body.status !== undefined && body.status !== 'performed' && body.status !== 'cancelled' && body.status !== 'absent') fields.status = 'Elegí un estado válido.';
    if (Object.keys(fields).length) return validation(reply, fields);

    const service = await prisma.service.findFirst({ where: { id: body.serviceId as string, active: true, employees: { some: { id: session.id } } } });
    if (!service) return validation(reply, { serviceId: 'El servicio no está habilitado para tu usuario.' });
    const status = body.status ?? 'performed';
    const amounts = calculateAttendanceAmounts(session.id, service, body.paymentMethod!, status);
    const createdAt = new Date().toISOString();
    const attendance: Attendance = {
      id: randomUUID(),
      employeeId: session.id,
      clientName,
      serviceId: service.id,
      serviceName: service.name,
      paymentMethod: body.paymentMethod!,
      status,
      ...amounts,
      createdAt,
      updatedAt: createdAt
    };
    const persisted = await prisma.attendance.create({
      data: {
        id: attendance.id,
        employeeId: attendance.employeeId,
        clientName: attendance.clientName,
        serviceId: attendance.serviceId,
        paymentMethod: attendance.paymentMethod,
        status: attendance.status,
        baseAmountCents: attendance.baseAmountCents,
        discountCents: attendance.discountCents,
        finalAmountCents: attendance.finalAmountCents,
        commissionCents: attendance.commissionCents,
        amountToNaniCents: attendance.amountToNaniCents,
        createdAt: new Date(attendance.createdAt),
        updatedAt: new Date(attendance.updatedAt)
      },
      include: { service: true }
    });
    await prisma.dailyRemittance.updateMany({
      where: { businessDate: businessDate(new Date(attendance.createdAt)), employeeId: session.id, sentAt: { not: null } },
      data: { sentAt: null }
    });
    return reply.code(201).send({
      attendance: {
        ...attendance,
        serviceName: persisted.service.name,
        createdAt: persisted.createdAt.toISOString()
      }
    });
  });

  app.get('/api/v1/attendances/recent', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'attendance:read:own')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const persisted = await prisma.attendance.findMany({
      where: { employeeId: session.id },
      include: { service: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return {
      attendances: persisted.map((attendance) => ({
        id: attendance.id,
        employeeId: attendance.employeeId,
        clientName: attendance.clientName,
        serviceId: attendance.serviceId,
        serviceName: attendance.service.name,
        paymentMethod: attendance.paymentMethod,
        status: attendance.status,
        baseAmountCents: attendance.baseAmountCents,
        discountCents: attendance.discountCents,
        finalAmountCents: attendance.finalAmountCents,
        commissionCents: attendance.commissionCents,
        amountToNaniCents: attendance.amountToNaniCents,
        createdAt: attendance.createdAt.toISOString(),
        updatedAt: attendance.updatedAt.toISOString()
      }))
    };
  });

  app.get<{ Querystring: { date?: string } }>('/api/v1/admin/daily-summary', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const date = request.query.date ?? businessDate(new Date());
    const persisted = await prisma.attendance.findMany({ include: { employee: true, service: true } });
    const daily = persisted.filter((attendance) =>
      businessDate(attendance.createdAt) === date && (session.role === 'ADMIN' || attendance.employeeId === session.id)
    );
    const activeEmployees = session.role === 'ADMIN'
      ? await prisma.user.findMany({ where: { active: true }, orderBy: { displayName: 'asc' } })
      : await prisma.user.findMany({ where: { id: session.id } });
    const employees = new Map<string, {
      employeeId: string; employeeName: string; attentions: number; performed: number;
      totalCents: number; commissionCents: number; amountToNaniCents: number; cashCents: number; transferCents: number;
    }>();
    for (const employee of activeEmployees) {
      employees.set(employee.id, {
        employeeId: employee.id, employeeName: employee.displayName,
        attentions: 0, performed: 0, totalCents: 0, commissionCents: 0, amountToNaniCents: 0, cashCents: 0, transferCents: 0
      });
    }
    for (const attendance of daily) {
      const current = employees.get(attendance.employeeId) ?? {
        employeeId: attendance.employeeId, employeeName: attendance.employee.displayName,
        attentions: 0, performed: 0, totalCents: 0, commissionCents: 0, amountToNaniCents: 0, cashCents: 0, transferCents: 0
      };
      current.attentions += 1;
      if (attendance.status === 'performed') {
        current.performed += 1;
        current.totalCents += attendance.finalAmountCents;
        current.commissionCents += attendance.commissionCents;
        current.amountToNaniCents += attendance.amountToNaniCents;
        if (attendance.paymentMethod === 'cash') current.cashCents += attendance.finalAmountCents;
        else current.transferCents += attendance.finalAmountCents;
      }
      employees.set(attendance.employeeId, current);
    }
    const totals = [...employees.values()].reduce((sum, employee) => ({
      attentions: sum.attentions + employee.attentions,
      performed: sum.performed + employee.performed,
      totalCents: sum.totalCents + employee.totalCents,
      amountToNaniCents: sum.amountToNaniCents + employee.amountToNaniCents
    }), { attentions: 0, performed: 0, totalCents: 0, amountToNaniCents: 0 });
    const remittances = await prisma.dailyRemittance.findMany({ where: { businessDate: date } });
    return {
      date,
      employees: [...employees.values()],
      totals,
      remittances: remittances.map((remittance) => ({
        employeeId: remittance.employeeId,
        amountCents: remittance.amountCents,
        sentAt: remittance.sentAt?.toISOString() ?? null
      })),
      attendances: daily
        .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
        .map((attendance) => ({
          id: attendance.id,
          employeeName: attendance.employee.displayName,
          clientName: attendance.clientName,
          serviceName: attendance.service.name,
          status: attendance.status,
          paymentMethod: attendance.paymentMethod,
          finalAmountCents: attendance.finalAmountCents,
          commissionCents: attendance.commissionCents,
          amountToNaniCents: attendance.amountToNaniCents,
          createdAt: attendance.createdAt.toISOString()
        }))
    };
  });

  app.get<{ Params: { date: string } }>('/api/v1/daily-closures/:date', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const closure = await prisma.dailyClosure.findUnique({ where: { businessDate: request.params.date } });
    return { closure: closure ? { businessDate: closure.businessDate, confirmedAt: closure.confirmedAt.toISOString(), reopenedAt: closure.reopenedAt?.toISOString() ?? null } : null };
  });

  app.post<{ Body: { date?: unknown } }>('/api/v1/daily-closures', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede confirmar el cierre.' } });
    const date = typeof request.body.date === 'string' ? request.body.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return validation(reply, { date: 'La fecha no es válida.' });
    const closure = await prisma.dailyClosure.upsert({
      where: { businessDate: date },
      update: { confirmedAt: new Date(), confirmedById: session.id, reopenedAt: null, reopenedById: null },
      create: { id: randomUUID(), businessDate: date, confirmedAt: new Date(), confirmedById: session.id }
    });
    return { closure: { businessDate: closure.businessDate, confirmedAt: closure.confirmedAt.toISOString(), reopenedAt: null } };
  });

  app.post<{ Params: { date: string } }>('/api/v1/daily-closures/:date/reopen', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede reabrir el cierre.' } });
    const closure = await prisma.dailyClosure.findUnique({ where: { businessDate: request.params.date } });
    if (!closure) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No hay un cierre para esa fecha.' } });
    const updated = await prisma.dailyClosure.update({ where: { businessDate: request.params.date }, data: { reopenedAt: new Date(), reopenedById: session.id } });
    return { closure: { businessDate: updated.businessDate, confirmedAt: updated.confirmedAt.toISOString(), reopenedAt: updated.reopenedAt?.toISOString() ?? null } };
  });

  app.post<{ Params: { date: string } }>('/api/v1/daily-remittances/:date/mark-sent', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'EMPLOYEE') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo las empleadas pueden marcar su entrega.' } });
    const date = request.params.date;
    const amountCents = (await prisma.attendance.findMany({ where: { employeeId: session.id } }))
      .filter((attendance) => businessDate(attendance.createdAt) === date && attendance.status === 'performed')
      .reduce((total, attendance) => total + attendance.amountToNaniCents, 0);
    const remittance = await prisma.dailyRemittance.upsert({
      where: { businessDate_employeeId: { businessDate: date, employeeId: session.id } },
      update: { amountCents, sentAt: new Date() },
      create: { id: randomUUID(), businessDate: date, employeeId: session.id, amountCents, sentAt: new Date() }
    });
    return { remittance: { employeeId: remittance.employeeId, amountCents: remittance.amountCents, sentAt: remittance.sentAt?.toISOString() ?? null } };
  });

  app.post<{ Params: { date: string; employeeId: string } }>('/api/v1/daily-remittances/:date/:employeeId/reset', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede corregir una entrega.' } });
    await prisma.dailyRemittance.deleteMany({ where: { businessDate: request.params.date, employeeId: request.params.employeeId } });
    return { ok: true };
  });

  app.get<{ Querystring: { date?: string; month?: string } }>('/api/v1/admin/expenses', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede consultar los gastos.' } });
    const date = request.query.date;
    const month = request.query.month;
    const allExpenses = await prisma.expense.findMany({
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }]
    });
    const expenses = allExpenses.filter((expense) => month ? expense.expenseDate.startsWith(month) : date ? expense.expenseDate === date : true);
    return {
      expenses: expenses.map((expense) => ({ ...expense, createdAt: expense.createdAt.toISOString(), updatedAt: expense.updatedAt.toISOString() })),
      totalCents: expenses.reduce((total, expense) => total + expense.amountCents, 0)
    };
  });

  app.post<{ Body: { expenseDate?: unknown; category?: unknown; description?: unknown; amountCents?: unknown } }>('/api/v1/admin/expenses', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede registrar gastos.' } });
    const body = request.body ?? {};
    const expenseDate = typeof body.expenseDate === 'string' ? body.expenseDate : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const amountCents = typeof body.amountCents === 'number' ? body.amountCents : 0;
    const fields: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) fields.expenseDate = 'Elegí una fecha válida.';
    if (!category) fields.category = 'Elegí una categoría.';
    if (!description) fields.description = 'Ingresá una descripción.';
    if (!Number.isInteger(amountCents) || amountCents <= 0) fields.amountCents = 'Ingresá un importe válido.';
    if (Object.keys(fields).length) return validation(reply, fields);
    if (await prisma.monthlyClosure.findFirst({ where: { month: expenseDate.slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'MONTH_CLOSED', message: 'El cierre mensual ya fue confirmado por NANI.' } });
    }
    const expense = await prisma.expense.create({ data: { id: randomUUID(), expenseDate, category, description, amountCents, paidById: session.id } });
    return reply.code(201).send({ expense: { ...expense, createdAt: expense.createdAt.toISOString(), updatedAt: expense.updatedAt.toISOString() } });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/admin/expenses/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede eliminar gastos.' } });
    const expense = await prisma.expense.findUnique({ where: { id: request.params.id } });
    if (expense && await prisma.monthlyClosure.findFirst({ where: { month: expense.expenseDate.slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'MONTH_CLOSED', message: 'El cierre mensual ya fue confirmado por NANI.' } });
    }
    await prisma.expense.delete({ where: { id: request.params.id } }).catch(() => undefined);
    return { ok: true };
  });

  app.get<{ Querystring: { from?: string; to?: string } }>('/api/v1/admin/reports', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede consultar reportes.' } });
    const from = request.query.from ?? businessDate(new Date());
    const to = request.query.to ?? from;
    const [attendances, expenses] = await Promise.all([
      prisma.attendance.findMany({ include: { employee: true, service: true } }),
      prisma.expense.findMany()
    ]);
    const dailyAttendances = attendances.filter((attendance) => {
      const date = businessDate(attendance.createdAt);
      return date >= from && date <= to;
    });
    const dailyExpenses = expenses.filter((expense) => expense.expenseDate >= from && expense.expenseDate <= to);
    const monthlyClosure = from.slice(0, 7) === to.slice(0, 7)
      ? await prisma.monthlyClosure.findUnique({ where: { month: from.slice(0, 7) } })
      : null;
    const employees = new Map<string, { employeeId: string; employeeName: string; attentions: number; performed: number; totalCents: number; commissionCents: number; amountToNaniCents: number }>();
    const services = new Map<string, { serviceId: string; serviceName: string; attentions: number; totalCents: number }>();
    for (const attendance of dailyAttendances) {
      const employee = employees.get(attendance.employeeId) ?? { employeeId: attendance.employeeId, employeeName: attendance.employee.displayName, attentions: 0, performed: 0, totalCents: 0, commissionCents: 0, amountToNaniCents: 0 };
      employee.attentions += 1;
      if (attendance.status === 'performed') {
        employee.performed += 1;
        employee.totalCents += attendance.finalAmountCents;
        employee.commissionCents += attendance.commissionCents;
        employee.amountToNaniCents += attendance.amountToNaniCents;
      }
      employees.set(attendance.employeeId, employee);
      if (attendance.status === 'performed') {
        const service = services.get(attendance.serviceId) ?? { serviceId: attendance.serviceId, serviceName: attendance.service.name, attentions: 0, totalCents: 0 };
        service.attentions += 1;
        service.totalCents += attendance.finalAmountCents;
        services.set(attendance.serviceId, service);
      }
    }
    return {
      from, to,
      closure: monthlyClosure ? { month: monthlyClosure.month, confirmedAt: monthlyClosure.confirmedAt.toISOString(), reopenedAt: monthlyClosure.reopenedAt?.toISOString() ?? null } : null,
      totals: {
        attentions: dailyAttendances.length,
        performed: dailyAttendances.filter((attendance) => attendance.status === 'performed').length,
        totalCents: dailyAttendances.reduce((total, attendance) => total + attendance.finalAmountCents, 0),
        amountToNaniCents: dailyAttendances.reduce((total, attendance) => total + attendance.amountToNaniCents, 0),
        expensesCents: dailyExpenses.reduce((total, expense) => total + expense.amountCents, 0)
      },
      employees: [...employees.values()].sort((first, second) => second.totalCents - first.totalCents),
      services: [...services.values()].sort((first, second) => second.attentions - first.attentions)
    };
  });

  app.post<{ Body: { month?: unknown } }>('/api/v1/admin/monthly-closures', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede cerrar el mes.' } });
    const month = typeof request.body.month === 'string' ? request.body.month : '';
    if (!/^\d{4}-\d{2}$/.test(month)) return validation(reply, { month: 'El mes no es válido.' });
    const closure = await prisma.monthlyClosure.upsert({
      where: { month },
      update: { confirmedAt: new Date(), confirmedById: session.id, reopenedAt: null, reopenedById: null },
      create: { id: randomUUID(), month, confirmedAt: new Date(), confirmedById: session.id }
    });
    return { closure: { month: closure.month, confirmedAt: closure.confirmedAt.toISOString(), reopenedAt: null } };
  });

  app.post<{ Params: { month: string } }>('/api/v1/admin/monthly-closures/:month/reopen', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede reabrir el mes.' } });
    const closure = await prisma.monthlyClosure.findUnique({ where: { month: request.params.month } });
    if (!closure) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No hay un cierre para ese mes.' } });
    const updated = await prisma.monthlyClosure.update({ where: { month: request.params.month }, data: { reopenedAt: new Date(), reopenedById: session.id } });
    return { closure: { month: updated.month, confirmedAt: updated.confirmedAt.toISOString(), reopenedAt: updated.reopenedAt?.toISOString() ?? null } };
  });

  app.get<{ Params: { id: string } }>('/api/v1/attendances/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'attendance:read:own')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const attendance = await prisma.attendance.findFirst({
      where: { id: request.params.id, employeeId: session.id },
      include: { service: true }
    });
    if (!attendance) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Atención no encontrada.' } });
    return {
      attendance: {
        id: attendance.id,
        employeeId: attendance.employeeId,
        clientName: attendance.clientName,
        serviceId: attendance.serviceId,
        serviceName: attendance.service.name,
        paymentMethod: attendance.paymentMethod,
        status: attendance.status,
        baseAmountCents: attendance.baseAmountCents,
        discountCents: attendance.discountCents,
        finalAmountCents: attendance.finalAmountCents,
        commissionCents: attendance.commissionCents,
        amountToNaniCents: attendance.amountToNaniCents,
        createdAt: attendance.createdAt.toISOString(),
        updatedAt: attendance.updatedAt.toISOString()
      },
      editableUntil: new Date(attendance.createdAt.getTime() + ATTENDANCE_EDIT_WINDOW_MS).toISOString(),
      canEdit: Date.now() < attendance.createdAt.getTime() + ATTENDANCE_EDIT_WINDOW_MS
    };
  });

  app.patch<{ Params: { id: string }; Body: Partial<UpdateAttendanceRequest> }>('/api/v1/attendances/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'attendance:write:own')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const attendance = await prisma.attendance.findFirst({
      where: { id: request.params.id, employeeId: session.id }
    });
    if (!attendance) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Atención no encontrada.' } });
    if (await prisma.dailyClosure.findFirst({ where: { businessDate: businessDate(attendance.createdAt), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'DAY_CLOSED', message: 'El cierre de ese día ya fue confirmado por NANI.' } });
    }
    if (await prisma.monthlyClosure.findFirst({ where: { month: businessDate(attendance.createdAt).slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'MONTH_CLOSED', message: 'El cierre mensual ya fue confirmado por NANI.' } });
    }
    if (Date.now() >= attendance.createdAt.getTime() + ATTENDANCE_EDIT_WINDOW_MS) {
      return reply.code(403).send({ error: { code: 'EDIT_WINDOW_EXPIRED', message: 'La ventana de edición terminó.' } });
    }

    const body = request.body ?? {};
    const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
    const fields: Record<string, string> = {};
    if (!clientName) fields.clientName = 'Ingresá el nombre completo de la clienta.';
    if (typeof body.serviceId !== 'string' || !body.serviceId) fields.serviceId = 'Elegí un servicio.';
    if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'transfer') fields.paymentMethod = 'Elegí efectivo o transferencia.';
    if (body.status !== undefined && body.status !== 'performed' && body.status !== 'cancelled' && body.status !== 'absent') fields.status = 'Elegí un estado válido.';
    if (Object.keys(fields).length) return validation(reply, fields);

    const service = await prisma.service.findFirst({ where: { id: body.serviceId as string, active: true, employees: { some: { id: session.id } } } });
    if (!service) return validation(reply, { serviceId: 'El servicio no está habilitado para tu usuario.' });
    const paymentMethod = body.paymentMethod as 'cash' | 'transfer';
    const status = (body.status ?? attendance.status) as Attendance['status'];
    const amounts = calculateAttendanceAmounts(session.id, service, paymentMethod, status);
    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clientName,
        serviceId: service.id,
        paymentMethod,
        status,
        ...amounts
      },
      include: { service: true }
    });
    await prisma.dailyRemittance.updateMany({
      where: { businessDate: businessDate(attendance.createdAt), employeeId: session.id, sentAt: { not: null } },
      data: { sentAt: null }
    });
    return {
      attendance: {
        id: updated.id,
        employeeId: updated.employeeId,
        clientName: updated.clientName,
        serviceId: updated.serviceId,
        serviceName: updated.service.name,
        paymentMethod: updated.paymentMethod,
        status: updated.status,
        baseAmountCents: updated.baseAmountCents,
        discountCents: updated.discountCents,
        finalAmountCents: updated.finalAmountCents,
        commissionCents: updated.commissionCents,
        amountToNaniCents: updated.amountToNaniCents,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString()
      }
    };
  });

  app.delete('/api/v1/attendances/:id', async (_request, reply) => {
    return reply.code(405).send({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Las atenciones no se pueden eliminar.' } });
  });

  app.get('/api/v1/admin/summary', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'admin:read')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    return { total: 0 };
  });

  app.get('/api/v1/admin/employees', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:read')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const employees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      select: { id: true, displayName: true, role: true, active: true },
      orderBy: [{ active: 'desc' }, { displayName: 'asc' }]
    });
    return { employees };
  });

  app.patch<{ Params: { employeeId: string }; Body: UpdateEmployeeStatusRequest }>('/api/v1/admin/employees/:employeeId/status', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:write')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    if (typeof request.body?.active !== 'boolean') return validation(reply, { active: 'Indicá un estado válido.' });
    const employee = await prisma.user.findFirst({ where: { id: request.params.employeeId, role: 'EMPLOYEE' } });
    if (!employee) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Empleada no encontrada.' } });
    const updated = await prisma.user.update({
      where: { id: employee.id },
      data: { active: request.body.active },
      select: { id: true, displayName: true, role: true, active: true }
    });
    return { employee: updated };
  });

  app.patch<{ Params: { employeeId: string }; Body: ChangeEmployeePinRequest }>('/api/v1/admin/employees/:employeeId/pin', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:write')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    if (typeof request.body?.pin !== 'string' || !/^\d{4}$/.test(request.body.pin)) {
      return validation(reply, { pin: 'El PIN debe tener exactamente 4 dígitos.' });
    }
    const employee = await prisma.user.findFirst({ where: { id: request.params.employeeId, role: 'EMPLOYEE' } });
    if (!employee) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Empleada no encontrada.' } });
    await prisma.user.update({ where: { id: employee.id }, data: { pinHash: hashPin(request.body.pin) } });
    return { employeeId: employee.id };
  });

  return app;
}
