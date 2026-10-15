import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Attendance, ManagedEmployee, PublicUser, Service } from '@studiobynani/contracts';
import './styles.css';

const API = '/api/v1';
type Quote = Pick<Attendance, 'serviceId' | 'serviceName' | 'baseAmountCents' | 'discountCents' | 'finalAmountCents' | 'commissionCents' | 'amountToNaniCents'>;
type DailySummary = {
  date: string;
  employees: Array<{ employeeId: string; employeeName: string; attentions: number; performed: number; totalCents: number; commissionCents: number; amountToNaniCents: number; cashCents: number; transferCents: number; productSales: number; productTotalCents: number; productAmountToNaniCents: number; commonBoxCents: number }>;
  totals: { attentions: number; performed: number; totalCents: number; amountToNaniCents: number; productSales: number; productQuantity: number; productTotalCents: number; productAmountToNaniCents: number; commonBoxCents: number };
  remittances: Array<{ employeeId: string; amountCents: number; sentAt: string | null; receivedAt: string | null }>;
  attendances: Array<{ id: string; employeeName: string; clientName: string; serviceName: string; status: Attendance['status']; paymentMethod: Attendance['paymentMethod']; finalAmountCents: number; amountToNaniCents: number; createdAt: string }>;
  productSales: Array<{ id: string; sellerName: string; clientName: string; totalCents: number; amountToNaniCents: number; commonBoxCents: number; createdAt: string; items: string[] }>;
};
type AttendanceDraft = { clientName: string; serviceIds: string[]; paymentMethod: Attendance['paymentMethod']; status: Attendance['status'] };
type DailyClosure = { businessDate: string; confirmedAt: string; reopenedAt: string | null };
type Expense = { id: string; expenseDate: string; category: string; description: string; amountCents: number; createdAt: string; updatedAt: string };
type Product = { id: string; name: string; category: string; supplierType: 'once' | 'local'; supplierName: string; currentCostCents: number; salePriceCents: number; lowStockThreshold: number; active: boolean; stock: number };
type ProductSale = { id: string; clientName: string; paymentMethod: 'cash' | 'transfer'; totalCents: number; amountToNaniCents: number; commonBoxCents: number; status?: 'completed' | 'cancelled'; sellerName: string; createdAt: string; items: Array<{ productId: string; productName: string; quantity: number; lineTotalCents: number }> };
type PendingRemittance = { date: string; employeeId: string; employeeName: string; amountCents: number; alreadySent: number; remainingCents: number; sentAt: string | null };
type MonthRemittance = { date: string; employeeId: string; employeeName: string; amountCents: number; sentAmountCents: number; sentAt: string | null; receivedAt: string | null; status: 'pendiente' | 'enviado' | 'recibido' };
type Report = {
  from: string; to: string;
  closure: { month: string; confirmedAt: string; reopenedAt: string | null } | null;
  totals: { attentions: number; performed: number; totalCents: number; amountToNaniCents: number; expensesCents: number };
  employees: Array<{ employeeId: string; employeeName: string; attentions: number; performed: number; totalCents: number; commissionCents: number; amountToNaniCents: number }>;
  services: Array<{ serviceId: string; serviceName: string; attentions: number; totalCents: number }>;
};
type AuditLog = { id: string; actorName: string; action: string; entityType: string; entityId: string | null; details: Record<string, unknown>; createdAt: string };

function formatAmount(cents: number) {
  return `$${(cents / 100).toLocaleString('es-AR')}`;
}

function businessDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(isoDate));
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDisplayMonth(value: string) {
  const [year, month] = value.slice(0, 7).split('-');
  return year && month ? `${month}/${year}` : value;
}

function formatDisplayDateTime(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}`;
}

function formatDisplayTime(value: string) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function todayInArgentina() {
  return businessDate(new Date().toISOString());
}

function monthStartInArgentina() {
  return `${todayInArgentina().slice(0, 7)}-01`;
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    'attendance.created': 'Creó una atención',
    'attendance.updated': 'Editó una atención',
    'daily_closure.confirmed': 'Confirmó un cierre diario',
    'daily_closure.reopened': 'Reabrió un cierre diario',
    'monthly_closure.confirmed': 'Confirmó un cierre mensual',
    'monthly_closure.reopened': 'Reabrió un cierre mensual',
    'remittance.marked_sent': 'Marcó una entrega como enviada',
    'remittance.marked_sent_by_admin': 'Marcó una entrega como enviada',
    'remittance.marked_received': 'Confirmó que recibió una entrega',
    'remittance.receipt_cleared': 'Quitó la confirmación de una entrega',
    'remittance.reset': 'Restableció una entrega',
    'expense.created': 'Registró un gasto',
    'expense.deleted': 'Eliminó un gasto',
    'employee.activated': 'Activó una empleada',
    'employee.deactivated': 'Desactivó una empleada',
    'employee.pin_changed': 'Cambió el PIN de una empleada',
    'account.pin_changed': 'Cambió su PIN',
    'product.deleted': 'Eliminó un producto',
    'product.stock_adjusted': 'Actualizó el stock de un producto'
  };
  return labels[action] ?? action;
}

function Access({ onLogin }: { onLogin: (user: PublicUser) => void }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [usersLoading, setUsersLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/users`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => Array.isArray(data.users) ? setUsers(data.users) : Promise.reject())
      .catch(() => setError('No se pudieron cargar los usuarios.'))
      .finally(() => setUsersLoading(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) return setError('Elegí tu usuario.');
    if (!/^\d{4}$/.test(pin)) return setError('Ingresá un PIN de 4 dígitos.');
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ userId, pin })
      });
      if (!response.ok) return setError('Usuario o PIN inválido.');
      const data = await response.json(); onLogin(data.user);
    } catch {
      setError('No se pudo conectar con la aplicación.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="access-shell">
    <section className="access-card" aria-labelledby="title">
      <img className="brand-logo" src="/studio-by-nani-logo.png" alt="StudioByNani" />
      <p className="eyebrow">STUDIOBYNANI</p>
      <h1 id="title">Ingresá al estudio</h1>
      <p className="muted">Elegí tu usuario para comenzar.</p>
      <form onSubmit={submit} noValidate aria-busy={loading || usersLoading}>
        <label htmlFor="user">Usuario</label>
        <select id="user" value={userId} onChange={(event) => setUserId(event.target.value)} required disabled={usersLoading || loading}
          aria-describedby={error ? 'access-error' : undefined} aria-invalid={Boolean(error)}>
          <option value="">{usersLoading ? 'Cargando usuarios…' : 'Seleccioná tu nombre'}</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
        </select>
        <label htmlFor="pin">PIN</label>
        <input id="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} type="password" value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          aria-describedby={error ? 'access-error' : undefined} aria-invalid={Boolean(error)} disabled={usersLoading || loading} />
        {error && <p id="access-error" className="error" role="alert">{error}</p>}
        <button disabled={usersLoading || loading} type="submit">{usersLoading ? 'Cargando usuarios…' : loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </section>
  </main>;
}

function placeCatalogService(list: Service[], service: Service) {
  const rest = list.filter((item) => item.id !== service.id);
  if (!service.active) return [...rest, service];
  return [...rest.filter((item) => item.active), service, ...rest.filter((item) => !item.active)];
}

function moveActiveService(list: Service[], serviceId: string, toIndex: number) {
  const actives = list.filter((service) => service.active);
  const fromIndex = actives.findIndex((service) => service.id === serviceId);
  if (fromIndex < 0 || fromIndex === toIndex) return list;
  const nextActives = [...actives];
  const [moved] = nextActives.splice(fromIndex, 1);
  nextActives.splice(toIndex, 0, moved);
  return [...nextActives, ...list.filter((service) => !service.active)];
}

function orderServicesLike(list: Service[], ordered: Service[]) {
  const rank = new Map(ordered.map((service, index) => [service.id, index]));
  return [...list].sort((first, second) => (rank.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(second.id) ?? Number.MAX_SAFE_INTEGER));
}

function Home({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const isAdmin = user.role === 'ADMIN';
  const [adminTab, setAdminTab] = useState<'attendance' | 'catalog' | 'assignments' | 'employees' | 'expenses' | 'reports' | 'activity' | 'products' | 'remittances'>('attendance');
  const [selectedDate, setSelectedDate] = useState(todayInArgentina);
  const [services, setServices] = useState<Service[]>([]);
  const [catalog, setCatalog] = useState<Service[]>([]);
  const catalogRef = useRef(catalog);
  const catalogListRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; serviceId: string; origin: Service[] } | null>(null);
  const catalogEpoch = useRef(0);
  const [draggingServiceId, setDraggingServiceId] = useState<string | null>(null);
  useEffect(() => {
    if (dragRef.current === null) catalogRef.current = catalog;
  }, [catalog]);
  const [catalogEditingId, setCatalogEditingId] = useState<string | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [catalogName, setCatalogName] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogPrice, setCatalogPrice] = useState('');
  const [catalogDuration, setCatalogDuration] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [employees, setEmployees] = useState<PublicUser[]>([]);
  const [assignments, setAssignments] = useState<{ employeeId: string; serviceIds: string[] }[]>([]);
  const [assignmentSaving, setAssignmentSaving] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState('');
  const [managedEmployees, setManagedEmployees] = useState<ManagedEmployee[]>([]);
  const [employeeError, setEmployeeError] = useState('');
  const [pinEmployeeId, setPinEmployeeId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [currentOwnPin, setCurrentOwnPin] = useState('');
  const [confirmOwnPin, setConfirmOwnPin] = useState('');
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeePin, setNewEmployeePin] = useState('');
  const [employeeCreateSaving, setEmployeeCreateSaving] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [clientName, setClientName] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const servicePickerRef = useRef<HTMLDetailsElement>(null);
  const serviceId = selectedServiceIds[0] ?? '';
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer');
  const [status, setStatus] = useState<Attendance['status']>('performed');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [recentLoading, setRecentLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attendanceToEdit, setAttendanceToEdit] = useState<Attendance | null>(null);
  const [attendanceEditDraft, setAttendanceEditDraft] = useState<AttendanceDraft>({ clientName: '', serviceIds: [], paymentMethod: 'transfer', status: 'performed' });
  const [now, setNow] = useState(() => Date.now());
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [dailyClosure, setDailyClosure] = useState<DailyClosure | null>(null);
  const [closureSaving, setClosureSaving] = useState(false);
  const [closureError, setClosureError] = useState('');
  const [remittanceSaving, setRemittanceSaving] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [expenseCategory, setExpenseCategory] = useState('Alquiler');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [expenseMonth, setExpenseMonth] = useState(todayInArgentina().slice(0, 7));
  const [expenseDate, setExpenseDate] = useState(todayInArgentina);
  const [reportFrom, setReportFrom] = useState(monthStartInArgentina);
  const [reportTo, setReportTo] = useState(todayInArgentina);
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [monthlyClosureSaving, setMonthlyClosureSaving] = useState(false);
  const [pendingRemittances, setPendingRemittances] = useState<PendingRemittance[]>([]);
  const [pendingRemittanceSaving, setPendingRemittanceSaving] = useState<string | null>(null);
  const [remittanceMonth, setRemittanceMonth] = useState(todayInArgentina().slice(0, 7));
  const [monthRemittances, setMonthRemittances] = useState<MonthRemittance[]>([]);
  const [monthRemittancesError, setMonthRemittancesError] = useState('');
  const [receiptSaving, setReceiptSaving] = useState<string | null>(null);
  const [remittanceActionError, setRemittanceActionError] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productSales, setProductSales] = useState<ProductSale[]>([]);
  const [productClientName, setProductClientName] = useState('');
  const [productPaymentMethod, setProductPaymentMethod] = useState<'cash' | 'transfer'>('transfer');
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState('');
  const [productTab, setProductTab] = useState<'sales' | 'catalog'>('sales');
  const [productSearch, setProductSearch] = useState('');
  const [editingProductSaleId, setEditingProductSaleId] = useState<string | null>(null);
  const [saleToEdit, setSaleToEdit] = useState<ProductSale | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSupplierType, setNewProductSupplierType] = useState<'once' | 'local'>('local');
  const [newProductSupplierName, setNewProductSupplierName] = useState('');
  const [newProductCost, setNewProductCost] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockSalePrice, setRestockSalePrice] = useState('');
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<ProductSale | null>(null);

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(''), 2500);
  }
  const [restockSearch, setRestockSearch] = useState('');
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const idleTimeout = 7 * 60 * 1000;
    let timer = window.setTimeout(onLogout, idleTimeout);
    const resetIdleTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onLogout, idleTimeout);
    };
    window.addEventListener('pointerdown', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
    };
  }, [onLogout]);

  useEffect(() => {
    const closePicker = (event: PointerEvent) => {
      if (servicePickerRef.current?.open && !servicePickerRef.current.contains(event.target as Node)) {
        servicePickerRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', closePicker);
    return () => document.removeEventListener('pointerdown', closePicker);
  }, []);

  useEffect(() => {
    setRecentLoading(true);
    Promise.all([
      fetch(`${API}/attendances/services`, { credentials: 'include' }),
      fetch(`${API}/attendances/recent`, { credentials: 'include' }),
      ...(isAdmin ? [fetch(`${API}/admin/services`, { credentials: 'include' })] : [])
    ]).then(async ([serviceResponse, recentResponse, catalogResponse]) => {
      if (serviceResponse.status === 401 || recentResponse.status === 401) {
        onLogout();
        return;
      }
      if (!serviceResponse.ok || !recentResponse.ok) throw new Error('load');
      const [serviceData, recentData] = await Promise.all([serviceResponse.json(), recentResponse.json()]);
      setServices(serviceData.services ?? []);
      setAttendances(recentData.attendances ?? []);
      if (isAdmin && catalogResponse?.ok) setCatalog((await catalogResponse.json()).services ?? []);
    }).catch(() => setLoadError('No se pudieron cargar tus atenciones.'))
      .finally(() => setRecentLoading(false));
  }, [isAdmin, onLogout]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/products`, { credentials: 'include' }),
      fetch(`${API}/product-sales/recent?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' })
    ]).then(async ([productsResponse, salesResponse]) => {
      if (productsResponse.status === 401 || salesResponse.status === 401) return onLogout();
      if (!productsResponse.ok || !salesResponse.ok) throw new Error('load');
      setProducts((await productsResponse.json()).products ?? []);
      setProductSales((await salesResponse.json()).sales ?? []);
    }).catch(() => setProductError('No se pudieron cargar los productos.'));
  }, [isAdmin, onLogout, selectedDate]);

  useEffect(() => {
    setSummaryLoading(true); setSummaryError('');
    fetch(`${API}/admin/daily-summary?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        setDailySummary(await response.json());
      })
      .catch(() => setSummaryError('No se pudo cargar el resumen diario.'))
      .finally(() => setSummaryLoading(false));
  }, [isAdmin, selectedDate]);

  useEffect(() => {
    if (!isAdmin || adminTab !== 'reports') return;
    setReportLoading(true); setReportError('');
    fetch(`${API}/admin/reports?from=${encodeURIComponent(reportFrom)}&to=${encodeURIComponent(reportTo)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        setReport(await response.json());
      })
      .catch(() => setReportError('No se pudo cargar el reporte.'))
      .finally(() => setReportLoading(false));
  }, [adminTab, isAdmin, reportFrom, reportTo]);

  useEffect(() => {
    if (!isAdmin || adminTab !== 'activity') return;
    setAuditLoading(true); setAuditError('');
    fetch(`${API}/admin/audit-logs`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        setAuditLogs((await response.json()).logs ?? []);
      })
      .catch(() => setAuditError('No se pudo cargar la actividad.'))
      .finally(() => setAuditLoading(false));
  }, [adminTab, isAdmin]);

  useEffect(() => {
    fetch(`${API}/admin/daily-remittances/pending`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        setPendingRemittances((await response.json()).pending ?? []);
      })
      .catch(() => setPendingRemittances([]));
  }, [isAdmin]);

  useEffect(() => {
    fetch(`${API}/daily-closures/${encodeURIComponent(selectedDate)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        const data = await response.json();
        setDailyClosure(data.closure);
      })
      .catch(() => setClosureError('No se pudo consultar el estado del cierre.'));
  }, [selectedDate]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API}/admin/expenses?month=${encodeURIComponent(expenseMonth)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        const data = await response.json();
        setExpenses(data.expenses ?? []);
        setExpensesTotal(data.totalCents ?? 0);
      })
      .catch(() => setExpenseError('No se pudieron cargar los gastos.'));
  }, [expenseMonth, isAdmin]);

  const loadMonthRemittances = useCallback(() => {
    setMonthRemittancesError('');
    return fetch(`${API}/daily-remittances?month=${encodeURIComponent(remittanceMonth)}`, { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          onLogout();
          return;
        }
        if (!response.ok) throw new Error('load');
        setMonthRemittances((await response.json()).remittances ?? []);
      })
      .catch(() => setMonthRemittancesError('No se pudieron cargar las entregas.'));
  }, [onLogout, remittanceMonth]);

  useEffect(() => {
    if (adminTab !== 'remittances') return;
    loadMonthRemittances();
  }, [adminTab, loadMonthRemittances]);

  async function confirmDailyClosure() {
    setClosureSaving(true); setClosureError('');
    try {
      const response = await fetch(`${API}/daily-closures`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: selectedDate })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo confirmar el cierre.');
      setDailyClosure(data.closure);
    } catch (closureFailure) {
      setClosureError(closureFailure instanceof Error ? closureFailure.message : 'No se pudo confirmar el cierre.');
    } finally {
      setClosureSaving(false);
    }
  }

  async function reopenDailyClosure() {
    setClosureSaving(true); setClosureError('');
    try {
      const response = await fetch(`${API}/daily-closures/${encodeURIComponent(selectedDate)}/reopen`, {
        method: 'POST', credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo reabrir el cierre.');
      setDailyClosure(data.closure);
    } catch (closureFailure) {
      setClosureError(closureFailure instanceof Error ? closureFailure.message : 'No se pudo reabrir el cierre.');
    } finally {
      setClosureSaving(false);
    }
  }

  async function markRemittance() {
    setRemittanceSaving(true);
    try {
      const response = await fetch(`${API}/daily-remittances/${encodeURIComponent(selectedDate)}/mark-sent`, { method: 'POST', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo registrar la entrega.');
      setDailySummary((current) => current ? { ...current, remittances: [...current.remittances.filter((item) => item.employeeId !== user.id), data.remittance] } : current);
    } finally {
      setRemittanceSaving(false);
    }
  }

  async function markPendingRemittance(date: string, employeeId: string) {
    const key = `${date}:${employeeId}`;
    setPendingRemittanceSaving(key);
    try {
      const url = isAdmin
        ? `${API}/admin/daily-remittances/${encodeURIComponent(date)}/${encodeURIComponent(employeeId)}/mark-sent`
        : `${API}/daily-remittances/${encodeURIComponent(date)}/mark-sent`;
      const response = await fetch(url, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('save');
      const pendingResponse = await fetch(`${API}/admin/daily-remittances/pending`, { credentials: 'include' });
      if (pendingResponse.ok) setPendingRemittances((await pendingResponse.json()).pending ?? []);
      else setPendingRemittances((current) => current.filter((item) => `${item.date}:${item.employeeId}` !== key));
      if (isAdmin && date === selectedDate) {
        const summaryResponse = await fetch(`${API}/admin/daily-summary?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' });
        if (summaryResponse.ok) setDailySummary(await summaryResponse.json());
      }
      if (adminTab === 'remittances') await loadMonthRemittances();
      showSuccess('Entrega marcada como enviada.');
    } finally {
      setPendingRemittanceSaving(null);
    }
  }

  async function setRemittanceReceipt(date: string, employeeId: string, action: 'receive' | 'clear') {
    const key = `${date}:${employeeId}`;
    setReceiptSaving(key);
    setRemittanceActionError('');
    try {
      const response = await fetch(`${API}/admin/daily-remittances/${encodeURIComponent(date)}/${encodeURIComponent(employeeId)}/${action === 'receive' ? 'mark-received' : 'clear-received'}`, { method: 'POST', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo actualizar la recepción.');
      if (date === selectedDate) {
        const summaryResponse = await fetch(`${API}/admin/daily-summary?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' });
        if (summaryResponse.ok) setDailySummary(await summaryResponse.json());
      }
      const pendingResponse = await fetch(`${API}/admin/daily-remittances/pending`, { credentials: 'include' });
      if (pendingResponse.ok) setPendingRemittances((await pendingResponse.json()).pending ?? []);
      if (adminTab === 'remittances') await loadMonthRemittances();
      showSuccess(action === 'receive' ? 'Entrega marcada como recibida.' : 'La entrega volvió a enviada.');
    } catch (failure) {
      setRemittanceActionError(failure instanceof Error ? failure.message : 'No se pudo actualizar la recepción.');
    } finally {
      setReceiptSaving(null);
    }
  }

  async function saveProductSale(event: React.FormEvent) {
    event.preventDefault();
    const activeIds = new Set(products.filter((product) => product.active).map((product) => product.id));
    const items = Object.entries(productQuantities).filter(([productId, quantity]) => quantity > 0 && activeIds.has(productId)).map(([productId, quantity]) => ({ productId, quantity }));
    if (!productClientName.trim() || items.length === 0) return setProductError('Ingresá la clienta y elegí al menos un producto.');
    setProductSaving(true); setProductError('');
    try {
      const response = await fetch(editingProductSaleId ? `${API}/product-sales/${editingProductSaleId}` : `${API}/product-sales`, {
        method: editingProductSaleId ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientName: productClientName, paymentMethod: productPaymentMethod, items })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo guardar la venta.');
      const salesResponse = await fetch(`${API}/product-sales/recent?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' });
      if (salesResponse.ok) setProductSales((await salesResponse.json()).sales ?? []);
      setProductClientName(''); setProductQuantities({}); setEditingProductSaleId(null); setSaleToEdit(null);
      showSuccess(editingProductSaleId ? 'Venta actualizada correctamente.' : 'Venta registrada correctamente.');
      const refreshed = await fetch(`${API}/products`, { credentials: 'include' });
      if (refreshed.ok) setProducts((await refreshed.json()).products ?? []);
      const summaryResponse = await fetch(`${API}/admin/daily-summary?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' });
      if (summaryResponse.ok) setDailySummary(await summaryResponse.json());
    } catch (failure) {
      setProductError(failure instanceof Error ? failure.message : 'No se pudo guardar la venta.');
    } finally {
      setProductSaving(false);
    }
  }

  async function cancelProductSale() {
    if (!saleToCancel) return;
    setProductSaving(true); setProductError('');
    try {
      const response = await fetch(`${API}/product-sales/${encodeURIComponent(saleToCancel.id)}/cancel`, { method: 'POST', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo cancelar la venta.');
      const salesResponse = await fetch(`${API}/product-sales/recent?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' });
      if (salesResponse.ok) setProductSales((await salesResponse.json()).sales ?? []);
      const productsResponse = await fetch(`${API}/products`, { credentials: 'include' });
      if (productsResponse.ok) setProducts((await productsResponse.json()).products ?? []);
      const summaryResponse = await fetch(`${API}/admin/daily-summary?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' });
      if (summaryResponse.ok) setDailySummary(await summaryResponse.json());
      setSaleToCancel(null);
      showSuccess('Venta cancelada correctamente.');
    } catch (failure) {
      setProductError(failure instanceof Error ? failure.message : 'No se pudo cancelar la venta.');
    } finally {
      setProductSaving(false);
    }
  }

  function editProductSale(sale: ProductSale) {
    if (Date.now() > new Date(sale.createdAt).getTime() + 24 * 60 * 60 * 1000) return;
    setEditingProductSaleId(sale.id);
    setProductClientName(sale.clientName);
    setProductPaymentMethod(sale.paymentMethod);
    setProductQuantities(Object.fromEntries(sale.items.map((item) => [item.productId, item.quantity])));
    setProductError('');
    setSaleToEdit(sale);
  }

  async function createProduct(event: React.FormEvent) {
    event.preventDefault(); setProductSaving(true); setProductError('');
    try {
      const response = await fetch(`${API}/admin/products`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        name: newProductName, supplierType: newProductSupplierType, supplierName: newProductSupplierName,
        currentCostCents: Math.round(Number(newProductCost.replace(',', '.')) * 100), salePriceCents: Math.round(Number(newProductPrice.replace(',', '.')) * 100)
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo crear el producto.');
      setProducts((current) => [...current, { ...data.product, stock: 0 }]);
      setNewProductName(''); setNewProductSupplierName(''); setNewProductCost(''); setNewProductPrice('');
    } catch (failure) { setProductError(failure instanceof Error ? failure.message : 'No se pudo crear el producto.'); }
    finally { setProductSaving(false); }
  }

  async function restockProduct(event: React.FormEvent) {
    event.preventDefault(); if (!restockId) return;
    setProductSaving(true); setProductError('');
    try {
      const response = await fetch(`${API}/admin/products/${encodeURIComponent(restockId)}/purchases`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantity: Number(restockQuantity), unitCostCents: Math.round(Number(restockCost.replace(',', '.')) * 100), salePriceCents: Math.round(Number(restockSalePrice.replace(',', '.')) * 100) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo registrar la compra.');
      const refreshed = await fetch(`${API}/products`, { credentials: 'include' });
      if (refreshed.ok) setProducts((await refreshed.json()).products ?? []);
      setStockDrafts((current) => { const next = { ...current }; delete next[restockId]; return next; });
      setRestockId(null); setRestockQuantity(''); setRestockCost(''); setRestockSalePrice('');
    } catch (failure) { setProductError(failure instanceof Error ? failure.message : 'No se pudo registrar la compra.'); }
    finally { setProductSaving(false); }
  }

  async function saveProductStock(event: React.FormEvent, product: Product) {
    event.preventDefault();
    const raw = (stockDrafts[product.id] ?? String(product.stock)).trim();
    const stock = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(stock)) {
      setProductError('Ingresá una cantidad entera, cero o mayor.');
      return;
    }
    setProductSaving(true); setProductError('');
    try {
      const response = await fetch(`${API}/admin/products/${encodeURIComponent(product.id)}/stock`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stock }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo actualizar el stock.');
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, stock: data.product.stock } : item));
      const refreshed = await fetch(`${API}/products`, { credentials: 'include' });
      if (refreshed.ok) setProducts((await refreshed.json()).products ?? []);
      setStockDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
      showSuccess('Stock actualizado.');
    } catch (failure) { setProductError(failure instanceof Error ? failure.message : 'No se pudo actualizar el stock.'); }
    finally { setProductSaving(false); }
  }

  async function deleteProduct() {
    if (!productToDelete) return;
    setProductSaving(true); setProductError('');
    try {
      const response = await fetch(`${API}/admin/products/${encodeURIComponent(productToDelete.id)}`, { method: 'DELETE', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo eliminar el producto.');
      setProducts((current) => current.filter((item) => item.id !== productToDelete.id));
      setProductQuantities((current) => { const next = { ...current }; delete next[productToDelete.id]; return next; });
      setStockDrafts((current) => { const next = { ...current }; delete next[productToDelete.id]; return next; });
      setProductToDelete(null);
      showSuccess('Producto eliminado correctamente.');
    } catch (failure) {
      setProductError(failure instanceof Error ? failure.message : 'No se pudo eliminar el producto.');
    } finally {
      setProductSaving(false);
    }
  }

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault(); setExpenseSaving(true); setExpenseError('');
    try {
      const response = await fetch(`${API}/admin/expenses`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expenseDate, category: expenseCategory, description: expenseDescription, amountCents: Math.round(Number(expenseAmount.replace(',', '.')) * 100) })
      });
      const data = await response.json();
      if (!response.ok) return setExpenseError(data.error?.message ?? 'No se pudo guardar el gasto.');
      setExpenses((current) => [data.expense, ...current]);
      setExpensesTotal((current) => current + data.expense.amountCents);
      setExpenseDescription(''); setExpenseAmount('');
    } catch {
      setExpenseError('No se pudo conectar con la aplicación.');
    } finally {
      setExpenseSaving(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!window.confirm(`¿Eliminar el gasto "${expense.description}"?`)) return;
    const response = await fetch(`${API}/admin/expenses/${expense.id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) return setExpenseError('No se pudo eliminar el gasto.');
    setExpenses((current) => current.filter((item) => item.id !== expense.id));
    setExpensesTotal((current) => current - expense.amountCents);
  }

  async function toggleMonthlyClosure() {
    if (!report) return;
    setMonthlyClosureSaving(true);
    try {
      const month = formatDisplayMonth(report.from);
      const url = report.closure && !report.closure.reopenedAt
        ? `${API}/admin/monthly-closures/${encodeURIComponent(month)}/reopen`
        : `${API}/admin/monthly-closures`;
      const response = await fetch(url, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: url.endsWith('monthly-closures') ? JSON.stringify({ month }) : undefined
      });
      if (!response.ok) throw new Error('closure');
      const data = await response.json();
      setReport((current) => current ? { ...current, closure: data.closure } : current);
    } finally {
      setMonthlyClosureSaving(false);
    }
  }

  async function toggleAssignment(employeeId: string, serviceId: string, enabled: boolean) {
    const current = assignments.find((assignment) => assignment.employeeId === employeeId);
    if (!current) return;
    const serviceIds = enabled
      ? [...new Set([...current.serviceIds, serviceId])]
      : current.serviceIds.filter((id) => id !== serviceId);
    setAssignmentSaving(employeeId); setAssignmentError('');
    try {
      const response = await fetch(`${API}/admin/service-assignments/${employeeId}`, {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceIds })
      });
      const data = await response.json();
      if (!response.ok) return setAssignmentError(data.error?.message ?? 'No se pudo guardar la habilitación.');
      setAssignments((currentAssignments) => currentAssignments.map((assignment) =>
        assignment.employeeId === employeeId ? { ...assignment, serviceIds: data.serviceIds } : assignment
      ));
    } catch {
      setAssignmentError('No se pudo conectar con la aplicación.');
    } finally {
      setAssignmentSaving(null);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API}/admin/service-assignments`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        const data = await response.json();
        setEmployees(data.employees ?? []);
        setAssignments(data.assignments ?? []);
      })
      .catch(() => setAssignmentError('No se pudieron cargar las habilitaciones.'));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API}/admin/employees`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load');
        const data = await response.json();
        setManagedEmployees(data.employees ?? []);
      })
      .catch(() => setEmployeeError('No se pudieron cargar las empleadas.'));
  }, [isAdmin]);

  async function toggleEmployee(employee: ManagedEmployee) {
    setEmployeeError('');
    const response = await fetch(`${API}/admin/employees/${employee.id}/status`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !employee.active })
    });
    const data = await response.json();
    if (!response.ok) return setEmployeeError(data.error?.message ?? 'No se pudo cambiar el estado.');
    setManagedEmployees((current) => current.map((item) => item.id === employee.id ? data.employee : item));
  }

  async function changeEmployeePin(event: React.FormEvent) {
    event.preventDefault();
    if (!pinEmployeeId) return;
    setPinSaving(true); setEmployeeError('');
    try {
      const response = await fetch(`${API}/admin/employees/${pinEmployeeId}/pin`, {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pinEmployeeId === 'nani' ? { pin: newPin, currentPin: currentOwnPin, confirmPin: confirmOwnPin } : { pin: newPin })
      });
      const data = await response.json();
      if (!response.ok) return setEmployeeError(data.error?.fields?.currentPin ?? data.error?.fields?.confirmPin ?? data.error?.message ?? 'No se pudo cambiar el PIN.');
      if (pinEmployeeId === 'nani') showSuccess('Tu PIN quedó actualizado.');
      setPinEmployeeId(null); setNewPin(''); setCurrentOwnPin(''); setConfirmOwnPin('');
    } catch {
      setEmployeeError('No se pudo conectar con la aplicación.');
    } finally {
      setPinSaving(false);
    }
  }

  async function createEmployee(event: React.FormEvent) {
    event.preventDefault();
    setEmployeeCreateSaving(true); setEmployeeError('');
    try {
      const response = await fetch(`${API}/admin/employees`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: newEmployeeName, pin: newEmployeePin })
      });
      const data = await response.json();
      if (!response.ok) return setEmployeeError(data.error?.message ?? 'No se pudo crear la empleada.');
      setManagedEmployees((current) => [...current, data.employee]);
      setNewEmployeeName(''); setNewEmployeePin('');
    } catch {
      setEmployeeError('No se pudo conectar con la aplicación.');
    } finally {
      setEmployeeCreateSaving(false);
    }
  }

  async function saveCatalogService(event: React.FormEvent) {
    event.preventDefault();
    setCatalogSaving(true); setCatalogError('');
    const payload = {
      name: catalogName.trim(), category: catalogCategory.trim(),
      baseAmountCents: Math.round(Number(catalogPrice) * 100),
      durationMinutes: Number(catalogDuration)
    };
    try {
      const response = await fetch(`${API}/admin/services${catalogEditingId ? `/${catalogEditingId}` : ''}`, {
        method: catalogEditingId ? 'PATCH' : 'POST',
        credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) return setCatalogError(data.error?.message ?? 'No se pudo guardar el servicio.');
      catalogEpoch.current += 1;
      setCatalog((current) => catalogEditingId
        ? current.map((service) => service.id === catalogEditingId ? data.service : service)
        : placeCatalogService(current, data.service));
      setServices((current) => catalogEditingId
        ? current.map((service) => service.id === catalogEditingId ? data.service : service)
        : [...current, data.service]);
      setCatalogEditingId(null); setCatalogName(''); setCatalogCategory(''); setCatalogPrice(''); setCatalogDuration('');
    } catch { setCatalogError('No se pudo conectar con la aplicación.'); }
    finally { setCatalogSaving(false); }
  }

  function editCatalogService(service: Service) {
    setCatalogEditingId(service.id); setCatalogName(service.name); setCatalogCategory(service.category);
    setCatalogPrice(String(service.baseAmountCents / 100)); setCatalogDuration(String(service.durationMinutes));
    setCatalogError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleCatalogService(service: Service) {
    setCatalogError('');
    const response = await fetch(`${API}/admin/services/${service.id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !service.active })
    });
    const data = await response.json();
    if (!response.ok) return setCatalogError(data.error?.message ?? 'No se pudo cambiar el estado.');
    catalogEpoch.current += 1;
    setCatalog((current) => placeCatalogService(current, data.service));
    setServices((current) => data.service.active
      ? placeCatalogService(current, data.service)
      : current.filter((item) => item.id !== service.id));
  }

  async function deleteCatalogService() {
    if (!serviceToDelete) return;
    setCatalogSaving(true); setCatalogError('');
    try {
      const response = await fetch(`${API}/admin/services/${encodeURIComponent(serviceToDelete.id)}`, { method: 'DELETE', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo eliminar el servicio.');
      catalogEpoch.current += 1;
      setCatalog((current) => placeCatalogService(current, data.service));
      setServices((current) => current.filter((item) => item.id !== serviceToDelete.id));
      setServiceToDelete(null);
      showSuccess('Servicio eliminado correctamente.');
    } catch (failure) {
      setCatalogError(failure instanceof Error ? failure.message : 'No se pudo eliminar el servicio.');
    } finally {
      setCatalogSaving(false);
    }
  }

  function onDragHandlePointerDown(event: React.PointerEvent<HTMLButtonElement>, service: Service) {
    if (!service.active || event.button !== 0 || catalogSaving || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    dragRef.current = { pointerId, serviceId: service.id, origin: catalogRef.current };
    setDraggingServiceId(service.id);
    setCatalogError('');
    const move = (pointerEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (pointerEvent.pointerId !== pointerId || !drag) return;
      pointerEvent.preventDefault();
      const list = catalogListRef.current;
      if (!list) return;
      const cards = [...list.querySelectorAll<HTMLElement>('.service-catalog-card[data-active="true"]')];
      let toIndex = 0;
      for (const card of cards) {
        if (card.dataset.serviceId === drag.serviceId) continue;
        const rect = card.getBoundingClientRect();
        if (pointerEvent.clientY > rect.top + rect.height / 2) toIndex += 1;
      }
      const next = moveActiveService(catalogRef.current, drag.serviceId, toIndex);
      if (next !== catalogRef.current) {
        catalogRef.current = next;
        setCatalog(next);
      }
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingServiceId(null);
      if (!drag) return;
      if (pointerEvent.type === 'pointercancel') {
        catalogRef.current = drag.origin;
        setCatalog(drag.origin);
        return;
      }
      const nextIds = catalogRef.current.filter((item) => item.active).map((item) => item.id);
      const originIds = drag.origin.filter((item) => item.active).map((item) => item.id);
      if (nextIds.join('\0') === originIds.join('\0')) return;
      const epoch = catalogEpoch.current;
      void fetch(`${API}/admin/services/order`, {
        method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceIds: nextIds })
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (catalogEpoch.current !== epoch) return;
        if (!response.ok || !Array.isArray(data.services)) {
          catalogRef.current = drag.origin;
          setCatalog(drag.origin);
          setCatalogError(data.error?.message ?? 'No se pudo guardar el orden.');
          return;
        }
        catalogRef.current = data.services;
        setCatalog(data.services);
        setServices((current) => orderServicesLike(current, data.services));
      }).catch(() => {
        if (catalogEpoch.current !== epoch) return;
        catalogRef.current = drag.origin;
        setCatalog(drag.origin);
        setCatalogError('No se pudo conectar con la aplicación.');
      });
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  useEffect(() => {
    if (!serviceId) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    const controller = new AbortController();
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError('');
    fetch(`${API}/attendances/quote`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceIds: selectedServiceIds, paymentMethod, status }),
      signal: controller.signal
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'No se pudo calcular la cotización.');
      setQuote(data.quote ?? null);
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setQuote(null);
      setQuoteError(reason instanceof Error ? reason.message : 'No se pudo calcular la cotización.');
    }).finally(() => {
      if (!controller.signal.aborted) setQuoteLoading(false);
    });
    return () => controller.abort();
  }, [selectedServiceIds, paymentMethod, status]);

  async function saveAttendance(event: React.FormEvent, draft?: AttendanceDraft) {
    const values = draft ?? { clientName, serviceIds: selectedServiceIds, paymentMethod, status };
    const attendanceId = editingId ?? attendanceToEdit?.id;
    event.preventDefault(); setSaving(true); setError(''); setFieldErrors({});
    if (dailyClosure && !dailyClosure.reopenedAt && selectedDate === todayInArgentina()) {
      setSaving(false);
      return setError('El día ya fue cerrado por NANI. No se pueden registrar nuevas atenciones.');
    }
    try {
      const response = await fetch(`${API}/attendances${attendanceId ? `/${attendanceId}` : ''}`, {
        method: attendanceId ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values)
      });
      const data = await response.json();
      if (!response.ok) {
        setFieldErrors(data.error?.fields ?? {});
        return setError(data.error?.message ?? 'No se pudo guardar la atención.');
      }
      setAttendances((current) => attendanceId
        ? current.map((attendance) => attendance.id === attendanceId ? data.attendance : attendance)
        : [data.attendance, ...current]);
      fetch(`${API}/admin/daily-summary?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' })
        .then((summaryResponse) => summaryResponse.ok ? summaryResponse.json() : null)
        .then((summaryData) => summaryData && setDailySummary(summaryData))
        .catch(() => undefined);
      setClientName(''); setSelectedServiceIds([]); setPaymentMethod('transfer'); setStatus('performed'); setEditingId(null);
      setAttendanceToEdit(null);
      setAttendanceEditDraft({ clientName: '', serviceIds: [], paymentMethod: 'transfer', status: 'performed' });
      showSuccess(attendanceId ? 'Atención actualizada correctamente.' : 'Atención registrada correctamente.');
    } catch { setError('No se pudo conectar con la aplicación.'); }
    finally { setSaving(false); }
  }

  function editAttendance(attendance: Attendance) {
    setAttendanceEditDraft({
      clientName: attendance.clientName,
      serviceIds: attendance.serviceIds?.length ? attendance.serviceIds : [attendance.serviceId],
      paymentMethod: attendance.paymentMethod,
      status: attendance.status
    });
    setError('');
    setAttendanceToEdit(attendance);
  }

  function remainingWindow(createdAt: string) {
    const remaining = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000 - now;
    if (remaining <= 0) return 'La ventana de edición terminó';
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `Podés editar por ${hours} h ${minutes} min más`;
  }

  const visibleAttendances = attendances
    .filter((attendance) => !selectedDate || businessDate(attendance.createdAt) === selectedDate)
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());

  return <main className="home-shell"><header><div className="home-brand"><img src="/studio-by-nani-logo.png" alt="StudioByNani" /><div><p className="eyebrow">STUDIOBYNANI</p><h1>Hola, {user.displayName}</h1></div></div><button className="secondary" onClick={onLogout}>Cerrar sesión</button></header>
    <nav className={`menu-tabs ${isAdmin ? 'admin-menu' : 'employee-menu'}`} aria-label="Menú principal">
      <button className={adminTab === 'attendance' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('attendance')}>Atenciones</button>
      <button className={adminTab === 'products' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('products')}>Productos</button>
      <button className={adminTab === 'remittances' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('remittances')}>Entregas</button>
      {isAdmin && <><button className={adminTab === 'catalog' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('catalog')}>Servicios</button>
      <button className={adminTab === 'employees' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('employees')}>Equipo</button></>}
      {isAdmin && <button className={adminTab === 'expenses' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('expenses')}>Gastos</button>}
      {isAdmin && <button className={adminTab === 'reports' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('reports')}>Reportes</button>}
      {isAdmin && <button className={adminTab === 'activity' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('activity')}>Actividad</button>}
    </nav>
    {successMessage && <p className="success-message" role="status">{successMessage}</p>}
    {isAdmin && adminTab === 'attendance' && <DailyClosureControls date={selectedDate} closure={dailyClosure} saving={closureSaving} error={closureError} onConfirm={confirmDailyClosure} onReopen={reopenDailyClosure} />}
    {(adminTab === 'attendance' || (!isAdmin && adminTab === 'products')) && (isAdmin ? <DailyRemittanceOverview date={selectedDate} summary={dailySummary} saving={pendingRemittanceSaving} receiptSaving={receiptSaving} error={remittanceActionError} onMark={markPendingRemittance} onReceive={(date, employeeId) => setRemittanceReceipt(date, employeeId, 'receive')} onClear={(date, employeeId) => setRemittanceReceipt(date, employeeId, 'clear')} /> : <DailyRemittanceSelf summary={dailySummary} saving={remittanceSaving} onMark={markRemittance} />)}
    {isAdmin && adminTab === 'reports' && <MonthlyClosureControls report={report} saving={monthlyClosureSaving} onToggle={toggleMonthlyClosure} />}
    {(adminTab === 'attendance' || (!isAdmin && adminTab === 'products')) && (isAdmin ? <PendingRemittanceNotice pending={pendingRemittances} saving={pendingRemittanceSaving} onMark={markPendingRemittance} /> : <PendingOwnRemittanceNotice pending={pendingRemittances} saving={pendingRemittanceSaving} onMark={markPendingRemittance} />)}
    <div className={`page-content ${adminTab === 'remittances' ? 'admin-page' : (!isAdmin || adminTab === 'attendance') ? 'attendance-page' : 'admin-page'}`}><>{adminTab === 'attendance' && <section className="day-summary" aria-labelledby="daily-summary-title"><div className="summary-heading"><div><h2 id="daily-summary-title">{isAdmin ? 'Resumen del día' : 'Mi resumen del día'}</h2><p className="muted">{isAdmin ? 'Atenciones, productos y dinero a entregar a NANI del día seleccionado.' : 'Tu facturación y lo que te queda del día seleccionado.'}</p></div><div className="date-filter global-date-filter"><label htmlFor="summary-date">Fecha</label><input id="summary-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button type="button" className="secondary" onClick={() => setSelectedDate(todayInArgentina())}>Hoy</button>{summaryLoading && <span className="summary-loading">Cargando…</span>}</div></div>{summaryError ? <p className="error" role="alert">{summaryError}</p> : dailySummary && <><div className="summary-totals"><span><strong>{dailySummary.totals.performed}</strong> realizadas</span><span><strong>{formatAmount(dailySummary.totals.totalCents)}</strong> atenciones facturadas</span><span><strong>{formatAmount(isAdmin ? dailySummary.totals.amountToNaniCents - dailySummary.totals.productAmountToNaniCents : dailySummary.totals.totalCents - (dailySummary.totals.amountToNaniCents - dailySummary.totals.productAmountToNaniCents))}</strong> {isAdmin ? 'para NANI · atenciones' : 'me queda · atenciones'}</span><span><strong>{dailySummary.totals.productQuantity}</strong> productos vendidos</span><span><strong>{formatAmount(dailySummary.totals.productTotalCents)}</strong> productos facturados</span><span><strong>{formatAmount(isAdmin ? dailySummary.totals.productAmountToNaniCents : dailySummary.totals.productTotalCents - dailySummary.totals.productAmountToNaniCents - dailySummary.totals.commonBoxCents)}</strong> {isAdmin ? 'para NANI · productos' : 'me queda · productos'}</span><span><strong>{formatAmount(dailySummary.totals.commonBoxCents)}</strong> caja común</span>{!isAdmin && <span><strong>{formatAmount(dailySummary.totals.totalCents - (dailySummary.totals.amountToNaniCents - dailySummary.totals.productAmountToNaniCents) + dailySummary.totals.productTotalCents - dailySummary.totals.productAmountToNaniCents - dailySummary.totals.commonBoxCents)}</strong> mi total del día</span>}</div>{isAdmin && <details className="summary-attendances"><summary>Ver detalle de clientas ({dailySummary.attendances.length})</summary>{dailySummary.attendances.map((attendance) => <div className="summary-attendance" key={attendance.id}><div><strong>{attendance.clientName}</strong><span>{attendance.serviceName} · {attendance.employeeName}</span></div><div><b>{attendance.status === 'performed' ? formatAmount(attendance.finalAmountCents) : 'Sin cargo'}</b><span>{formatDisplayTime(attendance.createdAt)} · {attendance.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}</span></div></div>)}</details>}</>}</section>}{adminTab !== 'remittances' && (!isAdmin || adminTab === 'attendance') && <><section className="welcome"><h2>{editingId ? 'Editar atención' : isAdmin ? 'Nueva atención de NANI' : 'Nueva atención'}</h2><form onSubmit={saveAttendance} noValidate>
        <label htmlFor="client-name">Clienta</label><input id="client-name" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nombre completo" required aria-describedby={fieldErrors.clientName ? 'client-name-error' : undefined} aria-invalid={Boolean(fieldErrors.clientName)} />{fieldErrors.clientName && <p id="client-name-error" className="error" role="alert">{fieldErrors.clientName}</p>}
        <label>Servicios</label><details ref={servicePickerRef} className={`service-picker ${fieldErrors.serviceIds ? 'picker-invalid' : ''}`}><summary>{selectedServiceIds.length === 0 ? 'Seleccioná uno o varios servicios' : `${selectedServiceIds.length} servicio${selectedServiceIds.length === 1 ? '' : 's'} seleccionado${selectedServiceIds.length === 1 ? '' : 's'}`}</summary><div className="service-picker-options">{services.map((service) => <label key={service.id}><input type="checkbox" checked={selectedServiceIds.includes(service.id)} onChange={(event) => setSelectedServiceIds(event.target.checked ? [...selectedServiceIds, service.id] : selectedServiceIds.filter((id) => id !== service.id))} /><span>{service.name}<small>{formatAmount(service.baseAmountCents)}</small></span></label>)}</div></details>{selectedServiceIds.length > 0 && <div className="selected-services">{selectedServiceIds.map((id) => services.find((service) => service.id === id)).filter((service): service is Service => Boolean(service)).map((service) => <span key={service.id}>{service.name}<button type="button" aria-label={`Quitar ${service.name}`} onClick={() => setSelectedServiceIds((current) => current.filter((selectedId) => selectedId !== service.id))}>×</button></span>)}</div>}{fieldErrors.serviceIds && <p id="service-error" className="error" role="alert">{fieldErrors.serviceIds}</p>}
        <label htmlFor="payment">Medio de pago</label><select id="payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'transfer')} aria-describedby={fieldErrors.paymentMethod ? 'payment-error' : undefined} aria-invalid={Boolean(fieldErrors.paymentMethod)}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option></select>
        {fieldErrors.paymentMethod && <p id="payment-error" className="error" role="alert">{fieldErrors.paymentMethod}</p>}
        <label htmlFor="status">Estado</label><select id="status" value={status} onChange={(event) => setStatus(event.target.value as Attendance['status'])} aria-describedby={fieldErrors.status ? 'status-error' : undefined} aria-invalid={Boolean(fieldErrors.status)}><option value="performed">Realizada</option><option value="cancelled">Cancelada</option><option value="absent">Ausente</option></select>
        {fieldErrors.status && <p id="status-error" className="error" role="alert">{fieldErrors.status}</p>}
        <section className="quote" aria-live="polite" aria-labelledby="quote-title">
          <h3 id="quote-title">Resumen</h3>
          {!serviceId ? <p className="muted">Elegí un servicio para ver el importe.</p> : quoteLoading ? <p className="muted">Calculando…</p> : quoteError ? <p className="error">{quoteError}</p> : quote && <div className="quote-lines">
            <span>Precio base <strong>{formatAmount(quote.baseAmountCents)}</strong></span>
            <span>Descuento <strong>{formatAmount(quote.discountCents)}</strong></span>
            <span>Precio final <strong>{formatAmount(quote.finalAmountCents)}</strong></span>
            <span>Comisión <strong>{formatAmount(quote.commissionCents)}</strong></span>
            {user.id !== 'nani' && quote.amountToNaniCents > 0 && <span>Entregar a NANI <strong>{formatAmount(quote.amountToNaniCents)}</strong></span>}
          </div>}
        </section>
        {error && <p className="error" role="alert">{error}</p>}<div className="home-actions"><button disabled={saving || !quote} type="submit">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar atención'}</button>{editingId && <button className="secondary" type="button" onClick={() => { setEditingId(null); setClientName(''); setSelectedServiceIds([]); setStatus('performed'); setError(''); }}>Cancelar edición</button>}</div>
      </form></section>
      <section className="recent" aria-labelledby="recent-title"><div className="section-heading"><h2 id="recent-title">Mis atenciones</h2></div>{recentLoading ? <p className="muted" role="status">Cargando tus atenciones…</p> : loadError ? <p className="error" role="alert">{loadError}</p> : attendances.length === 0 ? <p className="muted" role="status">Todavía no registraste atenciones.</p> : visibleAttendances.length === 0 ? <p className="muted" role="status">No hay atenciones para esta fecha.</p> : visibleAttendances.map((attendance) => {
        const dayClosed = Boolean(dailyClosure && !dailyClosure.reopenedAt && businessDate(attendance.createdAt) === dailyClosure.businessDate);
        const editable = !dayClosed && now < new Date(attendance.createdAt).getTime() + 24 * 60 * 60 * 1000;
        const statusLabel = attendance.status === 'performed' ? 'Realizada' : attendance.status === 'cancelled' ? 'Cancelada' : 'Ausente';
        return <article className={`attendance-card status-${attendance.status}`} key={attendance.id}><div className="attendance-summary"><strong>{attendance.clientName}</strong><span>{attendance.serviceName}</span><span className="status-label">Estado: <strong>{statusLabel}</strong></span></div><div className="attendance-financial">{attendance.status === 'performed' ? <><span>Base: {formatAmount(attendance.baseAmountCents)}</span><span className="attendance-amount">Total: {formatAmount(attendance.finalAmountCents)} · {attendance.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}</span>{user.id !== 'nani' && attendance.amountToNaniCents > 0 && <span className="attendance-nani">Entregar a NANI: {formatAmount(attendance.amountToNaniCents)}</span>}</> : <span className="attendance-amount">No es ingreso · importes $0</span>}</div><div className="attendance-meta"><time className="attendance-time" dateTime={attendance.createdAt}>{formatDisplayDateTime(attendance.createdAt)}</time>{!dayClosed && <span>{remainingWindow(attendance.createdAt)}</span>}{editable && <button className="attendance-edit" type="button" onClick={() => editAttendance(attendance)}>Editar atención</button>}</div></article>;
      })}</section></>}
      {isAdmin && adminTab === 'catalog' && <section className="catalog" aria-labelledby="catalog-title">
        <h2 id="catalog-title">Catálogo de servicios</h2>
        <p className="muted">Los cambios aplican a nuevas atenciones. Las atenciones guardadas conservan sus importes.</p>
        {catalogEditingId && <div className="edit-mode-notice"><strong>Editando servicio</strong><span>Modificá los datos arriba y guardá los cambios.</span></div>}
        <form onSubmit={saveCatalogService} className="service-create-form" noValidate>
          <div><label htmlFor="catalog-name">Nombre</label><input id="catalog-name" value={catalogName} onChange={(event) => setCatalogName(event.target.value)} required /></div>
          <div><label htmlFor="catalog-category">Categoría</label><input id="catalog-category" value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} required placeholder="Ej. Cejas" /></div>
          <div><label htmlFor="catalog-price">Precio (pesos)</label><input id="catalog-price" inputMode="decimal" value={catalogPrice} onChange={(event) => setCatalogPrice(event.target.value)} required /></div>
          <div><label htmlFor="catalog-duration">Duración (minutos)</label><input id="catalog-duration" inputMode="numeric" value={catalogDuration} onChange={(event) => setCatalogDuration(event.target.value)} required /></div>
          {catalogError && <p className="error" role="alert">{catalogError}</p>}
          <div className="home-actions"><button disabled={catalogSaving} type="submit">{catalogSaving ? 'Guardando…' : catalogEditingId ? 'Guardar cambios' : 'Crear servicio'}</button>{catalogEditingId && <button className="secondary" type="button" onClick={() => { setCatalogEditingId(null); setCatalogName(''); setCatalogCategory(''); setCatalogPrice(''); setCatalogDuration(''); }}>Cancelar</button>}</div>
        </form>
        <div className="catalog-list service-catalog-list" ref={catalogListRef}>{catalog.map((service) => <article className={`catalog-card service-catalog-card ${service.active ? '' : 'catalog-inactive'} ${draggingServiceId === service.id ? 'is-dragging' : ''}`} key={service.id} data-service-id={service.id} data-active={service.active ? 'true' : 'false'}>
          {service.active && <button type="button" className="service-drag-handle" aria-label={`Arrastrar ${service.name}`} onPointerDown={(event) => onDragHandlePointerDown(event, service)}>⋮⋮</button>}
          <div className="service-catalog-info"><strong>{service.name}</strong><span>{service.category} · {formatAmount(service.baseAmountCents)} · {service.durationMinutes} min</span><span>{service.active ? 'Activo' : 'Inactivo'}</span></div>
          <div className="catalog-actions"><button type="button" onClick={() => editCatalogService(service)}>Editar</button><button className="secondary" type="button" onClick={() => toggleCatalogService(service)}>{service.active ? 'Desactivar' : 'Activar'}</button><button className="danger-button" type="button" onClick={() => setServiceToDelete(service)}>Eliminar</button></div>
        </article>)}</div>
      </section>}
      {isAdmin && adminTab === 'employees' && <section className="catalog" aria-labelledby="assignments-title">
        <h2 id="assignments-title">Servicios por empleada</h2>
        <p className="muted">Elegí qué servicios puede cargar cada empleada. Solo los servicios activos y habilitados aparecen en su formulario.</p>
        {assignmentError && <p className="error" role="alert">{assignmentError}</p>}
        <div className="assignment-list">
          {assignments.map((assignment) => {
            const employee = employees.find((candidate) => candidate.id === assignment.employeeId);
            const employeeName = employee?.displayName ?? assignment.employeeId.toUpperCase();
            return <article className="assignment-card" key={assignment.employeeId}>
              <h3>{employeeName}</h3>
              <div className="assignment-services">
                {catalog.filter((service) => service.active).map((service) => <label className="assignment-option" key={service.id}>
                  <input type="checkbox" checked={assignment.serviceIds.includes(service.id)}
                    disabled={assignmentSaving === assignment.employeeId}
                    onChange={(event) => toggleAssignment(assignment.employeeId, service.id, event.target.checked)} />
                  <span>{service.name}</span>
                </label>)}
              </div>
            </article>;
          })}
        </div>
      </section>}
      {isAdmin && adminTab === 'employees' && <section className="catalog" aria-labelledby="employees-title">
        <h2 id="employees-title">Equipo</h2>
        <p className="muted">Actualizá tu PIN y el de cada empleada. También podés activar o desactivar su acceso. Los PIN nunca se muestran.</p>
        {employeeError && <p className="error" role="alert">{employeeError}</p>}
        <form onSubmit={createEmployee} className="employee-create-form" noValidate>
          <div><label htmlFor="new-employee-name">Nueva empleada</label><input id="new-employee-name" value={newEmployeeName} onChange={(event) => setNewEmployeeName(event.target.value)} placeholder="Nombre completo" required /></div>
          <div><label htmlFor="new-employee-pin">PIN inicial</label><input id="new-employee-pin" inputMode="numeric" type="password" maxLength={4} value={newEmployeePin} onChange={(event) => setNewEmployeePin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 dígitos" required /></div>
          <button disabled={employeeCreateSaving || !/^\d{4}$/.test(newEmployeePin)} type="submit">{employeeCreateSaving ? 'Guardando…' : 'Agregar empleada'}</button>
        </form>
        <div className="catalog-list">
          <article className="catalog-card">
            <div><strong>NANI</strong><span>Tu acceso</span></div>
            <div className="catalog-actions">
              <button className="secondary" type="button" onClick={() => { setPinEmployeeId('nani'); setNewPin(''); setCurrentOwnPin(''); setConfirmOwnPin(''); }}>Cambiar PIN</button>
            </div>
            {pinEmployeeId === 'nani' && <form onSubmit={changeEmployeePin}>
              <label htmlFor="pin-nani-current">PIN actual</label>
              <input id="pin-nani-current" inputMode="numeric" type="password" autoComplete="current-password" maxLength={4} value={currentOwnPin}
                onChange={(event) => setCurrentOwnPin(event.target.value.replace(/\D/g, '').slice(0, 4))} required />
              <label htmlFor="pin-nani">Nuevo PIN</label>
              <input id="pin-nani" inputMode="numeric" type="password" autoComplete="new-password" maxLength={4} value={newPin}
                onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))} required />
              <label htmlFor="pin-nani-confirm">Repetir PIN nuevo</label>
              <input id="pin-nani-confirm" inputMode="numeric" type="password" autoComplete="new-password" maxLength={4} value={confirmOwnPin}
                onChange={(event) => setConfirmOwnPin(event.target.value.replace(/\D/g, '').slice(0, 4))} required />
              <div className="home-actions"><button disabled={pinSaving || !/^\d{4}$/.test(currentOwnPin) || !/^\d{4}$/.test(newPin) || newPin !== confirmOwnPin} type="submit">{pinSaving ? 'Guardando…' : 'Guardar PIN'}</button>
                <button className="secondary" type="button" onClick={() => { setPinEmployeeId(null); setCurrentOwnPin(''); setConfirmOwnPin(''); }}>Cancelar</button></div>
            </form>}
          </article>
          {managedEmployees.map((employee) => <article className={`catalog-card ${employee.active ? '' : 'catalog-inactive'}`} key={employee.id}>
            <div><strong>{employee.displayName}</strong><span>{employee.active ? 'Activa' : 'Inactiva'}</span></div>
            <div className="catalog-actions">
              <button type="button" onClick={() => toggleEmployee(employee)}>{employee.active ? 'Desactivar' : 'Activar'}</button>
              <button className="secondary" type="button" onClick={() => { setPinEmployeeId(employee.id); setNewPin(''); }}>Cambiar PIN</button>
            </div>
            {pinEmployeeId === employee.id && <form onSubmit={changeEmployeePin}>
              <label htmlFor={`pin-${employee.id}`}>Nuevo PIN</label>
              <input id={`pin-${employee.id}`} inputMode="numeric" type="password" maxLength={4} value={newPin}
                onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))} required />
              <div className="home-actions"><button disabled={pinSaving || !/^\d{4}$/.test(newPin)} type="submit">{pinSaving ? 'Guardando…' : 'Guardar PIN'}</button>
                <button className="secondary" type="button" onClick={() => setPinEmployeeId(null)}>Cancelar</button></div>
            </form>}
          </article>)}
        </div>
      </section>}
      {isAdmin && adminTab === 'expenses' && <section className="catalog expenses-panel" aria-labelledby="expenses-title">
        <div className="section-heading"><div><h2 id="expenses-title">Gastos</h2><p className="muted">Registrá gastos y consultá el total del mes seleccionado.</p></div><div className="expense-month-filter"><label htmlFor="expense-month">Mes</label><input id="expense-month" type="month" value={expenseMonth} onChange={(event) => setExpenseMonth(event.target.value)} /><strong className="expenses-total">Total: {formatAmount(expensesTotal)}</strong></div></div>
        {expenseError && <p className="error" role="alert">{expenseError}</p>}
        <form onSubmit={saveExpense} noValidate>
          <label htmlFor="expense-date">Fecha del gasto</label><input id="expense-date" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
          <label htmlFor="expense-category">Categoría</label><select id="expense-category" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option>Alquiler</option><option>Expensas</option><option>Limpieza</option><option>Luz</option><option>Internet</option><option>Otro</option></select>
          <label htmlFor="expense-description">Descripción</label><input id="expense-description" value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Ej. Alquiler del local" required />
          <label htmlFor="expense-amount">Importe</label><input id="expense-amount" inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0" required />
          <div className="home-actions"><button disabled={expenseSaving} type="submit">{expenseSaving ? 'Guardando…' : 'Registrar gasto'}</button></div>
        </form>
        <div className="catalog-list">{expenses.length === 0 ? <p className="muted">No hay gastos para esta fecha.</p> : expenses.map((expense) => <article className="catalog-card" key={expense.id}><div><strong>{expense.category}</strong><span>{expense.description}</span></div><div className="catalog-actions"><strong>{formatAmount(expense.amountCents)}</strong><button className="secondary" type="button" onClick={() => deleteExpense(expense)}>Eliminar</button></div></article>)}</div>
      </section>}
      {isAdmin && adminTab === 'reports' && <section className="catalog reports-panel" aria-labelledby="reports-title">
        <div className="section-heading"><div><h2 id="reports-title">Reportes</h2><p className="muted">Consultá el rendimiento del estudio por período.</p></div><div className="report-filters"><label htmlFor="report-from">Desde</label><input id="report-from" type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} /><label htmlFor="report-to">Hasta</label><input id="report-to" type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} /></div></div>
        {reportLoading && <p className="muted">Cargando reporte…</p>}{reportError && <p className="error" role="alert">{reportError}</p>}{report && <><div className="summary-totals report-totals"><span><strong>{report.totals.attentions}</strong> atenciones</span><span><strong>{report.totals.performed}</strong> realizadas</span><span><strong>{formatAmount(report.totals.totalCents)}</strong> facturado</span><span><strong>{formatAmount(report.totals.expensesCents)}</strong> gastos</span><span className="report-net"><strong>{formatAmount(report.totals.totalCents - report.totals.expensesCents)}</strong> neto estimado</span></div><h3>Por empleada</h3><div className="report-grid">{report.employees.length === 0 ? <p className="muted">No hay datos para este período.</p> : report.employees.map((employee) => <article className="report-card" key={employee.employeeId}><strong>{employee.employeeName}</strong><span>{employee.attentions} atenciones · {employee.performed} realizadas</span><b>Facturado: {formatAmount(employee.totalCents)}</b><b>Entregar a NANI: {formatAmount(employee.amountToNaniCents)}</b></article>)}</div><h3>Servicios más realizados</h3><div className="report-grid">{report.services.length === 0 ? <p className="muted">No hay servicios realizados en este período.</p> : report.services.map((service) => <article className="report-card" key={service.serviceId}><strong>{service.serviceName}</strong><span>{service.attentions} atenciones</span><b>{formatAmount(service.totalCents)} facturado</b></article>)}</div></>}
      </section>}
      {isAdmin && adminTab === 'activity' && <section className="catalog" aria-labelledby="activity-title">
        <div className="section-heading"><div><h2 id="activity-title">Actividad</h2><p className="muted">Historial de acciones realizadas en el sistema. Solo NANI puede consultarlo.</p></div></div>
        {auditLoading && <p className="muted">Cargando actividad…</p>}{auditError && <p className="error" role="alert">{auditError}</p>}
        {!auditLoading && !auditError && auditLogs.length === 0 && <p className="muted">Todavía no hay actividad registrada.</p>}
        <div className="catalog-list activity-list">{auditLogs.map((log) => <article className="catalog-card activity-card" key={log.id}>
          <div><strong>{auditActionLabel(log.action)}</strong><span>{log.actorName} · {log.entityType}{log.entityId ? ` · ${log.entityId}` : ''}</span></div>
          <time dateTime={log.createdAt}>{formatDisplayDateTime(log.createdAt)}</time>
        </article>)}</div>
      </section>}
      {adminTab === 'remittances' && <MonthRemittances isAdmin={isAdmin} month={remittanceMonth} rows={monthRemittances} error={monthRemittancesError || remittanceActionError} saving={pendingRemittanceSaving} receiptSaving={receiptSaving} onMonthChange={setRemittanceMonth} onMark={markPendingRemittance} onReceive={(date, employeeId) => setRemittanceReceipt(date, employeeId, 'receive')} onClear={(date, employeeId) => setRemittanceReceipt(date, employeeId, 'clear')} />}
      {adminTab === 'products' && <section className={`catalog products-panel ${isAdmin ? 'admin-products-panel' : 'employee-products-panel'} product-${productTab}-mode`} aria-labelledby="products-title">
        <div className="section-heading"><div><h2 id="products-title">Productos</h2><p className="muted">Registrá ventas y consultá el stock disponible.</p></div><nav className="product-subtabs" aria-label="Secciones de productos">
          <button type="button" className={productTab === 'sales' ? 'tab-active' : 'secondary'} onClick={() => setProductTab('sales')}>Registrar venta</button>
          {isAdmin && <button type="button" className={productTab === 'catalog' ? 'tab-active' : 'secondary'} onClick={() => setProductTab('catalog')}>Catálogo y reposiciones</button>}
        </nav></div>
        {productError && <p className="error" role="alert">{productError}</p>}
        {productTab === 'sales' && <ProductSearchPicker products={products} search={productSearch} onSearch={setProductSearch} quantities={productQuantities} onQuantityChange={(productId, quantity) => setProductQuantities((current) => ({ ...current, [productId]: quantity }))} />}
        {productTab === 'sales' && <div className="product-recent-column"><div className="product-date-filter"><label htmlFor="product-date">Ventas del día</label><input id="product-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button type="button" className="secondary" onClick={() => setSelectedDate(todayInArgentina())}>Hoy</button></div><h3>Ventas recientes</h3><div className="catalog-list">{productSales.length === 0 ? <p className="muted">Todavía no hay ventas de productos.</p> : productSales.map((sale) => <article className={`catalog-card product-sale-card ${sale.status === 'cancelled' ? 'product-sale-cancelled' : ''}`} key={sale.id}><div className="product-sale-info"><strong>{sale.clientName}</strong><span>{sale.status === 'cancelled' ? 'Venta cancelada' : sale.items.map((item) => `${item.productName} ×${item.quantity}`).join(' · ')}</span><small>{sale.sellerName} · {formatDisplayDateTime(sale.createdAt)}</small></div><div className="product-sale-financial">{sale.status === 'cancelled' ? <strong className="product-sale-cancelled-label">Cancelada</strong> : <><strong className="product-sale-total">{formatAmount(sale.totalCents)}</strong>{sale.amountToNaniCents > 0 && <span className="product-sale-remittance">Entregar a NANI: {formatAmount(sale.amountToNaniCents)}</span>}{sale.commonBoxCents > 0 && <span className="product-sale-destination">Destino: caja común</span>}<div className="product-sale-actions"><button type="button" className="secondary" onClick={() => editProductSale(sale)}>Editar</button><button type="button" className="danger-button" onClick={() => setSaleToCancel(sale)}>Cancelar venta</button></div></>}</div></article>)}</div></div>}
        {isAdmin && <div className="product-admin-tools">
          <form onSubmit={createProduct} className="product-create-form" noValidate>
            <div><label htmlFor="new-product-name">Producto</label><input id="new-product-name" value={newProductName} onChange={(event) => setNewProductName(event.target.value)} placeholder="Ej. Crema facial" required /></div>
            <div><label htmlFor="new-product-origin">Origen</label><select id="new-product-origin" value={newProductSupplierType} onChange={(event) => setNewProductSupplierType(event.target.value as 'once' | 'local')}><option value="local">Proveedor local</option><option value="once">Once</option></select></div>
            <div><label htmlFor="new-product-supplier">Proveedor</label><input id="new-product-supplier" value={newProductSupplierName} onChange={(event) => setNewProductSupplierName(event.target.value)} placeholder="Nombre del proveedor" required /></div>
            <div><label htmlFor="new-product-cost">Costo actual</label><input id="new-product-cost" inputMode="decimal" value={newProductCost} onChange={(event) => setNewProductCost(event.target.value)} required /></div>
            <div><label htmlFor="new-product-price">Precio de venta</label><input id="new-product-price" inputMode="decimal" value={newProductPrice} onChange={(event) => setNewProductPrice(event.target.value)} required /></div>
            <div className="home-actions"><button disabled={productSaving} type="submit">Crear producto</button></div>
          </form>
          <label className="product-inventory-search" htmlFor="restock-search">Buscar producto</label>
          <input id="restock-search" type="search" value={restockSearch} onChange={(event) => setRestockSearch(event.target.value)} placeholder="Escribí el nombre del producto…" />
          <div className="catalog-list product-inventory-list">{[...products].filter((product) => product.active && product.name.toLocaleLowerCase().includes(restockSearch.toLocaleLowerCase())).sort((first, second) => Number(first.stock <= 0) - Number(second.stock <= 0)).map((product) => <article className={`catalog-card product-inventory-row ${product.stock <= 0 ? 'product-out-of-stock' : ''}`} key={product.id}><div><strong>{product.name}</strong><span>{product.supplierType === 'once' ? 'Once' : 'Proveedor local'}</span></div><form className="product-inventory-stock product-stock-edit" onSubmit={(event) => saveProductStock(event, product)}><label htmlFor={`stock-${product.id}`}>Stock</label><input id={`stock-${product.id}`} type="number" min="0" step="1" value={stockDrafts[product.id] ?? String(product.stock)} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.id]: event.target.value }))} /><button className="secondary" type="submit" disabled={productSaving}>Guardar</button></form><span className="product-inventory-price">{formatAmount(product.salePriceCents)}</span><div className="catalog-actions"><button className="secondary" type="button" onClick={() => { setRestockId(product.id); setRestockQuantity(''); setRestockCost(String(product.currentCostCents / 100)); setRestockSalePrice(String(product.salePriceCents / 100)); }}>Reponer</button><button className="danger-button" type="button" onClick={() => setProductToDelete(product)}>Eliminar</button></div>{restockId === product.id && <form onSubmit={restockProduct} className="inline-form"><div><label htmlFor={`restock-quantity-${product.id}`}>Cantidad a ingresar</label><input id={`restock-quantity-${product.id}`} type="number" min="1" step="1" value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} required /></div><div><label htmlFor={`restock-cost-${product.id}`}>Precio de compra</label><input id={`restock-cost-${product.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={restockCost} onChange={(event) => setRestockCost(event.target.value)} required /></div><div><label htmlFor={`restock-sale-price-${product.id}`}>Precio de venta</label><input id={`restock-sale-price-${product.id}`} type="number" min="0.01" step="0.01" inputMode="decimal" value={restockSalePrice} onChange={(event) => setRestockSalePrice(event.target.value)} required /></div><button disabled={productSaving} type="submit">Guardar compra</button></form>}</article>)}</div>
        </div>}
        <form onSubmit={saveProductSale} className="product-sale-form" noValidate>
          <label htmlFor="product-client">Clienta</label><input id="product-client" value={productClientName} onChange={(event) => setProductClientName(event.target.value)} placeholder="Nombre completo" required />
          <label htmlFor="product-payment">Medio de pago</label><select id="product-payment" value={productPaymentMethod} onChange={(event) => setProductPaymentMethod(event.target.value as 'cash' | 'transfer')}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option></select>
          <h3>Elegí los productos</h3>
          <div className="product-grid">{products.filter((product) => product.active).sort((first, second) => Number(first.stock <= 0) - Number(second.stock <= 0)).map((product) => <label className={`product-option ${product.stock <= product.lowStockThreshold ? 'product-low-stock' : ''} ${product.stock <= 0 ? 'product-out-of-stock' : ''}`} aria-disabled={product.stock <= 0} key={product.id}>
            <span><strong>{product.name}</strong><small>{formatAmount(product.salePriceCents)} · {product.stock > 0 ? `Stock: ${product.stock}` : 'Sin stock'}</small></span>
            <input aria-label={`Cantidad de ${product.name}`} type="number" min="0" max={product.stock} value={productQuantities[product.id] ?? ''} onChange={(event) => setProductQuantities((current) => ({ ...current, [product.id]: Math.min(product.stock, Math.max(0, Number(event.target.value) || 0)) }))} disabled={product.stock <= 0} />
          </label>)}</div>
          <div className="home-actions"><button disabled={productSaving} type="submit">{productSaving ? 'Guardando…' : 'Registrar venta'}</button></div>
        </form>
      </section>}
      {isAdmin && productToDelete && <ProductDeleteModal product={productToDelete} saving={productSaving} onCancel={() => setProductToDelete(null)} onConfirm={deleteProduct} />}
      {saleToCancel && <SaleCancelModal sale={saleToCancel} saving={productSaving} onCancel={() => setSaleToCancel(null)} onConfirm={cancelProductSale} />}
      {saleToEdit && <ProductSaleEditModal sale={saleToEdit} products={products} clientName={productClientName} paymentMethod={productPaymentMethod} quantities={productQuantities} saving={productSaving} onClientNameChange={setProductClientName} onPaymentMethodChange={setProductPaymentMethod} onQuantityChange={(productId, quantity) => setProductQuantities((current) => ({ ...current, [productId]: quantity }))} onCancel={() => { setSaleToEdit(null); setEditingProductSaleId(null); }} onSubmit={saveProductSale} />}
      {attendanceToEdit && <AttendanceEditModal attendance={attendanceToEdit} services={services} clientName={attendanceEditDraft.clientName} selectedServiceIds={attendanceEditDraft.serviceIds} paymentMethod={attendanceEditDraft.paymentMethod} status={attendanceEditDraft.status} saving={saving} onClientNameChange={(value) => setAttendanceEditDraft((current) => ({ ...current, clientName: value }))} onServiceToggle={(serviceId, enabled) => setAttendanceEditDraft((current) => ({ ...current, serviceIds: enabled ? [...new Set([...current.serviceIds, serviceId])] : current.serviceIds.filter((id) => id !== serviceId) }))} onPaymentMethodChange={(value) => setAttendanceEditDraft((current) => ({ ...current, paymentMethod: value }))} onStatusChange={(value) => setAttendanceEditDraft((current) => ({ ...current, status: value }))} onCancel={() => { setAttendanceToEdit(null); setEditingId(null); }} onSubmit={(event) => saveAttendance(event, attendanceEditDraft)} />}
      {isAdmin && serviceToDelete && <ServiceDeleteModal service={serviceToDelete} saving={catalogSaving} onCancel={() => setServiceToDelete(null)} onConfirm={deleteCatalogService} />}
    </></div>
  </main>;
}

function ProductSearchPicker({ products, search, onSearch, quantities, onQuantityChange }: {
  products: Product[];
  search: string;
  onSearch: (value: string) => void;
  quantities: Record<string, number>;
  onQuantityChange: (productId: string, quantity: number) => void;
}) {
  const filtered = products.filter((product) => product.active && product.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((first, second) => Number(first.stock <= 0) - Number(second.stock <= 0));
  return <section className="product-search-picker" aria-label="Buscar productos">
    <label htmlFor="product-search">Buscar producto</label>
    <input id="product-search" type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Escribí el nombre del producto…" />
    <div className="product-search-results">
      {filtered.length === 0 ? <p className="muted">No encontramos productos con esa búsqueda.</p> : filtered.map((product) => <label className={`product-option ${product.stock <= product.lowStockThreshold ? 'product-low-stock' : ''} ${product.stock <= 0 ? 'product-out-of-stock' : ''}`} aria-disabled={product.stock <= 0} key={product.id}>
        <span><strong>{product.name}</strong><small>{formatAmount(product.salePriceCents)} · {product.stock > 0 ? `Stock: ${product.stock}` : 'Sin stock'}</small></span>
        <input aria-label={`Cantidad de ${product.name}`} type="number" min="0" max={product.stock} value={quantities[product.id] ?? ''} onChange={(event) => onQuantityChange(product.id, Math.min(product.stock, Math.max(0, Number(event.target.value) || 0)))} disabled={product.stock <= 0} />
      </label>)}
    </div>
  </section>;
}

function ProductDeleteModal({ product, saving, onCancel, onConfirm }: { product: Product; saving: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
      <p className="eyebrow">Eliminar producto</p>
      <h2 id="delete-product-title">¿Querés quitar “{product.name}” del catálogo?</h2>
      <p className="muted">{product.stock > 0 ? `Tiene ${product.stock} unidades registradas.` : 'No tiene stock disponible.'} El producto dejará de aparecer para nuevas ventas, pero se conservará su historial.</p>
      <div className="modal-actions"><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="danger-button" type="button" onClick={onConfirm} disabled={saving}>{saving ? 'Eliminando…' : 'Sí, eliminar'}</button></div>
    </section>
  </div>;
}

function ServiceDeleteModal({ service, saving, onCancel, onConfirm }: { service: Service; saving: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-service-title">
      <p className="eyebrow">Eliminar servicio</p>
      <h2 id="delete-service-title">¿Querés quitar “{service.name}” del catálogo?</h2>
      <p className="muted">Dejará de aparecer para nuevas atenciones, pero se conservará el historial de atenciones existentes.</p>
      <div className="modal-actions"><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="danger-button" type="button" onClick={onConfirm} disabled={saving}>{saving ? 'Eliminando…' : 'Sí, eliminar'}</button></div>
    </section>
  </div>;
}

function SaleCancelModal({ sale, saving, onCancel, onConfirm }: { sale: ProductSale; saving: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-sale-title">
      <p className="eyebrow">Cancelar venta</p>
      <h2 id="cancel-sale-title">¿Querés cancelar la venta de “{sale.clientName}”?</h2>
      <p className="muted">Se devolverá el stock y se recalcularán los importes. Esta acción se puede hacer dentro de las 24 horas y antes del cierre.</p>
      <div className="modal-actions"><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Volver</button><button className="danger-button" type="button" onClick={onConfirm} disabled={saving}>{saving ? 'Cancelando…' : 'Sí, cancelar venta'}</button></div>
    </section>
  </div>;
}

function ProductSaleEditModal({ sale, products, clientName, paymentMethod, quantities, saving, onClientNameChange, onPaymentMethodChange, onQuantityChange, onCancel, onSubmit }: {
  sale: ProductSale;
  products: Product[];
  clientName: string;
  paymentMethod: 'cash' | 'transfer';
  quantities: Record<string, number>;
  saving: boolean;
  onClientNameChange: (value: string) => void;
  onPaymentMethodChange: (value: 'cash' | 'transfer') => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="confirm-modal product-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-sale-title">
      <p className="eyebrow">Editar venta</p>
      <h2 id="edit-sale-title">Venta de {sale.clientName}</h2>
      <form onSubmit={onSubmit} className="product-edit-form">
        <label htmlFor="edit-sale-client">Clienta</label><input id="edit-sale-client" value={clientName} onChange={(event) => onClientNameChange(event.target.value)} required />
        <label htmlFor="edit-sale-payment">Medio de pago</label><select id="edit-sale-payment" value={paymentMethod} onChange={(event) => onPaymentMethodChange(event.target.value as 'cash' | 'transfer')}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option></select>
        <fieldset><legend>Productos</legend>{products.filter((product) => product.active).map((product) => <label className="product-edit-option" key={product.id}><span>{product.name}<small>{formatAmount(product.salePriceCents)}</small></span><input aria-label={`Cantidad de ${product.name}`} type="number" min="0" value={quantities[product.id] ?? ''} onChange={(event) => onQuantityChange(product.id, Math.max(0, Number(event.target.value) || 0))} /></label>)}</fieldset>
        <div className="modal-actions"><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
      </form>
    </section>
  </div>;
}

function AttendanceEditModal({ attendance, services, clientName, selectedServiceIds, paymentMethod, status, saving, onClientNameChange, onServiceToggle, onPaymentMethodChange, onStatusChange, onCancel, onSubmit }: {
  attendance: Attendance;
  services: Service[];
  clientName: string;
  selectedServiceIds: string[];
  paymentMethod: Attendance['paymentMethod'];
  status: Attendance['status'];
  saving: boolean;
  onClientNameChange: (value: string) => void;
  onServiceToggle: (serviceId: string, enabled: boolean) => void;
  onPaymentMethodChange: (value: Attendance['paymentMethod']) => void;
  onStatusChange: (value: Attendance['status']) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="confirm-modal attendance-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-attendance-title">
      <p className="eyebrow">Editar atención</p>
      <h2 id="edit-attendance-title">Atención de {attendance.clientName}</h2>
      <form onSubmit={onSubmit} className="product-edit-form">
        <label htmlFor="edit-attendance-client">Clienta</label><input id="edit-attendance-client" value={clientName} onChange={(event) => onClientNameChange(event.target.value)} required />
        <label>Servicios</label><details className="service-picker service-edit-picker"><summary>{selectedServiceIds.length === 0 ? 'Seleccioná uno o varios servicios' : `${selectedServiceIds.length} servicio${selectedServiceIds.length === 1 ? '' : 's'} seleccionado${selectedServiceIds.length === 1 ? '' : 's'}`}</summary><div className="service-picker-options">{services.map((service) => <label key={service.id}><input type="checkbox" checked={selectedServiceIds.includes(service.id)} onChange={(event) => onServiceToggle(service.id, event.target.checked)} /><span>{service.name}</span></label>)}</div></details>
        <label htmlFor="edit-attendance-payment">Medio de pago</label><select id="edit-attendance-payment" value={paymentMethod} onChange={(event) => onPaymentMethodChange(event.target.value as Attendance['paymentMethod'])}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option></select>
        <label htmlFor="edit-attendance-status">Estado</label><select id="edit-attendance-status" value={status} onChange={(event) => onStatusChange(event.target.value as Attendance['status'])}><option value="performed">Realizada</option><option value="cancelled">Cancelada</option><option value="absent">Ausente</option></select>
        <div className="modal-actions"><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
      </form>
    </section>
  </div>;
}

function ProductDailySummary({ summary }: { summary: DailySummary }) {
  if (summary.productSales.length === 0) return null;
  return <section className="product-daily-summary" aria-label="Ventas de productos del día">
    <strong>Ventas de productos del día</strong>
    <span>Atenciones: {formatAmount(summary.totals.totalCents)} · Productos: {formatAmount(summary.totals.productTotalCents)} · Total: {formatAmount(summary.totals.totalCents + summary.totals.productTotalCents)} · Caja común: {formatAmount(summary.totals.commonBoxCents)}</span>
  </section>;
}

function PendingRemittanceNotice({ pending, saving, onMark }: { pending: PendingRemittance[]; saving: string | null; onMark: (date: string, employeeId: string) => void }) {
  if (pending.length === 0) return null;
  return <section className="pending-remittance" aria-label="Entregas pendientes"><strong>Entregas pendientes de días anteriores</strong><div>{pending.map((item) => <span key={`${item.date}-${item.employeeId}`}><span>{item.employeeName} · {formatDisplayDate(item.date)}: {item.alreadySent ? `ya envió ${formatAmount(item.alreadySent)}, falta ${formatAmount(item.remainingCents)}` : `debe entregar ${formatAmount(item.amountCents)}`}</span><button type="button" className="secondary" onClick={() => onMark(item.date, item.employeeId)} disabled={saving === `${item.date}:${item.employeeId}`}>{saving === `${item.date}:${item.employeeId}` ? 'Guardando…' : 'Marcar enviado'}</button></span>)}</div></section>;
}

function PendingOwnRemittanceNotice({ pending, saving, onMark }: { pending: PendingRemittance[]; saving: string | null; onMark: (date: string, employeeId: string) => void }) {
  if (pending.length === 0) return null;
  return <section className="pending-remittance" aria-label="Mis entregas pendientes"><strong>Mis entregas pendientes de días anteriores</strong><div>{pending.map((item) => <span key={`${item.date}-${item.employeeId}`}><span>{formatDisplayDate(item.date)}: {item.alreadySent ? `ya enviaste ${formatAmount(item.alreadySent)}, falta ${formatAmount(item.remainingCents)}` : `falta enviar ${formatAmount(item.amountCents)}`}</span><button type="button" className="secondary" onClick={() => onMark(item.date, item.employeeId)} disabled={saving === `${item.date}:${item.employeeId}`}>{saving === `${item.date}:${item.employeeId}` ? 'Guardando…' : 'Marcar enviado'}</button></span>)}</div></section>;
}

function MonthlyClosureControls({ report, saving, onToggle }: { report: Report | null; saving: boolean; onToggle: () => void }) {
  if (!report || formatDisplayMonth(report.from) !== report.to.slice(0, 7)) return null;
  const closed = Boolean(report.closure && !report.closure.reopenedAt);
  return <section className={`closure-bar ${closed ? 'closure-closed' : ''}`} aria-label="Cierre mensual"><div><strong>{closed ? 'Mes cerrado' : 'Cierre mensual pendiente'}</strong><span>{closed ? `Confirmado el ${formatDisplayDateTime(report.closure!.confirmedAt)}` : `Período: ${formatDisplayMonth(report.from)}.`}</span></div><button className={closed ? 'secondary' : ''} type="button" onClick={onToggle} disabled={saving}>{saving ? 'Guardando…' : closed ? 'Reabrir mes' : 'Confirmar cierre mensual'}</button></section>;
}

function DailyRemittanceOverview({ date, summary, saving, receiptSaving, error, onMark, onReceive, onClear }: {
  date: string;
  summary: DailySummary | null;
  saving: string | null;
  receiptSaving: string | null;
  error: string;
  onMark: (date: string, employeeId: string) => void;
  onReceive: (date: string, employeeId: string) => void;
  onClear: (date: string, employeeId: string) => void;
}) {
  if (!summary) return null;
  const employees = summary.employees.filter((employee) => employee.employeeId !== 'nani' && employee.amountToNaniCents > 0);
  if (employees.length === 0) return null;
  const labelDate = date === todayInArgentina() ? 'hoy' : formatDisplayDate(date);
  return <section className="remittance-bar" aria-label="Estado de entregas">
    <div className="remittance-heading"><strong>Entregas a NANI</strong><span>{labelDate}</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="remittance-list">{employees.map((employee) => {
      const remittance = summary.remittances.find((item) => item.employeeId === employee.employeeId);
      const alreadySent = remittance?.amountCents ?? 0;
      const remaining = Math.max(employee.amountToNaniCents - alreadySent, 0);
      const attendanceAmount = employee.amountToNaniCents - employee.productAmountToNaniCents;
      const received = Boolean(remittance?.receivedAt);
      const sent = Boolean(remittance?.sentAt);
      const covers = sent && remaining === 0;
      const key = `${date}:${employee.employeeId}`;
      return <article key={employee.employeeId} className={`remittance-person-card ${received ? 'remittance-received' : covers ? 'remittance-sent' : 'remittance-pending'}`}>
        <strong className="remittance-person-name">{employee.employeeName}</strong>
        <div className="remittance-breakdown"><span>Atenciones <b>{formatAmount(attendanceAmount)}</b></span><span>Productos <b>{formatAmount(employee.productAmountToNaniCents)}</b></span></div>
        <strong className="remittance-status">{received ? `Recibido ${formatAmount(alreadySent)}` : covers ? `Enviado ${formatAmount(alreadySent)}` : sent ? `Enviado ${formatAmount(alreadySent)} · Falta ${formatAmount(remaining)}` : alreadySent ? `Ya entregó ${formatAmount(alreadySent)} · Debe entregar ${formatAmount(remaining)}` : `Debe entregar ${formatAmount(employee.amountToNaniCents)}`}</strong>
        {!received && !covers && <button type="button" className="secondary remittance-mark-button" onClick={() => onMark(date, employee.employeeId)} disabled={saving === key}>{saving === key ? 'Guardando…' : 'Marcar enviado'}</button>}
        {covers && !received && <button type="button" className="remittance-mark-button" onClick={() => onReceive(date, employee.employeeId)} disabled={receiptSaving === key}>{receiptSaving === key ? 'Guardando…' : 'Recibido'}</button>}
        {received && <button type="button" className="secondary remittance-mark-button" onClick={() => onClear(date, employee.employeeId)} disabled={receiptSaving === key}>{receiptSaving === key ? 'Guardando…' : 'Quitar recibido'}</button>}
      </article>;
    })}</div>
  </section>;
}

function DailyRemittanceSelf({ summary, saving, onMark }: { summary: DailySummary | null; saving: boolean; onMark: () => void }) {
  if (!summary || summary.employees.length === 0) return null;
  const employee = summary.employees[0];
  const remittance = summary.remittances.find((item) => item.employeeId === employee.employeeId);
  const received = Boolean(remittance?.receivedAt);
  const sent = Boolean(remittance?.sentAt);
  const alreadySent = remittance?.amountCents ?? 0;
  const remaining = Math.max(employee.amountToNaniCents - alreadySent, 0);
  const covers = sent && remaining === 0;
  const attendanceAmount = employee.amountToNaniCents - employee.productAmountToNaniCents;
  return <section className={`remittance-bar ${received ? 'remittance-received' : covers ? 'remittance-sent' : ''}`} aria-label="Mi entrega a NANI">
    <div className="remittance-content">
      <div className="remittance-heading"><strong>Mi entrega a NANI</strong><span>{summary.date === todayInArgentina() ? 'hoy' : formatDisplayDate(summary.date)}</span></div>
      <strong>{received ? `Recibido: ${formatAmount(alreadySent)}` : covers ? `Enviado: ${formatAmount(alreadySent)}` : sent ? `Enviado: ${formatAmount(alreadySent)} · Falta: ${formatAmount(remaining)}` : alreadySent ? `Ya entregado: ${formatAmount(alreadySent)} · Debe entregar: ${formatAmount(remaining)}` : `Debe entregar: ${formatAmount(employee.amountToNaniCents)}`}</strong>
      <span>Atenciones: {formatAmount(attendanceAmount)} · Productos: {formatAmount(employee.productAmountToNaniCents)}</span>
      <span>{received ? 'NANI confirmó que recibió el dinero.' : covers ? 'Esperando que NANI confirme la recepción.' : alreadySent || sent ? 'Hay nuevas atenciones o ventas pendientes de entregar.' : 'Todavía no está marcada como enviada.'}</span>
    </div>
    {!received && !covers && <button type="button" onClick={onMark} disabled={saving}>{saving ? 'Guardando…' : 'Marcar dinero enviado'}</button>}
  </section>;
}

function MonthRemittances({ isAdmin, month, rows, error, saving, receiptSaving, onMonthChange, onMark, onReceive, onClear }: {
  isAdmin: boolean;
  month: string;
  rows: MonthRemittance[];
  error: string;
  saving: string | null;
  receiptSaving: string | null;
  onMonthChange: (month: string) => void;
  onMark: (date: string, employeeId: string) => void;
  onReceive: (date: string, employeeId: string) => void;
  onClear: (date: string, employeeId: string) => void;
}) {
  return <section className="catalog" aria-labelledby="remittances-title">
    <div className="section-heading">
      <div><h2 id="remittances-title">Entregas</h2><p className="muted">{isAdmin ? 'Revisá lo pendiente, enviado y recibido del mes, sin cambiar la fecha una por una.' : 'Tus entregas del mes y si NANI ya confirmó la recepción.'}</p></div>
      <div className="expense-month-filter"><label htmlFor="remittance-month">Mes</label><input id="remittance-month" type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} /></div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {rows.length === 0 ? <p className="muted">No hay entregas con deuda en este mes.</p> : <div className="remittance-bar"><div className="remittance-list">{rows.map((row) => {
      const key = `${row.date}:${row.employeeId}`;
      const short = row.status !== 'recibido' && row.sentAmountCents < row.amountCents;
      const covers = row.status === 'enviado' && row.sentAmountCents >= row.amountCents;
      const amount = row.status === 'pendiente' ? row.amountCents : row.sentAmountCents;
      const label = row.status === 'pendiente' ? 'Pendiente' : row.status === 'enviado' ? 'Enviado' : 'Recibido';
      return <article key={key} className={`remittance-person-card ${row.status === 'recibido' ? 'remittance-received' : covers ? 'remittance-sent' : 'remittance-pending'}`}>
        <strong className="remittance-person-name">{row.employeeName}</strong>
        <span>{formatDisplayDate(row.date)}</span>
        <strong className="remittance-status">{label} {formatAmount(amount)}{row.status === 'enviado' && short ? ` · Falta ${formatAmount(row.amountCents - row.sentAmountCents)}` : ''}</strong>
        {short && <button type="button" className="secondary remittance-mark-button" onClick={() => onMark(row.date, row.employeeId)} disabled={saving === key}>{saving === key ? 'Guardando…' : 'Marcar enviado'}</button>}
        {isAdmin && covers && <button type="button" className="remittance-mark-button" onClick={() => onReceive(row.date, row.employeeId)} disabled={receiptSaving === key}>{receiptSaving === key ? 'Guardando…' : 'Recibido'}</button>}
        {isAdmin && row.status === 'recibido' && <button type="button" className="secondary remittance-mark-button" onClick={() => onClear(row.date, row.employeeId)} disabled={receiptSaving === key}>{receiptSaving === key ? 'Guardando…' : 'Quitar recibido'}</button>}
        {!isAdmin && covers && <span>Esperando que NANI confirme la recepción.</span>}
        {!isAdmin && row.status === 'recibido' && <span>NANI confirmó que recibió el dinero.</span>}
      </article>;
    })}</div></div>}
  </section>;
}

function DailyClosureControls({ date, closure, saving, error, onConfirm, onReopen }: {
  date: string;
  closure: DailyClosure | null;
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onReopen: () => void;
}) {
  const closed = Boolean(closure && !closure.reopenedAt);
  return <section className={`closure-bar ${closed ? 'closure-closed' : ''}`} aria-label="Cierre diario">
    <div><strong>{closed ? 'Cierre confirmado' : 'Cierre diario pendiente'}</strong><span>{closed ? `Confirmado el ${formatDisplayDateTime(closure!.confirmedAt)}` : `La fecha seleccionada es ${formatDisplayDate(date)}.`}</span></div>
    {error && <span className="error">{error}</span>}
    {closed ? <button className="secondary" type="button" onClick={onReopen} disabled={saving}>Reabrir cierre</button> : <button type="button" onClick={onConfirm} disabled={saving}>{saving ? 'Confirmando…' : 'Confirmar cierre'}</button>}
  </section>;
}

function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    fetch(`${API}/auth/session`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setUser(data.user))
      .catch(() => undefined)
      .finally(() => setCheckingSession(false));
  }, []);
  const logout = useCallback(async () => {
    try {
      const response = await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('logout');
      setUser(null);
    } catch {
      // Mantener la pantalla actual evita ocultar una sesión que no se pudo cerrar.
    }
  }, []);
  if (checkingSession) return <main className="access-shell"><p className="muted">Cargando…</p></main>;
  return user ? <Home user={user} onLogout={logout} /> : <Access onLogin={setUser} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
