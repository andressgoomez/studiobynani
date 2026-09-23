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
  });
});
