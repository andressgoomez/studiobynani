import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ACTIVE_USERS, type Attendance, type CreateAttendanceRequest, type LoginRequest, type SessionUser, type UpdateAttendanceRequest } from '@studiobynani/contracts';
import { calculateAttendanceAmounts, can, DEFAULT_USERS, INITIAL_SERVICES, verifyPin, type StoredUser } from '@studiobynani/domain';

const SESSION_COOKIE = 'studiobynani_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ATTENDANCE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
type StoredSession = SessionUser & { expiresAt: number };
const sessions = new Map<string, StoredSession>();
const users = new Map<string, StoredUser>(DEFAULT_USERS.map((user) => [user.id, user]));

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
          update: { displayName: user.displayName, role: user.role, active: user.active, pinHash: user.pinHash },
          create: { id: user.id, displayName: user.displayName, role: user.role, active: user.active, pinHash: user.pinHash }
        });
      }
      for (const service of INITIAL_SERVICES) {
        await transaction.service.upsert({
          where: { id: service.id },
          update: {
            name: service.name,
            baseAmountCents: service.baseAmountCents,
            durationMinutes: service.durationMinutes,
            active: service.active,
            employees: { set: service.enabledFor.map((id) => ({ id })) }
          },
          create: {
            id: service.id,
            name: service.name,
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
    const user = users.get(body.userId);
    if (!user || !user.active || !verifyPin(body.pin, user.pinHash)) return invalid(reply);

    const sessionId = randomBytes(32).toString('base64url');
    const sessionUser: StoredSession = {
      id: user.id, displayName: user.displayName, role: user.role, sessionId,
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

  const services = INITIAL_SERVICES.map((service) => ({ ...service, enabledFor: [...service.enabledFor] }));

  app.get('/api/v1/attendances/services', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    return { services: services.filter((service) => service.active && service.enabledFor.includes(session.id)).map(({ enabledFor: _enabledFor, ...service }) => service) };
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

    const service = services.find((item) => item.id === body.serviceId && item.active && item.enabledFor.includes(session.id));
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

    const service = services.find((item) => item.id === body.serviceId && item.active && item.enabledFor.includes(session.id));
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

    const service = services.find((item) => item.id === body.serviceId && item.active && item.enabledFor.includes(session.id));
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

  return app;
}
