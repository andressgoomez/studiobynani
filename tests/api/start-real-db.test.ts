import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { hashPin, INITIAL_SERVICES, verifyPin } from '../../packages/domain/src/index.js';
import { copyDatabase } from '../../scripts/backup-db.js';
import { applyRealStart, runAfterSuccessfulBackup } from '../../scripts/start-real-db.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'nani-start-'));
const databaseUrl = `file:${path.join(tempDir, 'test.sqlite').replaceAll('\\', '/')}`;
const previousDatabaseUrl = process.env.DATABASE_URL;

describe('inicio de la base real', () => {
  afterAll(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('no escribe si la copia falla', async () => {
    let applied = false;
    const started = await runAfterSuccessfulBackup(async () => {
      throw new Error('sin copia');
    }, async () => {
      applied = true;
    });
    expect(started).toBe(false);
    expect(applied).toBe(false);
  });

  it('si la copia sale bien, aplica el inicio', async () => {
    let applied = false;
    const started = await runAfterSuccessfulBackup(async () => {}, async () => {
      applied = true;
    });
    expect(started).toBe(true);
    expect(applied).toBe(true);
  });

  it('copia el sqlite indicado a la carpeta de backups', () => {
    const source = path.join(tempDir, 'origen.sqlite');
    writeFileSync(source, 'origen');
    const backupPath = copyDatabase(source);
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, 'utf8')).toBe('origen');
    rmSync(backupPath);
  });

  it('deja 23 servicios sin movimiento y el arranque no pisa lo que NANI cambió', async () => {
    process.env.DATABASE_URL = databaseUrl;
    execSync('npx prisma db push --skip-generate --accept-data-loss', { cwd: projectRoot, env: process.env, stdio: 'pipe' });
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
    await prisma.user.create({ data: { id: 'nani', displayName: 'X', role: 'ADMIN', active: true, pinHash: 'no' } });
    await prisma.user.create({ data: { id: 'juanita', displayName: 'JUANITA', role: 'EMPLOYEE', active: true, pinHash: 'no' } });
    await prisma.service.create({
      data: { id: 'fuera', name: 'día completo', category: 'General', baseAmountCents: 1, durationMinutes: 60, active: true }
    });
    await prisma.service.create({
      data: {
        id: 'perfilado-cejas', name: 'Viejo', category: 'Vieja', baseAmountCents: 1, durationMinutes: 1, active: false,
        employees: { connect: { id: 'nani' } }
      }
    });
    await prisma.attendance.create({
      data: {
        id: 'att-1', employeeId: 'nani', clientName: 'Ana Pérez', serviceId: 'fuera', paymentMethod: 'cash',
        baseAmountCents: 1, discountCents: 0, finalAmountCents: 1, commissionCents: 0, amountToNaniCents: 1
      }
    });
    await prisma.product.create({
      data: { id: 'prod-1', name: 'Crema', supplierType: 'once', supplierName: 'x', currentCostCents: 1, salePriceCents: 2 }
    });
    await prisma.productPurchase.create({
      data: { id: 'pur-1', productId: 'prod-1', quantity: 1, unitCostCents: 1, supplierName: 'x', purchasedAt: '2026-10-08', createdById: 'nani' }
    });
    await prisma.productSale.create({
      data: {
        id: 'sale-1', sellerId: 'nani', clientName: 'Ana', paymentMethod: 'cash', totalCents: 2, profitCents: 1,
        employeeCommissionCents: 0, amountToNaniCents: 2, commonBoxCents: 0
      }
    });
    await prisma.productSaleItem.create({
      data: {
        id: 'item-1', saleId: 'sale-1', productId: 'prod-1', quantity: 1, unitCostCents: 1,
        saleUnitPriceCents: 2, lineTotalCents: 2, profitCents: 1
      }
    });
    await prisma.expense.create({
      data: { id: 'exp-1', expenseDate: '2026-10-08', category: 'Alquiler', description: 'x', amountCents: 1, paidById: 'nani' }
    });
    await prisma.dailyClosure.create({
      data: { id: 'dc-1', businessDate: '2026-10-08', confirmedAt: new Date(), confirmedById: 'nani' }
    });
    await prisma.monthlyClosure.create({
      data: { id: 'mc-1', month: '2026-10', confirmedAt: new Date(), confirmedById: 'nani' }
    });
    await prisma.dailyRemittance.create({
      data: { id: 'dr-1', businessDate: '2026-10-08', employeeId: 'nani', amountCents: 1 }
    });
    await prisma.session.create({
      data: { id: 'ses-1', userId: 'nani', expiresAt: new Date('2026-10-14T00:00:00.000Z') }
    });
    await prisma.auditLog.create({
      data: { id: 'aud-1', actorId: 'nani', action: 'x', entityType: 'Service' }
    });

    await applyRealStart(prisma);

    const services = await prisma.service.findMany({ include: { employees: true } });
    expect(await prisma.user.count()).toBe(4);
    expect(services).toHaveLength(23);
    expect(services.every((service) => service.employees.length === 0)).toBe(true);
    expect(services.some((service) => /d[ií]a completo/i.test(service.name))).toBe(false);
    expect(await prisma.service.findUnique({ where: { id: 'fuera' } })).toBeNull();
    expect(await prisma.attendance.count()).toBe(0);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.productSale.count()).toBe(0);
    expect(await prisma.productSaleItem.count()).toBe(0);
    expect(await prisma.productPurchase.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.dailyClosure.count()).toBe(0);
    expect(await prisma.monthlyClosure.count()).toBe(0);
    expect(await prisma.dailyRemittance.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: 'juanita' } })).toBeNull();
    for (const user of await prisma.user.findMany()) expect(verifyPin('1234', user.pinHash)).toBe(true);
    for (const expected of INITIAL_SERVICES) {
      const actual = services.find((service) => service.id === expected.id);
      expect(actual).toMatchObject({
        name: expected.name,
        category: expected.category,
        baseAmountCents: expected.baseAmountCents,
        durationMinutes: expected.durationMinutes,
        active: true
      });
    }

    const keptPin = hashPin('9999', 'kept-salt');
    await prisma.service.update({
      where: { id: 'perfilado-cejas' },
      data: { baseAmountCents: 111, category: 'Editada', employees: { connect: { id: 'lula' } } }
    });
    await prisma.user.update({ where: { id: 'lula' }, data: { pinHash: keptPin } });
    await prisma.service.delete({ where: { id: 'laminado-cejas' } });
    } finally {
      await prisma.$disconnect();
    }

    const { buildApp } = await import('../../apps/api/src/app.js');
    const app = buildApp();
    await app.ready();
    await app.close();

    const check = new PrismaClient();
    try {
    const perfilado = await check.service.findUniqueOrThrow({ where: { id: 'perfilado-cejas' }, include: { employees: true } });
    const laminado = await check.service.findUniqueOrThrow({ where: { id: 'laminado-cejas' }, include: { employees: true } });
    const lula = await check.user.findUniqueOrThrow({ where: { id: 'lula' } });
    const untouched = await check.service.findUniqueOrThrow({ where: { id: 'lash-lifting' }, include: { employees: true } });
    expect(perfilado.baseAmountCents).toBe(111);
    expect(perfilado.category).toBe('Editada');
    expect(perfilado.employees.map((employee) => employee.id)).toEqual(['lula']);
    expect(verifyPin('9999', lula.pinHash)).toBe(true);
    expect(laminado.employees).toHaveLength(0);
    expect(laminado.baseAmountCents).toBe(INITIAL_SERVICES.find((service) => service.id === 'laminado-cejas')?.baseAmountCents);
    expect(untouched.employees).toHaveLength(0);
    } finally {
      await check.$disconnect();
    }
  }, 60000);
});
