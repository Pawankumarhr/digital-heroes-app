import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  apiForgotPassword,
  apiLogin,
  apiSignup,
  apiSubmitContact,
  apiUserSignup,
  closeDraw,
  createCheckoutSession,
  createCharity,
  createDraw,
  createScore,
  createWinner,
  deleteCharity,
  deleteDraw,
  deleteScore,
  deleteWinner,
  fetchMyCharityImpact,
  fetchNotifications,
  fetchPublicCharities,
  fetchCharities,
  fetchContactMessages,
  fetchDraws,
  fetchAdminUsers,
  fetchSubscriptionStatus,
  fetchAuditLogs,
  fetchMe,
  fetchReportSummary,
  fetchScores,
  fetchWinners,
  markAllNotificationsRead,
  markNotificationRead,
  markWinnerPaid,
  publishDraw,
  runDraw,
  simulateDraw,
  submitWinnerProof,
  updateAuthPreferences,
  updateAdminUser,
  exportReportCsv,
  verifyWinner,
  updateCharity,
  updateDraw,
  updateScore,
  updateWinner,
} from './lib/api.ts';

type JsonRecord = Record<string, unknown>;

type AppUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  preferredCharityId?: string | null;
  charityContributionPercent?: number | null;
};

type AdminManagedUser = {
  id: string;
  full_name?: string | null;
  email: string;
  role: string;
  is_active: boolean;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_ends_at?: string | null;
};

type Score = {
  id: string;
  user_id: string;
  score_value: number;
  score_date: string;
};

type Draw = {
  id: string;
  title: string;
  draw_month: string;
  status: string;
  draw_type?: string;
  winning_numbers?: number[];
  prize_pool_cents?: number;
};

type Charity = {
  id: string;
  name: string;
  slug: string;
};

type Winner = {
  id: string;
  user_id: string;
  draw_id: string;
  charity_id: string;
  payout_status: string;
  prize_amount: number;
  tier?: number;
  verification_status?: string;
  proof_file_url?: string | null;
  proof_notes?: string | null;
  payout_reference?: string | null;
  created_at: string;
  user?: {
    full_name?: string;
    email?: string;
  };
  draw?: {
    title?: string;
    draw_month?: string;
  };
  charity?: {
    name?: string;
  };
  [key: string]: unknown;
};

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  submitted_at?: string;
  created_at?: string;
};

type AuditLog = {
  id: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
};

type ReportSummary = {
  totals: {
    scores: number;
    draws: number;
    charities: number;
    winners: number;
    contacts: number;
    paidWinners: number;
    pendingWinners: number;
    totalPrize: number;
  };
  monthly: Array<{
    month: string;
    scores: number;
    winners: number;
    contacts: number;
    total_prize: number;
  }>;
};

type DataKey = 'scores' | 'draws' | 'charities' | 'winners' | 'contacts' | 'audit';
type SortDir = 'asc' | 'desc';

type QueryState = {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: SortDir;
  status: string;
  payoutStatus: string;
  action: string;
  entityType: string;
};

type PaginationMetaState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ViewKey =
  | 'dashboard'
  | 'users'
  | 'scores'
  | 'draws'
  | 'charities'
  | 'winners'
  | 'contacts'
  | 'reports';
type ModuleKey = 'scores' | 'draws' | 'charities' | 'winners';
type PublicPage = '/' | '/about' | '/contact';
type DrawStatus = 'draft' | 'simulated' | 'published' | 'closed';
type WinnerPayoutStatus = 'pending' | 'paid' | 'failed';

type EditableState = {
  module: ModuleKey;
  id: string;
  json: string;
} | null;

type CharityFormState = {
  name: string;
  slug: string;
};

type WinnerFormState = {
  userId: string;
  drawId: string;
  charityId: string;
  prizeAmount: string;
  matchedNumbers: '3' | '4' | '5';
  payoutStatus: WinnerPayoutStatus;
};

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  { key: 'scores', label: 'Scores' },
  { key: 'draws', label: 'Draws' },
  { key: 'charities', label: 'Charities' },
  { key: 'winners', label: 'Winners' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'reports', label: 'Reports' },
];

const publicLinks: Array<{ href: PublicPage; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

const defaultDrafts: Record<ModuleKey, string> = {
  scores: JSON.stringify(
    {
      user_id: 'replace-with-user-uuid',
      score_value: 18,
      course_name: 'General Course',
      score_date: new Date().toISOString(),
    },
    null,
    2
  ),
  draws: JSON.stringify(
    {
      title: 'April 2026 Draw',
      draw_month: '2026-04-01',
      status: 'draft',
    },
    null,
    2
  ),
  charities: JSON.stringify(
    {
      name: 'Local Youth Golf Fund',
      slug: 'local-youth-golf-fund',
    },
    null,
    2
  ),
  winners: JSON.stringify(
    {
      user_id: 'replace-with-user-uuid',
      draw_id: 'replace-with-draw-uuid',
      charity_id: 'replace-with-charity-uuid',
      prize_amount: 250,
      payout_status: 'pending',
    },
    null,
    2
  ),
};

const drawStatuses: DrawStatus[] = ['draft', 'simulated', 'published', 'closed'];
const winnerPayoutStatuses: WinnerPayoutStatus[] = ['pending', 'paid', 'failed'];

const auditMigrationSql = `create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  actor_email text null,
  actor_role text null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_entity_type on public.audit_logs (entity_type);

alter table public.audit_logs enable row level security;

create policy if not exists "Admins can read audit logs"
on public.audit_logs
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);

create policy if not exists "Admins can insert audit logs"
on public.audit_logs
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);`;

const defaultQueryStateByKey: Record<DataKey, QueryState> = {
  scores: {
    page: 1,
    pageSize: 10,
    search: '',
    sortBy: 'score_date',
    sortDir: 'desc',
    status: '',
    payoutStatus: '',
    action: '',
    entityType: '',
  },
  draws: {
    page: 1,
    pageSize: 10,
    search: '',
    sortBy: 'draw_month',
    sortDir: 'desc',
    status: '',
    payoutStatus: '',
    action: '',
    entityType: '',
  },
  charities: {
    page: 1,
    pageSize: 10,
    search: '',
    sortBy: 'created_at',
    sortDir: 'desc',
    status: '',
    payoutStatus: '',
    action: '',
    entityType: '',
  },
  winners: {
    page: 1,
    pageSize: 10,
    search: '',
    sortBy: 'created_at',
    sortDir: 'desc',
    status: '',
    payoutStatus: '',
    action: '',
    entityType: '',
  },
  contacts: {
    page: 1,
    pageSize: 10,
    search: '',
    sortBy: 'submitted_at',
    sortDir: 'desc',
    status: '',
    payoutStatus: '',
    action: '',
    entityType: '',
  },
  audit: {
    page: 1,
    pageSize: 10,
    search: '',
    sortBy: 'created_at',
    sortDir: 'desc',
    status: '',
    payoutStatus: '',
    action: '',
    entityType: '',
  },
};

const defaultMetaStateByKey: Record<DataKey, PaginationMetaState> = {
  scores: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  draws: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  charities: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  winners: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  contacts: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  audit: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

const toSlug = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const sanitizeEditableData = (module: ModuleKey, row: JsonRecord) => {
  const copy = { ...row };

  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;

  if (module === 'winners') {
    delete copy.user;
    delete copy.draw;
    delete copy.charity;
  }

  return copy;
};

const parseJsonRecord = (value: string) => {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be an object');
  }
  return parsed as JsonRecord;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(value) || 0
  );
};

const isPublicPage = (path: string): path is PublicPage => {
  return path === '/' || path === '/about' || path === '/contact';
};

const appPath = () => {
  const path = window.location.pathname || '/';
  if (path.startsWith('/admin')) {
    return '/admin';
  }
  if (path.startsWith('/user')) {
    return '/user';
  }
  if (isPublicPage(path)) {
    return path;
  }
  return '/';
};

function UserPortalPage() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('dh_user_token') || '');
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [publicCharities, setPublicCharities] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [preferredCharityId, setPreferredCharityId] = useState('');
  const [charityContributionPercent, setCharityContributionPercent] = useState(10);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [myWinners, setMyWinners] = useState<Winner[]>([]);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      event_type: string;
      subject?: string | null;
      body?: string | null;
      status?: string;
      read_at?: string | null;
      created_at: string;
    }>
  >([]);
  const [charityImpact, setCharityImpact] = useState<{
    totalCharityAmount: number;
    totalPlayerAmount: number;
    totalPayoutAmount: number;
    averageContributionPercent: number;
    recordsCount: number;
    lastContributionAt: string | null;
  } | null>(null);
  const [proofUrlByWinner, setProofUrlByWinner] = useState<Record<string, string>>({});
  const [proofFileDataByWinner, setProofFileDataByWinner] = useState<Record<string, string>>({});
  const [proofFileNameByWinner, setProofFileNameByWinner] = useState<Record<string, string>>({});
  const [proofNotesByWinner, setProofNotesByWinner] = useState<Record<string, string>>({});
  const [subscription, setSubscription] = useState<{
    status: string;
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null>(null);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadPublicCharities = async () => {
      try {
        const items = await fetchPublicCharities();
        setPublicCharities(items);
        if (items.length > 0) {
          setPreferredCharityId((prev) => prev || items[0].id);
        }
      } catch {
        setPublicCharities([]);
      }
    };

    void loadPublicCharities();
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) {
        return;
      }

      try {
        const me = await fetchMe(token);
        setProfile({
          id: String(me.id),
          name: me.name || null,
          email: String(me.email),
          role: String(me.role || 'user'),
          preferredCharityId: me.preferredCharityId || null,
          charityContributionPercent:
            typeof me.charityContributionPercent === 'number' ? me.charityContributionPercent : null,
        });
        if (me.preferredCharityId) {
          setPreferredCharityId(String(me.preferredCharityId));
        }
        if (typeof me.charityContributionPercent === 'number') {
          setCharityContributionPercent(me.charityContributionPercent);
        }
      } catch {
        localStorage.removeItem('dh_user_token');
        setToken('');
        setProfile(null);
        setSubscription(null);
      }
    };

    void bootstrap();
  }, [token]);

  useEffect(() => {
    const loadSubscription = async () => {
      if (!token || !profile) {
        return;
      }

      setSubscriptionBusy(true);
      try {
        const data = await fetchSubscriptionStatus(token);
        setSubscription({
          status: data.status,
          plan: data.plan,
          currentPeriodEnd: data.currentPeriodEnd,
        });
      } catch {
        setSubscription(null);
      } finally {
        setSubscriptionBusy(false);
      }
    };

    void loadSubscription();
  }, [token, profile]);

  useEffect(() => {
    const loadUserData = async () => {
      if (!token || !profile) {
        return;
      }

      try {
        const [winnerRes, notificationRes, impactRes] = await Promise.all([
          fetchWinners(token, { page: 1, pageSize: 10 }),
          fetchNotifications(token, { page: 1, pageSize: 10 }),
          fetchMyCharityImpact(token),
        ]);

        setMyWinners(winnerRes.items || []);
        setNotifications(
          (notificationRes.items || []) as Array<{
            id: string;
            event_type: string;
            subject?: string | null;
            body?: string | null;
            status?: string;
            read_at?: string | null;
            created_at: string;
          }>
        );
        setCharityImpact(impactRes);
      } catch {
        setMyWinners([]);
        setNotifications([]);
        setCharityImpact(null);
      }
    };

    void loadUserData();
  }, [token, profile]);

  const startCheckout = async (plan: 'monthly' | 'yearly') => {
    if (!token) {
      return;
    }

    setSubscriptionBusy(true);
    setError('');
    setMessage('');
    try {
      const session = await createCheckoutSession(token, plan);
      if (session.url) {
        window.location.href = session.url;
        return;
      }
      setError('Unable to start checkout right now.');
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout');
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const savePreferences = async () => {
    if (!token) {
      return;
    }

    setPreferencesBusy(true);
    setError('');
    setMessage('');
    try {
      await updateAuthPreferences(token, {
        preferredCharityId: preferredCharityId || null,
        charityContributionPercent,
      });
      setMessage('Preferences saved successfully.');
    } catch (prefError) {
      setError(prefError instanceof Error ? prefError.message : 'Failed to save preferences');
    } finally {
      setPreferencesBusy(false);
    }
  };

  const refreshUserData = async () => {
    if (!token || !profile) {
      return;
    }

    const [winnerRes, notificationRes, impactRes] = await Promise.all([
      fetchWinners(token, { page: 1, pageSize: 10 }),
      fetchNotifications(token, { page: 1, pageSize: 10 }),
      fetchMyCharityImpact(token),
    ]);

    setMyWinners(winnerRes.items || []);
    setNotifications(
      (notificationRes.items || []) as Array<{
        id: string;
        event_type: string;
        subject?: string | null;
        body?: string | null;
        status?: string;
        read_at?: string | null;
        created_at: string;
      }>
    );
    setCharityImpact(impactRes);
  };

  const onProofFileChange = async (winnerId: string, file: File | null) => {
    if (!file) {
      setProofFileDataByWinner((prev) => ({ ...prev, [winnerId]: '' }));
      setProofFileNameByWinner((prev) => ({ ...prev, [winnerId]: '' }));
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read selected proof file'));
      reader.readAsDataURL(file);
    });

    setProofFileDataByWinner((prev) => ({ ...prev, [winnerId]: dataUrl }));
    setProofFileNameByWinner((prev) => ({ ...prev, [winnerId]: file.name }));
  };

  const markOneNotificationRead = async (notificationId: string) => {
    if (!token) {
      return;
    }

    setError('');
    try {
      await markNotificationRead(token, notificationId);
      await refreshUserData();
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Failed to mark notification as read');
    }
  };

  const markAllUserNotificationsRead = async () => {
    if (!token) {
      return;
    }

    setError('');
    try {
      await markAllNotificationsRead(token);
      await refreshUserData();
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Failed to mark all notifications as read');
    }
  };

  const submitProofForWinner = async (winnerId: string) => {
    if (!token) {
      return;
    }

    const proofFileUrl = (proofUrlByWinner[winnerId] || '').trim();
    const proofNotes = (proofNotesByWinner[winnerId] || '').trim();
    const proofFileDataBase64 = proofFileDataByWinner[winnerId] || '';
    const proofFileName = proofFileNameByWinner[winnerId] || '';

    if (!proofFileUrl && !proofFileDataBase64) {
      setError('Please provide a proof URL or upload a proof file before submitting.');
      return;
    }

    setError('');
    setMessage('');
    try {
      await submitWinnerProof(token, winnerId, {
        proofFileUrl: proofFileUrl || undefined,
        proofNotes,
        proofFileDataBase64: proofFileDataBase64 || undefined,
        proofFileName: proofFileName || undefined,
      });
      await refreshUserData();
      setMessage('Winner proof submitted successfully.');
    } catch (proofError) {
      setError(proofError instanceof Error ? proofError.message : 'Failed to submit winner proof');
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'register') {
        const result = await apiUserSignup(
          name,
          identifier,
          password,
          preferredCharityId || undefined,
          charityContributionPercent
        );
        if (result.session?.access_token) {
          localStorage.setItem('dh_user_token', result.session.access_token);
          setToken(result.session.access_token);
          setMessage('Registration successful. Welcome to your dashboard.');
        } else {
          setMessage('Registration successful. Please login now.');
          setMode('login');
        }
      } else if (mode === 'login') {
        const result = await apiLogin(identifier, password);
        localStorage.setItem('dh_user_token', result.token);
        setToken(result.token);
        setMessage('Login successful.');
      } else {
        await apiForgotPassword(identifier, '/user');
        setMessage('If this account email exists, a reset link has been sent.');
        setMode('login');
      }
      setPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('dh_user_token');
    setToken('');
    setProfile(null);
    setSubscription(null);
    setMessage('Logged out');
  };

  if (profile) {
    return (
      <main className="bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black">User Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">Logged in as {profile.name || profile.email}</p>
            </div>
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={logout}
              type="button"
            >
              Logout
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-500">Name</h2>
              <p className="mt-1 text-lg font-bold text-slate-900">{profile.name || 'Not set'}</p>
            </article>
            <article className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-500">Email</h2>
              <p className="mt-1 text-lg font-bold text-slate-900">{profile.email}</p>
            </article>
            <article className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-500">Role</h2>
              <p className="mt-1 text-lg font-bold capitalize text-slate-900">{profile.role}</p>
            </article>
            <article className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-500">User ID</h2>
              <p className="mt-1 break-all text-sm font-medium text-slate-800">{profile.id}</p>
            </article>
            <article className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
              <h2 className="text-sm font-semibold text-slate-500">Subscription</h2>
              <p className="mt-1 text-lg font-bold capitalize text-slate-900">
                {subscriptionBusy
                  ? 'Loading...'
                  : `${subscription?.status || 'inactive'}${subscription?.plan ? ` (${subscription.plan})` : ''}`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Renewal/End Date: {subscription?.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : 'N/A'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={subscriptionBusy}
                  onClick={() => {
                    void startCheckout('monthly');
                  }}
                  type="button"
                >
                  Subscribe Monthly
                </button>
                <button
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={subscriptionBusy}
                  onClick={() => {
                    void startCheckout('yearly');
                  }}
                  type="button"
                >
                  Subscribe Yearly
                </button>
              </div>
            </article>
            <article className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
              <h2 className="text-sm font-semibold text-slate-500">Charity Preferences</h2>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Preferred Charity</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    onChange={(event) => setPreferredCharityId(event.target.value)}
                    value={preferredCharityId}
                  >
                    <option value="">No preference</option>
                    {publicCharities.map((charity) => (
                      <option key={charity.id} value={charity.id}>
                        {charity.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Charity Contribution % (min 10)</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    max={100}
                    min={10}
                    onChange={(event) => setCharityContributionPercent(Number(event.target.value) || 10)}
                    type="number"
                    value={charityContributionPercent}
                  />
                </label>
              </div>
              <button
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                disabled={preferencesBusy}
                onClick={() => {
                  void savePreferences();
                }}
                type="button"
              >
                {preferencesBusy ? 'Saving...' : 'Save Preferences'}
              </button>
            </article>

            <article className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
              <h2 className="text-sm font-semibold text-slate-500">My Charity Impact</h2>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Total Charity</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {formatMoney(charityImpact?.totalCharityAmount || 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Total You Receive</p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatMoney(charityImpact?.totalPlayerAmount || 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Average Contribution</p>
                  <p className="text-lg font-bold text-slate-900">
                    {(charityImpact?.averageContributionPercent || 0).toFixed(2)}%
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Records: {charityImpact?.recordsCount || 0} | Last contribution:{' '}
                {charityImpact?.lastContributionAt ? formatDate(charityImpact.lastContributionAt) : 'N/A'}
              </p>
            </article>
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-base font-semibold text-slate-800">My Winner Claims</h2>
              {myWinners.length === 0 ? <p className="mt-2 text-sm text-slate-500">No winner records yet.</p> : null}
              <div className="mt-3 space-y-3">
                {myWinners.map((winner) => (
                  <div className="rounded-lg border border-slate-200 p-3" key={winner.id}>
                    <p className="text-sm font-semibold text-slate-800">
                      Tier {winner.tier || '-'} | Payout: {formatMoney(winner.prize_amount || 0)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Verification: {winner.verification_status || 'pending'} | Payout: {winner.payout_status}
                    </p>
                    <input
                      className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      onChange={(event) =>
                        setProofUrlByWinner((prev) => ({ ...prev, [winner.id]: event.target.value }))
                      }
                      placeholder="Proof file URL (https://...)"
                      value={proofUrlByWinner[winner.id] || ''}
                    />
                    <label className="mt-2 block text-xs text-slate-600">
                      Upload proof file
                      <input
                        className="mt-1 block w-full text-xs"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          void onProofFileChange(winner.id, file);
                        }}
                        type="file"
                      />
                    </label>
                    {proofFileNameByWinner[winner.id] ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Selected file: {proofFileNameByWinner[winner.id]}
                      </p>
                    ) : null}
                    <textarea
                      className="mt-2 h-16 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      onChange={(event) =>
                        setProofNotesByWinner((prev) => ({ ...prev, [winner.id]: event.target.value }))
                      }
                      placeholder="Notes for admin verification"
                      value={proofNotesByWinner[winner.id] || ''}
                    />
                    <button
                      className="mt-2 rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                      onClick={() => {
                        void submitProofForWinner(winner.id);
                      }}
                      type="button"
                    >
                      Submit Proof
                    </button>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-800">Notifications</h2>
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => {
                    void markAllUserNotificationsRead();
                  }}
                  type="button"
                >
                  Mark All Read
                </button>
              </div>
              {notifications.length === 0 ? <p className="mt-2 text-sm text-slate-500">No notifications yet.</p> : null}
              <ul className="mt-3 space-y-2">
                {notifications.map((item) => (
                  <li className="rounded-lg border border-slate-200 p-3" key={item.id}>
                    <p className="text-xs font-semibold uppercase text-slate-500">{item.event_type}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{item.subject || 'Notification'}</p>
                    <p className="mt-1 text-xs text-slate-600">{item.body || ''}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{formatDate(item.created_at)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">
                        Status: {item.status || (item.read_at ? 'read' : 'queued')}
                      </p>
                      {item.status !== 'read' ? (
                        <button
                          className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                          onClick={() => {
                            void markOneNotificationRead(item.id);
                          }}
                          type="button"
                        >
                          Mark Read
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black">User Portal</h1>
        <p className="mt-2 text-sm text-slate-600">Register or login to access your user dashboard.</p>

        <div className="mt-4 flex rounded-lg border border-slate-300 p-1 text-sm">
          <button
            className={`w-1/2 rounded px-3 py-2 font-semibold ${mode === 'login' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
            onClick={() => setMode('login')}
            type="button"
          >
            Login
          </button>
          <button
            className={`w-1/2 rounded px-3 py-2 font-semibold ${mode === 'register' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
            onClick={() => setMode('register')}
            type="button"
          >
            Register
          </button>
        </div>

        {mode === 'login' ? (
          <button
            className="mt-3 text-xs font-semibold text-slate-700 hover:text-slate-900"
            onClick={() => {
              setError('');
              setMessage('');
              setMode('forgot');
            }}
            type="button"
          >
            Forgot password?
          </button>
        ) : null}

        {mode === 'forgot' ? (
          <button
            className="mt-3 text-xs font-semibold text-slate-700 hover:text-slate-900"
            onClick={() => {
              setError('');
              setMessage('');
              setMode('login');
            }}
            type="button"
          >
            Back to Login
          </button>
        ) : null}

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          {mode === 'register' ? (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Full Name</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
          ) : null}

          {mode === 'register' ? (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Preferred Charity</span>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                onChange={(event) => setPreferredCharityId(event.target.value)}
                value={preferredCharityId}
              >
                <option value="">No preference</option>
                {publicCharities.map((charity) => (
                  <option key={charity.id} value={charity.id}>
                    {charity.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {mode === 'register' ? (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Charity Contribution % (10-100)</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                max={100}
                min={10}
                onChange={(event) => setCharityContributionPercent(Number(event.target.value) || 10)}
                type="number"
                value={charityContributionPercent}
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Email or Phone</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={mode === 'forgot' ? 'you@example.com' : 'you@example.com or +15551234567'}
              required
              type="text"
              value={identifier}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Password</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required={mode !== 'forgot'}
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {message ? <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

          <button
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Please wait...' : mode === 'login' ? 'Login' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>
      </section>
    </main>
  );
}

const navigate = (to: string) => {
  if (window.location.pathname === to) {
    return;
  }
  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event('popstate'));
};

function PublicNavbar({ path }: { path: PublicPage }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  return (
    <header className="sticky top-0 z-40 bg-[linear-gradient(145deg,_#143428_0%,_#0f2a22_55%,_#0c221c_100%)] pt-3">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[999px] border border-emerald-100/25 bg-emerald-950/30 px-4 py-2 shadow-[0_12px_36px_rgba(15,23,42,0.25)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <a
              className="font-display text-sm font-bold tracking-[0.14em] text-white sm:text-base"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigate('/');
              }}
            >
              DIGITAL HEROES GOLF
            </a>

            <button
              aria-label="Toggle navigation menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100/25 text-amber-50 transition hover:bg-emerald-900/45 md:hidden"
              onClick={() => setMenuOpen((prev) => !prev)}
              type="button"
            >
              <span className="relative block h-4 w-5">
                <span
                  className={`absolute left-0 top-0 block h-0.5 w-5 bg-current transition-transform duration-300 ${
                    menuOpen ? 'translate-y-[7px] rotate-45' : ''
                  }`}
                />
                <span
                  className={`absolute left-0 top-[7px] block h-0.5 w-5 bg-current transition-opacity duration-200 ${
                    menuOpen ? 'opacity-0' : 'opacity-100'
                  }`}
                />
                <span
                  className={`absolute left-0 top-[14px] block h-0.5 w-5 bg-current transition-transform duration-300 ${
                    menuOpen ? '-translate-y-[7px] -rotate-45' : ''
                  }`}
                />
              </span>
            </button>

            <nav className="hidden flex-wrap items-center gap-2 md:flex">
              {publicLinks.map((link) => (
                <a
                  key={link.href}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                    path === link.href
                      ? 'bg-[#d8b26a] text-[#1b2f29]'
                      : 'text-amber-50 hover:bg-emerald-900/45'
                  }`}
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(link.href);
                  }}
                >
                  {link.label}
                </a>
              ))}
              <a
                className="rounded-full bg-[#d8b26a] px-4 py-2 text-sm font-bold text-[#1e2f29] transition hover:bg-[#c49a51]"
                href="/user"
                onClick={(event) => {
                  event.preventDefault();
                  navigate('/user');
                }}
              >
                User Portal
              </a>
            </nav>
          </div>
        </div>

        <nav
          className={`grid transition-all duration-300 md:hidden ${
            menuOpen ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="rounded-2xl border border-emerald-100/25 bg-emerald-950/35 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              {publicLinks.map((link) => (
                <a
                  key={link.href}
                  className={`mb-1 block rounded-lg px-3 py-2 text-sm font-semibold transition last:mb-0 ${
                    path === link.href
                      ? 'bg-[#d8b26a] text-[#1b2f29]'
                      : 'text-amber-50 hover:bg-emerald-900/45'
                  }`}
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(link.href);
                  }}
                >
                  {link.label}
                </a>
              ))}
              <a
                className="mt-1 block rounded-lg bg-[#d8b26a] px-3 py-2 text-sm font-bold text-[#1e2f29] transition hover:bg-[#c49a51]"
                href="/user"
                onClick={(event) => {
                  event.preventDefault();
                  navigate('/user');
                }}
              >
                User Portal
              </a>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}

function GolfFeatureIcons() {
  return (
    <div className="grid grid-cols-5 gap-2">
      <div className="rounded-xl border border-emerald-950/20 bg-white p-2">
        <svg viewBox="0 0 64 64" className="h-10 w-10">
          <circle cx="17" cy="45" r="8" fill="#18352e" />
          <circle cx="47" cy="45" r="8" fill="#18352e" />
          <rect x="10" y="26" width="38" height="14" rx="4" fill="#2f7a5f" />
          <rect x="44" y="21" width="10" height="19" rx="3" fill="#3e9f7c" />
          <rect x="28" y="18" width="10" height="8" rx="2" fill="#e2b56d" />
        </svg>
      </div>
      <div className="rounded-xl border border-emerald-950/20 bg-white p-2">
        <svg viewBox="0 0 64 64" className="h-10 w-10">
          <path d="M19 50h8V25l11-11-4-4-15 15z" fill="#245543" />
          <rect x="15" y="50" width="18" height="4" rx="2" fill="#e2b56d" />
          <path d="M35 13l14 14 4-4-14-14z" fill="#1f3e33" />
        </svg>
      </div>
      <div className="rounded-xl border border-emerald-950/20 bg-white p-2">
        <svg viewBox="0 0 64 64" className="h-10 w-10">
          <rect x="18" y="20" width="28" height="34" rx="8" fill="#2f7a5f" />
          <rect x="24" y="26" width="16" height="4" rx="2" fill="#e2b56d" />
          <rect x="20" y="14" width="6" height="12" rx="2" fill="#18352e" />
          <rect x="30" y="14" width="6" height="12" rx="2" fill="#18352e" />
          <rect x="40" y="14" width="6" height="12" rx="2" fill="#18352e" />
        </svg>
      </div>
      <div className="rounded-xl border border-emerald-950/20 bg-white p-2">
        <svg viewBox="0 0 64 64" className="h-10 w-10">
          <rect x="8" y="36" width="48" height="14" rx="7" fill="#61b07c" />
          <circle cx="20" cy="32" r="4" fill="#ffffff" />
          <rect x="31" y="14" width="3" height="22" fill="#1f3e33" />
          <path d="M34 14l14 5-14 5z" fill="#e2b56d" />
        </svg>
      </div>
      <div className="rounded-xl border border-emerald-950/20 bg-white p-2">
        <svg viewBox="0 0 64 64" className="h-10 w-10">
          <circle cx="22" cy="18" r="6" fill="#f2c892" />
          <rect x="18" y="24" width="8" height="16" rx="4" fill="#2f7a5f" />
          <circle cx="42" cy="18" r="6" fill="#f2c892" />
          <rect x="38" y="24" width="8" height="16" rx="4" fill="#245543" />
          <rect x="16" y="40" width="12" height="4" rx="2" fill="#1f3e33" />
          <rect x="36" y="40" width="12" height="4" rx="2" fill="#1f3e33" />
        </svg>
      </div>
    </div>
  );
}

function GolfHeroIllustration() {
  return (
    <svg viewBox="0 0 520 320" className="h-full w-full" role="img" aria-label="Golf course scene">
      <rect width="520" height="320" fill="#e9f1ec" />
      <ellipse cx="275" cy="278" rx="260" ry="70" fill="#8cc59d" />
      <ellipse cx="290" cy="286" rx="190" ry="44" fill="#67af7e" />

      <g transform="translate(50 165)">
        <rect x="20" y="38" width="138" height="34" rx="10" fill="#2f7a5f" />
        <rect x="136" y="27" width="28" height="45" rx="8" fill="#3f9774" />
        <rect x="85" y="18" width="24" height="20" rx="5" fill="#e2b56d" />
        <circle cx="42" cy="82" r="18" fill="#1d3a31" />
        <circle cx="141" cy="82" r="18" fill="#1d3a31" />
      </g>

      <g transform="translate(238 120)">
        <rect x="0" y="46" width="42" height="78" rx="11" fill="#2f7a5f" />
        <rect x="9" y="56" width="24" height="7" rx="3" fill="#e2b56d" />
        <rect x="4" y="30" width="7" height="18" rx="2" fill="#1d3a31" />
        <rect x="17" y="30" width="7" height="18" rx="2" fill="#1d3a31" />
        <rect x="30" y="30" width="7" height="18" rx="2" fill="#1d3a31" />
      </g>

      <g transform="translate(350 104)">
        <circle cx="22" cy="20" r="12" fill="#f2c892" />
        <rect x="14" y="32" width="16" height="34" rx="8" fill="#2f7a5f" />
        <rect x="8" y="64" width="11" height="6" rx="3" fill="#1d3a31" />
        <rect x="25" y="64" width="11" height="6" rx="3" fill="#1d3a31" />
        <path d="M36 50l28-20 4 4-27 21z" fill="#23493b" />
      </g>

      <g transform="translate(420 124)">
        <circle cx="16" cy="16" r="10" fill="#f2c892" />
        <rect x="9" y="26" width="14" height="30" rx="7" fill="#245543" />
        <rect x="5" y="56" width="9" height="5" rx="2" fill="#1d3a31" />
        <rect x="18" y="56" width="9" height="5" rx="2" fill="#1d3a31" />
      </g>

      <g transform="translate(444 70)">
        <rect x="8" y="20" width="4" height="106" fill="#1f3e33" />
        <path d="M12 22l35 12-35 12z" fill="#e2b56d" />
      </g>

      <circle cx="454" cy="248" r="8" fill="#ffffff" />
      <circle cx="454" cy="248" r="3" fill="#d4ded8" />
    </svg>
  );
}

function HomePage() {
  const platformPillars = [
    {
      title: 'Golf Score Pipeline',
      body: 'Recent score submissions drive draw entries with controlled validation rules.',
    },
    {
      title: 'Draw Operations',
      body: 'Admins can simulate, run, publish, and close monthly draw cycles with auditable transitions.',
    },
    {
      title: 'Winner Verification',
      body: 'Proof submission and verification decisions are tracked before payout completion.',
    },
    {
      title: 'Impact Ledger',
      body: 'Charity split values and user impact totals are computed and recorded with payout actions.',
    },
  ];

  return (
    <main className="bg-[#f4f3ef] text-[var(--ink)]">
      <section className="border-b border-emerald-950/15 bg-[linear-gradient(145deg,_#143428_0%,_#0f2a22_55%,_#0c221c_100%)] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="premium-chip inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]">
              Competition Platform For Golf Communities
            </p>
            <h1 className="font-display mt-5 text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">
              Play Better Rounds.
              <br />
              Build Measurable Impact.
            </h1>
            <p className="mt-5 max-w-xl text-base text-emerald-100/90 sm:text-lg">
              Digital Heroes Golf combines monthly draw operations, proof-based winner verification,
              payout workflows, and charity-linked reporting in one production system.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-extrabold text-[#132a23] transition hover:bg-[var(--accent-deep)] hover:text-white"
                href="/user"
                onClick={(event) => {
                  event.preventDefault();
                  navigate('/user');
                }}
              >
                Open User Portal
              </a>
              <a
                className="premium-outline rounded-xl bg-transparent px-5 py-3 text-sm font-bold text-amber-50 transition hover:bg-amber-200/10"
                href="/about"
                onClick={(event) => {
                  event.preventDefault();
                  navigate('/about');
                }}
              >
                Explore Product Capabilities
              </a>
            </div>

            <div className="mt-6 max-w-md">
              <GolfFeatureIcons />
            </div>
          </div>

          <div className="premium-panel rounded-2xl p-4">
            <GolfHeroIllustration />
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl text-[#143428] sm:text-4xl">Platform Pillars</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
            Each feature area is connected to real operational flows already available in your system.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {platformPillars.map((item, index) => (
              <article key={item.title} className="premium-panel rounded-2xl p-5">
                <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900">
                  Pillar 0{index + 1}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function AboutPage() {
  return (
    <main className="bg-[var(--surface)] px-4 py-12 text-[var(--ink)] sm:px-6 lg:px-8">
      <section className="premium-panel mx-auto max-w-5xl rounded-2xl p-7">
        <h1 className="font-display text-3xl text-slate-900 sm:text-4xl">About Digital Heroes Golf</h1>
        <p className="mt-4 text-slate-700">
          Digital Heroes Golf is a competition and impact platform designed around monthly golf draw operations,
          not generic raffle workflows. Scoring data, draw execution, winner verification, payout actions, and
          charity outcomes are connected as one operational chain.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="premium-outline rounded-xl bg-[#f8f5ee] p-5">
            <h2 className="text-lg font-bold text-slate-900">Core System Modules</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              <li>Score management and rolling entry logic</li>
              <li>Draw simulation, run, publish, and close lifecycle</li>
              <li>Winner verification and payout status operations</li>
              <li>Charity contribution ledger and impact reporting</li>
            </ul>
          </article>

          <article className="premium-outline rounded-xl bg-[#f8f5ee] p-5">
            <h2 className="text-lg font-bold text-slate-900">Governance And Trust</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              <li>Role-based admin controls and protected operations</li>
              <li>Audit log records for sensitive action trails</li>
              <li>Notification events for user-facing workflow updates</li>
              <li>Transparent payout-to-charity contribution visibility</li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}

function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await apiSubmitContact(name, email, message);
      setSuccess('Message sent successfully. Our team will get back to you soon.');
      setName('');
      setEmail('');
      setMessage('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="bg-[var(--surface)] px-4 py-12 text-[var(--ink)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-5">
        <article className="premium-panel rounded-2xl p-6 lg:col-span-2">
          <h1 className="font-display text-2xl text-slate-900">Contact The Team</h1>
          <p className="mt-3 text-sm text-slate-700">
            Need help with draw operations, winner verification, account setup, or platform partnerships?
            Send us a message and we will respond quickly.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>Email: support@digitalheroes.example</li>
            <li>Ops Desk: +1 (000) 000-0000</li>
            <li>Hours: Mon-Fri, 9:00 AM - 6:00 PM</li>
          </ul>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Tip: Include your registered email and draw month in support messages for faster resolution.
          </div>
        </article>

        <article className="premium-panel rounded-2xl p-6 text-slate-900 lg:col-span-3">
          <h2 className="font-display text-2xl text-slate-900">Quick Message</h2>
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              required
              value={name}
            />
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Your email"
              required
              type="email"
              value={email}
            />
            <textarea
              className="h-28 w-full rounded-xl border border-slate-300 px-3 py-2"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Your message"
              required
              value={message}
            />
            {error ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            ) : null}
            {success ? (
              <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
            ) : null}
            <button
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#1f2f2a] transition hover:bg-[var(--accent-deep)] hover:text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Sending...' : 'Send'}
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}

function AdminApp() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('dh_token') || '');
  const [user, setUser] = useState<AppUser | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [adminInviteKey, setAdminInviteKey] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const [view, setView] = useState<ViewKey>('dashboard');
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');

  const [scores, setScores] = useState<Score[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [charities, setCharities] = useState<Charity[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminManagedUser[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [auditSetupRequired, setAuditSetupRequired] = useState(false);
  const [auditSetupError, setAuditSetupError] = useState('');
  const [auditSqlCopied, setAuditSqlCopied] = useState(false);

  const [queryByKey, setQueryByKey] = useState<Record<DataKey, QueryState>>(defaultQueryStateByKey);
  const [metaByKey, setMetaByKey] = useState<Record<DataKey, PaginationMetaState>>(defaultMetaStateByKey);

  const [drafts, setDrafts] = useState<Record<ModuleKey, string>>(defaultDrafts);
  const [drawForm, setDrawForm] = useState<{ title: string; drawMonth: string; status: DrawStatus }>({
    title: '',
    drawMonth: '',
    status: 'draft',
  });
  const [drawFormError, setDrawFormError] = useState('');
  const [charityForm, setCharityForm] = useState<CharityFormState>({ name: '', slug: '' });
  const [charityFormError, setCharityFormError] = useState('');
  const [winnerForm, setWinnerForm] = useState<WinnerFormState>({
    userId: '',
    drawId: '',
    charityId: '',
    prizeAmount: '',
    matchedNumbers: '3',
    payoutStatus: 'pending',
  });
  const [winnerFormError, setWinnerFormError] = useState('');
  const [editing, setEditing] = useState<EditableState>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const isAdmin = user?.role === 'admin';

  const metrics = useMemo(() => {
    const totals = reportSummary?.totals;
    return {
      scoreCount: totals?.scores ?? metaByKey.scores.total,
      drawCount: totals?.draws ?? metaByKey.draws.total,
      charityCount: totals?.charities ?? metaByKey.charities.total,
      winnerCount: totals?.winners ?? metaByKey.winners.total,
      paidCount: totals?.paidWinners ?? winners.filter((winner) => winner.payout_status === 'paid').length,
      pendingCount:
        totals?.pendingWinners ?? Math.max(metaByKey.winners.total - winners.filter((winner) => winner.payout_status === 'paid').length, 0),
      totalPrize: totals?.totalPrize ?? winners.reduce((sum, winner) => sum + (Number(winner.prize_amount) || 0), 0),
    };
  }, [reportSummary, metaByKey, winners]);

  const setMeta = (key: DataKey, next: PaginationMetaState) => {
    setMetaByKey((prev) => ({ ...prev, [key]: next }));
  };

  const loadAdminUsers = async (authToken: string) => {
    const data = await fetchAdminUsers(authToken);
    setAdminUsers(data.items || []);
  };

  const loadReports = async (authToken: string) => {
    setReportBusy(true);
    try {
      const data = await fetchReportSummary(authToken);
      setReportSummary(data);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Failed to fetch reports');
    } finally {
      setReportBusy(false);
    }
  };

  const loadModuleData = async (authToken: string, key: DataKey, silent = false) => {
    if (!silent) {
      setLoadingData(true);
      setDataError('');
    }

    try {
      const query = queryByKey[key];

      if (key === 'scores') {
        const result = await fetchScores(authToken, query);
        setScores(result.items);
        setMeta('scores', result.meta);
      }

      if (key === 'draws') {
        const result = await fetchDraws(authToken, query);
        setDraws(result.items);
        setMeta('draws', result.meta);
      }

      if (key === 'charities') {
        const result = await fetchCharities(authToken, query);
        setCharities(result.items);
        setMeta('charities', result.meta);
      }

      if (key === 'winners') {
        const result = await fetchWinners(authToken, query);
        setWinners(result.items);
        setMeta('winners', result.meta);
      }

      if (key === 'contacts') {
        const result = await fetchContactMessages(authToken, query);
        setContactMessages(result.items);
        setMeta('contacts', result.meta);
      }

      if (key === 'audit') {
        const result = await fetchAuditLogs(authToken, query);
        setAuditLogs(result.items);
        setMeta('audit', result.meta);
        setAuditSetupRequired(false);
        setAuditSetupError('');
        setAuditSqlCopied(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to load ${key}`;
      if (key === 'audit' && /audit_logs|does not exist|relation/i.test(message)) {
        setAuditSetupRequired(true);
        setAuditSetupError(message);
        setAuditLogs([]);
        setMeta('audit', defaultMetaStateByKey.audit);
      } else {
        setDataError(message);
      }
    } finally {
      if (!silent) {
        setLoadingData(false);
      }
    }
  };

  const loadProtectedData = async (authToken: string) => {
    setLoadingData(true);
    setDataError('');

    const keys: DataKey[] = ['scores', 'draws', 'charities', 'winners', 'contacts', 'audit'];
    const results = await Promise.allSettled([
      ...keys.map((key) => loadModuleData(authToken, key, true)),
      loadAdminUsers(authToken),
    ]);

    const loadErrors = results
      .map((result, index) => {
        if (result.status !== 'rejected') {
          return null;
        }
        const label = index < keys.length ? keys[index] : 'users';
        return `${label}: ${result.reason instanceof Error ? result.reason.message : 'failed'}`;
      })
      .filter(Boolean) as string[];

    await loadReports(authToken);

    if (loadErrors.length > 0) {
      setDataError(loadErrors.join(' | '));
    }

    setLoadingData(false);
  };

  const updateQueryState = (key: DataKey, patch: Partial<QueryState>, resetPage = false) => {
    setQueryByKey((prev) => {
      const next = {
        ...prev[key],
        ...patch,
      };

      if (resetPage) {
        next.page = 1;
      }

      return {
        ...prev,
        [key]: next,
      };
    });
  };

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) {
        return;
      }

      setAuthError('');
      setStatusMessage('');
      try {
        const me = await fetchMe(token);
        setUser({
          id: String(me.id),
          name: me.name || null,
          email: String(me.email),
          role: String(me.role || 'user'),
        });
      } catch (error) {
        setUser(null);
        setToken('');
        localStorage.removeItem('dh_token');
        setAuthError(error instanceof Error ? error.message : 'Session expired. Please login again.');
      }
    };

    void bootstrap();
  }, [token]);

  useEffect(() => {
    if (!token || !isAdmin) {
      return;
    }
    void loadProtectedData(token);
  }, [token, isAdmin]);

  useEffect(() => {
    if (!token || !isAdmin) {
      return;
    }

    const keyByView: Partial<Record<ViewKey, DataKey>> = {
      scores: 'scores',
      draws: 'draws',
      charities: 'charities',
      winners: 'winners',
      contacts: 'contacts',
      reports: 'audit',
    };

    const dataKey = keyByView[view];
    if (view === 'users') {
      void loadAdminUsers(token);
      return;
    }

    if (!dataKey) {
      return;
    }

    void loadModuleData(token, dataKey);
    if (view === 'reports') {
      void loadReports(token);
    }
  }, [token, isAdmin, view, queryByKey]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    setWinnerForm((prev) => {
      if (prev.userId.trim()) {
        return prev;
      }
      return { ...prev, userId: user.id };
    });
  }, [user?.id]);

  useEffect(() => {
    setActionError('');
    setActionMessage('');
  }, [view]);

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setScores([]);
    setDraws([]);
    setCharities([]);
    setWinners([]);
    setAdminUsers([]);
    setContactMessages([]);
    setAuditLogs([]);
    setReportSummary(null);
    setQueryByKey(defaultQueryStateByKey);
    setMetaByKey(defaultMetaStateByKey);
    localStorage.removeItem('dh_token');
    setStatusMessage('Logged out successfully');
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    setStatusMessage('');

    try {
      if (authMode === 'login') {
        const result = await apiLogin(authEmail, authPassword);
        setToken(result.token);
        localStorage.setItem('dh_token', result.token);
        setStatusMessage('Login successful');
      } else if (authMode === 'signup') {
        if (!adminInviteKey.trim()) {
          throw new Error('Admin invite key is required for admin signup');
        }
        const result = await apiSignup(authName, authEmail, authPassword, adminInviteKey.trim());
        if (result.session?.access_token) {
          setToken(result.session.access_token);
          localStorage.setItem('dh_token', result.session.access_token);
          setStatusMessage('Admin signup successful and logged in');
        } else {
          setStatusMessage('Signup successful. Please login with your new account.');
          setAuthMode('login');
        }
      } else {
        await apiForgotPassword(authEmail, '/admin');
        setStatusMessage('If this email exists, a reset link has been sent. Check your inbox.');
        setAuthMode('login');
      }
      setAuthPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      if (authMode === 'signup' && message.toLowerCase().includes('rate-limited')) {
        setAuthMode('login');
      }
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const setDraft = (module: ModuleKey, value: string) => {
    setDrafts((prev) => ({ ...prev, [module]: value }));
  };

  const validateDrawForm = () => {
    const cleanTitle = drawForm.title.trim();
    if (cleanTitle.length < 3) {
      throw new Error('Draw title must be at least 3 characters long');
    }

    const monthValue = drawForm.drawMonth;
    if (!/^\d{4}-\d{2}$/.test(monthValue) && !/^\d{4}-\d{2}-\d{2}$/.test(monthValue)) {
      throw new Error('Please select a valid draw month');
    }

    const monthPrefix = monthValue.length === 7 ? monthValue : monthValue.slice(0, 7);

    if (!drawStatuses.includes(drawForm.status)) {
      throw new Error('Please select a valid draw status');
    }

    return {
      title: cleanTitle,
      draw_month: `${monthPrefix}-01`,
      status: drawForm.status,
    };
  };

  const validateCharityForm = () => {
    const cleanName = charityForm.name.trim();
    if (cleanName.length < 2) {
      throw new Error('Charity name must be at least 2 characters long');
    }

    const candidateSlug = charityForm.slug.trim() || toSlug(cleanName);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateSlug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    return {
      name: cleanName,
      slug: candidateSlug,
    };
  };

  const validateWinnerForm = () => {
    const cleanUserId = winnerForm.userId.trim();
    const cleanDrawId = winnerForm.drawId.trim();
    const cleanCharityId = winnerForm.charityId.trim();
    const amount = Number(winnerForm.prizeAmount);
    const matchedNumbers = Number(winnerForm.matchedNumbers);

    if (!isUuid(cleanUserId)) {
      throw new Error('User ID must be a valid UUID');
    }
    if (!isUuid(cleanDrawId)) {
      throw new Error('Draw ID must be a valid UUID');
    }
    if (!isUuid(cleanCharityId)) {
      throw new Error('Charity ID must be a valid UUID');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Prize amount must be greater than 0');
    }
    if (![3, 4, 5].includes(matchedNumbers)) {
      throw new Error('Matched numbers must be 3, 4, or 5');
    }
    if (!winnerPayoutStatuses.includes(winnerForm.payoutStatus)) {
      throw new Error('Please select a valid payout status');
    }

    return {
      user_id: cleanUserId,
      draw_id: cleanDrawId,
      charity_id: cleanCharityId,
      matched_numbers: matchedNumbers,
      tier: matchedNumbers,
      payout_amount_cents: Math.round(amount * 100),
      payout_status: winnerForm.payoutStatus,
      verification_status: 'pending',
    };
  };

  const executeModuleAction = async (action: () => Promise<unknown>, message: string) => {
    setActionBusy(true);
    setActionError('');
    setActionMessage('');

    try {
      await action();
      await loadProtectedData(token);
      setActionMessage(message);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreate = async (module: ModuleKey) => {
    setActionError('');
    setActionMessage('');
    setDrawFormError('');
    setCharityFormError('');
    setWinnerFormError('');

    let payload: JsonRecord;

    try {
      if (module === 'draws') {
        payload = validateDrawForm();
      } else if (module === 'charities') {
        payload = validateCharityForm();
      } else if (module === 'winners') {
        payload = validateWinnerForm();
      } else {
        payload = parseJsonRecord(drafts[module]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid create payload';
      if (module === 'draws') {
        setDrawFormError(message);
      } else if (module === 'charities') {
        setCharityFormError(message);
      } else if (module === 'winners') {
        setWinnerFormError(message);
      } else {
        setActionError(message);
      }
      return;
    }

    await executeModuleAction(async () => {
      if (module === 'scores') {
        await createScore(token, payload);
      }
      if (module === 'draws') {
        await createDraw(token, payload);
      }
      if (module === 'charities') {
        await createCharity(token, payload);
      }
      if (module === 'winners') {
        await createWinner(token, payload);
      }
    }, `${module.slice(0, -1)} created successfully`);

    if (module === 'draws') {
      setDrawForm({ title: '', drawMonth: '', status: 'draft' });
    }
    if (module === 'charities') {
      setCharityForm({ name: '', slug: '' });
    }
    if (module === 'winners') {
      setWinnerForm({
        userId: '',
        drawId: '',
        charityId: '',
        prizeAmount: '',
        matchedNumbers: '3',
        payoutStatus: 'pending',
      });
    }
  };

  const beginEdit = (module: ModuleKey, row: JsonRecord, id: string) => {
    setEditing({
      module,
      id,
      json: JSON.stringify(sanitizeEditableData(module, row), null, 2),
    });
    setActionError('');
    setActionMessage('');
  };

  const saveEdit = async () => {
    if (!editing) {
      return;
    }

    const payload = parseJsonRecord(editing.json);
    const current = editing;

    await executeModuleAction(async () => {
      if (current.module === 'scores') {
        await updateScore(token, current.id, payload);
      }
      if (current.module === 'draws') {
        await updateDraw(token, current.id, payload);
      }
      if (current.module === 'charities') {
        await updateCharity(token, current.id, payload);
      }
      if (current.module === 'winners') {
        await updateWinner(token, current.id, payload);
      }
    }, `${current.module.slice(0, -1)} updated successfully`);

    setEditing(null);
  };

  const handleDelete = async (module: ModuleKey, id: string) => {
    await executeModuleAction(async () => {
      if (module === 'scores') {
        await deleteScore(token, id);
      }
      if (module === 'draws') {
        await deleteDraw(token, id);
      }
      if (module === 'charities') {
        await deleteCharity(token, id);
      }
      if (module === 'winners') {
        await deleteWinner(token, id);
      }
    }, `${module.slice(0, -1)} deleted successfully`);
  };

  const handleDrawLifecycleAction = async (
    actionName: 'simulate' | 'run' | 'publish' | 'close',
    drawId: string
  ) => {
    await executeModuleAction(async () => {
      if (actionName === 'simulate') {
        await simulateDraw(token, drawId);
      }
      if (actionName === 'run') {
        await runDraw(token, drawId);
      }
      if (actionName === 'publish') {
        await publishDraw(token, drawId);
      }
      if (actionName === 'close') {
        await closeDraw(token, drawId);
      }
    }, `Draw ${actionName} completed successfully`);
  };

  const handleVerifyWinnerAction = async (
    winnerId: string,
    decision: 'approved' | 'rejected'
  ) => {
    await executeModuleAction(async () => {
      await verifyWinner(token, winnerId, { decision });
    }, `Winner ${decision} successfully`);
  };

  const handleMarkWinnerPaidAction = async (winnerId: string) => {
    await executeModuleAction(async () => {
      await markWinnerPaid(token, winnerId, {});
    }, 'Winner marked as paid successfully');
  };

  const exportCsvReport = async () => {
    setActionError('');
    setActionMessage('');
    try {
      const blob = await exportReportCsv(token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `digital-heroes-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setActionMessage('CSV report exported successfully');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to export CSV report');
    }
  };

  const copyAuditMigrationSql = async () => {
    try {
      await navigator.clipboard.writeText(auditMigrationSql);
      setAuditSqlCopied(true);
      setActionMessage('Audit migration SQL copied to clipboard');
    } catch {
      setActionError('Unable to copy SQL automatically. Please copy it manually from the box.');
    }
  };

  const handleAdminUserUpdate = async (
    id: string,
    patch: Partial<Pick<AdminManagedUser, 'role' | 'is_active' | 'subscription_status' | 'subscription_plan'>>,
    message: string
  ) => {
    await executeModuleAction(async () => {
      await updateAdminUser(token, id, patch);
    }, message);
  };

  const renderQueryToolbar = (
    key: DataKey,
    options: {
      sortOptions: Array<{ label: string; value: string }>;
      showStatusFilter?: boolean;
      showPayoutFilter?: boolean;
      showActionFilter?: boolean;
      showEntityTypeFilter?: boolean;
    }
  ) => {
    const query = queryByKey[key];
    const meta = metaByKey[key];

    return (
      <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            onChange={(event) => updateQueryState(key, { search: event.target.value }, true)}
            placeholder="Search"
            value={query.search}
          />

          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            onChange={(event) => updateQueryState(key, { sortBy: event.target.value }, true)}
            title="Sort field"
            value={query.sortBy}
          >
            {options.sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            onChange={(event) => updateQueryState(key, { sortDir: event.target.value as SortDir }, true)}
            title="Sort direction"
            value={query.sortDir}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>

          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            onChange={(event) =>
              updateQueryState(key, { pageSize: Number(event.target.value), page: 1 }, false)
            }
            title="Rows per page"
            value={String(query.pageSize)}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={String(size)}>
                {size} / page
              </option>
            ))}
          </select>

          {options.showStatusFilter ? (
            <select
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => updateQueryState(key, { status: event.target.value }, true)}
              title="Draw status filter"
              value={query.status}
            >
              <option value="">All statuses</option>
              {drawStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          ) : null}

          {options.showPayoutFilter ? (
            <select
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => updateQueryState(key, { payoutStatus: event.target.value }, true)}
              title="Payout status filter"
              value={query.payoutStatus}
            >
              <option value="">All payouts</option>
              {winnerPayoutStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          ) : null}

          {options.showActionFilter ? (
            <select
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => updateQueryState(key, { action: event.target.value }, true)}
              title="Audit action filter"
              value={query.action}
            >
              <option value="">All actions</option>
              <option value="create">create</option>
              <option value="update">update</option>
              <option value="delete">delete</option>
            </select>
          ) : null}

          {options.showEntityTypeFilter ? (
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => updateQueryState(key, { entityType: event.target.value }, true)}
              placeholder="Filter entity type"
              value={query.entityType}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Total: {meta.total} | Page {meta.page} of {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={query.page <= 1}
              onClick={() => updateQueryState(key, { page: Math.max(1, query.page - 1) }, false)}
              type="button"
            >
              Prev
            </button>
            <button
              className="rounded border border-slate-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={query.page >= meta.totalPages}
              onClick={() =>
                updateQueryState(key, { page: Math.min(meta.totalPages, query.page + 1) }, false)
              }
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!token || !user) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
        <section className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <h1 className="text-2xl font-bold tracking-tight">Admin Access</h1>
          <p className="mt-2 text-sm text-slate-300">
            This area is restricted to approved administrators only.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Existing admins should use Login. New admin accounts require a valid invite key.
          </p>

          <div className="mt-5 flex rounded-lg border border-slate-700 p-1 text-sm">
            <button
              className={`w-1/2 rounded-md px-3 py-2 font-medium transition ${
                authMode === 'login' ? 'bg-emerald-600 text-white' : 'text-slate-300'
              }`}
              onClick={() => setAuthMode('login')}
              type="button"
            >
              Login
            </button>
            <button
              className={`w-1/2 rounded-md px-3 py-2 font-medium transition ${
                authMode === 'signup' ? 'bg-emerald-600 text-white' : 'text-slate-300'
              }`}
              onClick={() => setAuthMode('signup')}
              type="button"
            >
              Admin Signup
            </button>
          </div>

          {authMode === 'login' ? (
            <button
              className="mt-3 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
              onClick={() => {
                setAuthError('');
                setStatusMessage('');
                setAuthMode('forgot');
              }}
              type="button"
            >
              Forgot password?
            </button>
          ) : null}

          {authMode === 'forgot' ? (
            <button
              className="mt-3 text-xs font-semibold text-slate-300 hover:text-slate-200"
              onClick={() => {
                setAuthError('');
                setStatusMessage('');
                setAuthMode('login');
              }}
              type="button"
            >
              Back to Login
            </button>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' ? (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-300">Full Name</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-emerald-500 focus:ring"
                  onChange={(event) => setAuthName(event.target.value)}
                  required
                  value={authName}
                />
              </label>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Email or Phone</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-emerald-500 focus:ring"
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder={authMode === 'forgot' ? 'you@example.com' : 'you@example.com or +15551234567'}
                required
                type="text"
                value={authEmail}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Password</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-emerald-500 focus:ring"
                minLength={8}
                onChange={(event) => setAuthPassword(event.target.value)}
                required={authMode !== 'forgot'}
                type="password"
                value={authPassword}
              />
            </label>

            {authMode === 'signup' ? (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-300">Admin Invite Key</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-emerald-500 focus:ring"
                  onChange={(event) => setAdminInviteKey(event.target.value)}
                  required
                  value={adminInviteKey}
                />
              </label>
            ) : null}

            {authError ? (
              <p className="rounded-lg border border-rose-800 bg-rose-950/70 px-3 py-2 text-sm text-rose-200">
                {authError}
              </p>
            ) : null}

            {statusMessage ? (
              <p className="rounded-lg border border-emerald-800 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-200">
                {statusMessage}
              </p>
            ) : null}

            <button
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
              disabled={authBusy}
              type="submit"
            >
              {authBusy
                ? 'Please wait...'
                : authMode === 'login'
                  ? 'Login'
                  : authMode === 'signup'
                    ? 'Create Admin Account'
                    : 'Send Reset Link'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
        <section className="mx-auto max-w-lg rounded-2xl border border-amber-700/60 bg-slate-900 p-6">
          <h1 className="text-2xl font-bold">Access Restricted</h1>
          <p className="mt-2 text-slate-300">
            Logged in as {user.email}, but this panel requires an admin role in profiles.role.
          </p>
          <button
            className="mt-4 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="rounded-2xl bg-emerald-900 px-5 py-4 text-emerald-50 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-lg bg-amber-500 px-2 text-2xl font-extrabold text-white">
                11
              </span>
              <div>
                <h1 className="text-2xl font-bold uppercase tracking-wide sm:text-3xl">Admin Dashboard</h1>
                <p className="text-sm text-emerald-100">
                  {user.name || 'Admin'} | {user.email} | role: {user.role}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="rounded-lg border border-emerald-700 bg-emerald-800 px-3 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-700"
                onClick={() => void loadProtectedData(token)}
                type="button"
              >
                Refresh
              </button>
              <button
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                onClick={handleLogout}
                type="button"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                item.key === view
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-white text-slate-700 hover:bg-slate-200'
              }`}
              onClick={() => setView(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {dataError ? (
          <p className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {dataError}
          </p>
        ) : null}

        {actionError ? (
          <p className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </p>
        ) : null}

        {actionMessage ? (
          <p className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {actionMessage}
          </p>
        ) : null}

        {loadingData ? <p className="mt-4 text-sm text-slate-600">Loading data...</p> : null}

        {editing ? (
          <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-900">Editing {editing.module.slice(0, -1)}</h2>
            <p className="mt-1 text-xs text-amber-700">ID: {editing.id}</p>
            <textarea
              className="mt-3 h-40 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-xs outline-none ring-amber-500 focus:ring"
              placeholder="Enter JSON update payload"
              title="JSON editor"
              onChange={(event) => setEditing({ ...editing, json: event.target.value })}
              value={editing.json}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                disabled={actionBusy}
                onClick={() => void saveEdit()}
                type="button"
              >
                {actionBusy ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                className="rounded-lg bg-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
                onClick={() => setEditing(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-4 grid gap-4">
          {view === 'dashboard' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-600">Scores</h2>
                <p className="mt-1 text-3xl font-bold">{metrics.scoreCount}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-600">Draws</h2>
                <p className="mt-1 text-3xl font-bold">{metrics.drawCount}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-600">Charities</h2>
                <p className="mt-1 text-3xl font-bold">{metrics.charityCount}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-600">Winners</h2>
                <p className="mt-1 text-3xl font-bold">{metrics.winnerCount}</p>
              </article>
            </div>
          ) : null}

          {view === 'users' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Users ({adminUsers.length})</h2>
              <p className="mt-1 text-xs text-slate-500">
                Manage role, account status, and subscription fields.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Active</th>
                      <th className="px-3 py-2">Subscription</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((managedUser) => (
                      <tr className="border-t border-slate-200" key={managedUser.id}>
                        <td className="px-3 py-2">{managedUser.full_name || '-'}</td>
                        <td className="px-3 py-2">{managedUser.email}</td>
                        <td className="px-3 py-2 capitalize">{managedUser.role}</td>
                        <td className="px-3 py-2">{managedUser.is_active ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2">
                          {managedUser.subscription_status || 'inactive'}
                          {managedUser.subscription_plan ? ` (${managedUser.subscription_plan})` : ''}
                          <div className="text-xs text-slate-500">
                            {managedUser.subscription_ends_at
                              ? `Ends ${formatDate(managedUser.subscription_ends_at)}`
                              : 'No end date'}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleAdminUserUpdate(
                                  managedUser.id,
                                  { role: managedUser.role === 'admin' ? 'user' : 'admin' },
                                  'User role updated successfully'
                                );
                              }}
                              type="button"
                            >
                              Toggle Role
                            </button>
                            <button
                              className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleAdminUserUpdate(
                                  managedUser.id,
                                  { is_active: !managedUser.is_active },
                                  'User active status updated successfully'
                                );
                              }}
                              type="button"
                            >
                              {managedUser.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleAdminUserUpdate(
                                  managedUser.id,
                                  {
                                    subscription_status: 'active',
                                    subscription_plan: managedUser.subscription_plan || 'monthly',
                                  },
                                  'Subscription updated successfully'
                                );
                              }}
                              type="button"
                            >
                              Mark Active Sub
                            </button>
                            <button
                              className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleAdminUserUpdate(
                                  managedUser.id,
                                  { subscription_status: 'inactive', subscription_plan: null },
                                  'Subscription updated successfully'
                                );
                              }}
                              type="button"
                            >
                              Clear Sub
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {adminUsers.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-sm text-slate-500" colSpan={6}>
                          No users found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {view === 'scores' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Scores ({metaByKey.scores.total})</h2>
              <p className="mt-1 text-xs text-slate-500">Create score (JSON object)</p>
              {renderQueryToolbar('scores', {
                sortOptions: [
                  { label: 'Score Date', value: 'score_date' },
                  { label: 'Score Value', value: 'score_value' },
                  { label: 'Created At', value: 'created_at' },
                  { label: 'User ID', value: 'user_id' },
                ],
              })}
              <textarea
                className="mt-2 h-28 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none ring-slate-500 focus:ring"
                placeholder="Enter score JSON payload"
                title="Create score JSON"
                onChange={(event) => setDraft('scores', event.target.value)}
                value={drafts.scores}
              />
              <button
                className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={actionBusy}
                onClick={() => void handleCreate('scores')}
                type="button"
              >
                {actionBusy ? 'Working...' : 'Create Score'}
              </button>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Score</th>
                      <th className="px-3 py-2">User ID</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((score) => (
                      <tr className="border-t border-slate-200" key={score.id}>
                        <td className="px-3 py-2">{formatDate(score.score_date)}</td>
                        <td className="px-3 py-2">{score.score_value}</td>
                        <td className="px-3 py-2 text-slate-500">{score.user_id}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => beginEdit('scores', score as unknown as JsonRecord, score.id)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => void handleDelete('scores', score.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {view === 'draws' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Draws ({metaByKey.draws.total})</h2>
              <p className="mt-1 text-xs text-slate-500">Create draw using validated fields</p>
              {renderQueryToolbar('draws', {
                sortOptions: [
                  { label: 'Draw Month', value: 'draw_month' },
                  { label: 'Title', value: 'title' },
                  { label: 'Status', value: 'status' },
                  { label: 'Created At', value: 'created_at' },
                ],
                showStatusFilter: true,
              })}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Title</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setDrawFormError('');
                      setDrawForm((prev) => ({ ...prev, title: event.target.value }));
                    }}
                    placeholder="April 2026 Draw"
                    value={drawForm.title}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Draw Month</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setDrawFormError('');
                      setDrawForm((prev) => ({ ...prev, drawMonth: event.target.value }));
                    }}
                    type="date"
                    value={drawForm.drawMonth}
                  />
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-600">Status</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setDrawFormError('');
                      setDrawForm((prev) => ({ ...prev, status: event.target.value as DrawStatus }));
                    }}
                    value={drawForm.status}
                  >
                    {drawStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {drawFormError ? (
                <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {drawFormError}
                </p>
              ) : null}

              <button
                className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={actionBusy}
                onClick={async () => {
                  try {
                    await handleCreate('draws');
                  } catch (error) {
                    setDrawFormError(error instanceof Error ? error.message : 'Unable to create draw');
                  }
                }}
                type="button"
              >
                {actionBusy ? 'Working...' : 'Create Draw'}
              </button>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2">Winning Numbers</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draws.map((draw) => (
                      <tr className="border-t border-slate-200" key={draw.id}>
                        <td className="px-3 py-2">{draw.title}</td>
                        <td className="px-3 py-2">{draw.draw_month}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {Array.isArray(draw.winning_numbers) && draw.winning_numbers.length > 0
                            ? draw.winning_numbers.join(', ')
                            : '-'}
                        </td>
                        <td className="px-3 py-2 capitalize">{draw.status}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => beginEdit('draws', draw as unknown as JsonRecord, draw.id)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleDrawLifecycleAction('simulate', draw.id);
                              }}
                              type="button"
                            >
                              Simulate
                            </button>
                            <button
                              className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleDrawLifecycleAction('run', draw.id);
                              }}
                              type="button"
                            >
                              Run
                            </button>
                            <button
                              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleDrawLifecycleAction('publish', draw.id);
                              }}
                              type="button"
                            >
                              Publish
                            </button>
                            <button
                              className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                void handleDrawLifecycleAction('close', draw.id);
                              }}
                              type="button"
                            >
                              Close
                            </button>
                            <button
                              className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => void handleDelete('draws', draw.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {view === 'charities' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Charities ({metaByKey.charities.total})</h2>
              <p className="mt-1 text-xs text-slate-500">Create charity using validated fields</p>
              {renderQueryToolbar('charities', {
                sortOptions: [
                  { label: 'Created At', value: 'created_at' },
                  { label: 'Name', value: 'name' },
                  { label: 'Slug', value: 'slug' },
                ],
              })}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Name</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setCharityFormError('');
                      const nextName = event.target.value;
                      setCharityForm((prev) => ({
                        name: nextName,
                        slug: prev.slug || toSlug(nextName),
                      }));
                    }}
                    placeholder="Local Youth Golf Fund"
                    value={charityForm.name}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Slug</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setCharityFormError('');
                      setCharityForm((prev) => ({ ...prev, slug: toSlug(event.target.value) }));
                    }}
                    placeholder="local-youth-golf-fund"
                    value={charityForm.slug}
                  />
                </label>
              </div>

              {charityFormError ? (
                <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {charityFormError}
                </p>
              ) : null}

              <button
                className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={actionBusy}
                onClick={async () => {
                  try {
                    await handleCreate('charities');
                  } catch (error) {
                    setCharityFormError(error instanceof Error ? error.message : 'Unable to create charity');
                  }
                }}
                type="button"
              >
                {actionBusy ? 'Working...' : 'Create Charity'}
              </button>

              <ul className="mt-4 space-y-2">
                {charities.map((charity) => (
                  <li className="rounded-lg border border-slate-200 px-3 py-2" key={charity.id}>
                    <p className="font-medium text-slate-800">{charity.name}</p>
                    <p className="text-xs text-slate-500">slug: {charity.slug}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => beginEdit('charities', charity as unknown as JsonRecord, charity.id)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => void handleDelete('charities', charity.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view === 'winners' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Winners ({metaByKey.winners.total})</h2>
              <p className="mt-1 text-xs text-slate-500">Create winner using validated fields</p>
              {renderQueryToolbar('winners', {
                sortOptions: [
                  { label: 'Created At', value: 'created_at' },
                  { label: 'Prize Amount', value: 'prize_amount' },
                  { label: 'Payout Status', value: 'payout_status' },
                  { label: 'User ID', value: 'user_id' },
                ],
                showPayoutFilter: true,
              })}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-600">User ID (UUID)</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setWinnerFormError('');
                      setWinnerForm((prev) => ({ ...prev, userId: event.target.value }));
                    }}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    value={winnerForm.userId}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        if (!user?.id) {
                          return;
                        }
                        setWinnerFormError('');
                        setWinnerForm((prev) => ({ ...prev, userId: user.id }));
                      }}
                      type="button"
                    >
                      Use My Admin UUID
                    </button>
                    <p className="text-xs text-slate-500">
                      Use a valid profiles.id UUID for the winning user.
                    </p>
                  </div>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Draw</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setWinnerFormError('');
                      setWinnerForm((prev) => ({ ...prev, drawId: event.target.value }));
                    }}
                    value={winnerForm.drawId}
                  >
                    <option value="">Select draw</option>
                    {draws.map((draw) => (
                      <option key={draw.id} value={draw.id}>
                        {draw.title} ({draw.draw_month})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Charity</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setWinnerFormError('');
                      setWinnerForm((prev) => ({ ...prev, charityId: event.target.value }));
                    }}
                    value={winnerForm.charityId}
                  >
                    <option value="">Select charity</option>
                    {charities.map((charity) => (
                      <option key={charity.id} value={charity.id}>
                        {charity.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Prize Amount</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    min={0}
                    onChange={(event) => {
                      setWinnerFormError('');
                      setWinnerForm((prev) => ({ ...prev, prizeAmount: event.target.value }));
                    }}
                    placeholder="250"
                    step="0.01"
                    type="number"
                    value={winnerForm.prizeAmount}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Matched Numbers</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setWinnerFormError('');
                      setWinnerForm((prev) => ({
                        ...prev,
                        matchedNumbers: event.target.value as '3' | '4' | '5',
                      }));
                    }}
                    value={winnerForm.matchedNumbers}
                  >
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Payout Status</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-500 focus:ring"
                    onChange={(event) => {
                      setWinnerFormError('');
                      setWinnerForm((prev) => ({
                        ...prev,
                        payoutStatus: event.target.value as WinnerPayoutStatus,
                      }));
                    }}
                    value={winnerForm.payoutStatus}
                  >
                    {winnerPayoutStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {winnerFormError ? (
                <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {winnerFormError}
                </p>
              ) : null}

              <button
                className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={actionBusy}
                onClick={async () => {
                  try {
                    await handleCreate('winners');
                  } catch (error) {
                    setWinnerFormError(error instanceof Error ? error.message : 'Unable to create winner');
                  }
                }}
                type="button"
              >
                {actionBusy ? 'Working...' : 'Create Winner'}
              </button>

              <div className="mt-3 space-y-3">
                {winners.map((winner) => (
                  <article className="rounded-lg border border-slate-200 p-3" key={winner.id}>
                    <p className="font-medium text-slate-900">
                      {winner.user?.full_name || winner.user?.email || 'Unknown user'}
                    </p>
                    <p className="text-sm text-slate-700">
                      Draw: {winner.draw?.title || winner.draw?.draw_month || 'N/A'}
                    </p>
                    <p className="text-sm text-slate-700">
                      Charity: {winner.charity?.name || 'N/A'} | Prize: {formatMoney(winner.prize_amount)}
                    </p>
                    <p className="text-xs text-slate-500">
                      verification: {winner.verification_status || 'pending'} | payout: {winner.payout_status} |{' '}
                      {formatDate(winner.created_at)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => beginEdit('winners', winner as unknown as JsonRecord, winner.id)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => {
                          void handleVerifyWinnerAction(winner.id, 'approved');
                        }}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="rounded bg-amber-700 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => {
                          void handleVerifyWinnerAction(winner.id, 'rejected');
                        }}
                        type="button"
                      >
                        Reject
                      </button>
                      <button
                        className="rounded bg-sky-700 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => {
                          void handleMarkWinnerPaidAction(winner.id);
                        }}
                        type="button"
                      >
                        Mark Paid
                      </button>
                      <button
                        className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => void handleDelete('winners', winner.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {view === 'contacts' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Contact Messages ({metaByKey.contacts.total})</h2>
              {renderQueryToolbar('contacts', {
                sortOptions: [
                  { label: 'Submitted At', value: 'submitted_at' },
                  { label: 'Created At', value: 'created_at' },
                  { label: 'Name', value: 'name' },
                  { label: 'Email', value: 'email' },
                ],
              })}
              <div className="mt-3 space-y-3">
                {contactMessages.length === 0 ? (
                  <p className="text-sm text-slate-500">No contact messages yet.</p>
                ) : null}
                {contactMessages.map((message) => (
                  <article className="rounded-lg border border-slate-200 p-3" key={message.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{message.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(message.submitted_at || message.created_at || '')}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{message.email}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{message.message}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {view === 'reports' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Reports Overview</h2>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => void exportCsvReport()}
                  type="button"
                >
                  Export CSV
                </button>
              </div>

              {reportBusy ? <p className="mt-2 text-sm text-slate-500">Refreshing reports...</p> : null}

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm text-slate-500">Total Prize Distributed</p>
                  <p className="text-xl font-bold text-slate-900">{formatMoney(metrics.totalPrize)}</p>
                </article>
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm text-slate-500">Paid Winners</p>
                  <p className="text-xl font-bold text-emerald-700">{metrics.paidCount}</p>
                </article>
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm text-slate-500">Pending Payouts</p>
                  <p className="text-xl font-bold text-amber-700">{metrics.pendingCount}</p>
                </article>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2">Scores</th>
                      <th className="px-3 py-2">Winners</th>
                      <th className="px-3 py-2">Contacts</th>
                      <th className="px-3 py-2">Total Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportSummary?.monthly || []).map((row) => (
                      <tr className="border-t border-slate-200" key={row.month}>
                        <td className="px-3 py-2 font-medium">{row.month}</td>
                        <td className="px-3 py-2">{row.scores}</td>
                        <td className="px-3 py-2">{row.winners}</td>
                        <td className="px-3 py-2">{row.contacts}</td>
                        <td className="px-3 py-2">{formatMoney(row.total_prize)}</td>
                      </tr>
                    ))}
                    {(reportSummary?.monthly || []).length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-sm text-slate-500" colSpan={5}>
                          No monthly aggregate data available yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-5">
                <h3 className="text-base font-semibold text-slate-900">Audit Logs ({metaByKey.audit.total})</h3>
                {renderQueryToolbar('audit', {
                  sortOptions: [
                    { label: 'Created At', value: 'created_at' },
                    { label: 'Action', value: 'action' },
                    { label: 'Entity Type', value: 'entity_type' },
                    { label: 'Actor Email', value: 'actor_email' },
                  ],
                  showActionFilter: true,
                  showEntityTypeFilter: true,
                })}

                {auditSetupRequired ? (
                  <article className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <h4 className="text-sm font-semibold text-amber-900">Audit Logs Setup Required</h4>
                    <p className="mt-1 text-xs text-amber-800">
                      Run the audit migration SQL in Supabase SQL Editor, then click Refresh.
                    </p>
                    {auditSetupError ? (
                      <p className="mt-2 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900">
                        {auditSetupError}
                      </p>
                    ) : null}
                    <textarea
                      className="mt-2 h-40 w-full rounded border border-amber-300 bg-white px-2 py-1 font-mono text-xs text-slate-800"
                      readOnly
                      title="Audit migration SQL"
                      value={auditMigrationSql}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="rounded border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900"
                        onClick={() => void copyAuditMigrationSql()}
                        type="button"
                      >
                        {auditSqlCopied ? 'Copied' : 'Copy SQL'}
                      </button>
                      <button
                        className="rounded border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900"
                        onClick={() => {
                          void loadModuleData(token, 'audit');
                        }}
                        type="button"
                      >
                        Recheck Audit Table
                      </button>
                    </div>
                  </article>
                ) : null}

                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Actor</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Entity</th>
                        <th className="px-3 py-2">Entity ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr className="border-t border-slate-200" key={log.id}>
                          <td className="px-3 py-2">{formatDate(log.created_at)}</td>
                          <td className="px-3 py-2">{log.actor_email || 'unknown'}</td>
                          <td className="px-3 py-2 uppercase">{log.action}</td>
                          <td className="px-3 py-2">{log.entity_type}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{log.entity_id || '-'}</td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-sm text-slate-500" colSpan={5}>
                            No audit logs found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function App() {
  const [path, setPath] = useState<string>(() => appPath());

  useEffect(() => {
    const onPopState = () => setPath(appPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (path === '/admin') {
    return <AdminApp />;
  }

  if (path === '/user') {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicNavbar path="/" />
        <UserPortalPage />
      </div>
    );
  }

  const publicPath: PublicPage = isPublicPage(path) ? path : '/';

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicNavbar path={publicPath} />
      {publicPath === '/' ? <HomePage /> : null}
      {publicPath === '/about' ? <AboutPage /> : null}
      {publicPath === '/contact' ? <ContactPage /> : null}
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Digital Heroes. All rights reserved.
      </footer>
    </div>
  );
}

export default App;

