import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { ACTIVE_USERS, type Attendance, type ChangeEmployeePinRequest, type CreateAttendanceRequest, type CreateServiceRequest, type LoginRequest, type ReorderServicesRequest, type SessionUser, type UpdateAttendanceRequest, type UpdateEmployeeStatusRequest, type UpdateServiceRequest } from '@studiobynani/contracts';
import { calculateAttendanceBundleAmounts, calculateAttendanceAmounts, can, DEFAULT_USERS, hashPin, INITIAL_SERVICES, verifyPin } from '@studiobynani/domain';

const SESSION_COOKIE = 'studiobynani_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_IDLE_TIMEOUT_MS = 7 * 60 * 1000;
const ATTENDANCE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
type StoredSession = SessionUser & { expiresAt: number; lastActivityAt: number };
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
  if (session.lastActivityAt + SESSION_IDLE_TIMEOUT_MS <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  session.lastActivityAt = Date.now();
  return session;
}

function validation(reply: FastifyReply, fields: Record<string, string>) {
  return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.', fields } });
}

function presentRemittance(remittance: { employeeId: string; amountCents: number; sentAt: Date | null; receivedAt: Date | null; receivedById: string | null }) {
  return {
    employeeId: remittance.employeeId,
    amountCents: remittance.amountCents,
    sentAt: remittance.sentAt?.toISOString() ?? null,
    receivedAt: remittance.receivedAt?.toISOString() ?? null,
    receivedById: remittance.receivedById
  };
}

function businessDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function requestedServiceIds(body: { serviceId?: unknown; serviceIds?: unknown }) {
  const ids = Array.isArray(body.serviceIds) ? body.serviceIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  if (ids.length) return [...new Set(ids)];
  return typeof body.serviceId === 'string' && body.serviceId ? [body.serviceId] : [];
}

type ServiceDb = PrismaClient | Prisma.TransactionClient;

class InvalidServiceOrder extends Error {}

async function writeServiceOrder(db: ServiceDb, orderedIds: string[]) {
  for (let index = 0; index < orderedIds.length; index += 1) {
    await db.service.update({ where: { id: orderedIds[index] }, data: { sortOrder: index } });
  }
}

async function placeService(db: ServiceDb, serviceId: string, placement: 'end-of-actives' | 'end') {
  const services = await db.service.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, active: true } });
  const others = services.filter((service) => service.id !== serviceId);
  const orderedIds = placement === 'end'
    ? [...others.map((service) => service.id), serviceId]
    : [
        ...others.filter((service) => service.active).map((service) => service.id),
        serviceId,
        ...others.filter((service) => !service.active).map((service) => service.id)
      ];
  await writeServiceOrder(db, orderedIds);
}

function storedServiceIds(attendance: { serviceId: string; serviceIdsJson: string }) {
  try {
    const ids = JSON.parse(attendance.serviceIdsJson);
    return Array.isArray(ids) && ids.length ? ids.filter((id): id is string => typeof id === 'string') : [attendance.serviceId];
  } catch {
    return [attendance.serviceId];
  }
}

function productFinancials(supplierType: string, sellerId: string, totalCents: number, profitCents: number) {
  if (supplierType === 'once') {
    return {
      employeeCommissionCents: 0,
      amountToNaniCents: 0,
      commonBoxCents: totalCents
    };
  }
  const employeeCommissionCents = sellerId === 'nani' ? 0 : Math.floor(profitCents * 40 / 100);
  return {
    employeeCommissionCents,
    amountToNaniCents: sellerId === 'nani' ? 0 : totalCents - employeeCommissionCents,
    commonBoxCents: 0
  };
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
  const audit = (actorId: string, action: string, entityType: string, entityId?: string, details: Record<string, unknown> = {}) =>
    prisma.auditLog.create({ data: { id: randomUUID(), actorId, action, entityType, entityId, detailsJson: JSON.stringify(details) } });
  const owedToNaniCents = async (employeeId: string, date: string) => {
    const attendanceAmountCents = (await prisma.attendance.findMany({ where: { employeeId } }))
      .filter((attendance) => businessDate(attendance.createdAt) === date && attendance.status === 'performed')
      .reduce((total, attendance) => total + attendance.amountToNaniCents, 0);
    const productAmountCents = (await prisma.productSale.findMany({ where: { sellerId: employeeId, status: 'completed' } }))
      .filter((sale) => businessDate(sale.createdAt) === date)
      .reduce((total, sale) => total + sale.amountToNaniCents, 0);
    return attendanceAmountCents + productAmountCents;
  };
  app.addHook('onReady', async () => {
    await prisma.$transaction(async (transaction) => {
      for (const user of DEFAULT_USERS) {
        await transaction.user.upsert({
          where: { id: user.id },
          update: { displayName: user.displayName, role: user.role },
          create: { id: user.id, displayName: user.displayName, role: user.role, active: user.active, pinHash: user.pinHash }
        });
      }
      const existingServiceIds = new Set((await transaction.service.findMany({ select: { id: true } })).map((service) => service.id));
      const missingServices = INITIAL_SERVICES.filter((service) => !existingServiceIds.has(service.id))
        .sort((left, right) => Number(right.active) - Number(left.active) || (left.category < right.category ? -1 : left.category > right.category ? 1 : left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
      for (const service of missingServices) {
        await transaction.service.create({
          data: {
            id: service.id,
            name: service.name,
            category: service.category,
            baseAmountCents: service.baseAmountCents,
            durationMinutes: service.durationMinutes,
            active: service.active,
            sortOrder: 0
          }
        });
        await placeService(transaction, service.id, service.active ? 'end-of-actives' : 'end');
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
            sortOrder: 0
          }
        });
      }
      const stored = await transaction.service.findMany({ select: { id: true, name: true, category: true, active: true, sortOrder: true } });
      if (stored.length > 1 && new Set(stored.map((service) => service.sortOrder)).size === 1) {
        const ordered = [...stored].sort((left, right) => Number(right.active) - Number(left.active)
          || (left.category < right.category ? -1 : left.category > right.category ? 1 : left.name < right.name ? -1 : left.name > right.name ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
        await writeServiceOrder(transaction, ordered.map((service) => service.id));
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
      expiresAt: Date.now() + SESSION_TTL_MS, lastActivityAt: Date.now()
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
    const persisted = await prisma.service.findMany({ include: { employees: true }, orderBy: { sortOrder: 'asc' } });
    return { services: persisted.map(serviceResponse) };
  });

  app.put<{ Body: Partial<ReorderServicesRequest> }>('/api/v1/admin/services/order', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'admin:write')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const serviceIds = request.body?.serviceIds;
    const invalidOrder = () => reply.code(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'Indicá cada servicio activo una sola vez, sin repetidos ni ids desconocidos.' }
    });
    if (!Array.isArray(serviceIds) || serviceIds.some((serviceId) => typeof serviceId !== 'string' || !serviceId)) return invalidOrder();
    if (new Set(serviceIds).size !== serviceIds.length) return invalidOrder();
    try {
      await prisma.$transaction(async (transaction) => {
        const current = await transaction.service.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, active: true } });
        const activeIds = new Set(current.filter((service) => service.active).map((service) => service.id));
        if (serviceIds.length !== activeIds.size || serviceIds.some((serviceId) => !activeIds.has(serviceId))) throw new InvalidServiceOrder();
        await writeServiceOrder(transaction, [
          ...serviceIds,
          ...current.filter((service) => !service.active).map((service) => service.id)
        ]);
      });
    } catch (error) {
      if (error instanceof InvalidServiceOrder) return invalidOrder();
      throw error;
    }
    const persisted = await prisma.service.findMany({ include: { employees: true }, orderBy: { sortOrder: 'asc' } });
    return { services: persisted.map(serviceResponse) };
  });

  app.post<{ Body: Partial<CreateServiceRequest> }>('/api/v1/admin/services', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'admin:write')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const body = request.body ?? {};
    const fields = serviceValidation(body, true);
    if (Object.keys(fields).length) return validation(reply, fields);
    const created = await prisma.$transaction(async (transaction) => {
      const service = await transaction.service.create({
        data: {
          id: randomUUID(),
          name: body.name!.trim(),
          category: body.category!.trim(),
          baseAmountCents: body.baseAmountCents!,
          durationMinutes: body.durationMinutes!,
          active: true,
          sortOrder: 0,
          employees: { connect: DEFAULT_USERS.filter((user) => user.active).map((user) => ({ id: user.id })) }
        },
        include: { employees: true }
      });
      await placeService(transaction, service.id, 'end-of-actives');
      return service;
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
    const moves = body.active !== undefined && body.active !== existing.active;
    const updated = await prisma.$transaction(async (transaction) => {
      const service = await transaction.service.update({
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
      if (moves) await placeService(transaction, service.id, body.active ? 'end-of-actives' : 'end');
      return service;
    });
    return { service: serviceResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>('/api/v1/admin/services/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !can(session, 'admin:write')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const existing = await prisma.service.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Servicio no encontrado.' } });
    const updated = await prisma.$transaction(async (transaction) => {
      const service = await transaction.service.update({ where: { id: existing.id }, data: { active: false }, include: { employees: true } });
      await placeService(transaction, service.id, 'end');
      return service;
    });
    await audit(session.id, 'service.deleted', 'Service', existing.id, { name: existing.name });
    return { service: serviceResponse(updated) };
  });

  app.get('/api/v1/admin/service-assignments', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:read')) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    const [employees, persisted] = await Promise.all([
      prisma.user.findMany({ where: { active: true, role: { in: ['EMPLOYEE', 'ADMIN'] } }, include: { services: { select: { id: true } } }, orderBy: { displayName: 'asc' } }),
      prisma.service.findMany({ include: { employees: { select: { id: true } } }, orderBy: { sortOrder: 'asc' } })
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
    const employee = await prisma.user.findFirst({ where: { id: request.params.employeeId, active: true, role: { in: ['EMPLOYEE', 'ADMIN'] } } });
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
      orderBy: { sortOrder: 'asc' }
    });
    return { services: persisted.map((service) => ({ ...service, enabledFor: [session.id] })) };
  });

  app.post<{ Body: { serviceId?: unknown; serviceIds?: unknown; paymentMethod?: unknown; status?: unknown } }>('/api/v1/attendances/quote', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!can(session, 'attendance:write:own')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const body = request.body ?? {};
    const fields: Record<string, string> = {};
    const serviceIds = requestedServiceIds(body);
    if (serviceIds.length === 0) fields.serviceIds = 'Elegí al menos un servicio.';
    if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'transfer') fields.paymentMethod = 'Elegí efectivo o transferencia.';
    if (body.status !== undefined && body.status !== 'performed' && body.status !== 'cancelled' && body.status !== 'absent') fields.status = 'Elegí un estado válido.';
    if (Object.keys(fields).length) return validation(reply, fields);
    if (await prisma.dailyClosure.findFirst({ where: { businessDate: businessDate(new Date()), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'DAY_CLOSED', message: 'El cierre del día ya fue confirmado por NANI.' } });
    }
    if (await prisma.monthlyClosure.findFirst({ where: { month: businessDate(new Date()).slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'MONTH_CLOSED', message: 'El cierre mensual ya fue confirmado por NANI.' } });
    }

    const services = await prisma.service.findMany({ where: { id: { in: serviceIds }, active: true, employees: { some: { id: session.id } } } });
    if (services.length !== serviceIds.length) return validation(reply, { serviceIds: 'Todos los servicios deben estar habilitados para tu usuario.' });

    return {
      quote: {
        serviceId: services[0].id,
        serviceName: services.map((service) => service.name).join(' + '),
        ...calculateAttendanceBundleAmounts(session.id, services, body.paymentMethod as 'cash' | 'transfer', (body.status ?? 'performed') as 'performed' | 'cancelled' | 'absent')
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
    const serviceIds = requestedServiceIds(body);
    const fields: Record<string, string> = {};
    if (!clientName) fields.clientName = 'Ingresá el nombre completo de la clienta.';
    if (serviceIds.length === 0) fields.serviceIds = 'Elegí al menos un servicio.';
    if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'transfer') fields.paymentMethod = 'Elegí efectivo o transferencia.';
    if (body.status !== undefined && body.status !== 'performed' && body.status !== 'cancelled' && body.status !== 'absent') fields.status = 'Elegí un estado válido.';
    if (Object.keys(fields).length) return validation(reply, fields);

    const services = await prisma.service.findMany({ where: { id: { in: serviceIds }, active: true, employees: { some: { id: session.id } } } });
    if (services.length !== serviceIds.length) return validation(reply, { serviceIds: 'Todos los servicios deben estar habilitados para tu usuario.' });
    const status = body.status ?? 'performed';
    const amounts = calculateAttendanceBundleAmounts(session.id, services, body.paymentMethod!, status);
    const createdAt = new Date().toISOString();
    const attendance: Attendance = {
      id: randomUUID(),
      employeeId: session.id,
      clientName,
      serviceId: services[0].id,
      serviceIds,
      serviceNames: services.map((service) => service.name),
      serviceName: services.map((service) => service.name).join(' + '),
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
        serviceIdsJson: JSON.stringify(attendance.serviceIds),
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
      data: { sentAt: null, receivedAt: null, receivedById: null }
    });
    await audit(session.id, 'attendance.created', 'Attendance', attendance.id, { serviceIds, status });
    return reply.code(201).send({
      attendance: {
        ...attendance,
        serviceName: attendance.serviceName,
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
        serviceIds: storedServiceIds(attendance),
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

  app.get('/api/v1/products', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const products = await prisma.product.findMany({
      where: { active: true },
      include: { purchases: { select: { quantity: true } }, saleItems: { select: { quantity: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    });
    return {
      products: products.map((product) => ({
        id: product.id, name: product.name, category: product.category, supplierType: product.supplierType,
        supplierName: product.supplierName, currentCostCents: product.currentCostCents, salePriceCents: product.salePriceCents,
        lowStockThreshold: product.lowStockThreshold, active: product.active,
        stock: product.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0) - product.saleItems.reduce((sum, item) => sum + item.quantity, 0)
      }))
    };
  });

  app.post<{ Body: { name?: unknown; category?: unknown; supplierType?: unknown; supplierName?: unknown; currentCostCents?: unknown; salePriceCents?: unknown; lowStockThreshold?: unknown } }>('/api/v1/admin/products', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede administrar productos.' } });
    const body = request.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : 'General';
    const supplierType = body.supplierType === 'once' || body.supplierType === 'local' ? body.supplierType : '';
    const supplierName = typeof body.supplierName === 'string' ? body.supplierName.trim() : '';
    const currentCostCents = typeof body.currentCostCents === 'number' ? body.currentCostCents : 0;
    const salePriceCents = typeof body.salePriceCents === 'number' ? body.salePriceCents : 0;
    const lowStockThreshold = typeof body.lowStockThreshold === 'number' ? body.lowStockThreshold : 1;
    const fields: Record<string, string> = {};
    if (!name) fields.name = 'Ingresá un nombre.';
    if (!supplierType) fields.supplierType = 'Elegí el origen.';
    if (!supplierName) fields.supplierName = 'Ingresá el proveedor.';
    if (!Number.isInteger(currentCostCents) || currentCostCents < 0) fields.currentCostCents = 'Ingresá un costo válido.';
    if (!Number.isInteger(salePriceCents) || salePriceCents <= 0) fields.salePriceCents = 'Ingresá un precio válido.';
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) fields.lowStockThreshold = 'Ingresá una alerta válida.';
    if (Object.keys(fields).length) return validation(reply, fields);
    const product = await prisma.product.create({ data: { id: randomUUID(), name, category, supplierType, supplierName, currentCostCents, salePriceCents, lowStockThreshold } });
    await audit(session.id, 'product.created', 'Product', product.id, { name, supplierType });
    return reply.code(201).send({ product: { ...product, stock: 0 } });
  });

  app.patch<{ Params: { id: string }; Body: { name?: unknown; category?: unknown; supplierType?: unknown; supplierName?: unknown; currentCostCents?: unknown; salePriceCents?: unknown; lowStockThreshold?: unknown; active?: unknown } }>('/api/v1/admin/products/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede administrar productos.' } });
    const existing = await prisma.product.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' } });
    const body = request.body ?? {};
    const data = {
      ...(typeof body.name === 'string' ? { name: body.name.trim() } : {}),
      ...(typeof body.category === 'string' ? { category: body.category.trim() } : {}),
      ...(body.supplierType === 'once' || body.supplierType === 'local' ? { supplierType: body.supplierType } : {}),
      ...(typeof body.supplierName === 'string' ? { supplierName: body.supplierName.trim() } : {}),
      ...(typeof body.currentCostCents === 'number' && Number.isInteger(body.currentCostCents) && body.currentCostCents >= 0 ? { currentCostCents: body.currentCostCents } : {}),
      ...(typeof body.salePriceCents === 'number' && Number.isInteger(body.salePriceCents) && body.salePriceCents > 0 ? { salePriceCents: body.salePriceCents } : {}),
      ...(typeof body.lowStockThreshold === 'number' && Number.isInteger(body.lowStockThreshold) && body.lowStockThreshold >= 0 ? { lowStockThreshold: body.lowStockThreshold } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {})
    };
    const product = await prisma.product.update({ where: { id: existing.id }, data });
    await audit(session.id, 'product.updated', 'Product', product.id, { changedFields: Object.keys(data) });
    return { product };
  });

  app.delete<{ Params: { id: string } }>('/api/v1/admin/products/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede administrar productos.' } });
    const product = await prisma.product.findUnique({ where: { id: request.params.id }, include: { purchases: { select: { quantity: true } }, saleItems: { select: { quantity: true } } } });
    if (!product) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' } });
    const stock = product.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0) - product.saleItems.reduce((sum, item) => sum + item.quantity, 0);
    const updated = await prisma.product.update({ where: { id: product.id }, data: { active: false } });
    await audit(session.id, 'product.deleted', 'Product', product.id, { name: product.name, stock });
    return { product: updated };
  });

  app.post<{ Params: { id: string }; Body: { quantity?: unknown; unitCostCents?: unknown; salePriceCents?: unknown; supplierName?: unknown; purchasedAt?: unknown } }>('/api/v1/admin/products/:id/purchases', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede registrar compras.' } });
    const product = await prisma.product.findUnique({ where: { id: request.params.id } });
    if (!product || !product.active) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' } });
    const body = request.body ?? {};
    const quantity = typeof body.quantity === 'number' ? body.quantity : 0;
    const unitCostCents = typeof body.unitCostCents === 'number' ? body.unitCostCents : 0;
    const salePriceCents = typeof body.salePriceCents === 'number' ? body.salePriceCents : 0;
    const supplierName = typeof body.supplierName === 'string' ? body.supplierName.trim() : product.supplierName;
    const purchasedAt = typeof body.purchasedAt === 'string' ? body.purchasedAt : businessDate(new Date());
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(unitCostCents) || unitCostCents < 0 || !Number.isInteger(salePriceCents) || salePriceCents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(purchasedAt)) {
      return validation(reply, { purchase: 'Revisá cantidad, precio de compra, precio de venta y fecha de compra.' });
    }
    if (await prisma.monthlyClosure.findFirst({ where: { month: purchasedAt.slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'MONTH_CLOSED', message: 'El cierre mensual ya fue confirmado por NANI.' } });
    }
    const purchase = await prisma.productPurchase.create({ data: { id: randomUUID(), productId: product.id, quantity, unitCostCents, supplierName, purchasedAt, createdById: session.id } });
    await prisma.product.update({ where: { id: product.id }, data: { currentCostCents: unitCostCents, salePriceCents, supplierName } });
    await audit(session.id, 'product.purchase_created', 'ProductPurchase', purchase.id, { productId: product.id, quantity, unitCostCents, salePriceCents });
    return reply.code(201).send({ purchase });
  });

  app.patch<{ Params: { id: string }; Body: { stock?: unknown } }>('/api/v1/admin/products/:id/stock', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede administrar productos.' } });
    const stock = request.body?.stock;
    if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > 100000) return validation(reply, { stock: 'Ingresá una cantidad entera entre 0 y 100000.' });
    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: request.params.id }, include: { purchases: { select: { quantity: true } }, saleItems: { select: { quantity: true } } } });
      if (!product || !product.active) return null;
      const current = product.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0) - product.saleItems.reduce((sum, item) => sum + item.quantity, 0);
      const delta = stock - current;
      const adjustment = delta === 0 ? null : await tx.productPurchase.create({
        data: { id: randomUUID(), productId: product.id, quantity: delta, unitCostCents: product.currentCostCents, supplierName: product.supplierName, purchasedAt: businessDate(new Date()), createdById: session.id }
      });
      return { id: product.id, stock, currentCostCents: product.currentCostCents, salePriceCents: product.salePriceCents, previousStock: current, adjustmentId: adjustment?.id ?? null };
    });
    if (!updated) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' } });
    if (updated.adjustmentId) await audit(session.id, 'product.stock_adjusted', 'ProductPurchase', updated.adjustmentId, { productId: updated.id, previousStock: updated.previousStock, stock });
    return { product: { id: updated.id, stock: updated.stock, currentCostCents: updated.currentCostCents, salePriceCents: updated.salePriceCents } };
  });

  app.get<{ Querystring: { date?: string } }>('/api/v1/product-sales/recent', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const date = request.query.date;
    const sales = await prisma.productSale.findMany({
      where: {
        ...(session.role === 'ADMIN' ? {} : { sellerId: session.id }),
        ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { createdAt: { gte: new Date(`${date}T00:00:00-03:00`), lt: new Date(`${date}T23:59:59.999-03:00`) } } : {})
      },
      include: { seller: { select: { displayName: true } }, items: { include: { product: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 50
    });
    return { sales: sales.map((sale) => ({ ...sale, sellerName: sale.seller.displayName, createdAt: sale.createdAt.toISOString(), updatedAt: sale.updatedAt.toISOString(), items: sale.items.map((item) => ({ productId: item.productId, productName: item.product.name, quantity: item.quantity, lineTotalCents: item.lineTotalCents })) })) };
  });

  app.post<{ Body: { clientName?: unknown; paymentMethod?: unknown; items?: unknown } }>('/api/v1/product-sales', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const saleDate = businessDate(new Date());
    if (await prisma.dailyClosure.findFirst({ where: { businessDate: saleDate, reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'DAY_CLOSED', message: 'El cierre del día ya fue confirmado por NANI.' } });
    }
    if (await prisma.monthlyClosure.findFirst({ where: { month: saleDate.slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'MONTH_CLOSED', message: 'El cierre mensual ya fue confirmado por NANI.' } });
    }
    const body = request.body ?? {};
    const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
    const paymentMethod = body.paymentMethod === 'cash' || body.paymentMethod === 'transfer' ? body.paymentMethod : '';
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const itemInputs = rawItems.filter((item): item is { productId: string; quantity: number } => Boolean(item) && typeof item === 'object' && typeof (item as { productId?: unknown }).productId === 'string' && Number.isInteger((item as { quantity?: unknown }).quantity) && (item as { quantity: number }).quantity > 0);
    if (!clientName || !paymentMethod || itemInputs.length === 0) return validation(reply, { sale: 'Ingresá clienta, medio de pago y al menos un producto.' });
    const unique = new Map(itemInputs.map((item) => [item.productId, item.quantity]));
    if (unique.size !== itemInputs.length) return validation(reply, { items: 'No repitas productos; modificá su cantidad.' });
    try {
      const sale = await prisma.$transaction(async (tx) => {
        const products = await tx.product.findMany({ where: { id: { in: [...unique.keys()] }, active: true }, include: { purchases: { select: { quantity: true } }, saleItems: { select: { quantity: true } } } });
        if (products.length !== unique.size) throw new Error('PRODUCT_NOT_FOUND');
        const items = products.map((product) => {
          const quantity = unique.get(product.id)!;
          const stock = product.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0) - product.saleItems.reduce((sum, item) => sum + item.quantity, 0);
          if (stock < quantity) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
          const lineTotalCents = product.salePriceCents * quantity;
          const profitCents = (product.salePriceCents - product.currentCostCents) * quantity;
          return { product, quantity, lineTotalCents, profitCents };
        });
        const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
        const profitCents = items.reduce((sum, item) => sum + item.profitCents, 0);
        const financials = items.reduce((sum, item) => {
          const line = productFinancials(item.product.supplierType, session.id, item.lineTotalCents, item.profitCents);
          return { employeeCommissionCents: sum.employeeCommissionCents + line.employeeCommissionCents, amountToNaniCents: sum.amountToNaniCents + line.amountToNaniCents, commonBoxCents: sum.commonBoxCents + line.commonBoxCents };
        }, { employeeCommissionCents: 0, amountToNaniCents: 0, commonBoxCents: 0 });
        const created = await tx.productSale.create({ data: { id: randomUUID(), sellerId: session.id, clientName, paymentMethod, totalCents, profitCents, ...financials, items: { create: items.map((item) => ({ id: randomUUID(), productId: item.product.id, quantity: item.quantity, unitCostCents: item.product.currentCostCents, saleUnitPriceCents: item.product.salePriceCents, lineTotalCents: item.lineTotalCents, profitCents: item.profitCents })) } }, include: { items: true } });
        if (session.id !== 'nani' && created.amountToNaniCents > 0) {
          await tx.dailyRemittance.updateMany({
            where: { businessDate: businessDate(created.createdAt), employeeId: session.id, sentAt: { not: null } },
            data: { sentAt: null, receivedAt: null, receivedById: null }
          });
        }
        return created;
      });
      await audit(session.id, 'product_sale.created', 'ProductSale', sale.id, { totalCents: sale.totalCents, itemCount: sale.items.length });
      return reply.code(201).send({ sale });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      if (message.startsWith('INSUFFICIENT_STOCK:')) return reply.code(409).send({ error: { code: 'INSUFFICIENT_STOCK', message: `No hay stock suficiente de ${message.slice(18)}.` } });
      if (message === 'PRODUCT_NOT_FOUND') return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Hay productos inválidos o inactivos.' } });
      throw failure;
    }
  });

  app.patch<{ Params: { id: string }; Body: { clientName?: unknown; paymentMethod?: unknown; items?: unknown } }>('/api/v1/product-sales/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const existing = await prisma.productSale.findUnique({ where: { id: request.params.id }, include: { items: true } });
    if (!existing || (session.role !== 'ADMIN' && existing.sellerId !== session.id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Venta no encontrada.' } });
    if (existing.status !== 'completed') return reply.code(409).send({ error: { code: 'SALE_CANCELLED', message: 'La venta ya fue cancelada.' } });
    if (Date.now() > existing.createdAt.getTime() + ATTENDANCE_EDIT_WINDOW_MS) return reply.code(409).send({ error: { code: 'EDIT_WINDOW_EXPIRED', message: 'La ventana de edición terminó.' } });
    const saleDate = businessDate(existing.createdAt);
    if (await prisma.dailyClosure.findFirst({ where: { businessDate: saleDate, reopenedAt: null } }) || await prisma.monthlyClosure.findFirst({ where: { month: saleDate.slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'CLOSED_PERIOD', message: 'El período ya fue cerrado por NANI.' } });
    }
    const remittance = await prisma.dailyRemittance.findUnique({ where: { businessDate_employeeId: { businessDate: saleDate, employeeId: existing.sellerId } } });
    if (remittance?.sentAt) return reply.code(409).send({ error: { code: 'REMITTANCE_SENT', message: 'No se puede modificar una venta después de enviar el dinero a NANI.' } });
    const body = request.body ?? {};
    const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : existing.clientName;
    const paymentMethod = body.paymentMethod === 'cash' || body.paymentMethod === 'transfer' ? body.paymentMethod : existing.paymentMethod;
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const itemInputs = rawItems.filter((item): item is { productId: string; quantity: number } => Boolean(item) && typeof item === 'object' && typeof (item as { productId?: unknown }).productId === 'string' && Number.isInteger((item as { quantity?: unknown }).quantity) && (item as { quantity: number }).quantity > 0);
    if (!clientName || itemInputs.length === 0) return validation(reply, { sale: 'Ingresá clienta y al menos un producto.' });
    const unique = new Map(itemInputs.map((item) => [item.productId, item.quantity]));
    if (unique.size !== itemInputs.length) return validation(reply, { items: 'No repitas productos; modificá su cantidad.' });
    const oldQuantities = new Map(existing.items.map((item) => [item.productId, item.quantity]));
    try {
      const sale = await prisma.$transaction(async (tx) => {
        const products = await tx.product.findMany({ where: { id: { in: [...unique.keys()] }, active: true }, include: { purchases: { select: { quantity: true } }, saleItems: { select: { quantity: true } } } });
        if (products.length !== unique.size) throw new Error('PRODUCT_NOT_FOUND');
        const items = products.map((product) => {
          const quantity = unique.get(product.id)!;
          const stock = product.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0) - product.saleItems.reduce((sum, item) => sum + item.quantity, 0) + (oldQuantities.get(product.id) ?? 0);
          if (stock < quantity) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
          return { product, quantity, lineTotalCents: product.salePriceCents * quantity, profitCents: (product.salePriceCents - product.currentCostCents) * quantity };
        });
        const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
        const profitCents = items.reduce((sum, item) => sum + item.profitCents, 0);
        const financials = items.reduce((sum, item) => {
          const line = productFinancials(item.product.supplierType, existing.sellerId, item.lineTotalCents, item.profitCents);
          return { employeeCommissionCents: sum.employeeCommissionCents + line.employeeCommissionCents, amountToNaniCents: sum.amountToNaniCents + line.amountToNaniCents, commonBoxCents: sum.commonBoxCents + line.commonBoxCents };
        }, { employeeCommissionCents: 0, amountToNaniCents: 0, commonBoxCents: 0 });
        await tx.productSaleItem.deleteMany({ where: { saleId: existing.id } });
        return tx.productSale.update({ where: { id: existing.id }, data: { clientName, paymentMethod, totalCents, profitCents, ...financials, items: { create: items.map((item) => ({ id: randomUUID(), productId: item.product.id, quantity: item.quantity, unitCostCents: item.product.currentCostCents, saleUnitPriceCents: item.product.salePriceCents, lineTotalCents: item.lineTotalCents, profitCents: item.profitCents })) } }, include: { items: true } });
      });
      await audit(session.id, 'product_sale.updated', 'ProductSale', sale.id, { totalCents: sale.totalCents, itemCount: sale.items.length });
      return { sale };
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      if (message.startsWith('INSUFFICIENT_STOCK:')) return reply.code(409).send({ error: { code: 'INSUFFICIENT_STOCK', message: `No hay stock suficiente de ${message.slice(18)}.` } });
      if (message === 'PRODUCT_NOT_FOUND') return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Hay productos inválidos o inactivos.' } });
      throw failure;
    }
  });

  app.post<{ Params: { id: string } }>('/api/v1/product-sales/:id/cancel', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const existing = await prisma.productSale.findUnique({ where: { id: request.params.id }, include: { items: true } });
    if (!existing || (session.role !== 'ADMIN' && existing.sellerId !== session.id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Venta no encontrada.' } });
    if (existing.status !== 'completed') return reply.code(409).send({ error: { code: 'SALE_CANCELLED', message: 'La venta ya fue cancelada.' } });
    if (Date.now() > existing.createdAt.getTime() + ATTENDANCE_EDIT_WINDOW_MS) return reply.code(409).send({ error: { code: 'EDIT_WINDOW_EXPIRED', message: 'La ventana de cancelación terminó.' } });
    const saleDate = businessDate(existing.createdAt);
    if (await prisma.dailyClosure.findFirst({ where: { businessDate: saleDate, reopenedAt: null } }) || await prisma.monthlyClosure.findFirst({ where: { month: saleDate.slice(0, 7), reopenedAt: null } })) {
      return reply.code(409).send({ error: { code: 'CLOSED_PERIOD', message: 'El período ya fue cerrado por NANI.' } });
    }
    const remittance = await prisma.dailyRemittance.findUnique({ where: { businessDate_employeeId: { businessDate: saleDate, employeeId: existing.sellerId } } });
    if (remittance?.sentAt) return reply.code(409).send({ error: { code: 'REMITTANCE_SENT', message: 'No se puede cancelar una venta después de enviar el dinero a NANI.' } });
    const sale = await prisma.$transaction(async (tx) => {
      await tx.productSaleItem.deleteMany({ where: { saleId: existing.id } });
      return tx.productSale.update({ where: { id: existing.id }, data: { status: 'cancelled', totalCents: 0, profitCents: 0, employeeCommissionCents: 0, amountToNaniCents: 0, commonBoxCents: 0 }, include: { items: true } });
    });
    await audit(session.id, 'product_sale.cancelled', 'ProductSale', sale.id, { previousTotalCents: existing.totalCents });
    return { sale };
  });

  app.get<{ Querystring: { date?: string } }>('/api/v1/admin/daily-summary', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const date = request.query.date ?? businessDate(new Date());
    const persisted = await prisma.attendance.findMany({ include: { employee: true, service: true } });
    const daily = persisted.filter((attendance) =>
      businessDate(attendance.createdAt) === date && (session.role === 'ADMIN' || attendance.employeeId === session.id)
    );
    const productSales = await prisma.productSale.findMany({
      where: { status: 'completed', createdAt: { gte: new Date(`${date}T00:00:00-03:00`), lt: new Date(`${date}T23:59:59.999-03:00`) }, ...(session.role === 'ADMIN' ? {} : { sellerId: session.id }) },
      include: { seller: true, items: { include: { product: true } } }
    });
    const activeEmployees = session.role === 'ADMIN'
      ? await prisma.user.findMany({ where: { active: true }, orderBy: { displayName: 'asc' } })
      : await prisma.user.findMany({ where: { id: session.id } });
    const employees = new Map<string, {
      employeeId: string; employeeName: string; attentions: number; performed: number;
      totalCents: number; commissionCents: number; amountToNaniCents: number; cashCents: number; transferCents: number; productSales: number; productQuantity: number; productTotalCents: number; productAmountToNaniCents: number; commonBoxCents: number;
    }>();
    for (const employee of activeEmployees) {
      employees.set(employee.id, {
        employeeId: employee.id, employeeName: employee.displayName,
        attentions: 0, performed: 0, totalCents: 0, commissionCents: 0, amountToNaniCents: 0, cashCents: 0, transferCents: 0, productSales: 0, productQuantity: 0, productTotalCents: 0, productAmountToNaniCents: 0, commonBoxCents: 0
      });
    }
    for (const attendance of daily) {
      const current = employees.get(attendance.employeeId) ?? {
        employeeId: attendance.employeeId, employeeName: attendance.employee.displayName,
        attentions: 0, performed: 0, totalCents: 0, commissionCents: 0, amountToNaniCents: 0, cashCents: 0, transferCents: 0, productSales: 0, productQuantity: 0, productTotalCents: 0, productAmountToNaniCents: 0, commonBoxCents: 0
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
    for (const sale of productSales) {
      const current = employees.get(sale.sellerId) ?? {
        employeeId: sale.sellerId, employeeName: sale.seller.displayName,
        attentions: 0, performed: 0, totalCents: 0, commissionCents: 0, amountToNaniCents: 0, cashCents: 0, transferCents: 0, productSales: 0, productQuantity: 0, productTotalCents: 0, productAmountToNaniCents: 0, commonBoxCents: 0
      };
      current.productSales += 1;
      current.productQuantity += sale.items.reduce((total, item) => total + item.quantity, 0);
      current.productTotalCents += sale.totalCents;
      current.productAmountToNaniCents += sale.amountToNaniCents;
      current.amountToNaniCents += sale.amountToNaniCents;
      current.commonBoxCents += sale.commonBoxCents;
      if (sale.paymentMethod === 'cash') current.cashCents += sale.totalCents;
      else current.transferCents += sale.totalCents;
      employees.set(sale.sellerId, current);
    }
    const totals = [...employees.values()].reduce((sum, employee) => ({
      attentions: sum.attentions + employee.attentions,
      performed: sum.performed + employee.performed,
      totalCents: sum.totalCents + employee.totalCents,
      amountToNaniCents: sum.amountToNaniCents + employee.amountToNaniCents,
      productSales: sum.productSales + employee.productSales,
      productQuantity: sum.productQuantity + employee.productQuantity,
      productTotalCents: sum.productTotalCents + employee.productTotalCents,
      productAmountToNaniCents: sum.productAmountToNaniCents + employee.productAmountToNaniCents,
      commonBoxCents: sum.commonBoxCents + employee.commonBoxCents
    }), { attentions: 0, performed: 0, totalCents: 0, amountToNaniCents: 0, productSales: 0, productQuantity: 0, productTotalCents: 0, productAmountToNaniCents: 0, commonBoxCents: 0 });
    const remittances = await prisma.dailyRemittance.findMany({ where: { businessDate: date } });
    return {
      date,
      employees: [...employees.values()],
      totals,
      remittances: remittances.map((remittance) => ({
        employeeId: remittance.employeeId,
        amountCents: remittance.amountCents,
        sentAt: remittance.sentAt?.toISOString() ?? null,
        receivedAt: remittance.receivedAt?.toISOString() ?? null
      })),
      attendances: daily
        .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
        .map((attendance) => ({
          id: attendance.id,
          employeeId: attendance.employeeId,
          employeeName: attendance.employee.displayName,
          clientName: attendance.clientName,
          serviceName: attendance.service.name,
          status: attendance.status,
          paymentMethod: attendance.paymentMethod,
          finalAmountCents: attendance.finalAmountCents,
          commissionCents: attendance.commissionCents,
          amountToNaniCents: attendance.amountToNaniCents,
          createdAt: attendance.createdAt.toISOString()
        })),
      productSales: productSales.map((sale) => ({
        id: sale.id, sellerName: sale.seller.displayName, clientName: sale.clientName,
        totalCents: sale.totalCents, amountToNaniCents: sale.amountToNaniCents, commonBoxCents: sale.commonBoxCents,
        createdAt: sale.createdAt.toISOString(), items: sale.items.map((item) => `${item.product.name} ×${item.quantity}`)
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
    await audit(session.id, 'daily_closure.confirmed', 'DailyClosure', date);
    return { closure: { businessDate: closure.businessDate, confirmedAt: closure.confirmedAt.toISOString(), reopenedAt: null } };
  });

  app.post<{ Params: { date: string } }>('/api/v1/daily-closures/:date/reopen', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede reabrir el cierre.' } });
    const closure = await prisma.dailyClosure.findUnique({ where: { businessDate: request.params.date } });
    if (!closure) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No hay un cierre para esa fecha.' } });
    const updated = await prisma.dailyClosure.update({ where: { businessDate: request.params.date }, data: { reopenedAt: new Date(), reopenedById: session.id } });
    await audit(session.id, 'daily_closure.reopened', 'DailyClosure', request.params.date);
    return { closure: { businessDate: updated.businessDate, confirmedAt: updated.confirmedAt.toISOString(), reopenedAt: updated.reopenedAt?.toISOString() ?? null } };
  });

  app.get<{ Querystring: { month?: string } }>('/api/v1/daily-remittances', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const month = request.query.month ?? '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return validation(reply, { month: 'El mes debe tener formato YYYY-MM.' });
    const attendances = await prisma.attendance.findMany({ include: { employee: true } });
    const sales = await prisma.productSale.findMany({ where: { status: 'completed' }, include: { seller: true } });
    const remittances = await prisma.dailyRemittance.findMany({ where: { businessDate: { startsWith: month } } });
    const remittanceMap = new Map(remittances.map((item) => [`${item.businessDate}:${item.employeeId}`, item]));
    const grouped = new Map<string, { date: string; employeeId: string; employeeName: string; amountCents: number }>();
    for (const attendance of attendances) {
      const date = businessDate(attendance.createdAt);
      if (!date.startsWith(`${month}-`) || attendance.employeeId === 'nani' || (session.role !== 'ADMIN' && attendance.employeeId !== session.id) || attendance.status !== 'performed' || attendance.amountToNaniCents <= 0) continue;
      const key = `${date}:${attendance.employeeId}`;
      const current = grouped.get(key) ?? { date, employeeId: attendance.employeeId, employeeName: attendance.employee.displayName, amountCents: 0 };
      current.amountCents += attendance.amountToNaniCents;
      grouped.set(key, current);
    }
    for (const sale of sales) {
      const date = businessDate(sale.createdAt);
      if (!date.startsWith(`${month}-`) || sale.sellerId === 'nani' || (session.role !== 'ADMIN' && sale.sellerId !== session.id) || sale.amountToNaniCents <= 0) continue;
      const key = `${date}:${sale.sellerId}`;
      const current = grouped.get(key) ?? { date, employeeId: sale.sellerId, employeeName: sale.seller.displayName, amountCents: 0 };
      current.amountCents += sale.amountToNaniCents;
      grouped.set(key, current);
    }
    const rows = [...grouped.values()].map((item) => {
      const remittance = remittanceMap.get(`${item.date}:${item.employeeId}`);
      const sentAt = remittance?.sentAt ?? null;
      const receivedAt = remittance?.receivedAt ?? null;
      return {
        ...item,
        sentAmountCents: remittance?.amountCents ?? 0,
        sentAt: sentAt?.toISOString() ?? null,
        receivedAt: receivedAt?.toISOString() ?? null,
        status: receivedAt ? 'recibido' : sentAt ? 'enviado' : 'pendiente'
      };
    }).sort((first, second) => second.date.localeCompare(first.date) || first.employeeName.localeCompare(second.employeeName, 'es'));
    return { month, remittances: rows };
  });

  app.post<{ Params: { date: string } }>('/api/v1/daily-remittances/:date/mark-sent', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'EMPLOYEE') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo las empleadas pueden marcar su entrega.' } });
    const date = request.params.date;
    const amountCents = await owedToNaniCents(session.id, date);
    const remittance = await prisma.dailyRemittance.upsert({
      where: { businessDate_employeeId: { businessDate: date, employeeId: session.id } },
      update: { amountCents, sentAt: new Date(), receivedAt: null, receivedById: null },
      create: { id: randomUUID(), businessDate: date, employeeId: session.id, amountCents, sentAt: new Date() }
    });
    await audit(session.id, 'remittance.marked_sent', 'DailyRemittance', `${date}:${session.id}`, { amountCents });
    return { remittance: presentRemittance(remittance) };
  });

  app.get('/api/v1/admin/daily-remittances/pending', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const today = businessDate(new Date());
    const attendances = await prisma.attendance.findMany({ include: { employee: true } });
    const remittances = await prisma.dailyRemittance.findMany();
    const remittanceMap = new Map(remittances.map((item) => [`${item.businessDate}:${item.employeeId}`, item]));
    const grouped = new Map<string, { date: string; employeeId: string; employeeName: string; amountCents: number }>();
    for (const attendance of attendances) {
      const date = businessDate(attendance.createdAt);
      if (date >= today || attendance.employeeId === 'nani' || (session.role !== 'ADMIN' && attendance.employeeId !== session.id) || attendance.status !== 'performed' || attendance.amountToNaniCents <= 0) continue;
      const key = `${date}:${attendance.employeeId}`;
      const current = grouped.get(key) ?? { date, employeeId: attendance.employeeId, employeeName: attendance.employee.displayName, amountCents: 0 };
      current.amountCents += attendance.amountToNaniCents;
      grouped.set(key, current);
    }
    const productSales = await prisma.productSale.findMany({ where: { status: 'completed' }, include: { seller: true } });
    for (const sale of productSales) {
      const date = businessDate(sale.createdAt);
      if (date >= today || sale.sellerId === 'nani' || (session.role !== 'ADMIN' && sale.sellerId !== session.id) || sale.amountToNaniCents <= 0) continue;
      const key = `${date}:${sale.sellerId}`;
      const current = grouped.get(key) ?? { date, employeeId: sale.sellerId, employeeName: sale.seller.displayName, amountCents: 0 };
      current.amountCents += sale.amountToNaniCents;
      grouped.set(key, current);
    }
    const pending = [...grouped.values()].map((item) => {
      const remittance = remittanceMap.get(`${item.date}:${item.employeeId}`);
      const alreadySent = remittance?.amountCents ?? 0;
      return { ...item, alreadySent, remainingCents: Math.max(item.amountCents - alreadySent, 0), sentAt: remittance?.sentAt?.toISOString() ?? null };
    }).filter((item) => !item.sentAt || item.remainingCents > 0).sort((first, second) => second.date.localeCompare(first.date));
    return { pending };
  });

  app.post<{ Params: { date: string; employeeId: string } }>('/api/v1/admin/daily-remittances/:date/:employeeId/mark-sent', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede corregir una entrega.' } });
    const amountCents = await owedToNaniCents(request.params.employeeId, request.params.date);
    const remittance = await prisma.dailyRemittance.upsert({
      where: { businessDate_employeeId: { businessDate: request.params.date, employeeId: request.params.employeeId } },
      update: { amountCents, sentAt: new Date(), receivedAt: null, receivedById: null },
      create: { id: randomUUID(), businessDate: request.params.date, employeeId: request.params.employeeId, amountCents, sentAt: new Date() }
    });
    await audit(session.id, 'remittance.marked_sent_by_admin', 'DailyRemittance', `${request.params.date}:${request.params.employeeId}`, { amountCents });
    return { remittance: presentRemittance(remittance) };
  });

  app.post<{ Params: { date: string; employeeId: string } }>('/api/v1/admin/daily-remittances/:date/:employeeId/mark-received', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede confirmar la recepción.' } });
    const { date, employeeId } = request.params;
    const remittance = await prisma.dailyRemittance.findUnique({ where: { businessDate_employeeId: { businessDate: date, employeeId } } });
    if (!remittance?.sentAt) return reply.code(409).send({ error: { code: 'REMITTANCE_NOT_SENT', message: 'Solo se puede confirmar una entrega ya enviada.' } });
    const owedCents = await owedToNaniCents(employeeId, date);
    if (remittance.amountCents < owedCents) return reply.code(409).send({ error: { code: 'REMITTANCE_SHORTFALL', message: 'El monto enviado no cubre lo adeudado del día.' } });
    const updated = await prisma.dailyRemittance.update({
      where: { businessDate_employeeId: { businessDate: date, employeeId } },
      data: { receivedAt: new Date(), receivedById: session.id }
    });
    await audit(session.id, 'remittance.marked_received', 'DailyRemittance', `${date}:${employeeId}`, { amountCents: updated.amountCents });
    return { remittance: presentRemittance(updated) };
  });

  app.post<{ Params: { date: string; employeeId: string } }>('/api/v1/admin/daily-remittances/:date/:employeeId/clear-received', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede quitar la confirmación.' } });
    const { date, employeeId } = request.params;
    const remittance = await prisma.dailyRemittance.findUnique({ where: { businessDate_employeeId: { businessDate: date, employeeId } } });
    if (!remittance?.receivedAt) return reply.code(409).send({ error: { code: 'REMITTANCE_NOT_RECEIVED', message: 'Esa entrega no está marcada como recibida.' } });
    const updated = await prisma.dailyRemittance.update({
      where: { businessDate_employeeId: { businessDate: date, employeeId } },
      data: { receivedAt: null, receivedById: null }
    });
    await audit(session.id, 'remittance.receipt_cleared', 'DailyRemittance', `${date}:${employeeId}`, { amountCents: updated.amountCents });
    return { remittance: presentRemittance(updated) };
  });

  app.post<{ Params: { date: string; employeeId: string } }>('/api/v1/daily-remittances/:date/:employeeId/reset', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede corregir una entrega.' } });
    await prisma.dailyRemittance.deleteMany({ where: { businessDate: request.params.date, employeeId: request.params.employeeId } });
    await audit(session.id, 'remittance.reset', 'DailyRemittance', `${request.params.date}:${request.params.employeeId}`);
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
    await audit(session.id, 'expense.created', 'Expense', expense.id, { expenseDate, category, amountCents });
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
    if (expense) await audit(session.id, 'expense.deleted', 'Expense', expense.id, { expenseDate: expense.expenseDate, amountCents: expense.amountCents });
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
    await audit(session.id, 'monthly_closure.confirmed', 'MonthlyClosure', month);
    return { closure: { month: closure.month, confirmedAt: closure.confirmedAt.toISOString(), reopenedAt: null } };
  });

  app.post<{ Params: { month: string } }>('/api/v1/admin/monthly-closures/:month/reopen', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== 'ADMIN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede reabrir el mes.' } });
    const closure = await prisma.monthlyClosure.findUnique({ where: { month: request.params.month } });
    if (!closure) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No hay un cierre para ese mes.' } });
    const updated = await prisma.monthlyClosure.update({ where: { month: request.params.month }, data: { reopenedAt: new Date(), reopenedById: session.id } });
    await audit(session.id, 'monthly_closure.reopened', 'MonthlyClosure', request.params.month);
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
        serviceIds: storedServiceIds(attendance),
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
    const serviceIds = requestedServiceIds(body);
    const fields: Record<string, string> = {};
    if (!clientName) fields.clientName = 'Ingresá el nombre completo de la clienta.';
    if (serviceIds.length === 0) fields.serviceIds = 'Elegí al menos un servicio.';
    if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'transfer') fields.paymentMethod = 'Elegí efectivo o transferencia.';
    if (body.status !== undefined && body.status !== 'performed' && body.status !== 'cancelled' && body.status !== 'absent') fields.status = 'Elegí un estado válido.';
    if (Object.keys(fields).length) return validation(reply, fields);

    const services = await prisma.service.findMany({ where: { id: { in: serviceIds }, active: true, employees: { some: { id: session.id } } } });
    if (services.length !== serviceIds.length) return validation(reply, { serviceIds: 'Todos los servicios deben estar habilitados para tu usuario.' });
    const paymentMethod = body.paymentMethod as 'cash' | 'transfer';
    const status = (body.status ?? attendance.status) as Attendance['status'];
    const amounts = calculateAttendanceBundleAmounts(session.id, services, paymentMethod, status);
    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clientName,
        serviceId: services[0].id,
        serviceIdsJson: JSON.stringify(serviceIds),
        paymentMethod,
        status,
        ...amounts
      },
      include: { service: true }
    });
    await prisma.dailyRemittance.updateMany({
      where: { businessDate: businessDate(attendance.createdAt), employeeId: session.id, sentAt: { not: null } },
      data: { sentAt: null, receivedAt: null, receivedById: null }
    });
    await audit(session.id, 'attendance.updated', 'Attendance', updated.id, { serviceIds, status });
    return {
      attendance: {
        id: updated.id,
        employeeId: updated.employeeId,
        clientName: updated.clientName,
        serviceId: updated.serviceId,
        serviceIds: storedServiceIds(updated),
        serviceName: services.map((service) => service.name).join(' + '),
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

  app.post<{ Body: { displayName?: unknown; pin?: unknown } }>('/api/v1/admin/employees', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || session.id !== 'nani' || !can(session, 'admin:write')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const displayName = typeof request.body?.displayName === 'string' ? request.body.displayName.trim() : '';
    const pin = typeof request.body?.pin === 'string' ? request.body.pin : '';
    const fields: Record<string, string> = {};
    if (displayName.length < 2) fields.displayName = 'Ingresá un nombre válido.';
    if (!/^\d{4}$/.test(pin)) fields.pin = 'El PIN debe tener exactamente 4 dígitos.';
    if (Object.keys(fields).length) return validation(reply, fields);
    const employee = await prisma.user.create({
      data: { id: randomUUID(), displayName, role: 'EMPLOYEE', active: true, pinHash: hashPin(pin) },
      select: { id: true, displayName: true, role: true, active: true }
    });
    await audit(session.id, 'employee.created', 'User', employee.id, { displayName });
    return reply.code(201).send({ employee });
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
    await audit(session.id, request.body.active ? 'employee.activated' : 'employee.deactivated', 'User', employee.id);
    return { employee: updated };
  });

  app.patch<{ Params: { employeeId: string }; Body: ChangeEmployeePinRequest }>('/api/v1/admin/employees/:employeeId/pin', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:write')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'No tenés permisos para esta función.' } });
    }
    const pin = request.body?.pin;
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return validation(reply, { pin: 'El PIN debe tener exactamente 4 dígitos.' });
    }
    const isOwnAdminPin = request.params.employeeId === session.id && session.role === 'ADMIN';
    const employee = await prisma.user.findFirst({
      where: { id: request.params.employeeId, role: isOwnAdminPin ? 'ADMIN' : 'EMPLOYEE' }
    });
    if (!employee) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Empleada no encontrada.' } });
    if (isOwnAdminPin) {
      const currentPin = (request.body as { currentPin?: unknown } | undefined)?.currentPin;
      const confirmPin = (request.body as { confirmPin?: unknown } | undefined)?.confirmPin;
      if (typeof confirmPin !== 'string' || confirmPin !== pin) {
        return validation(reply, { confirmPin: 'Repetí el mismo PIN nuevo.' });
      }
      if (typeof currentPin !== 'string' || !verifyPin(currentPin, employee.pinHash)) {
        return validation(reply, { currentPin: 'El PIN actual no coincide.' });
      }
    }
    const action = isOwnAdminPin ? 'account.pin_changed' : 'employee.pin_changed';
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: employee.id }, data: { pinHash: hashPin(pin) } });
      await transaction.auditLog.create({
        data: { id: randomUUID(), actorId: session.id, action, entityType: 'User', entityId: employee.id, detailsJson: '{}' }
      });
    });
    if (isOwnAdminPin) {
      const currentToken = request.cookies[SESSION_COOKIE];
      for (const [token, stored] of sessions) {
        if (stored.id === employee.id && token !== currentToken) sessions.delete(token);
      }
    }
    return { employeeId: employee.id };
  });

  app.get<{ Querystring: { from?: string; to?: string; actorId?: string; action?: string } }>('/api/v1/admin/audit-logs', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.id !== 'nani' || !can(session, 'admin:read')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Solo NANI puede consultar la actividad.' } });
    }
    const { from, to, actorId, action } = request.query;
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(actorId ? { actorId } : {}),
        ...(action ? { action } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lt: new Date(`${to}T23:59:59.999`) } : {}) } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 250
    });
    const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((log) => log.actorId))] } }, select: { id: true, displayName: true } });
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.displayName]));
    return {
      logs: logs.map((log) => ({
        id: log.id,
        actorId: log.actorId,
        actorName: actorNames.get(log.actorId) ?? log.actorId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        details: JSON.parse(log.detailsJson),
        createdAt: log.createdAt.toISOString()
      }))
    };
  });

  if (process.env.SERVE_WEB === 'true') {
    const webDist = path.join(projectRoot, 'apps', 'web', 'dist');
    if (!existsSync(webDist)) {
      throw new Error(`No está el sitio compilado en ${webDist}.`);
    }
    void app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      const url = request.url.split('?')[0] ?? request.url;
      if (url.startsWith('/api/')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No encontrado.' } });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
