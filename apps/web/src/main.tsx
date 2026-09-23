import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Attendance, ManagedEmployee, PublicUser, Service } from '@studiobynani/contracts';
import './styles.css';

const API = '/api/v1';
type Quote = Pick<Attendance, 'serviceId' | 'serviceName' | 'baseAmountCents' | 'discountCents' | 'finalAmountCents' | 'commissionCents' | 'amountToNaniCents'>;
type DailySummary = {
  date: string;
  employees: Array<{ employeeId: string; employeeName: string; attentions: number; performed: number; totalCents: number; commissionCents: number; amountToNaniCents: number; cashCents: number; transferCents: number }>;
  totals: { attentions: number; performed: number; totalCents: number; amountToNaniCents: number };
  remittances: Array<{ employeeId: string; amountCents: number; sentAt: string | null }>;
  attendances: Array<{ id: string; employeeName: string; clientName: string; serviceName: string; status: Attendance['status']; paymentMethod: Attendance['paymentMethod']; finalAmountCents: number; amountToNaniCents: number; createdAt: string }>;
};
type DailyClosure = { businessDate: string; confirmedAt: string; reopenedAt: string | null };
type Expense = { id: string; expenseDate: string; category: string; description: string; amountCents: number; createdAt: string; updatedAt: string };
type Report = {
  from: string; to: string;
  closure: { month: string; confirmedAt: string; reopenedAt: string | null } | null;
  totals: { attentions: number; performed: number; totalCents: number; amountToNaniCents: number; expensesCents: number };
  employees: Array<{ employeeId: string; employeeName: string; attentions: number; performed: number; totalCents: number; commissionCents: number; amountToNaniCents: number }>;
  services: Array<{ serviceId: string; serviceName: string; attentions: number; totalCents: number }>;
};

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

function todayInArgentina() {
  return businessDate(new Date().toISOString());
}

function monthStartInArgentina() {
  return `${todayInArgentina().slice(0, 7)}-01`;
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

function Home({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const isAdmin = user.role === 'ADMIN';
  const [adminTab, setAdminTab] = useState<'attendance' | 'catalog' | 'assignments' | 'employees' | 'expenses' | 'reports'>('attendance');
  const [selectedDate, setSelectedDate] = useState(todayInArgentina);
  const [services, setServices] = useState<Service[]>([]);
  const [catalog, setCatalog] = useState<Service[]>([]);
  const [catalogEditingId, setCatalogEditingId] = useState<string | null>(null);
  const [catalogName, setCatalogName] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogPrice, setCatalogPrice] = useState('');
  const [catalogDuration, setCatalogDuration] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [employees, setEmployees] = useState<PublicUser[]>([]);
  const [assignments, setAssignments] = useState<{ employeeId: string; serviceIds: string[] }[]>([]);
  const [assignmentSaving, setAssignmentSaving] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState('');
  const [managedEmployees, setManagedEmployees] = useState<ManagedEmployee[]>([]);
  const [employeeError, setEmployeeError] = useState('');
  const [pinEmployeeId, setPinEmployeeId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [clientName, setClientName] = useState('');
  const [serviceId, setServiceId] = useState('');
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
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
      const month = report.from.slice(0, 7);
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
        body: JSON.stringify({ pin: newPin })
      });
      const data = await response.json();
      if (!response.ok) return setEmployeeError(data.error?.message ?? 'No se pudo cambiar el PIN.');
      setPinEmployeeId(null); setNewPin('');
    } catch {
      setEmployeeError('No se pudo conectar con la aplicación.');
    } finally {
      setPinSaving(false);
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
      setCatalog((current) => catalogEditingId
        ? current.map((service) => service.id === catalogEditingId ? data.service : service)
        : [...current, data.service]);
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
  }

  async function toggleCatalogService(service: Service) {
    setCatalogError('');
    const response = await fetch(`${API}/admin/services/${service.id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !service.active })
    });
    const data = await response.json();
    if (!response.ok) return setCatalogError(data.error?.message ?? 'No se pudo cambiar el estado.');
    setCatalog((current) => current.map((item) => item.id === service.id ? data.service : item));
    setServices((current) => service.active
      ? current.filter((item) => item.id !== service.id)
      : [...current, data.service]);
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
      body: JSON.stringify({ serviceId, paymentMethod, status }),
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
  }, [serviceId, paymentMethod, status]);

  async function saveAttendance(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setFieldErrors({});
    if (dailyClosure && !dailyClosure.reopenedAt && selectedDate === todayInArgentina()) {
      setSaving(false);
      return setError('El día ya fue cerrado por NANI. No se pueden registrar nuevas atenciones.');
    }
    try {
      const response = await fetch(`${API}/attendances${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientName, serviceId, paymentMethod, status })
      });
      const data = await response.json();
      if (!response.ok) {
        setFieldErrors(data.error?.fields ?? {});
        return setError(data.error?.message ?? 'No se pudo guardar la atención.');
      }
      setAttendances((current) => editingId
        ? current.map((attendance) => attendance.id === editingId ? data.attendance : attendance)
        : [data.attendance, ...current]);
      fetch(`${API}/admin/daily-summary?date=${encodeURIComponent(selectedDate)}`, { credentials: 'include' })
        .then((summaryResponse) => summaryResponse.ok ? summaryResponse.json() : null)
        .then((summaryData) => summaryData && setDailySummary(summaryData))
        .catch(() => undefined);
      setClientName(''); setServiceId(''); setPaymentMethod('transfer'); setStatus('performed'); setEditingId(null);
    } catch { setError('No se pudo conectar con la aplicación.'); }
    finally { setSaving(false); }
  }

  function editAttendance(attendance: Attendance) {
    setEditingId(attendance.id);
    setClientName(attendance.clientName);
    setServiceId(attendance.serviceId);
    setPaymentMethod(attendance.paymentMethod);
    setStatus(attendance.status);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  return <main className="home-shell"><header><div className="home-brand"><img src="/studio-by-nani-logo.png" alt="StudioByNani" /><div><p className="eyebrow">STUDIOBYNANI</p><h1>Hola, {user.displayName}</h1></div></div><button className="secondary" onClick={onLogout}>Salir</button></header>
    <nav className={`menu-tabs ${isAdmin ? 'admin-menu' : 'employee-menu'}`} aria-label="Menú principal">
      <button className={adminTab === 'attendance' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('attendance')}>Atenciones</button>
      {isAdmin && <><button className={adminTab === 'catalog' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('catalog')}>Servicios</button>
      <button className={adminTab === 'employees' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('employees')}>Equipo</button></>}
      {isAdmin && <button className={adminTab === 'expenses' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('expenses')}>Gastos</button>}
      {isAdmin && <button className={adminTab === 'reports' ? 'tab-active' : 'secondary'} onClick={() => setAdminTab('reports')}>Reportes</button>}
    </nav>
    {isAdmin && adminTab === 'attendance' && <DailyClosureControls date={selectedDate} closure={dailyClosure} saving={closureSaving} error={closureError} onConfirm={confirmDailyClosure} onReopen={reopenDailyClosure} />}
    {adminTab === 'attendance' && (isAdmin ? <DailyRemittanceOverview summary={dailySummary} /> : <DailyRemittanceSelf summary={dailySummary} saving={remittanceSaving} onMark={markRemittance} />)}
    {isAdmin && adminTab === 'reports' && <MonthlyClosureControls report={report} saving={monthlyClosureSaving} onToggle={toggleMonthlyClosure} />}
    <div className={`page-content ${(!isAdmin || adminTab === 'attendance') ? 'attendance-page' : 'admin-page'}`}><>{adminTab === 'attendance' && <section className="day-summary" aria-labelledby="daily-summary-title"><div className="summary-heading"><div><h2 id="daily-summary-title">{isAdmin ? 'Resumen del día' : 'Mi resumen del día'}</h2><p className="muted">{isAdmin ? 'Atenciones y dinero a entregar a NANI del día seleccionado.' : 'Tu facturación y el importe a entregar a NANI del día seleccionado.'}</p></div><div className="date-filter global-date-filter"><label htmlFor="summary-date">Fecha</label><input id="summary-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button type="button" className="secondary" onClick={() => setSelectedDate(todayInArgentina())}>Hoy</button>{summaryLoading && <span className="summary-loading">Cargando…</span>}</div></div>{summaryError ? <p className="error" role="alert">{summaryError}</p> : dailySummary && <><div className="summary-totals"><span><strong>{dailySummary.totals.attentions}</strong> atenciones</span><span><strong>{dailySummary.totals.performed}</strong> realizadas</span><span><strong>{formatAmount(dailySummary.totals.totalCents)}</strong> facturado</span><span><strong>{formatAmount(dailySummary.totals.amountToNaniCents)}</strong> para NANI</span></div>{isAdmin && <div className="summary-employees">{dailySummary.employees.length === 0 ? <p className="muted">No hay atenciones registradas para este día.</p> : dailySummary.employees.map((employee) => <div className="summary-employee" key={employee.employeeId}><strong>{employee.employeeName}</strong><span>{employee.attentions} atenciones · {formatAmount(employee.totalCents)}</span><b>Entregar: {formatAmount(employee.amountToNaniCents)}</b></div>)}</div>}{isAdmin && <details className="summary-attendances"><summary>Ver detalle de clientas ({dailySummary.attendances.length})</summary>{dailySummary.attendances.map((attendance) => <div className="summary-attendance" key={attendance.id}><div><strong>{attendance.clientName}</strong><span>{attendance.serviceName} · {attendance.employeeName}</span></div><div><b>{attendance.status === 'performed' ? formatAmount(attendance.finalAmountCents) : 'Sin cargo'}</b><span>{new Date(attendance.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {attendance.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}</span></div></div>)}</details>}</>}</section>}{(!isAdmin || adminTab === 'attendance') && <><section className="welcome"><h2>{editingId ? 'Editar atención' : isAdmin ? 'Nueva atención de NANI' : 'Nueva atención'}</h2><form onSubmit={saveAttendance} noValidate>
        <label htmlFor="client-name">Clienta</label><input id="client-name" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nombre completo" required aria-describedby={fieldErrors.clientName ? 'client-name-error' : undefined} aria-invalid={Boolean(fieldErrors.clientName)} />{fieldErrors.clientName && <p id="client-name-error" className="error" role="alert">{fieldErrors.clientName}</p>}
        <label htmlFor="service">Servicio</label><select id="service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} required aria-describedby={fieldErrors.serviceId ? 'service-error' : undefined} aria-invalid={Boolean(fieldErrors.serviceId)}><option value="">Seleccioná un servicio</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} — {formatAmount(service.baseAmountCents)}</option>)}</select>{fieldErrors.serviceId && <p id="service-error" className="error" role="alert">{fieldErrors.serviceId}</p>}
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
            <span>Entregar a NANI <strong>{formatAmount(quote.amountToNaniCents)}</strong></span>
          </div>}
        </section>
        {error && <p className="error" role="alert">{error}</p>}<div className="home-actions"><button disabled={saving || !quote} type="submit">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar atención'}</button>{editingId && <button className="secondary" type="button" onClick={() => { setEditingId(null); setClientName(''); setServiceId(''); setStatus('performed'); setError(''); }}>Cancelar edición</button>}</div>
      </form></section>
      <section className="recent" aria-labelledby="recent-title"><div className="section-heading"><h2 id="recent-title">Mis atenciones</h2></div>{recentLoading ? <p className="muted" role="status">Cargando tus atenciones…</p> : loadError ? <p className="error" role="alert">{loadError}</p> : attendances.length === 0 ? <p className="muted" role="status">Todavía no registraste atenciones.</p> : visibleAttendances.length === 0 ? <p className="muted" role="status">No hay atenciones para esta fecha.</p> : visibleAttendances.map((attendance) => {
        const dayClosed = Boolean(dailyClosure && !dailyClosure.reopenedAt && businessDate(attendance.createdAt) === dailyClosure.businessDate);
        const editable = !dayClosed && now < new Date(attendance.createdAt).getTime() + 24 * 60 * 60 * 1000;
        const statusLabel = attendance.status === 'performed' ? 'Realizada' : attendance.status === 'cancelled' ? 'Cancelada' : 'Ausente';
        return <article className={`attendance-card status-${attendance.status}`} key={attendance.id}><div className="attendance-summary"><strong>{attendance.clientName}</strong><span>{attendance.serviceName}</span><span className="status-label">Estado: <strong>{statusLabel}</strong></span></div><div className="attendance-financial">{attendance.status === 'performed' ? <><span>Base: {formatAmount(attendance.baseAmountCents)}</span><span className="attendance-amount">Total: {formatAmount(attendance.finalAmountCents)} · {attendance.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}</span><span className="attendance-nani">Entregar a NANI: {formatAmount(attendance.amountToNaniCents)}</span></> : <span className="attendance-amount">No es ingreso · importes $0</span>}</div><div className="attendance-meta"><time className="attendance-time" dateTime={attendance.createdAt}>{new Date(attendance.createdAt).toLocaleString('es-AR')}</time>{!dayClosed && <span>{remainingWindow(attendance.createdAt)}</span>}{editable && <button className="attendance-edit" type="button" onClick={() => editAttendance(attendance)}>Editar atención</button>}</div></article>;
      })}</section></>}
      {isAdmin && adminTab === 'catalog' && <section className="catalog" aria-labelledby="catalog-title">
        <h2 id="catalog-title">Catálogo de servicios</h2>
        <p className="muted">Los cambios aplican a nuevas atenciones. Las atenciones guardadas conservan sus importes.</p>
        <form onSubmit={saveCatalogService} noValidate>
          <label htmlFor="catalog-name">Nombre</label><input id="catalog-name" value={catalogName} onChange={(event) => setCatalogName(event.target.value)} required />
          <label htmlFor="catalog-category">Categoría</label><input id="catalog-category" value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} required placeholder="Ej. Cejas" />
          <label htmlFor="catalog-price">Precio (pesos)</label><input id="catalog-price" inputMode="decimal" value={catalogPrice} onChange={(event) => setCatalogPrice(event.target.value)} required />
          <label htmlFor="catalog-duration">Duración (minutos)</label><input id="catalog-duration" inputMode="numeric" value={catalogDuration} onChange={(event) => setCatalogDuration(event.target.value)} required />
          {catalogError && <p className="error" role="alert">{catalogError}</p>}
          <div className="home-actions"><button disabled={catalogSaving} type="submit">{catalogSaving ? 'Guardando…' : catalogEditingId ? 'Guardar cambios' : 'Crear servicio'}</button>{catalogEditingId && <button className="secondary" type="button" onClick={() => { setCatalogEditingId(null); setCatalogName(''); setCatalogCategory(''); setCatalogPrice(''); setCatalogDuration(''); }}>Cancelar</button>}</div>
        </form>
        <div className="catalog-list">{catalog.map((service) => <article className={`catalog-card ${service.active ? '' : 'catalog-inactive'}`} key={service.id}>
          <div><strong>{service.name}</strong><span>{service.category} · {formatAmount(service.baseAmountCents)} · {service.durationMinutes} min</span><span>{service.active ? 'Activo' : 'Inactivo'}</span></div>
          <div className="catalog-actions"><button type="button" onClick={() => editCatalogService(service)}>Editar</button><button className="secondary" type="button" onClick={() => toggleCatalogService(service)}>{service.active ? 'Desactivar' : 'Activar'}</button></div>
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
        <p className="muted">Activá o desactivá el acceso y actualizá el PIN de cada empleada. Los PIN nunca se muestran.</p>
        {employeeError && <p className="error" role="alert">{employeeError}</p>}
        <div className="catalog-list">
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
    </></div>
  </main>;
}

function MonthlyClosureControls({ report, saving, onToggle }: { report: Report | null; saving: boolean; onToggle: () => void }) {
  if (!report || report.from.slice(0, 7) !== report.to.slice(0, 7)) return null;
  const closed = Boolean(report.closure && !report.closure.reopenedAt);
  return <section className={`closure-bar ${closed ? 'closure-closed' : ''}`} aria-label="Cierre mensual"><div><strong>{closed ? 'Mes cerrado' : 'Cierre mensual pendiente'}</strong><span>{closed ? `Confirmado el ${new Date(report.closure!.confirmedAt).toLocaleString('es-AR')}` : `Período: ${report.from.slice(0, 7)}.`}</span></div><button className={closed ? 'secondary' : ''} type="button" onClick={onToggle} disabled={saving}>{saving ? 'Guardando…' : closed ? 'Reabrir mes' : 'Confirmar cierre mensual'}</button></section>;
}

function DailyRemittanceOverview({ summary }: { summary: DailySummary | null }) {
  if (!summary) return null;
  return <section className="remittance-bar" aria-label="Estado de entregas"><strong>Entregas a NANI</strong><div className="remittance-list">{summary.employees.filter((employee) => employee.employeeId !== 'nani').map((employee) => {
    const remittance = summary.remittances.find((item) => item.employeeId === employee.employeeId);
    const alreadySent = remittance?.amountCents ?? 0;
    const remaining = Math.max(employee.amountToNaniCents - alreadySent, 0);
    return <span key={employee.employeeId} className={remittance?.sentAt ? 'remittance-sent' : ''}>{employee.employeeName}: {remittance?.sentAt ? `Enviado ${formatAmount(alreadySent)}` : alreadySent ? `Ya envió ${formatAmount(alreadySent)} · Falta ${formatAmount(remaining)}` : `Pendiente · ${formatAmount(employee.amountToNaniCents)}`}</span>;
  })}</div></section>;
}

function DailyRemittanceSelf({ summary, saving, onMark }: { summary: DailySummary | null; saving: boolean; onMark: () => void }) {
  if (!summary || summary.employees.length === 0) return null;
  const employee = summary.employees[0];
  const remittance = summary.remittances.find((item) => item.employeeId === employee.employeeId);
  const sent = Boolean(remittance?.sentAt);
  const alreadySent = remittance?.amountCents ?? 0;
  const remaining = Math.max(employee.amountToNaniCents - alreadySent, 0);
  return <section className={`remittance-bar ${sent ? 'remittance-sent' : ''}`} aria-label="Mi entrega a NANI"><div><strong>{sent ? `Enviado: ${formatAmount(alreadySent)}` : alreadySent ? `Ya enviado: ${formatAmount(alreadySent)} · Falta: ${formatAmount(remaining)}` : `Entrega a NANI: ${formatAmount(employee.amountToNaniCents)}`}</strong><span>{sent ? 'La entrega está registrada.' : alreadySent ? 'Hay nuevas atenciones pendientes de entregar.' : 'Todavía no está marcada como enviada.'}</span></div>{!sent && <button type="button" onClick={onMark} disabled={saving}>{saving ? 'Guardando…' : 'Marcar dinero enviado'}</button>}</section>;
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
    <div><strong>{closed ? 'Cierre confirmado' : 'Cierre diario pendiente'}</strong><span>{closed ? `Confirmado el ${new Date(closure!.confirmedAt).toLocaleString('es-AR')}` : `La fecha seleccionada es ${date}.`}</span></div>
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
