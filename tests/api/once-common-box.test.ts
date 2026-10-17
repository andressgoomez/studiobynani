import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../apps/api/src/app.js';

function todayInArgentina() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

describe('productos Once en la caja común', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  const clients: PrismaClient[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(clients.splice(0).map((prisma) => prisma.$disconnect()));
  });

  it('deja el total Once en la caja común y el local en la entrega a NANI', async () => {
    const app = buildApp();
    apps.push(app);
    await app.ready();
    const prisma = new PrismaClient();
    clients.push(prisma);
    const login = async (userId: string) => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId, pin: '1234' } });
      const header = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'][0] : response.headers['set-cookie'];
      if (!header) throw new Error(`No se pudo iniciar sesión de ${userId}`);
      return header.split(';')[0];
    };
    const nani = await login('nani');
    const lula = await login('lula');
    const date = todayInArgentina();
    const previousRemittance = await prisma.dailyRemittance.findUnique({ where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } } });
    const createdProductIds: string[] = [];
    const createdPurchaseIds: string[] = [];
    const createdSaleIds: string[] = [];
    const before = await app.inject({ method: 'GET', url: `/api/v1/admin/daily-summary?date=${date}`, headers: { cookie: nani } });
    const lulaBefore = before.json().employees.find((employee: { employeeId: string }) => employee.employeeId === 'lula');
    try {
      const createProduct = async (name: string, supplierType: 'once' | 'local') => {
        const created = await app.inject({
          method: 'POST', url: '/api/v1/admin/products', headers: { cookie: nani },
          payload: { name, supplierType, supplierName: 'Prueba caja común', currentCostCents: 4000, salePriceCents: 10000, lowStockThreshold: 1 }
        });
        expect(created.statusCode).toBe(201);
        const productId = created.json().product.id as string;
        createdProductIds.push(productId);
        const purchase = await app.inject({
          method: 'POST', url: `/api/v1/admin/products/${productId}/purchases`, headers: { cookie: nani },
          payload: { quantity: 2, unitCostCents: 4000, salePriceCents: 10000, supplierName: 'Prueba caja común', purchasedAt: date }
        });
        expect(purchase.statusCode).toBe(201);
        createdPurchaseIds.push(purchase.json().purchase.id as string);
        return productId;
      };
      const onceId = await createProduct('Rimel Once prueba', 'once');
      const localId = await createProduct('Rimel local prueba', 'local');
      const sell = async (items: Array<{ productId: string; quantity: number }>) => {
        const sale = await app.inject({
          method: 'POST', url: '/api/v1/product-sales', headers: { cookie: lula },
          payload: { clientName: 'Clienta caja común', paymentMethod: 'cash', items }
        });
        expect(sale.statusCode).toBe(201);
        createdSaleIds.push(sale.json().sale.id as string);
        return sale.json().sale;
      };

      const onceSale = await sell([{ productId: onceId, quantity: 1 }]);
      expect(onceSale).toMatchObject({ employeeCommissionCents: 0, amountToNaniCents: 0, commonBoxCents: 10000 });

      const localSale = await sell([{ productId: localId, quantity: 1 }]);
      expect(localSale).toMatchObject({ employeeCommissionCents: 3000, amountToNaniCents: 7000, commonBoxCents: 0 });

      const mixedSale = await sell([{ productId: onceId, quantity: 1 }, { productId: localId, quantity: 1 }]);
      expect(mixedSale).toMatchObject({ employeeCommissionCents: 3000, amountToNaniCents: 7000, commonBoxCents: 10000, totalCents: 20000 });

      const after = await app.inject({ method: 'GET', url: `/api/v1/admin/daily-summary?date=${date}`, headers: { cookie: nani } });
      const lulaAfter = after.json().employees.find((employee: { employeeId: string }) => employee.employeeId === 'lula');
      expect(lulaAfter.cashCents - lulaBefore.cashCents).toBe(40000);
      expect(lulaAfter.commonBoxCents - lulaBefore.commonBoxCents).toBe(20000);
      expect(lulaAfter.productAmountToNaniCents - lulaBefore.productAmountToNaniCents).toBe(14000);
      expect(lulaAfter.amountToNaniCents - lulaBefore.amountToNaniCents).toBe(14000);
    } finally {
      if (createdSaleIds.length) {
        await prisma.productSaleItem.deleteMany({ where: { saleId: { in: createdSaleIds } } });
        await prisma.productSale.deleteMany({ where: { id: { in: createdSaleIds } } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'ProductSale', entityId: { in: createdSaleIds } } });
      }
      if (createdProductIds.length) {
        await prisma.productPurchase.deleteMany({ where: { productId: { in: createdProductIds } } });
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'Product', entityId: { in: createdProductIds } } });
        if (createdPurchaseIds.length) await prisma.auditLog.deleteMany({ where: { entityType: 'ProductPurchase', entityId: { in: createdPurchaseIds } } });
      }
      if (previousRemittance) {
        await prisma.dailyRemittance.update({
          where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } },
          data: { amountCents: previousRemittance.amountCents, sentAt: previousRemittance.sentAt, receivedAt: previousRemittance.receivedAt, receivedById: previousRemittance.receivedById }
        });
      }
    }
  });
});
