import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_USERS, INITIAL_SERVICES, verifyPin } from '../packages/domain/src/index.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = path.join(projectRoot, 'prisma', 'data', 'studiobynani.sqlite');
const appliedMarkerPath = path.join(projectRoot, 'prisma', 'data', 'real-start-applied');

export async function runAfterSuccessfulBackup(backup: () => Promise<void>, apply: () => Promise<void>) {
  try {
    await backup();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
  await apply();
  return true;
}

export async function applyRealStart(prisma: PrismaClient) {
    const catalogIds = INITIAL_SERVICES.map((service) => service.id);
    const userIds = DEFAULT_USERS.map((user) => user.id);

    await prisma.$transaction(async (transaction) => {
      await transaction.productSaleItem.deleteMany();
      await transaction.productSale.deleteMany();
      await transaction.productPurchase.deleteMany();
      await transaction.product.deleteMany();
      await transaction.attendance.deleteMany();
      await transaction.dailyRemittance.deleteMany();
      await transaction.dailyClosure.deleteMany();
      await transaction.monthlyClosure.deleteMany();
      await transaction.expense.deleteMany();
      await transaction.session.deleteMany();
      await transaction.auditLog.deleteMany();

      const existingServices = await transaction.service.findMany({ select: { id: true } });
      for (const service of existingServices) {
        await transaction.service.update({
          where: { id: service.id },
          data: { employees: { set: [] } }
        });
      }
      await transaction.service.deleteMany({ where: { id: { notIn: catalogIds } } });

      for (const user of DEFAULT_USERS) {
        await transaction.user.upsert({
          where: { id: user.id },
          update: {
            displayName: user.displayName,
            role: user.role,
            active: user.active,
            pinHash: user.pinHash
          },
          create: {
            id: user.id,
            displayName: user.displayName,
            role: user.role,
            active: user.active,
            pinHash: user.pinHash
          }
        });
      }
      await transaction.user.deleteMany({ where: { id: { notIn: userIds } } });

      for (const service of INITIAL_SERVICES) {
        await transaction.service.upsert({
          where: { id: service.id },
          update: {
            name: service.name,
            category: service.category,
            baseAmountCents: service.baseAmountCents,
            durationMinutes: service.durationMinutes,
            active: true,
            employees: { set: [] }
          },
          create: {
            id: service.id,
            name: service.name,
            category: service.category,
            baseAmountCents: service.baseAmountCents,
            durationMinutes: service.durationMinutes,
            active: true
          }
        });
      }
    }, { timeout: 120000 });

    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    const services = await prisma.service.findMany({ include: { employees: true }, orderBy: { id: 'asc' } });
    const assignedEmployees = services.reduce((total, service) => total + service.employees.length, 0);
    const movement = [
      await prisma.attendance.count(),
      await prisma.productSale.count(),
      await prisma.productSaleItem.count(),
      await prisma.productPurchase.count(),
      await prisma.product.count(),
      await prisma.expense.count(),
      await prisma.dailyClosure.count(),
      await prisma.monthlyClosure.count(),
      await prisma.dailyRemittance.count(),
      await prisma.session.count(),
      await prisma.auditLog.count()
    ].reduce((total, count) => total + count, 0);
    const pinsOk = users.length === DEFAULT_USERS.length && users.every((user) => verifyPin('1234', user.pinHash));
    const catalogOk = services.length === INITIAL_SERVICES.length
      && services.every((service) => service.active && service.employees.length === 0)
      && !services.some((service) => /d[ií]a completo/i.test(service.name));

    console.log(`Usuarias: ${users.length}`);
    console.log(`Servicios: ${services.length}`);
    console.log(`Empleadas asignadas: ${assignedEmployees}`);
    console.log(`Filas de movimiento: ${movement}`);
    for (const user of users) {
      console.log(`PIN 1234 ${user.displayName}: ${verifyPin('1234', user.pinHash) ? 'entra' : 'no entra'}`);
    }

    if (!pinsOk || !catalogOk || assignedEmployees !== 0 || movement !== 0) {
      process.exitCode = 1;
    }
}

async function main() {
  if (existsSync(appliedMarkerPath)) {
    console.error('El inicio real ya se aplicó. No se borra el movimiento ni se reinician los PIN.');
    process.exitCode = 1;
    return;
  }
  process.env.DATABASE_URL = `file:${databasePath}`;
  const started = await runAfterSuccessfulBackup(
    async () => {
      const { copyDatabase } = await import('./backup-db.js');
      copyDatabase(databasePath);
    },
    async () => {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      try {
        await applyRealStart(prisma);
      } finally {
        await prisma.$disconnect();
      }
    }
  );
  if (!started || process.exitCode) {
    process.exitCode = 1;
    return;
  }
  writeFileSync(appliedMarkerPath, new Date().toISOString());
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
