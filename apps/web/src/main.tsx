import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Attendance, PublicUser, Service } from '@studiobynani/contracts';
import './styles.css';

const API = '/api/v1';
type Quote = Pick<Attendance, 'serviceId' | 'serviceName' | 'baseAmountCents' | 'discountCents' | 'finalAmountCents' | 'commissionCents' | 'amountToNaniCents'>;

function formatAmount(cents: number) {
  return `$${(cents / 100).toLocaleString('es-AR')}`;
}

function Access({ onLogin }: { onLogin: (user: PublicUser) => void }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/users`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => Array.isArray(data.users) ? setUsers(data.users) : Promise.reject())
      .catch(() => setError('No se pudieron cargar los usuarios.'));
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
      <form onSubmit={submit} noValidate>
        <label htmlFor="user">Usuario</label>
        <select id="user" value={userId} onChange={(event) => setUserId(event.target.value)} required>
          <option value="">Seleccioná tu nombre</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
        </select>
        <label htmlFor="pin">PIN</label>
        <input id="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} type="password" value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          aria-describedby={error ? 'access-error' : undefined} />
        {error && <p id="access-error" className="error" role="alert">{error}</p>}
        <button disabled={loading} type="submit">{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </section>
  </main>;
}

function Home({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const isAdmin = user.role === 'ADMIN';
  const [services, setServices] = useState<Service[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [clientName, setClientName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer');
  const [status, setStatus] = useState<Attendance['status']>('performed');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/attendances/services`, { credentials: 'include' }),
      fetch(`${API}/attendances/recent`, { credentials: 'include' })
    ]).then(async ([serviceResponse, recentResponse]) => {
      if (serviceResponse.status === 401 || recentResponse.status === 401) {
        onLogout();
        return;
      }
      if (!serviceResponse.ok || !recentResponse.ok) throw new Error('load');
      const [serviceData, recentData] = await Promise.all([serviceResponse.json(), recentResponse.json()]);
      setServices(serviceData.services ?? []);
      setAttendances(recentData.attendances ?? []);
    }).catch(() => setError('No se pudieron cargar tus atenciones.'));
  }, [isAdmin, onLogout]);

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

  return <main className="home-shell"><header><div><p className="eyebrow">STUDIOBYNANI</p><h1>Hola, {user.displayName}</h1></div><button className="secondary" onClick={onLogout}>Salir</button></header>
    <><section className="welcome"><h2>{editingId ? 'Editar atención' : isAdmin ? 'Nueva atención de NANI' : 'Nueva atención'}</h2><form onSubmit={saveAttendance} noValidate>
        <label htmlFor="client-name">Clienta</label><input id="client-name" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nombre completo" required />{fieldErrors.clientName && <p className="error">{fieldErrors.clientName}</p>}
        <label htmlFor="service">Servicio</label><select id="service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} required><option value="">Seleccioná un servicio</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} — {formatAmount(service.baseAmountCents)}</option>)}</select>{fieldErrors.serviceId && <p className="error">{fieldErrors.serviceId}</p>}
        <label htmlFor="payment">Medio de pago</label><select id="payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'transfer')}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option></select>
        {fieldErrors.paymentMethod && <p className="error">{fieldErrors.paymentMethod}</p>}
        <label htmlFor="status">Estado</label><select id="status" value={status} onChange={(event) => setStatus(event.target.value as Attendance['status'])}><option value="performed">Realizada</option><option value="cancelled">Cancelada</option><option value="absent">Ausente</option></select>
        {fieldErrors.status && <p className="error">{fieldErrors.status}</p>}
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
      <section className="recent"><h2>Mis atenciones</h2>{attendances.length === 0 ? <p className="muted">Todavía no registraste atenciones.</p> : attendances.map((attendance) => {
        const editable = now < new Date(attendance.createdAt).getTime() + 24 * 60 * 60 * 1000;
        const statusLabel = attendance.status === 'performed' ? 'Realizada' : attendance.status === 'cancelled' ? 'Cancelada' : 'Ausente';
        return <article className="attendance-card" key={attendance.id}><strong>{attendance.clientName}</strong><span>{attendance.serviceName}</span><span>Estado: {statusLabel}</span>{attendance.status === 'performed' ? <><span>Base: {formatAmount(attendance.baseAmountCents)}</span><span>Total: {formatAmount(attendance.finalAmountCents)} · {attendance.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}</span></> : <span>No es ingreso · importes $0</span>}<time dateTime={attendance.createdAt}>{new Date(attendance.createdAt).toLocaleString('es-AR')}</time><span>{remainingWindow(attendance.createdAt)}</span>{editable && <button type="button" onClick={() => editAttendance(attendance)}>Editar atención</button>}</article>;
      })}</section>
    </>
  </main>;
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
