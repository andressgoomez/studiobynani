export type Role = 'ADMIN' | 'EMPLOYEE';
export type UserId = 'nani' | 'lula' | 'lola' | 'ledis';

export interface PublicUser {
  id: UserId;
  displayName: string;
  role: Role;
}

export interface SessionUser extends PublicUser {
  sessionId: string;
}

export interface LoginRequest {
  userId: string;
  pin: string;
}

export interface AuthResponse {
  user: PublicUser;
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export type PaymentMethod = 'cash' | 'transfer';
export type AttendanceStatus = 'performed' | 'cancelled' | 'absent';

export interface Service {
  id: string;
  name: string;
  category: string;
  baseAmountCents: number;
  durationMinutes: number;
  active: boolean;
  enabledFor: UserId[];
}

export interface CreateServiceRequest {
  name: string;
  category: string;
  baseAmountCents: number;
  durationMinutes: number;
}

export interface UpdateServiceRequest {
  name?: string;
  category?: string;
  baseAmountCents?: number;
  durationMinutes?: number;
  active?: boolean;
}

export interface ServiceAssignment {
  employeeId: UserId;
  serviceIds: string[];
}

export interface ServiceAssignmentsResponse {
  employees: PublicUser[];
  services: Service[];
  assignments: ServiceAssignment[];
}

export interface UpdateServiceAssignmentsRequest {
  serviceIds: string[];
}

export interface ManagedEmployee extends PublicUser {
  active: boolean;
}

export interface EmployeesResponse {
  employees: ManagedEmployee[];
}

export interface UpdateEmployeeStatusRequest {
  active: boolean;
}

export interface ChangeEmployeePinRequest {
  pin: string;
}

export interface CreateAttendanceRequest {
  clientName: string;
  serviceId: string;
  paymentMethod: PaymentMethod;
  status?: AttendanceStatus;
}

export interface UpdateAttendanceRequest {
  clientName: string;
  serviceId: string;
  paymentMethod: PaymentMethod;
  status: AttendanceStatus;
}

export interface Attendance {
  id: string;
  employeeId: UserId;
  clientName: string;
  serviceId: string;
  serviceName: string;
  paymentMethod: PaymentMethod;
  status: AttendanceStatus;
  baseAmountCents: number;
  discountCents: number;
  finalAmountCents: number;
  commissionCents: number;
  amountToNaniCents: number;
  createdAt: string;
  updatedAt: string;
}

export const ACTIVE_USERS: readonly PublicUser[] = [
  { id: 'nani', displayName: 'NANI', role: 'ADMIN' },
  { id: 'lula', displayName: 'LULA', role: 'EMPLOYEE' },
  { id: 'lola', displayName: 'LOLA', role: 'EMPLOYEE' },
  { id: 'ledis', displayName: 'LEDIS', role: 'EMPLOYEE' }
];
