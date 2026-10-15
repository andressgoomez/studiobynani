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

describe('catálogo de productos', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  const clients: PrismaClient[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(clients.splice(0).map((prisma) => prisma.$disconnect()));
  });

  it('oculta un producto eliminado y permite fijar el stock sin cambiar precios', async () => {
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
    const createdSaleIds: string[] = [];
    try {
      const created = await app.inject({
        method: 'POST', url: '/api/v1/admin/products', headers: { cookie: nani },
        payload: { name: 'Crema prueba catálogo', supplierType: 'local', supplierName: 'Proveedor prueba', currentCostCents: 2500, salePriceCents: 8000, lowStockThreshold: 1 }
      });
      expect(created.statusCode).toBe(201);
      const productId = created.json().product.id as string;
      createdProductIds.push(productId);
      const purchase = await app.inject({
        method: 'POST', url: `/api/v1/admin/products/${productId}/purchases`, headers: { cookie: nani },
        payload: { quantity: 4, unitCostCents: 2500, salePriceCents: 8000, supplierName: 'Proveedor prueba', purchasedAt: date }
      });
      expect(purchase.statusCode).toBe(201);

      const listed = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: nani } });
      expect(listed.json().products.find((product: { id: string }) => product.id === productId).stock).toBe(4);

      const lowered = await app.inject({
        method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: nani },
        payload: { stock: 1 }
      });
      expect(lowered.statusCode).toBe(200);
      expect(lowered.json().product).toMatchObject({ stock: 1, currentCostCents: 2500, salePriceCents: 8000 });

      const raised = await app.inject({
        method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: nani },
        payload: { stock: 6 }
      });
      expect(raised.statusCode).toBe(200);
      expect(raised.json().product.stock).toBe(6);
      const afterStock = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: nani } });
      expect(afterStock.json().products.find((product: { id: string }) => product.id === productId)).toMatchObject({ stock: 6, currentCostCents: 2500, salePriceCents: 8000 });
      const purchasesBefore = await prisma.productPurchase.count({ where: { productId } });
      const unchanged = await app.inject({
        method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: nani },
        payload: { stock: 6 }
      });
      expect(unchanged.statusCode).toBe(200);
      expect(await prisma.productPurchase.count({ where: { productId } })).toBe(purchasesBefore);

      expect((await app.inject({ method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: nani }, payload: { stock: -1 } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: nani }, payload: { stock: 100001 } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: lula }, payload: { stock: 2 } })).statusCode).toBe(403);

      const sale = await app.inject({
        method: 'POST', url: '/api/v1/product-sales', headers: { cookie: lula },
        payload: { clientName: 'Clienta catálogo', paymentMethod: 'cash', items: [{ productId, quantity: 1 }] }
      });
      expect(sale.statusCode).toBe(201);
      createdSaleIds.push(sale.json().sale.id as string);
      const afterSale = await app.inject({
        method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: nani },
        payload: { stock: 0 }
      });
      expect(afterSale.statusCode).toBe(200);
      const zeroStock = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: nani } });
      expect(zeroStock.json().products.find((product: { id: string }) => product.id === productId).stock).toBe(0);

      const removed = await app.inject({ method: 'DELETE', url: `/api/v1/admin/products/${productId}`, headers: { cookie: nani } });
      expect(removed.statusCode).toBe(200);
      const hidden = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: nani } });
      expect(hidden.json().products.some((product: { id: string }) => product.id === productId)).toBe(false);
      const stored = await prisma.product.findUnique({ where: { id: productId } });
      expect(stored?.active).toBe(false);
      const recent = await app.inject({ method: 'GET', url: `/api/v1/product-sales/recent?date=${date}`, headers: { cookie: nani } });
      expect(recent.json().sales.some((item: { id: string; items: Array<{ productName: string }> }) => item.id === sale.json().sale.id && item.items.some((line) => line.productName === 'Crema prueba catálogo'))).toBe(true);
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/admin/products/${productId}/stock`, headers: { cookie: nani }, payload: { stock: 3 } })).statusCode).toBe(404);
      expect((await app.inject({
        method: 'POST', url: `/api/v1/admin/products/${productId}/purchases`, headers: { cookie: nani },
        payload: { quantity: 1, unitCostCents: 2500, salePriceCents: 8000, supplierName: 'Proveedor prueba', purchasedAt: date }
      })).statusCode).toBe(404);
    } finally {
      if (createdSaleIds.length) {
        await prisma.productSaleItem.deleteMany({ where: { saleId: { in: createdSaleIds } } });
        await prisma.productSale.deleteMany({ where: { id: { in: createdSaleIds } } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'ProductSale', entityId: { in: createdSaleIds } } });
      }
      if (createdProductIds.length) {
        const purchases = await prisma.productPurchase.findMany({ where: { productId: { in: createdProductIds } }, select: { id: true } });
        if (purchases.length) await prisma.auditLog.deleteMany({ where: { entityType: 'ProductPurchase', entityId: { in: purchases.map((purchase) => purchase.id) } } });
        await prisma.productPurchase.deleteMany({ where: { productId: { in: createdProductIds } } });
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'Product', entityId: { in: createdProductIds } } });
      }
      if (previousRemittance) {
        await prisma.dailyRemittance.update({
          where: { businessDate_employeeId: { businessDate: date, employeeId: 'lula' } },
          data: { amountCents: previousRemittance.amountCents, sentAt: previousRemittance.sentAt, receivedAt: previousRemittance.receivedAt, receivedById: previousRemittance.receivedById }
        });
      }
    }
  });

  it('devolver el stock al cancelar permite vender esa unidad de nuevo', async () => {
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
    const createdSaleIds: string[] = [];
    try {
      const created = await app.inject({
        method: 'POST', url: '/api/v1/admin/products', headers: { cookie: nani },
        payload: { name: 'Crema prueba cancelación', supplierType: 'local', supplierName: 'Proveedor prueba', currentCostCents: 2500, salePriceCents: 8000, lowStockThreshold: 1 }
      });
      expect(created.statusCode).toBe(201);
      const productId = created.json().product.id as string;
      createdProductIds.push(productId);
      expect((await app.inject({
        method: 'POST', url: `/api/v1/admin/products/${productId}/purchases`, headers: { cookie: nani },
        payload: { quantity: 1, unitCostCents: 2500, salePriceCents: 8000, supplierName: 'Proveedor prueba', purchasedAt: date }
      })).statusCode).toBe(201);
      const sale = await app.inject({
        method: 'POST', url: '/api/v1/product-sales', headers: { cookie: lula },
        payload: { clientName: 'Clienta cancelación', paymentMethod: 'cash', items: [{ productId, quantity: 1 }] }
      });
      expect(sale.statusCode).toBe(201);
      createdSaleIds.push(sale.json().sale.id as string);
      expect((await app.inject({
        method: 'POST', url: '/api/v1/product-sales', headers: { cookie: lula },
        payload: { clientName: 'Clienta sin stock', paymentMethod: 'cash', items: [{ productId, quantity: 1 }] }
      })).statusCode).toBe(409);
      const cancelled = await app.inject({ method: 'POST', url: `/api/v1/product-sales/${sale.json().sale.id}/cancel`, headers: { cookie: nani } });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().sale).toMatchObject({ status: 'cancelled', totalCents: 0, amountToNaniCents: 0, items: [] });
      const listed = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: nani } });
      expect(listed.json().products.find((product: { id: string }) => product.id === productId).stock).toBe(1);
      const resold = await app.inject({
        method: 'POST', url: '/api/v1/product-sales', headers: { cookie: lula },
        payload: { clientName: 'Clienta reventa', paymentMethod: 'cash', items: [{ productId, quantity: 1 }] }
      });
      expect(resold.statusCode).toBe(201);
      createdSaleIds.push(resold.json().sale.id as string);
    } finally {
      if (createdSaleIds.length) {
        await prisma.productSaleItem.deleteMany({ where: { saleId: { in: createdSaleIds } } });
        await prisma.productSale.deleteMany({ where: { id: { in: createdSaleIds } } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'ProductSale', entityId: { in: createdSaleIds } } });
      }
      if (createdProductIds.length) {
        const purchases = await prisma.productPurchase.findMany({ where: { productId: { in: createdProductIds } }, select: { id: true } });
        if (purchases.length) await prisma.auditLog.deleteMany({ where: { entityType: 'ProductPurchase', entityId: { in: purchases.map((purchase) => purchase.id) } } });
        await prisma.productPurchase.deleteMany({ where: { productId: { in: createdProductIds } } });
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'Product', entityId: { in: createdProductIds } } });
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
