import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { AttendanceStatus, PaymentMethod, PublicUser, Role, Service, UserId } from '@studiobynani/contracts';

export interface StoredUser extends PublicUser {
  active: boolean;
  pinHash: string;
}

export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  ADMIN: ['dashboard:read', 'admin:read', 'admin:write', 'attendance:read:own', 'attendance:write:own'],
  EMPLOYEE: ['dashboard:read', 'attendance:read:own', 'attendance:write:own']
};

export function hashPin(pin: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}

export function verifyPin(pin: string, encoded: string): boolean {
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected || !/^\d{4}$/.test(pin)) return false;
  const actual = scryptSync(pin, salt, 32);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

export function can(user: Pick<StoredUser, 'role'>, permission: string): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export const DEFAULT_USERS: StoredUser[] = [
  { id: 'nani', displayName: 'NANI', role: 'ADMIN', active: true, pinHash: hashPin('1234', 'nani-seed') },
  { id: 'lula', displayName: 'LULA', role: 'EMPLOYEE', active: true, pinHash: hashPin('1234', 'lula-seed') },
  { id: 'lola', displayName: 'LOLA', role: 'EMPLOYEE', active: true, pinHash: hashPin('1234', 'lola-seed') },
  { id: 'ledis', displayName: 'LEDIS', role: 'EMPLOYEE', active: true, pinHash: hashPin('1234', 'ledis-seed') }
];

export function isActiveUserId(value: string): value is UserId {
  return DEFAULT_USERS.some((user) => user.id === value && user.active);
}

const sharedServices = [
  ['perfilado-cejas', 'Perfilado de cejas', 2200000, 30],
  ['lash-lifting', 'Lash Lifting', 3500000, 60],
  ['combo-ideal', 'Combo Ideal', 4600000, 90],
  ['combo-perfecto-x3', 'Combo Perfecto x3', 5400000, 90],
  ['combo-full-cejas', 'Combo Full Cejas', 3800000, 60],
  ['combo-laminado-lifting', 'Combo laminado de cejas sin perfilado + lifting con tinte', 4300000, 60],
  ['maquillaje-social', 'Maquillaje social', 10000000, 60],
  ['maquillaje-perfilado', 'Maquillaje + perfilado de cejas', 12000000, 90],
  ['clase-automaquillaje', 'Clase de automaquillaje', 7000000, 150],
] as const;

function categoryForService(id: string): string {
  if (id.startsWith('limpieza-')) return 'Limpieza facial';
  if (id.startsWith('peeling-')) return 'Peelings';
  if (id.startsWith('dermapen-')) return 'Dermapen';
  if (id === 'hydra-lips') return 'Labios';
  if (id === 'recuperacion-capilar') return 'Capilar';
  if (id === 'experiencia-skincare') return 'Experiencia';
  if (id.startsWith('maquillaje-') || id === 'clase-automaquillaje') return 'Maquillaje';
  if (id.startsWith('lash-')) return 'Pestañas';
  if (id.startsWith('combo-')) return 'Combos';
  return 'Cejas';
}

const ledisServices = [
  ['limpieza-extracciones', 'Limpieza profunda + extracciones', 3800000, 75],
  ['limpieza-masajes', 'Limpieza facial profunda + masajes faciales', 4000000, 75],
  ['limpieza-dermaplaning', 'Limpieza facial + dermaplaning', 4500000, 80],
  ['limpieza-drenaje', 'Limpieza facial + drenaje linfático', 4000000, 75],
  ['peeling-enzimatico', 'Peeling enzimático', 4800000, 75],
  ['peeling-quimico', 'Peeling químico', 4800000, 75],
  ['dermapen-glow', 'Dermapen Glow con activos concentrados', 4900000, 90],
  ['dermapen-premium', 'Dermapen Premium con exosomas', 5900000, 90],
  ['hydra-lips', 'Hydra Lips con Dermapen', 3500000, 45],
  ['recuperacion-capilar', 'Sesión recuperación capilar (Dermapen capilar)', 6500000, 90],
  ['experiencia-skincare', 'Experiencia Skincare: educación cutánea y skincare', 4500000, 60],
] as const;

export const INITIAL_SERVICES: readonly Service[] = [
  ...sharedServices.map(([id, name, baseAmountCents, durationMinutes]) => ({
    id, name, category: categoryForService(id), baseAmountCents, durationMinutes, active: true,
    enabledFor: ['nani', 'lula', 'lola'] as UserId[]
  })),
  ...ledisServices.map(([id, name, baseAmountCents, durationMinutes]) => ({
    id, name, category: categoryForService(id), baseAmountCents, durationMinutes, active: true,
    enabledFor: ['ledis'] as UserId[]
  }))
];

const commissionRates: Record<UserId, number> = { nani: 100, lula: 70, lola: 60, ledis: 70 };

export function calculateAttendanceAmounts(
  employeeId: UserId,
  service: Pick<Service, 'id' | 'name' | 'baseAmountCents'>,
  paymentMethod: PaymentMethod,
  status: AttendanceStatus
) {
  if (status !== 'performed') {
    return { baseAmountCents: 0, discountCents: 0, finalAmountCents: 0, commissionCents: 0, amountToNaniCents: 0 };
  }
  const isMakeup = service.id.startsWith('maquillaje-') || service.id === 'clase-automaquillaje';
  const hasCashDiscount = paymentMethod === 'cash' && employeeId !== 'ledis' && !isMakeup;
  const discountCents = hasCashDiscount ? Math.round(service.baseAmountCents * 0.1) : 0;
  const finalAmountCents = service.baseAmountCents - discountCents;
  const commissionCents = Math.round(finalAmountCents * commissionRates[employeeId] / 100);
  return {
    baseAmountCents: service.baseAmountCents,
    discountCents,
    finalAmountCents,
    commissionCents,
    amountToNaniCents: finalAmountCents - commissionCents
  };
}
