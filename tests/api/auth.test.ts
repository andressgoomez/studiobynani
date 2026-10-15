import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';

describe('acceso y permisos', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => { await Promise.all(apps.map((app) => app.close())); apps.length = 0; });
  async function app() { const instance = buildApp(); apps.push(instance); await instance.ready(); return instance; }

  it('expone solamente los cuatro usuarios activos', async () => {
    const response = await (await app()).inject({ method: 'GET', url: '/api/v1/auth/users' });
    expect(response.statusCode).toBe(200);
    expect(response.json().users.map((user: { id: string }) => user.id)).toEqual(['nani', 'lula', 'lola', 'ledis']);
  });

  it('crea sesión HttpOnly con PIN válido', async () => {
    const response = await (await app()).inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: '1234' }
    });
    expect(response.statusCode).toBe(200);
    const setCookie = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'][0] : response.headers['set-cookie'];
    expect(setCookie).toContain('studiobynani_session=');
    expect(setCookie?.toLowerCase()).toContain('httponly');
    expect(response.json().user.role).toBe('EMPLOYEE');
  });

  it('rechaza PIN incorrecto y usuario desactivado de forma genérica', async () => {
    const instance = await app();
    const wrong = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: '9999' } });
    const disabled = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'juanita', pin: '1234' } });
    const empty = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: '' } });
    const numeric = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: 1234 } });
    expect(wrong.statusCode).toBe(401);
    expect(disabled.statusCode).toBe(401);
    expect(empty.statusCode).toBe(400);
    expect(numeric.statusCode).toBe(400);
    expect(wrong.json()).toEqual(disabled.json());
    expect(wrong.headers['set-cookie']).toBeUndefined();
    expect(disabled.headers['set-cookie']).toBeUndefined();
    expect(empty.headers['set-cookie']).toBeUndefined();
  });

  it('rechaza recursos protegidos sin sesión y funciones admin para empleadas', async () => {
    const instance = await app();
    expect((await instance.inject({ method: 'GET', url: '/api/v1/admin/summary' })).statusCode).toBe(401);
    const login = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: '1234' } });
    const setCookie = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'][0] : login.headers['set-cookie'];
    const cookie = setCookie?.split(';')[0];
    expect((await instance.inject({ method: 'GET', url: '/api/v1/admin/summary', headers: { cookie } })).statusCode).toBe(403);
    expect((await instance.inject({ method: 'GET', url: '/api/v1/admin/employees', headers: { cookie } })).statusCode).toBe(403);
  });

  it('permite a NANI cambiar PIN y desactivar empleadas sin exponer PINs', async () => {
    const instance = await app();
    const login = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'nani', pin: '1234' } });
    const setCookie = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'][0] : login.headers['set-cookie'];
    const cookie = setCookie?.split(';')[0];
    const list = await instance.inject({ method: 'GET', url: '/api/v1/admin/employees', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().employees).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'lula', active: true })
    ]));
    expect(JSON.stringify(list.json())).not.toContain('pin');

    const pin = await instance.inject({
      method: 'PATCH', url: '/api/v1/admin/employees/lula/pin', headers: { cookie }, payload: { pin: '2468' }
    });
    expect(pin.statusCode).toBe(200);
    expect((await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: '2468' } })).statusCode).toBe(200);

    const disabled = await instance.inject({
      method: 'PATCH', url: '/api/v1/admin/employees/lula/status', headers: { cookie }, payload: { active: false }
    });
    expect(disabled.statusCode).toBe(200);
    expect((await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: '2468' } })).statusCode).toBe(401);
    await instance.inject({ method: 'PATCH', url: '/api/v1/admin/employees/lula/status', headers: { cookie }, payload: { active: true } });
    await instance.inject({ method: 'PATCH', url: '/api/v1/admin/employees/lula/pin', headers: { cookie }, payload: { pin: '1234' } });
  });

  it('permite a NANI cambiar su propio PIN sin poder desactivarse', async () => {
    const instance = await app();
    const login = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'nani', pin: '1234' } });
    const setCookie = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'][0] : login.headers['set-cookie'];
    const cookie = setCookie?.split(';')[0];
    const other = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'nani', pin: '1234' } });
    const otherCookie = (Array.isArray(other.headers['set-cookie']) ? other.headers['set-cookie'][0] : other.headers['set-cookie'])?.split(';')[0];
    let changed = false;
    try {
      const rejected = await instance.inject({
        method: 'PATCH', url: '/api/v1/admin/employees/nani/pin', headers: { cookie },
        payload: { pin: '4321', confirmPin: '4321', currentPin: '0000' }
      });
      expect(rejected.statusCode).toBe(400);
      const mismatched = await instance.inject({
        method: 'PATCH', url: '/api/v1/admin/employees/nani/pin', headers: { cookie },
        payload: { pin: '4321', confirmPin: '1111', currentPin: '1234' }
      });
      expect(mismatched.statusCode).toBe(400);
      expect((await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'nani', pin: '1234' } })).statusCode).toBe(200);
      const pin = await instance.inject({
        method: 'PATCH', url: '/api/v1/admin/employees/nani/pin', headers: { cookie },
        payload: { pin: '4321', confirmPin: '4321', currentPin: '1234' }
      });
      changed = pin.statusCode === 200;
      expect(pin.statusCode).toBe(200);
      expect(pin.json()).toEqual({ employeeId: 'nani' });
      expect(JSON.stringify(pin.json())).not.toContain('4321');
      expect((await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'nani', pin: '4321' } })).statusCode).toBe(200);
      expect((await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'nani', pin: '1234' } })).statusCode).toBe(401);
      expect((await instance.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie } })).statusCode).toBe(200);
      expect((await instance.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie: otherCookie } })).statusCode).toBe(401);
      expect((await instance.inject({ method: 'PATCH', url: '/api/v1/admin/employees/nani/status', headers: { cookie }, payload: { active: false } })).statusCode).toBe(404);
      const lula = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'lula', pin: '1234' } });
      const lulaCookie = (Array.isArray(lula.headers['set-cookie']) ? lula.headers['set-cookie'][0] : lula.headers['set-cookie'])?.split(';')[0];
      expect((await instance.inject({
        method: 'PATCH', url: '/api/v1/admin/employees/nani/pin', headers: { cookie: lulaCookie },
        payload: { pin: '9999', confirmPin: '9999', currentPin: '4321' }
      })).statusCode).toBe(403);
      expect((await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { userId: 'nani', pin: '4321' } })).statusCode).toBe(200);
      const logs = await instance.inject({ method: 'GET', url: '/api/v1/admin/audit-logs?action=account.pin_changed', headers: { cookie } });
      expect(logs.json().logs[0].action).toBe('account.pin_changed');
    } finally {
      if (changed) {
        const restored = await instance.inject({
          method: 'PATCH', url: '/api/v1/admin/employees/nani/pin', headers: { cookie },
          payload: { pin: '1234', confirmPin: '1234', currentPin: '4321' }
        });
        expect(restored.statusCode).toBe(200);
      }
    }
  });
});
