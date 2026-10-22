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

export const INITIAL_SERVICES: readonly Service[] = [
  {
    id: 'perfilado-cejas',
    name: 'Perfilado de cejas 🪄 (ef 10% off)',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 2200000,
    durationMinutes: 30,
    active: true,
    enabledFor: []
  },
  {
    id: 'lash-lifting',
    name: 'Lash Lifting 🙌🏽✨ (arqueado, nutrición, tinte) ( ef 10%eff)',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 3500000,
    durationMinutes: 60,
    active: true,
    enabledFor: []
  },
  {
    id: 'combo-ideal',
    name: 'Combo Ideal 🚀  (Perfilado de cejas + lash lifting) ( ef 10%off) c/tinte o s/tinte',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 4600000,
    durationMinutes: 90,
    active: true,
    enabledFor: []
  },
  {
    id: 'combo-perfecto-x3',
    name: 'Combo Perfecto x 3  ⚡️🚀⚡️( perfilado, laminado+ lash lifting c/ tinte o s/ tinte',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 5400000,
    durationMinutes: 90,
    active: true,
    enabledFor: []
  },
  {
    id: 'combo-full-cejas',
    name: 'COMBO FULL CEJAS⚡️     (perfilado + laminado y nutrición)',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 3800000,
    durationMinutes: 60,
    active: true,
    enabledFor: []
  },
  {
    id: 'combo-laminado-lifting',
    name: 'COMBO .      ( Laminado de cejas sin perfilado + Lifting con tinte',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 4300000,
    durationMinutes: 60,
    active: true,
    enabledFor: []
  },
  {
    id: 'maquillaje-social',
    name: 'Maquillaje social',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 10000000,
    durationMinutes: 90,
    active: true,
    enabledFor: []
  },
  {
    id: 'maquillaje-perfilado',
    name: 'Maquillaje + Perfilado de cejas',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 12500000,
    durationMinutes: 90,
    active: true,
    enabledFor: []
  },
  {
    id: 'clase-automaquillaje',
    name: 'Clase de automaquillaje',
    category: 'Cejas, pestañas, makeup 💄🦋',
    baseAmountCents: 7000000,
    durationMinutes: 150,
    active: true,
    enabledFor: []
  },
  {
    id: 'laminado-cejas',
    name: 'Laminado de cejas. Off 10% efectivo',
    category: 'Cejas, pestañas, makeup',
    baseAmountCents: 2200000,
    durationMinutes: 30,
    active: true,
    enabledFor: []
  },
  {
    id: 'perfi-tinte',
    name: 'PERFI + TINTE',
    category: 'Cejas, pestañas, makeup',
    baseAmountCents: 3000000,
    durationMinutes: 45,
    active: true,
    enabledFor: []
  },
  {
    id: 'prueba-maquillaje',
    name: 'Prueba de maquillaje',
    category: 'Cejas, pestañas, makeup',
    baseAmountCents: 5000000,
    durationMinutes: 60,
    active: true,
    enabledFor: []
  },
  {
    id: 'limpieza-extracciones',
    name: '​🧖🏻‍♀️​Limpieza Profunda + Extracciones: Para todo tipo de piel (ideal como mantenimiento mensual)',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 4000000,
    durationMinutes: 75,
    active: true,
    enabledFor: []
  },
  {
    id: 'limpieza-masajes',
    name: '🧖🏻‍♀️Limpieza facial profunda + masajes faciales relax (ideal para esos momentos que quieras darte un mimo)',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 4500000,
    durationMinutes: 75,
    active: true,
    enabledFor: []
  },
  {
    id: 'limpieza-dermaplaning',
    name: '​​🧖🏻‍♀️Limpieza facial  + dermaplaning (Elimina cèlulas muertas y vello facial)',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 4800000,
    durationMinutes: 80,
    active: true,
    enabledFor: []
  },
  {
    id: 'limpieza-drenaje',
    name: '​🧖🏻‍♀️Limpieza facial + Drenaje Linfático Facial: (Detox, desinflamación y efecto descanso).',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 4500000,
    durationMinutes: 75,
    active: true,
    enabledFor: []
  },
  {
    id: 'peeling-enzimatico',
    name: '​🧖🏻‍♀️Peeling Enzimático: (Renovación cutánea y luminosidad).',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 4800000,
    durationMinutes: 75,
    active: true,
    enabledFor: []
  },
  {
    id: 'peeling-quimico',
    name: '​🧖🏻‍♀️Peeling Químico (Renovación, textura, control de manchas y luminosidad).',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 4800000,
    durationMinutes: 75,
    active: true,
    enabledFor: []
  },
  {
    id: 'dermapen-glow',
    name: '🧖🏻‍♀️Dermapen Glow con ACTIVOS CONCENTRADOS: (Nutrición, brillo y suavidad).',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 5500000,
    durationMinutes: 90,
    active: true,
    enabledFor: []
  },
  {
    id: 'dermapen-premium',
    name: '​🧖🏻‍♀️Dermapen Premium con EXOSOMAS: (Regeneración celular avanzada de la piel y estimulaciòn de colàgeno )',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 6500000,
    durationMinutes: 90,
    active: true,
    enabledFor: []
  },
  {
    id: 'hydra-lips',
    name: '💋Hydra Lips con Dermapen (labios hidratados y ligero volumen)',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 3800000,
    durationMinutes: 45,
    active: true,
    enabledFor: []
  },
  {
    id: 'recuperacion-capilar',
    name: '🧖🏻‍♀️Sesión Recuperación Capilar (Dermapen Capilar): (Frena la caída y estimula el crecimiento).',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 6500000,
    durationMinutes: 90,
    active: true,
    enabledFor: []
  },
  {
    id: 'experiencia-skincare',
    name: '🧖🏻‍♀️Experiencia skincare Educación cutánea y Skincare (ideal para recomenzar el cuidado)',
    category: 'Skin care 🧖🏻‍♀️',
    baseAmountCents: 4500000,
    durationMinutes: 60,
    active: true,
    enabledFor: []
  }
];

const commissionRates: Record<UserId, number> = { nani: 100, lula: 70, lola: 60, ledis: 70 };

// El 10% de estos servicios es simbólico: en efectivo se cobra un importe redondo, no el 10% exacto.
const symbolicCashFinalCents: Partial<Record<string, number>> = {
  'perfilado-cejas': 2_000_000,
  'combo-ideal': 4_200_000,
  'combo-perfecto-x3': 4_800_000
};

export function calculateAttendanceAmounts(
  employeeId: UserId,
  service: Pick<Service, 'id' | 'name' | 'baseAmountCents'>,
  paymentMethod: PaymentMethod,
  status: AttendanceStatus
) {
  if (status !== 'performed') {
    return { baseAmountCents: 0, discountCents: 0, finalAmountCents: 0, commissionCents: 0, amountToNaniCents: 0 };
  }
  const isMakeup = service.id.startsWith('maquillaje-') || service.id === 'clase-automaquillaje' || service.id === 'prueba-maquillaje';
  const hasCashDiscount = paymentMethod === 'cash' && employeeId !== 'ledis' && !isMakeup;
  const cashFinalCents = symbolicCashFinalCents[service.id];
  const discountCents = !hasCashDiscount ? 0
    : cashFinalCents !== undefined ? Math.max(0, service.baseAmountCents - cashFinalCents)
    : Math.round(service.baseAmountCents * 0.1);
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

export function calculateAttendanceBundleAmounts(
  employeeId: UserId,
  services: readonly Pick<Service, 'id' | 'name' | 'baseAmountCents'>[],
  paymentMethod: PaymentMethod,
  status: AttendanceStatus
) {
  return services.reduce((total, service) => {
    const amounts = calculateAttendanceAmounts(employeeId, service, paymentMethod, status);
    return {
      baseAmountCents: total.baseAmountCents + amounts.baseAmountCents,
      discountCents: total.discountCents + amounts.discountCents,
      finalAmountCents: total.finalAmountCents + amounts.finalAmountCents,
      commissionCents: total.commissionCents + amounts.commissionCents,
      amountToNaniCents: total.amountToNaniCents + amounts.amountToNaniCents
    };
  }, { baseAmountCents: 0, discountCents: 0, finalAmountCents: 0, commissionCents: 0, amountToNaniCents: 0 });
}
