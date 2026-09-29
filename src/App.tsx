import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Globe, LogOut, Plus } from 'lucide-react';
import {
  CURRENCIES,
  DEFAULT_REMINDERS,
  DEFAULT_SETTINGS,
  effectiveBillingDate,
  formatMinor,
  parseMoneyInput,
  buildRecordFromCreate,
  parseCreateInput,
  reminderAnchor,
  resolveReminderTarget,
  urgencyFor,
  type AppSettings,
  type Currency,
  type DomainRecord,
  type RenewalIntent,
  type ReminderConfig,
} from '../shared/domain';
import { ApiClientError, api, completeEmailLink, getMemoryToken, linkInLocation, minorToField, rememberSignInEmail, setMemoryToken, signOutSession, storedSignInEmail, watchAuth } from './services/client';
import { backupToDrive, connectGoogle, createCalendarEvent, createTask, domainSheetRows, downloadDriveBackup, exportSheet, googleConfigured, listDriveBackups, plannedReminderDates, reminderTitle, type DriveBackupFile } from './services/googleIntegration';

type View = 'dashboard' | 'domains' | 'settings' | 'admin';
type DomainView = DomainRecord & { id: string; revision: number; normalizedName: string };

async function loadAllDomains(): Promise<DomainView[]> {
  const records: DomainView[] = [];
  let cursor: string | null = null;
  do {
    const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page = await api<{ records: DomainView[]; nextCursor: string | null }>(`/api/v1/domains?limit=100&archived=all${suffix}`);
    records.push(...page.data.records);
    cursor = page.data.nextCursor;
  } while (cursor);
  return records;
}

const TEST_AUTH = import.meta.env.VITE_TEST_AUTH === '1';

function mutationFailureMessage(error: unknown, rejected: string, unknownOutcome: string): string {
  const message = error instanceof Error ? error.message : 'The request failed.';
  return error instanceof ApiClientError && error.status < 500
    ? `${message} ${rejected}`
    : `${message} ${unknownOutcome}`;
}

export default function App() {
  if (window.location.pathname === '/auth/finish') return <AuthFinish />;
  return <Product />;
}

function Product() {
  const [user, setUser] = useState<{ uid: string; email: string | null; role: 'member' | 'admin' } | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>(window.location.pathname === '/admin' ? 'admin' : 'dashboard');
  const [domains, setDomains] = useState<DomainView[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editing, setEditing] = useState<DomainView | null>(null);
  const captureOpener = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const generation = useRef(0);

  function openCapture(initial: DomainView | null, opener: HTMLElement) {
    captureOpener.current = opener;
    setEditing(initial);
    setCaptureOpen(true);
  }

  function closeCapture() {
    setCaptureOpen(false);
    const opener = captureOpener.current;
    captureOpener.current = null;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }

  const clearPrivate = useCallback(() => {
    generation.current += 1;
    setDomains([]);
    setSummary(null);
    setSettings(DEFAULT_SETTINGS);
    setPendingCount(0);
    setEditing(null);
    setCaptureOpen(false);
  }, []);

  const load = useCallback(async (uid: string) => {
    const ticket = ++generation.current;
    const [list, sum, prefs, session] = await Promise.all([
      loadAllDomains(),
      api<Summary>('/api/v1/summary'),
      api<AppSettings>('/api/v1/settings'),
      api<{ role: 'member' | 'admin'; email: string | null; uid: string }>('/api/session'),
    ]);
    if (ticket !== generation.current || session.data.uid !== uid) return;
    setDomains(list);
    setSummary(sum.data);
    setSettings(prefs.data);
    setUser({ uid: session.data.uid, email: session.data.email, role: session.data.role });
    if (session.data.role === 'admin') {
      const queue = await api<{ pending: number }>('/api/admin/requests');
      if (ticket === generation.current) setPendingCount(queue.data.pending);
    }
  }, []);

  useEffect(() => {
    if (getMemoryToken()) {
      api<{ uid: string; email: string | null; role: 'member' | 'admin' }>('/api/session')
        .then((session) => {
          clearPrivate();
          setUser(session.data);
          return load(session.data.uid);
        })
        .finally(() => setReady(true))
        .catch(() => {
          setMemoryToken(null);
          clearPrivate();
          setUser(null);
          setReady(true);
        });
      return;
    }
    return watchAuth(async (firebaseUser) => {
      if (!firebaseUser && getMemoryToken()) return;
      clearPrivate();
      if (!firebaseUser) {
        setUser(null);
        setReady(true);
        return;
      }
      try {
        setMemoryToken(await firebaseUser.getIdToken());
        await load(firebaseUser.uid);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'This account cannot open a portfolio yet.');
        await signOutSession();
        setUser(null);
      } finally {
        setReady(true);
      }
    });
  }, [clearPrivate, load]);

  async function refresh() {
    if (user) await load(user.uid);
  }

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-300">
        <p>Loading Domain Expansion…</p>
      </main>
    );
  }

  if (!user) return <Gate onTestUser={async () => {
    clearPrivate();
    const uid = `test-user-${crypto.randomUUID()}`;
    const response = await api<{ token: string }>('/api/test/session', { method: 'POST', body: { uid, email: 'tester@example.com', role: 'admin' } });
    setMemoryToken(response.data.token);
    await load(uid);
    setUser({ uid, email: 'tester@example.com', role: 'admin' });
  }} />;

  const visible = domains.filter((domain) => {
    if (domain.isArchived !== showArchived) return false;
    if (!query.trim()) return true;
    return domain.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button className="flex items-center gap-2" onClick={() => setView('dashboard')}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-600/20 text-indigo-300"><Globe className="h-4 w-4" /></span>
            <span>
              <span className="block text-sm font-semibold">Domain Expansion</span>
              <span className="block text-[10px] text-zinc-400">{domains.filter((domain) => !domain.isArchived).length} domains tracked</span>
            </span>
          </button>
          <nav className="flex items-center gap-1 text-sm" aria-label="Primary">
            <NavButton current={view} id="dashboard" onClick={setView}>Dashboard</NavButton>
            <NavButton current={view} id="domains" onClick={setView}>Domains</NavButton>
            <NavButton current={view} id="settings" onClick={setView}>Settings</NavButton>
            {user.role === 'admin' ? (
              <button className={`rounded-md px-3 py-2 ${view === 'admin' ? 'bg-zinc-800' : ''}`} data-testid="nav-admin" onClick={() => setView('admin')}>
                Admin{pendingCount ? ` (${pendingCount})` : ''}
              </button>
            ) : null}
          </nav>
          <div className="flex items-center gap-2">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium" data-testid="open-add" onClick={(event) => openCapture(null, event.currentTarget)}>
              <Plus className="h-4 w-4" /> Add domain
            </button>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm" onClick={async () => { clearPrivate(); await signOutSession(); setUser(null); }}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      {notice ? <p className="mx-auto max-w-7xl px-4 pt-4 text-sm text-amber-300" role="status">{notice}</p> : null}
      <main className="mx-auto max-w-7xl px-4 py-8">
        {view === 'dashboard' ? <Dashboard summary={summary} onAdd={(opener) => openCapture(null, opener)} onOpen={(domain, opener) => openCapture(domain, opener)} /> : null}
        {view === 'domains' ? (
          <section>
            <label className="mb-4 block text-sm text-zinc-300">Search
              <input className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="mb-4 flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> View archived domains</label>
            <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {visible.map((domain) => (
                <li key={domain.id}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-900" onClick={(event) => openCapture(domain, event.currentTarget)}>
                    <span>
                      <span className="block font-medium">{domain.name}</span>
                      <span className="block text-xs text-zinc-400">{domain.registrar || 'Registrar unknown'} · {effectiveBillingDate(domain) || 'No date'}</span>
                    </span>
                    <span className="text-sm text-zinc-300">{formatMinor(domain.renewalCostMinor, domain.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {view === 'settings' ? <Settings settings={settings} domains={domains} onChanged={refresh} /> : null}
        {view === 'admin' && user.role === 'admin' ? <Admin onChanged={refresh} /> : null}
      </main>
      {captureOpen ? (
        <div key={editing?.id ?? 'new'}>
        <CaptureDialog
          settings={settings}
          initial={editing}
          onClose={closeCapture}
          onSaved={async (message) => {
            setNotice(message);
            closeCapture();
            try {
              await refresh();
            } catch (error) {
              setNotice(`${message}. The latest data could not be reloaded: ${error instanceof Error ? error.message : 'try refreshing the page'}`);
            }
          }}
          onOpenExisting={async (id) => {
            const match = domains.find((domain) => domain.id === id) || (await api<DomainView>(`/api/v1/domains/${id}`)).data;
            setEditing(match);
          }}
        />
        </div>
      ) : null}
    </div>
  );
}

function NavButton({ current, id, onClick, children }: { current: View; id: View; onClick: (view: View) => void; children: React.ReactNode }) {
  return (
    <button className={`rounded-md px-3 py-2 ${current === id ? 'bg-zinc-800' : ''}`} data-testid={`nav-${id}`} onClick={() => onClick(id)}>
      {children}
    </button>
  );
}

interface Summary {
  today: string;
  nextPayment: { id: string; name: string; effectiveBillingDate: string | null; renewalCostMinor: number | null; currency: Currency } | null;
  spending: { byCurrency: { currency: Currency; minor: number; count: number }[]; unknownCostCount: number };
  upcoming: DomainView[];
}

function Dashboard({ summary, onAdd, onOpen }: { summary: Summary | null; onAdd: (opener: HTMLElement) => void; onOpen: (domain: DomainView, opener: HTMLElement) => void }) {
  if (!summary || (summary.upcoming.length === 0 && !summary.nextPayment)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-semibold">No domains yet.</h1>
        <p className="mt-2 text-sm text-zinc-400">Add the next domain you are tracking. Advanced details can wait.</p>
        <button className="mt-6 inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4" data-testid="empty-add" onClick={(event) => onAdd(event.currentTarget)}>Add domain</button>
      </div>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-1">
        <h1 className="text-sm text-zinc-400">Next payment</h1>
        {summary.nextPayment ? (
          <>
            <p className="mt-2 text-2xl font-semibold">{summary.nextPayment.name}</p>
            <p className="text-zinc-300">{summary.nextPayment.effectiveBillingDate}</p>
            <p className="mt-2">{summary.nextPayment.renewalCostMinor === null ? 'Not entered' : formatMinor(summary.nextPayment.renewalCostMinor, summary.nextPayment.currency)}</p>
          </>
        ) : <p className="mt-2">Nothing scheduled.</p>}
      </section>
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-2">
        <h2 className="text-sm text-zinc-400">Next 12 months</h2>
        <ul className="mt-3 space-y-1">
          {summary.spending.byCurrency.map((row) => <li key={row.currency}>{formatMinor(row.minor, row.currency)} · {row.count} priced</li>)}
          {summary.spending.byCurrency.length === 0 ? <li>No priced renewals in the window.</li> : null}
        </ul>
        {summary.spending.unknownCostCount ? <p className="mt-2 text-sm text-amber-300">{summary.spending.unknownCostCount} qualifying domains have no cost entered.</p> : null}
      </section>
      <section className="lg:col-span-3">
        <h2 className="mb-3 text-sm text-zinc-400">Upcoming</h2>
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {summary.upcoming.slice(0, 6).map((domain) => (
            <li key={domain.id}>
              <button className="flex w-full justify-between px-4 py-3 text-left" onClick={(event) => onOpen(domain, event.currentTarget)}>
                <span>{domain.name}</span>
                <span className="text-zinc-400">{effectiveBillingDate(domain)} · {urgencyFor(domain, summary.today)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">Urgency is in-app only. Closing the browser does not schedule a notification.</p>
      </section>
    </div>
  );
}

function Gate({ onTestUser }: { onTestUser: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  async function submit(path: string, body: unknown) {
    setMessage(null);
    try {
      const response = await api<{ message: string }>(path, { method: 'POST', body });
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The request could not be sent. Try again.');
    }
  }
  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center gap-8 px-4">
      <div>
        <p className="text-sm text-indigo-300">Domain Expansion</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Know what renews next.</h1>
        <p className="mt-3 text-sm text-zinc-300">Track your domains, renewal dates, costs, and purchase details in a private portfolio. Review AI capture drafts before saving, and choose optional Google Calendar, Tasks, Sheets, or Drive actions when you need them.</p>
        <p className="mt-3 text-sm text-zinc-400">Approved members sign in by email. Everyone else can request access. A Firebase account alone does not open a portfolio.</p>
      </div>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); rememberSignInEmail(email); void submit('/api/auth/email-link', { email }); }}>
        <label className="text-sm">Email
          <input className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" data-testid="signin-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="min-h-11 rounded-md bg-indigo-600" type="submit">Email me a sign-in link</button>
      </form>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit('/api/access/request', { email, reason }); }}>
        <label className="text-sm">Request access
          <input className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" data-testid="request-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="text-sm">Reason, optional
          <input className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button className="min-h-11 rounded-md border border-zinc-700" type="submit">Request access</button>
      </form>
      {message ? <p role="status" className="text-sm text-zinc-300">{message}</p> : null}
      <nav aria-label="Public information" className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-indigo-300">
        <a className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" href="/showcase">View the showcase</a>
        <a className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" href="/privacy">Privacy notice</a>
      </nav>
      {TEST_AUTH ? <button className="min-h-11 rounded-md border border-dashed border-zinc-600 text-sm" data-testid="test-sign-in" onClick={() => void onTestUser()}>Continue as test user</button> : null}
    </main>
  );
}

function AuthFinish() {
  const [email, setEmail] = useState(storedSignInEmail() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!linkInLocation()) {
      window.history.replaceState({}, document.title, '/auth/finish');
      setError('This page completes an email sign-in link. Request a new link if this one expired.');
      return;
    }
    const stored = storedSignInEmail();
    if (!stored) return;
    completeEmailLink(stored).then(() => setDone(true)).catch(() => {
      window.history.replaceState({}, document.title, '/auth/finish');
      setError('This sign-in link is invalid, expired, or already used. Request another link.');
    });
  }, []);
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Finish signing in</h1>
      {done ? <p>Signed in. <a className="text-indigo-300" href="/">Continue</a></p> : null}
      {error ? <p role="alert">{error} <a className="text-indigo-300" href="/">Back</a></p> : null}
      {!done && linkInLocation() && !storedSignInEmail() ? (
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); completeEmailLink(email).then(() => setDone(true)).catch(() => { window.history.replaceState({}, document.title, '/auth/finish'); setError('Check the email address and request a new link.'); }); }}>
          <label>Confirm the email that received the link
            <input className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="min-h-11 rounded-md bg-indigo-600" type="submit">Continue</button>
        </form>
      ) : null}
    </main>
  );
}

function CaptureDialog({ settings, initial, onClose, onSaved, onOpenExisting }: { settings: AppSettings; initial: DomainView | null; onClose: () => void; onSaved: (message: string) => Promise<void>; onOpenExisting: (id: string) => Promise<void> }) {
  const titleId = useId();
  const [mode, setMode] = useState<'quick' | 'ai'>('quick');
  const [advanced, setAdvanced] = useState(false);
  const [unsaved, setUnsaved] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [registrar, setRegistrar] = useState(initial?.registrar ?? '');
  const [renewalDate, setRenewalDate] = useState(initial?.expirationDate ?? '');
  const [cost, setCost] = useState(initial ? minorToField(initial.renewalCostMinor, initial.currency) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? settings.defaultCurrency);
  const [intent, setIntent] = useState<RenewalIntent>(initial?.renewalIntent ?? 'renew');
  const [billingDate, setBillingDate] = useState(initial?.billingDate ?? '');
  const [registrationDate, setRegistrationDate] = useState(initial?.registrationDate ?? '');
  const [registrationCost, setRegistrationCost] = useState(initial ? minorToField(initial.registrationCostMinor, initial.currency) : '');
  const [dnsProvider, setDnsProvider] = useState(initial?.dnsProvider ?? '');
  const [ownership, setOwnership] = useState(initial?.ownership ?? 'owned');
  const [lifecycle, setLifecycle] = useState(initial?.lifecycle ?? 'active');
  const [autoRenew, setAutoRenew] = useState(initial?.autoRenew === null || initial?.autoRenew === undefined ? '' : initial.autoRenew ? 'true' : 'false');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [purchaseEmail, setPurchaseEmail] = useState(initial?.purchaseEmail ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '');
  const [reminders, setReminders] = useState<ReminderConfig>(initial?.reminders ?? settings.reminders);
  const [offsets, setOffsets] = useState((initial?.reminders ?? settings.reminders).offsets.join(', '));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const advancedUsed = useRef(false);
  const lastPayload = useRef('');
  const [archived, setArchived] = useState(initial?.isArchived ?? false);
  const [ackCurrency, setAckCurrency] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());
  const firstField = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);

  useEffect(() => { firstField.current?.focus(); }, [mode]);
  function mark() { dirty.current = true; }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current || deletingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setUnsaved(null);
    try {
      const renewalCostMinor = parseMoneyInput(cost, currency);
      const body: Record<string, unknown> = {
        name,
        registrar: registrar.trim() ? registrar.trim() : null,
        expirationDate: renewalDate || null,
        renewalCostMinor,
        currency,
        renewalIntent: intent,
      };
      if (advanced || advancedUsed.current || initial) {
        body.billingDate = billingDate || null;
        body.registrationDate = registrationDate || null;
        body.registrationCostMinor = parseMoneyInput(registrationCost, currency);
        body.dnsProvider = dnsProvider.trim() ? dnsProvider.trim() : null;
        body.ownership = ownership;
        body.lifecycle = lifecycle;
        body.autoRenew = autoRenew === '' ? null : autoRenew === 'true';
        body.notes = notes;
        body.purchaseEmail = purchaseEmail.trim() || null;
        body.paymentMethod = paymentMethod || null;
        body.isArchived = archived;
        body.reminders = { ...reminders, offsets: offsets.trim() ? offsets.split(',').map((part) => Number(part.trim())) : [] };
      }
        if (initial && currency !== initial.currency && (initial.renewalCostMinor !== null || initial.registrationCostMinor !== null)) {
          if (!ackCurrency) throw new ApiClientError(422, 'currency_change_unacknowledged', 'Confirm the currency change before saving.');
          body.clearCostsOnCurrencyChange = true;
        }
      const payload = JSON.stringify(body);
      if (lastPayload.current && lastPayload.current !== payload) idempotencyKey.current = crypto.randomUUID();
      lastPayload.current = payload;
      if (!initial) {
        await api('/api/v1/domains', { method: 'POST', body, idempotencyKey: idempotencyKey.current });
        dirty.current = false;
        await onSaved('Expanded');
      } else {
        await api(`/api/v1/domains/${initial.id}`, { method: 'PATCH', body, ifMatch: `"${initial.revision}"`, idempotencyKey: idempotencyKey.current });
        dirty.current = false;
        await onSaved('Saved');
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.existingId) {
        setUnsaved(`${error.message} You can open the existing record instead of overwriting it.`);
        await onOpenExisting(error.existingId);
        return;
      }
      setUnsaved(mutationFailureMessage(
        error,
        'Nothing was saved.',
        initial
          ? 'The save outcome is unknown. Your edit is still here; reload before retrying.'
          : 'The save outcome is unknown. Your draft is still here; retrying the unchanged submission is safe.',
      ));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial || savingRef.current || deletingRef.current || deleteName !== initial.name) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await api(`/api/v1/domains/${initial.id}`, { method: 'DELETE', ifMatch: `"${initial.revision}"` });
      dirty.current = false;
      await onSaved('Deleted');
    } catch (error) {
      setUnsaved(mutationFailureMessage(
        error,
        'Nothing was deleted.',
        'The delete outcome is unknown. Check the portfolio before trying again.',
      ));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  function switchMode(next: 'quick' | 'ai') {
    if (next === mode || savingRef.current || deletingRef.current) return;
    if (dirty.current && !window.confirm('Switching capture modes will discard the unsaved draft. Continue?')) return;
    dirty.current = false;
    setMode(next);
  }

  function requestClose() {
    if (savingRef.current || deletingRef.current) return;
    if (dirty.current && !window.confirm('Discard the unsaved domain draft?')) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onMouseDown={requestClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
        if (event.key !== 'Tab') return;
        const elements: HTMLElement[] = dialog.current ? Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')) : [];
        const controls = elements.filter((element) => element.getClientRects().length > 0);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">{initial ? 'Edit domain' : 'Add domain'}</h2>
          <button className="min-h-11 px-2" onClick={requestClose}>Close</button>
        </div>
        <div className="mb-4 flex gap-2" role="group" aria-label="Capture mode">
          <button type="button" aria-pressed={mode === 'quick'} className={`min-h-11 rounded-md px-3 ${mode === 'quick' ? 'bg-zinc-800' : ''}`} data-testid="capture-mode-quick" onClick={() => switchMode('quick')}>Quick Add</button>
          <button type="button" aria-pressed={mode === 'ai'} className={`min-h-11 rounded-md px-3 ${mode === 'ai' ? 'bg-zinc-800' : ''}`} data-testid="capture-mode-ai" onClick={() => switchMode('ai')}>✨ AI Quick Add</button>
        </div>
        {mode === 'ai' ? <AiCapture settings={settings} onSaved={onSaved} onOpenExisting={onOpenExisting} onDirty={mark} /> : (
          <form className="grid gap-3" onSubmit={save}>
            <Field label="Domain"><input ref={firstField} className="field" data-testid="quick-add-domain" required value={name} onChange={(event) => { mark(); setName(event.target.value); }} /></Field>
            <Field label="Registrar"><input className="field" data-testid="quick-add-registrar" value={registrar} onChange={(event) => { mark(); setRegistrar(event.target.value); }} placeholder="Optional" /></Field>
            <Field label={initial ? 'Expiration date' : 'Renewal date'}><input className="field" data-testid="quick-add-date" type="date" required={!billingDate} value={renewalDate} onChange={(event) => { mark(); setRenewalDate(event.target.value); }} /></Field>
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <Field label="Renewal cost"><input className="field" data-testid="quick-add-cost" inputMode="decimal" value={cost} onChange={(event) => { mark(); setCost(event.target.value); }} placeholder="Unknown if blank" /></Field>
              <Field label="Currency">
                <select className="field" data-testid="quick-add-currency" value={currency} onChange={(event) => { mark(); setCurrency(event.target.value as Currency); setCost(''); setRegistrationCost(''); setAckCurrency(false); }}>
                  {CURRENCIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Renewal intention">
              <select className="field" data-testid="quick-add-intent" value={intent} onChange={(event) => { mark(); setIntent(event.target.value as RenewalIntent); }}>
                <option value="renew">Renew</option>
                <option value="let_expire">Let expire</option>
              </select>
            </Field>
            <button type="button" className="min-h-11 text-left text-sm text-indigo-300" data-testid="more-details" aria-expanded={advanced} onClick={() => { if (!advanced) advancedUsed.current = true; setAdvanced((value) => !value); }}>
              {advanced ? 'Hide details' : 'More details'}
            </button>
            {advanced ? (
              <div data-testid="advanced-panel" className="grid gap-3 border-t border-zinc-800 pt-3">
                <h3 className="text-sm text-zinc-400">Dates and costs</h3>
                <Field label="Billing date"><input className="field" data-testid="billing-date" type="date" value={billingDate} onChange={(event) => { mark(); setBillingDate(event.target.value); }} /></Field>
                <Field label="Registration date"><input className="field" type="date" value={registrationDate} onChange={(event) => { mark(); setRegistrationDate(event.target.value); }} /></Field>
                <Field label="Registration cost"><input className="field" value={registrationCost} onChange={(event) => { mark(); setRegistrationCost(event.target.value); }} /></Field>
                <h3 className="text-sm text-zinc-400">Relationship and state</h3>
                <Field label="Ownership"><select className="field" value={ownership} onChange={(event) => { mark(); setOwnership(event.target.value as 'owned' | 'managed'); }}><option value="owned">Owned</option><option value="managed">Managed</option></select></Field>
                <Field label="Lifecycle"><select className="field" value={lifecycle} onChange={(event) => { mark(); setLifecycle(event.target.value as DomainView['lifecycle']); }}><option value="active">Active</option><option value="inactive">Inactive</option><option value="transferred">Transferred</option></select></Field>
                <Field label="Registrar auto-renew"><select className="field" value={autoRenew} onChange={(event) => { mark(); setAutoRenew(event.target.value); }}><option value="">Unknown</option><option value="true">On</option><option value="false">Off</option></select></Field>
                <h3 className="text-sm text-zinc-400">Providers and notes</h3>
                <Field label="DNS provider"><input className="field" value={dnsProvider} onChange={(event) => { mark(); setDnsProvider(event.target.value); }} /></Field>
                <Field label="Notes"><textarea className="field min-h-24" value={notes} onChange={(event) => { mark(); setNotes(event.target.value); }} /></Field>
                <h3 className="text-sm text-zinc-400">Payment details, optional</h3>
                <Field label="Purchase email"><input className="field" type="email" maxLength={254} data-testid="purchase-email" value={purchaseEmail} onChange={(event) => { mark(); setPurchaseEmail(event.target.value); }} /></Field>
                <Field label="Payment method"><textarea className="field min-h-20" maxLength={2000} data-testid="payment-method" value={paymentMethod} onChange={(event) => { mark(); setPaymentMethod(event.target.value); }} placeholder="Describe the method used" /></Field>
                <h3 className="text-sm text-zinc-400">Reminders</h3>
                <ReminderFields value={reminders} onChange={(value) => { mark(); setReminders(value); }} offsets={offsets} onOffsets={(value) => { mark(); setOffsets(value); }} />
                <p className="text-xs text-zinc-500">In-app urgency is shown when enabled. External notifications require a deliberate Calendar or Tasks action.</p>
                {initial ? <label className="text-sm"><input type="checkbox" checked={archived} onChange={(event) => { mark(); setArchived(event.target.checked); }} /> Archived</label> : null}
              </div>
            ) : null}
            {initial && currency !== initial.currency && (initial.renewalCostMinor !== null || initial.registrationCostMinor !== null) ? <label className="text-sm text-amber-200"><input type="checkbox" checked={ackCurrency} onChange={(event) => setAckCurrency(event.target.checked)} /> Changing currency clears the stored amounts. Any costs entered now use the new currency.</label> : null}
            {unsaved ? <p role="alert" data-testid="save-status" className="text-sm text-rose-300">{unsaved}</p> : null}
            <button className="min-h-11 rounded-md bg-indigo-600 disabled:opacity-50" data-testid="quick-add-save" type="submit" disabled={saving || deleting}>{saving ? 'Saving…' : deleting ? 'Deleting…' : 'Save'}</button>
            {initial ? (
              <div className="mt-4 border-t border-rose-900/60 pt-4">
                <button type="button" className="text-sm text-rose-300" disabled={saving || deleting} onClick={() => setDeleteArmed((value) => !value)}>Permanently delete {initial.name}</button>
                {deleteArmed ? (
                  <div className="mt-2 grid gap-2">
                    <p className="text-sm text-rose-200">This cannot be undone. Calendar events and tasks are left in place.</p>
                    <label>Type {initial.name} to confirm<input className="field" value={deleteName} onChange={(event) => setDeleteName(event.target.value)} /></label>
                    <div className="flex gap-2">
                      <button type="button" className="min-h-11 rounded-md bg-rose-700 px-3 disabled:opacity-50" data-testid="delete-submit" disabled={deleteName !== initial.name || saving || deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete forever'}</button>
                      <button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3" disabled={deleting} onClick={() => { setDeleteArmed(false); setDeleteName(''); }}>Cancel</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-sm text-zinc-300">{label}{children}</label>;
}

function ReminderFields({ value, onChange, offsets, onOffsets }: { value: ReminderConfig; onChange: (value: ReminderConfig) => void; offsets: string; onOffsets: (value: string) => void }) {
  return <>
    <label className="text-sm"><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /> Reminders enabled</label>
    <Field label="Reminder target"><select className="field" data-testid="reminder-target" value={value.target} onChange={(event) => onChange({ ...value, target: event.target.value as ReminderConfig['target'] })}><option value="default">Follow renewal intention</option><option value="billing">Billing</option><option value="expiration">Expiration</option></select></Field>
    <Field label="Reminder days before"><input className="field" data-testid="reminder-offsets" value={offsets} onChange={(event) => onOffsets(event.target.value)} placeholder="30, 14, 7, 1" /></Field>
  </>;
}

interface ClientDraft {
  name: string | null;
  registrar: string | null;
  expirationDate: string | null;
  billingDate: string | null;
  renewalCostMinor: number | null;
  currency: string | null;
  suggestedCurrency: string | null;
  renewalIntent: 'renew' | 'let_expire' | null;
  warnings: string[];
  proposals: { field: string; reason: string }[];
  excluded?: boolean;
  costInput?: string;
}

function AiCapture({ settings, onSaved, onOpenExisting, onDirty }: { settings: AppSettings; onSaved: (message: string) => Promise<void>; onOpenExisting: (id: string) => Promise<void>; onDirty: () => void }) {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<ClientDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestGen = useRef(0);
  const idempotencyKey = useRef(crypto.randomUUID());
  const approving = useRef(false);
  const [committing, setCommitting] = useState(false);
  const lastPayload = useRef('');
  useEffect(() => () => { requestGen.current += 1; }, []);
  function draftInput(draft: ClientDraft) {
    return { name: draft.name, registrar: draft.registrar, expirationDate: draft.expirationDate, billingDate: draft.billingDate, renewalCostMinor: draft.costInput === undefined ? draft.renewalCostMinor : parseMoneyInput(draft.costInput, (draft.currency ?? draft.suggestedCurrency ?? settings.defaultCurrency) as Currency), currency: draft.currency ?? draft.suggestedCurrency ?? settings.defaultCurrency, renewalIntent: draft.renewalIntent ?? 'renew' };
  }
  const selected = drafts.filter((draft) => {
    if (draft.excluded) return false;
    try { buildRecordFromCreate(parseCreateInput(draftInput(draft)), settings, 'draft', new Date().toISOString()); return true; } catch { return false; }
  });
  function editDraft(index: number, patch: Partial<ClientDraft>) {
    setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function extract(event: React.FormEvent) {
    event.preventDefault();
    const generation = ++requestGen.current;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ drafts: ClientDraft[] }>('/api/ai/extract', { method: 'POST', body: { text, timezone: settings.timezone } });
      if (generation !== requestGen.current) return;
      setDrafts(response.data.drafts);
    } catch (extractError) {
      if (generation === requestGen.current) setError(extractError instanceof Error ? extractError.message : 'AI Quick Add is unavailable. Quick Add still works.');
    } finally {
      if (generation === requestGen.current) setBusy(false);
    }
  }

  async function approve() {
    if (approving.current || !selected.length) return;
    approving.current = true;
    setCommitting(true);
    setError(null);
    try {
      const body = { source: 'ai', records: selected.map(draftInput) };
      const payload = JSON.stringify(body);
      if (lastPayload.current && lastPayload.current !== payload) idempotencyKey.current = crypto.randomUUID();
      lastPayload.current = payload;
      await api('/api/v1/domains/batch', {
        method: 'POST',
        idempotencyKey: idempotencyKey.current,
        body,
      });
      setDrafts([]);
      setText('');
      await onSaved(`Added ${selected.length}`);
    } catch (approveError) {
      if (approveError instanceof ApiClientError && approveError.existingId) {
        setError('One proposal matches a domain you already track. Open it instead of saving a duplicate. Nothing was added.');
        await onOpenExisting(approveError.existingId);
        return;
      }
      setError(mutationFailureMessage(
        approveError,
        'Nothing was added.',
        'The save outcome is unknown. Your review is still here; retrying the unchanged selection is safe.',
      ));
    } finally {
      approving.current = false;
      setCommitting(false);
    }
  }

  return (
    <div className="grid gap-3" onChange={onDirty}>
      <form onSubmit={extract} className="grid gap-2">
        <label className="text-sm">Describe one or more domains
          <textarea className="field min-h-24" data-testid="ai-input" value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <button className="min-h-11 rounded-md border border-zinc-700" data-testid="ai-submit" disabled={busy}>{busy ? 'Reading…' : 'Review proposals'}</button>
      </form>
      <p className="text-xs text-zinc-500">Proposals are not saved until you add them. Manual Quick Add stays available.</p>
      {drafts.map((draft, index) => (
        <article key={`${draft.name}-${index}`} className="rounded-lg border border-zinc-800 p-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!draft.excluded} onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, excluded: !event.target.checked } : row))} /> Include</label>
          <p className="mt-2">{draft.name || 'Name needed'} · {draft.registrar || 'Registrar unknown'} · {draft.expirationDate || 'Date needed'} · {draft.renewalCostMinor === null ? 'Cost unknown' : formatMinor(draft.renewalCostMinor, (draft.currency || draft.suggestedCurrency || settings.defaultCurrency) as Currency)} · {draft.renewalIntent || 'renew'}</p>
          {draft.proposals.map((proposal) => <p key={proposal.field} className="text-amber-200">{proposal.reason}</p>)}
          {draft.warnings.map((warning) => <p key={warning} className="text-rose-300">{warning}</p>)}
          <label className="mt-2 block">Domain<input className="field" value={draft.name ?? ''} onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /></label>
          <label className="mt-2 block">Registrar<input className="field" value={draft.registrar ?? ''} onChange={(event) => editDraft(index, { registrar: event.target.value || null })} /></label>
          <label className="mt-2 block">Expiration date<input className="field" type="date" value={draft.expirationDate ?? ''} onChange={(event) => editDraft(index, { expirationDate: event.target.value || null })} /></label>
          <label className="mt-2 block">Billing date<input className="field" type="date" value={draft.billingDate ?? ''} onChange={(event) => editDraft(index, { billingDate: event.target.value || null })} /></label>
          <div className="mt-2 grid grid-cols-[1fr_8rem] gap-2">
            <label>Renewal cost<input className="field" inputMode="decimal" value={draft.costInput ?? minorToField(draft.renewalCostMinor, (draft.currency ?? draft.suggestedCurrency ?? settings.defaultCurrency) as Currency)} onChange={(event) => editDraft(index, { costInput: event.target.value })} /></label>
            <label>Currency<select className="field" value={draft.currency ?? draft.suggestedCurrency ?? settings.defaultCurrency} onChange={(event) => editDraft(index, { currency: event.target.value })}>{CURRENCIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label className="mt-2 block">Renewal intention<select className="field" value={draft.renewalIntent ?? 'renew'} onChange={(event) => editDraft(index, { renewalIntent: event.target.value as RenewalIntent })}><option value="renew">Renew</option><option value="let_expire">Let expire</option></select></label>
        </article>
      ))}
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      {drafts.length ? <button className="min-h-11 rounded-md bg-indigo-600" data-testid="ai-add-selected" disabled={!selected.length || committing} onClick={() => void approve()}>{committing ? 'Adding…' : selected.length < drafts.filter((draft) => !draft.excluded).length ? `Add valid (${selected.length})` : `Add selected (${selected.length})`}</button> : null}
    </div>
  );
}

function Settings({ settings, domains, onChanged }: { settings: AppSettings; domains: DomainView[]; onChanged: () => Promise<void> }) {
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [reminders, setReminders] = useState(settings.reminders);
  const [offsets, setOffsets] = useState(settings.reminders.offsets.join(', '));
  const [key, setKey] = useState('');
  const [consent, setConsent] = useState(false);
  const [tokenName, setTokenName] = useState('Automation');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [integrationNote, setIntegrationNote] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ configured: boolean; source: string | null; revision?: number } | null>(null);
  const [tokens, setTokens] = useState<{ id: string; name: string; scopes: string[]; expiresAt: string; revokedAt: string | null }[]>([]);
  const [tokenScopes, setTokenScopes] = useState<string[]>(['domains:read', 'domains:write']);
  const [tokenDays, setTokenDays] = useState(90);
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const integrationBusyRef = useRef(false);
  const integrationMounted = useRef(true);
  const [reminderPlan, setReminderPlan] = useState<{ action: 'calendar' | 'tasks'; domain: DomainView; anchor: string; target: 'billing' | 'expiration'; items: { offset: number; date: string }[] } | null>(null);
  const [reminderOffset, setReminderOffset] = useState<number | null>(null);
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[]>([]);
  const [selectedDriveBackup, setSelectedDriveBackup] = useState('');
  const [driveRestoreContent, setDriveRestoreContent] = useState<{ content: string; nonce: number } | null>(null);
  const driveToken = useRef<{ accessToken: string; sessionToken: string } | null>(null);

  useEffect(() => {
    integrationMounted.current = true;
    return () => {
      integrationMounted.current = false;
      driveToken.current = null;
    };
  }, []);

  function captureIntegrationSession(): { token: string; isCurrent: () => boolean } | null {
    const token = getMemoryToken();
    if (!token) {
      setIntegrationNote('Sign in before using Google integrations.');
      return null;
    }
    return { token, isCurrent: () => integrationMounted.current && getMemoryToken() === token };
  }

  useEffect(() => {
    void Promise.all([
      api<typeof credential>('/api/credentials/gemini'),
      api<{ tokens: typeof tokens }>('/api/tokens'),
    ]).then(([status, list]) => {
      setCredential(status.data);
      setTokens(list.data.tokens);
    }).catch((error) => setMessage(error instanceof Error ? error.message : 'Settings could not be loaded.'));
  }, []);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/api/v1/settings', { method: 'PUT', body: { ...settings, defaultCurrency: currency, timezone, reminders: { ...reminders, offsets: offsets.trim() ? offsets.split(',').map((part) => Number(part.trim())) : [] } } });
      setMessage('Settings saved');
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Settings were not saved.');
    }
  }

  async function saveKey(event: React.FormEvent) {
    event.preventDefault();
    try {
      const response = await api<NonNullable<typeof credential>>('/api/credentials/gemini', { method: 'PUT', ifMatch: credential?.source === 'byok' && credential.revision ? `"${credential.revision}"` : undefined, body: { apiKey: key, consent, consentVersion: '2026-09-26' } });
      setKey('');
      setCredential(response.data);
      setMessage('Key stored. It will not be shown again.');
    } catch (error) {
      setKey('');
      setMessage(error instanceof Error ? error.message : 'Key was not stored.');
    }
  }

  async function removeKey() {
    try {
      const response = await api<NonNullable<typeof credential>>('/api/credentials/gemini', { method: 'DELETE' });
      setCredential(response.data);
      setMessage('Stored key removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Key was not removed.');
    }
  }

  async function createToken(event: React.FormEvent) {
    event.preventDefault();
    try {
      const response = await api<{ token: string; tokenRecord: typeof tokens[number] }>('/api/tokens', { method: 'POST', body: { name: tokenName, scopes: tokenScopes, expiresInDays: tokenDays } });
      setPlaintext(response.data.token);
      setTokens((rows) => [...rows, response.data.tokenRecord]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Token was not created.');
    }
  }

  async function revokeToken(id: string) {
    try {
      await api(`/api/tokens/${id}/revoke`, { method: 'POST', body: {} });
      setTokens((rows) => rows.map((row) => row.id === id ? { ...row, revokedAt: new Date().toISOString() } : row));
      setPlaintext(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Token was not revoked.');
    }
  }

  function prepareReminder(action: 'calendar' | 'tasks') {
    const domain = domains.find((item) => item.id === selectedDomainId && !item.isArchived);
    if (!domain) {
      setIntegrationNote('Choose a domain before creating an external reminder.');
      return;
    }
    const anchor = reminderAnchor(domain);
    if (!anchor) {
      setReminderPlan(null);
      setIntegrationNote(`${domain.name} has no effective billing or expiration date.`);
      return;
    }
    const items = plannedReminderDates(domain.reminders, anchor);
    if (!items.length) {
      setReminderPlan(null);
      setIntegrationNote(domain.reminders.enabled ? `${domain.name} has no reminder offsets configured.` : `${domain.name} reminders are disabled. Enable reminders before creating an external reminder.`);
      return;
    }
    const target = resolveReminderTarget(domain.reminders, domain.renewalIntent);
    setReminderPlan({ action, domain, anchor, target, items });
    setReminderOffset(items[0].offset);
    setIntegrationNote(null);
  }

  async function createPlannedReminder() {
    if (!reminderPlan || integrationBusyRef.current) return;
    const { action, domain, anchor, target, items } = reminderPlan;
    const selected = items.find((item) => item.offset === reminderOffset);
    if (!selected) return;
    const session = captureIntegrationSession();
    if (!session) return;
    integrationBusyRef.current = true;
    setIntegrationBusy(true);
    try {
      const accessToken = await connectGoogle(action);
      if (!session.isCurrent()) return;
      const date = selected.date;
      const reconcileKey = `${domain.id}:${anchor}:offset:${selected.offset}`;
      const title = reminderTitle(domain.name, domain.renewalIntent, selected.offset);
      const result = action === 'calendar'
        ? await createCalendarEvent(accessToken, title, date, reconcileKey, session.isCurrent)
        : await createTask(accessToken, title, date, reconcileKey, session.isCurrent);
      if (!session.isCurrent()) return;
      if (result.uncertain) {
        setIntegrationNote(`Google could not confirm whether the ${action === 'calendar' ? 'event' : 'task'} for ${domain.name} was created. Check ${action === 'calendar' ? 'Calendar' : 'Tasks'} before retrying.`);
        return;
      }
      try {
        if (!session.isCurrent()) return;
        await api(`/api/v1/domains/${domain.id}/integrations`, {
          method: 'POST',
          ifMatch: `"${domain.revision}"`,
          body: action === 'calendar'
            ? { calendarEventId: result.id, calendarReconcileKey: reconcileKey }
            : { tasksTaskId: result.id, tasksReconcileKey: reconcileKey },
        });
      } catch (error) {
        if (!session.isCurrent()) return;
        setIntegrationNote(`${result.alreadyExisted ? 'Matched' : 'Created'} the ${action === 'calendar' ? 'Calendar event' : 'Tasks reminder'} for ${domain.name} on ${date}, but could not update its Domain Expansion reference: ${error instanceof Error ? error.message : 'refresh and try again'}.`);
        await onChanged();
        return;
      }
      setIntegrationNote(`${result.alreadyExisted ? 'Matched' : 'Created'} the ${action === 'calendar' ? 'Calendar event' : 'Tasks reminder'} for ${domain.name} on ${date} (${target}, ${selected.offset} days before ${anchor}).`);
      setReminderPlan(null);
      await onChanged();
    } catch (error) {
      if (session.isCurrent()) setIntegrationNote(error instanceof Error ? error.message : 'Integration failed. Domain records stay as they were.');
    } finally {
      integrationBusyRef.current = false;
      if (integrationMounted.current) setIntegrationBusy(false);
    }
  }

  async function runIntegration(action: 'sheets' | 'driveFile') {
    if (integrationBusyRef.current) return;
    const session = captureIntegrationSession();
    if (!session) return;
    integrationBusyRef.current = true;
    setIntegrationBusy(true);
    try {
      const accessToken = await connectGoogle(action);
      if (!session.isCurrent()) return;
      if (action === 'sheets') {
        const url = await exportSheet(accessToken, domainSheetRows(domains), session.isCurrent);
        if (!session.isCurrent()) return;
        setIntegrationNote(`Full domain table created in Google Sheets: ${url}`);
      } else {
        const exported = await api<{ content: string }>('/api/v1/export?format=json&includeSettings=true');
        if (!session.isCurrent()) return;
        const name = await backupToDrive(accessToken, `domain-expansion-${new Date().toISOString().slice(0, 10)}.json`, exported.data.content, session.isCurrent);
        if (!session.isCurrent()) return;
        setIntegrationNote(`Visible Drive backup created: ${name}`);
      }
      if (!session.isCurrent()) return;
      await onChanged();
    } catch (error) {
      if (session.isCurrent()) setIntegrationNote(error instanceof Error ? error.message : 'Integration failed. Domain records stay as they were.');
    } finally {
      integrationBusyRef.current = false;
      if (integrationMounted.current) setIntegrationBusy(false);
    }
  }

  async function findDriveBackups() {
    if (integrationBusyRef.current) return;
    const session = captureIntegrationSession();
    if (!session) return;
    integrationBusyRef.current = true;
    setIntegrationBusy(true);
    try {
      const accessToken = await connectGoogle('driveFile');
      if (!session.isCurrent()) return;
      const files = await listDriveBackups(accessToken, session.isCurrent);
      if (!session.isCurrent()) return;
      driveToken.current = { accessToken, sessionToken: session.token };
      setDriveBackups(files);
      setSelectedDriveBackup(files[0]?.id ?? '');
      setIntegrationNote(files.length ? `Found ${files.length} date-named JSON backup${files.length === 1 ? '' : 's'} you can choose to validate.` : 'No date-named Domain Expansion JSON backups are available to this app.');
    } catch (error) {
      if (session.isCurrent()) setIntegrationNote(error instanceof Error ? error.message : 'Drive backups could not be listed.');
    } finally {
      integrationBusyRef.current = false;
      if (integrationMounted.current) setIntegrationBusy(false);
    }
  }

  async function previewDriveBackup() {
    const file = driveBackups.find((item) => item.id === selectedDriveBackup);
    const grant = driveToken.current;
    if (!file || !grant || integrationBusyRef.current) return;
    const session = captureIntegrationSession();
    if (!session || session.token !== grant.sessionToken) {
      driveToken.current = null;
      return;
    }
    integrationBusyRef.current = true;
    setIntegrationBusy(true);
    try {
      const content = await downloadDriveBackup(grant.accessToken, file.id, session.isCurrent);
      if (!session.isCurrent()) return;
      setDriveRestoreContent({ content, nonce: Date.now() });
      setIntegrationNote(`Downloaded ${file.name} for validation. Nothing has been imported.`);
    } catch (error) {
      if (session.isCurrent()) setIntegrationNote(error instanceof Error ? error.message : 'The selected backup could not be downloaded.');
    } finally {
      integrationBusyRef.current = false;
      if (integrationMounted.current) setIntegrationBusy(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-8">
      <form className="grid gap-3" onSubmit={saveSettings}>
        <h2 className="text-lg font-semibold">Defaults</h2>
        <Field label="Currency"><select className="field" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{CURRENCIES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Time zone"><input className="field" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
        <ReminderFields value={reminders} onChange={setReminders} offsets={offsets} onOffsets={setOffsets} />
        <button className="min-h-11 rounded-md bg-indigo-600" type="submit">Save defaults</button>
      </form>
      <form className="grid gap-3" onSubmit={saveKey}>
        <h2 className="text-lg font-semibold">Gemini key</h2>
        <p className="text-sm text-zinc-400">{credential ? credential.configured ? `Configured (${credential.source})` : 'No key configured' : 'Checking key status…'}</p>
        <p className="text-sm text-zinc-400">AI Quick Add sends the text you submit to Google using your key. Domain Expansion processes that key and text on the server. Google’s terms and billing apply. This is not a promise that Google will not use the data to improve products. Manual capture does not need a key.</p>
        <label className="text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I understand and want to store a key</label>
        <input className="field" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste key" />
        <button className="min-h-11 rounded-md border border-zinc-700" type="submit">Save key</button>
        {credential?.source === 'byok' ? <button className="min-h-11 rounded-md border border-rose-800 text-rose-300" type="button" onClick={() => void removeKey()}>Remove stored key</button> : null}
      </form>
      <form className="grid gap-3" onSubmit={createToken}>
        <h2 className="text-lg font-semibold">Developer tokens</h2>
        <p className="text-sm text-zinc-400">Choose each permission independently. The secret is shown once.</p>
        <label className="text-sm">Token name<input className="field" value={tokenName} onChange={(event) => setTokenName(event.target.value)} /></label>
        <div className="flex flex-wrap gap-4 text-sm">{['domains:read', 'domains:write', 'domains:delete'].map((scope) => <label key={scope}><input type="checkbox" checked={tokenScopes.includes(scope)} onChange={(event) => setTokenScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} /> {scope}</label>)}</div>
        <label className="text-sm">Expires in days<input className="field" type="number" min="1" max="365" value={tokenDays} onChange={(event) => setTokenDays(Number(event.target.value))} /></label>
        <button className="min-h-11 rounded-md border border-zinc-700" type="submit">Create token</button>
        {plaintext ? <p className="break-all rounded-md bg-zinc-900 p-3 font-mono text-xs" role="status">{plaintext}</p> : null}
        <ul className="space-y-2 text-sm">{tokens.map((token) => <li key={token.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 p-2"><span>{token.name} · {token.scopes.join(', ')} · expires {token.expiresAt.slice(0, 10)}{token.revokedAt ? ' · revoked' : ''}</span>{!token.revokedAt ? <button type="button" className="text-rose-300" onClick={() => void revokeToken(token.id)}>Revoke</button> : null}</li>)}</ul>
      </form>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Google integrations</h2>
        <p className="text-sm text-zinc-400">{googleConfigured() ? 'Connect Google only for the action you choose. This does not change your Domain Expansion sign-in.' : 'Google integrations are optional and currently not configured. Saving domains does not require them.'}</p>
        <label className="text-sm">Domain for Calendar or Tasks<select className="field" value={selectedDomainId} onChange={(event) => setSelectedDomainId(event.target.value)}><option value="">Choose a domain</option>{domains.filter((domain) => !domain.isArchived).map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3 disabled:opacity-50" disabled={integrationBusy} onClick={() => prepareReminder('calendar')}>Preview Calendar reminder</button>
          <button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3 disabled:opacity-50" disabled={integrationBusy} onClick={() => prepareReminder('tasks')}>Preview Tasks reminder</button>
          <button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3 disabled:opacity-50" disabled={integrationBusy} onClick={() => void runIntegration('sheets')}>Export full table to Sheets</button>
          <button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3 disabled:opacity-50" disabled={integrationBusy} onClick={() => void runIntegration('driveFile')}>Create visible Drive backup</button>
          <button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3 disabled:opacity-50" disabled={integrationBusy} onClick={() => void findDriveBackups()}>Find Drive backups</button>
        </div>
        {reminderPlan ? <div className="grid gap-2 rounded-md border border-zinc-800 p-3" data-testid="external-reminder-preview">
          <p className="text-sm">Preview for {reminderPlan.domain.name}: {reminderPlan.action === 'calendar' ? 'primary Google Calendar' : 'default Google Tasks list'} · {reminderPlan.target} date {reminderPlan.anchor}.</p>
          <label className="text-sm">Reminder date<select className="field" data-testid="external-reminder-date" value={reminderOffset ?? ''} onChange={(event) => setReminderOffset(Number(event.target.value))}>{reminderPlan.items.map((item) => <option key={item.offset} value={item.offset}>{item.date} · {item.offset} days before</option>)}</select></label>
          <p className="text-xs text-zinc-400">Only this selected item will be created. No Google permission is requested until you confirm.</p>
          <div className="flex gap-2"><button type="button" className="min-h-11 rounded-md bg-indigo-600 px-3 disabled:opacity-50" data-testid="create-external-reminder" disabled={integrationBusy} onClick={() => void createPlannedReminder()}>Create selected reminder</button><button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3" disabled={integrationBusy} onClick={() => setReminderPlan(null)}>Cancel</button></div>
        </div> : null}
        {driveBackups.length ? <div className="grid gap-2 rounded-md border border-zinc-800 p-3">
          <label className="text-sm">Domain Expansion Drive backup<select className="field" data-testid="drive-backup-choice" value={selectedDriveBackup} onChange={(event) => setSelectedDriveBackup(event.target.value)}>{driveBackups.map((file) => <option key={file.id} value={file.id}>{file.name} · {new Date(file.createdTime).toLocaleString()}</option>)}</select></label>
          <p className="text-xs text-zinc-400">The selected file is downloaded only after you choose Preview. The existing validated import preview must be committed separately.</p>
          <button type="button" className="min-h-11 rounded-md border border-zinc-700 px-3 disabled:opacity-50" data-testid="preview-drive-backup" disabled={integrationBusy || !selectedDriveBackup} onClick={() => void previewDriveBackup()}>Preview selected backup</button>
        </div> : null}
        {integrationNote ? <p className="text-sm text-zinc-300">{integrationNote}</p> : null}
      </section>
      <Transfer domains={domains} onChanged={onChanged} driveRestoreContent={driveRestoreContent} />
      {message ? <p role="status" className="text-sm text-emerald-300">{message}</p> : null}
    </div>
  );
}

function Transfer({ domains, onChanged, driveRestoreContent }: { domains: DomainView[]; onChanged: () => Promise<void>; driveRestoreContent: { content: string; nonce: number } | null }) {
  const [preview, setPreview] = useState<{ previewId: string; contentHash: string; rows: { name: string; action: string; currencyClearsCosts: boolean; issues: string[]; changes: { field: string; before: unknown; after: unknown }[] }[]; settingsChanges: { field: string; before: unknown; after: unknown }[]; warnings: string[]; currencyAcknowledgementRequired: boolean } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fileData, setFileData] = useState<{ format: string; content: string; encoding: string } | null>(null);
  const [policy, setPolicy] = useState<'skip' | 'replace' | 'merge'>('skip');
  const [acknowledgeCurrencyChanges, setAcknowledgeCurrencyChanges] = useState(false);
  const commitKey = useRef(crypto.randomUUID());
  const displayValue = (value: unknown) => value === null || value === undefined ? 'not set' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  async function download(format: string) {
    try {
      const response = await api<{ filename: string; content: string; encoding: string }>(`/api/v1/export?format=${format}&includeSettings=true`);
      const blob = response.data.encoding === 'base64' ? new Blob([Uint8Array.from(atob(response.data.content), (char) => char.charCodeAt(0))]) : new Blob([response.data.content]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Export failed.');
    }
  }
  async function showPreview(input: NonNullable<typeof fileData>, chosenPolicy: typeof policy, acknowledged: boolean) {
    setPreview(null);
    const response = await api<NonNullable<typeof preview>>('/api/v1/import/preview', {
      method: 'POST',
      body: { ...input, policy: chosenPolicy, includeSettings: true, acknowledgeCurrencyChanges: acknowledged },
    });
    setPreview(response.data);
    commitKey.current = crypto.randomUUID();
    setNote('Preview only. Nothing has been saved.');
  }
  useEffect(() => {
    if (!driveRestoreContent) return;
    const input = { format: 'json', content: driveRestoreContent.content, encoding: 'utf8' };
    setFileData(input);
    void showPreview(input, policy, acknowledgeCurrencyChanges).catch((error) => {
      setNote(error instanceof Error ? error.message : 'The Drive backup could not be previewed.');
    });
  }, [driveRestoreContent?.nonce]);
  async function onFile(file: File) {
    try {
      const format = file.name.endsWith('.xlsx') ? 'xlsx' : file.name.endsWith('.yaml') || file.name.endsWith('.yml') ? 'yaml' : file.name.endsWith('.csv') ? 'csv' : file.name.endsWith('.sql') ? 'sql' : 'json';
      let content: string;
      if (format === 'xlsx') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        content = btoa(binary);
      } else {
        content = await file.text();
      }
      const input = { format, content, encoding: format === 'xlsx' ? 'base64' : 'utf8' };
      setFileData(input);
      await showPreview(input, policy, acknowledgeCurrencyChanges);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'The file could not be previewed.');
    }
  }
  async function commitPreview() {
    if (!preview) return;
    try {
      const result = await api<{ applied: unknown[]; skipped: number }>('/api/v1/import/commit', { method: 'POST', idempotencyKey: commitKey.current, body: { previewId: preview.previewId, contentHash: preview.contentHash } });
      setNote(`Applied ${result.data.applied.length} rows; skipped ${result.data.skipped}. Domains not in the file were kept.`);
      setPreview(null);
      await onChanged();
    } catch (error) {
      setNote(error instanceof Error ? `${error.message} Nothing was committed.` : 'Import failed. Nothing was committed.');
    }
  }
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">Import and export</h2>
      <p className="text-sm text-zinc-400">JSON, YAML, and XLSX are full non-secret backups. CSV and SQL are domain tables, not complete backups. SQL is never executed.</p>
      <div className="flex flex-wrap gap-2">
        {['json', 'yaml', 'xlsx', 'csv', 'sql'].map((format) => <button key={format} className="min-h-11 rounded-md border border-zinc-700 px-3" onClick={() => void download(format)}>{format.toUpperCase()}</button>)}
      </div>
      <input aria-label="Import file" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); }} />
      <label className="text-sm">When a domain already exists<select className="field" value={policy} onChange={(event) => { const chosen = event.target.value as typeof policy; setPolicy(chosen); if (fileData) void showPreview(fileData, chosen, acknowledgeCurrencyChanges).catch((error) => setNote(error instanceof Error ? error.message : 'Preview failed.')); }}><option value="skip">Skip</option><option value="merge">Merge nonempty fields</option><option value="replace">Replace public fields</option></select></label>
      <label className="text-sm"><input type="checkbox" checked={acknowledgeCurrencyChanges} onChange={(event) => { setAcknowledgeCurrencyChanges(event.target.checked); if (fileData) void showPreview(fileData, policy, event.target.checked).catch((error) => setNote(error instanceof Error ? error.message : 'Preview failed.')); }} /> I understand changing currency may clear stored costs</label>
      {note ? <p className="text-sm">{note}</p> : null}
      {preview ? (
        <div>
          {preview.warnings.map((warning) => <p key={warning} className="text-amber-300">{warning}</p>)}
          <ul className="space-y-2 text-sm">{preview.rows.map((row, index) => <li key={`${row.name}-${index}`} className="rounded border border-zinc-800 p-2"><p>{row.name}: {row.action}{row.currencyClearsCosts ? ' · currency change clears costs' : ''}{row.issues.length ? ` · ${row.issues.join(', ')}` : ''}</p>{row.changes.map((change) => <p key={change.field} className="pl-2 text-zinc-400">{change.field}: {displayValue(change.before)} → {displayValue(change.after)}</p>)}</li>)}</ul>
          {preview.settingsChanges.length ? <div className="mt-3 text-sm"><p>Settings changes</p>{preview.settingsChanges.map((change) => <p key={change.field} className="pl-2 text-zinc-400">{change.field}: {displayValue(change.before)} → {displayValue(change.after)}</p>)}</div> : null}
          <button className="mt-2 min-h-11 rounded-md bg-indigo-600 px-3" disabled={preview.currencyAcknowledgementRequired && !acknowledgeCurrencyChanges} onClick={() => void commitPreview()}>Commit preview</button>
        </div>
      ) : null}
      <p className="text-xs text-zinc-500">{domains.length} domains currently loaded in this view.</p>
    </section>
  );
}

function Admin({ onChanged }: { onChanged: () => Promise<void> }) {
  const [requests, setRequests] = useState<{ id: string; email: string; reason: string; status: string; mailState: string; notificationId: string | null; notificationStatus: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function reload() {
    const response = await api<{ requests: typeof requests }>('/api/admin/requests');
    setRequests(response.data.requests);
  }
  useEffect(() => {
    void reload().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load requests.'));
  }, []);
  async function act(path: string) {
    setError(null);
    try {
      await api(path, { method: 'POST', body: {} });
      await reload();
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The action failed.');
    }
  }
  return (
    <section>
      <h1 className="text-xl font-semibold">Access requests</h1>
      <p className="mt-2 text-sm text-zinc-400">Approval manages membership only. It does not open another person’s domains or keys.</p>
      {error ? <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p> : null}
      <ul className="mt-4 divide-y divide-zinc-800 border-y border-zinc-800">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span><span className="block">{request.email}</span><span className="text-xs text-zinc-400">{request.status} · sign-in mail {request.mailState} · admin alert {request.notificationStatus ?? 'none'} · {request.reason || 'No reason'}</span></span>
            {request.status === 'pending' ? (
              <span className="flex gap-2">
                <button className="min-h-11 rounded-md bg-indigo-600 px-3" onClick={() => void act(`/api/admin/requests/${request.id}/approve`)}>Approve</button>
                <button className="min-h-11 rounded-md border border-zinc-700 px-3" onClick={() => void act(`/api/admin/requests/${request.id}/deny`)}>Deny</button>
              </span>
            ) : null}
            {request.status === 'approved' && request.mailState === 'failed' ? <button className="min-h-11 text-amber-300" onClick={() => void act(`/api/admin/requests/${request.id}/resend-signin`)}>Retry sign-in mail</button> : null}
            {request.notificationId && request.notificationStatus === 'failed' ? <button className="min-h-11 text-amber-300" onClick={() => void act(`/api/admin/notifications/${request.notificationId}/retry`)}>Retry admin alert</button> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
