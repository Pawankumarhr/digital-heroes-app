import { supabase } from './supabase';
import { appConfig } from '../config/appConfig';

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  errors?: unknown;
};

const apiBaseUrl = (appConfig.apiBaseUrl || '').replace(/\/+$/, '');
const isBackendConfigured = Boolean(apiBaseUrl);

const buildRequestUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  filters?: Record<string, string | null>;
};

type PaginatedData<T> = {
  items: T[];
  meta: PaginationMeta;
};

type ListQueryParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  userId?: string;
  status?: string;
  payoutStatus?: string;
  verificationStatus?: string;
  action?: string;
  entityType?: string;
};

type LoginData = {
  token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
  };
};

type SignupData = {
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
  } | null;
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  } | null;
};

type ForgotPasswordData = {
  email: string;
};

type SubscriptionStatusData = {
  status: string;
  plan: string | null;
  currentPeriodEnd: string | null;
  stripeSubscriptionId: string | null;
};

type CheckoutSessionData = {
  id: string;
  url: string;
  plan: 'monthly' | 'yearly';
};

type ContactData = {
  received: boolean;
};

type PublicCharity = {
  id: string;
  name: string;
  slug: string;
};

type Notification = {
  id: string;
  user_id?: string | null;
  channel: string;
  event_type: string;
  subject?: string | null;
  body?: string | null;
  status: string;
  read_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  sent_at?: string | null;
};

type CharityImpactData = {
  totalCharityAmount: number;
  totalPlayerAmount: number;
  totalPayoutAmount: number;
  averageContributionPercent: number;
  recordsCount: number;
  lastContributionAt: string | null;
};

type CharityContribution = {
  id: string;
  user_id: string;
  winner_id: string;
  draw_id: string;
  charity_id: string;
  contribution_percent: number;
  total_payout_cents: number;
  charity_amount_cents: number;
  player_amount_cents: number;
  status: string;
  created_at: string;
};

type AdminUser = {
  id: string;
  full_name?: string | null;
  email: string;
  role: string;
  is_active: boolean;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_ends_at?: string | null;
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

const parseError = async (response: Response) => {
  try {
    const json = (await response.json()) as { message?: string };
    return json.message || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
};

const parseJsonPayload = async <T>(response: Response, requestPath: string): Promise<ApiEnvelope<T>> => {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!contentType.toLowerCase().includes('application/json')) {
    if (/<!doctype\s+html|<html/i.test(text)) {
      throw new Error(
        `API endpoint ${requestPath} returned HTML instead of JSON. ` +
          'This usually means frontend-only deployment without backend API.'
      );
    }

    throw new Error(`API endpoint ${requestPath} returned non-JSON response`);
  }

  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new Error(`Invalid JSON response from ${requestPath}`);
  }
};

const request = async <T>(path: string, init: RequestInit = {}, token?: string): Promise<T> => {
  const headers = new Headers(init.headers || {});

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(buildRequestUrl(path), {
      ...init,
      headers,
    });
  } catch {
    const backendHint = apiBaseUrl
      ? `Unable to reach API at ${apiBaseUrl}`
      : 'Unable to reach API. Set appConfig.apiBaseUrl to your deployed backend URL';
    throw new Error(`${backendHint} (network request failed)`);
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = await parseJsonPayload<T>(response, path);

  if (!payload.success) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload.data;
};

const buildQuery = (params: ListQueryParams = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return;
    }
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

const toPage = (value?: number) => {
  const page = Number(value) || 1;
  return page > 0 ? page : 1;
};

const toPageSize = (value?: number) => {
  const pageSize = Number(value) || 20;
  return pageSize > 0 ? Math.min(pageSize, 200) : 20;
};

const toPaginationMeta = (
  params: ListQueryParams,
  total: number,
  defaultSortBy: string
): PaginationMeta => {
  const page = toPage(params.page);
  const pageSize = toPageSize(params.pageSize);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return {
    page,
    pageSize,
    total,
    totalPages,
    search: params.search?.trim() || '',
    sortBy: params.sortBy || defaultSortBy,
    sortDir: params.sortDir === 'asc' ? 'asc' : 'desc',
    filters: {
      userId: params.userId || null,
      status: params.status || null,
      payoutStatus: params.payoutStatus || null,
      verificationStatus: params.verificationStatus || null,
      action: params.action || null,
      entityType: params.entityType || null,
    },
  };
};

const tableQueryRange = (params: ListQueryParams) => {
  const page = toPage(params.page);
  const pageSize = toPageSize(params.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
};

const toIsoMonth = (value?: string | null) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 7);
};

const requestBlob = async (path: string, init: RequestInit = {}, token?: string) => {
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(buildRequestUrl(path), {
      ...init,
      headers,
    });
  } catch {
    const backendHint = apiBaseUrl
      ? `Unable to reach API at ${apiBaseUrl}`
      : 'Unable to reach API. Set appConfig.apiBaseUrl to your deployed backend URL';
    throw new Error(`${backendHint} (network request failed)`);
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.blob();
};

export const apiLogin = async (identifier: string, password: string) => {
  const loginWithSupabase = async () => {
    if (!identifier.includes('@')) {
      throw new Error('Email is required for frontend-only login');
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });

    if (authError) {
      throw new Error(authError.message || 'Authentication failed');
    }

    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error('Authentication failed: missing access token');
    }

    const userId = data.user?.id || '';
    let fullName: string | null = data.user?.user_metadata?.full_name ?? null;

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
      fullName = (profile?.full_name as string | null | undefined) ?? fullName;
    }

    return {
      token: accessToken,
      refresh_token: data.session?.refresh_token,
      expires_at: data.session?.expires_at,
      user: {
        id: userId,
        email: data.user?.email || identifier,
        full_name: fullName,
      },
    };
  };

  if (!isBackendConfigured) {
    return loginWithSupabase();
  }

  try {
    return await request<LoginData>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  } catch (error) {
    if (!identifier.includes('@')) {
      throw error;
    }
    return loginWithSupabase();
  }
};

export const apiSignup = async (
  name: string,
  identifier: string,
  password: string,
  inviteKey: string
) => {
  const payload = identifier.includes('@')
    ? { name, email: identifier, password, inviteKey }
    : { name, phone: identifier, password, inviteKey };

  return request<SignupData>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const apiUserSignup = async (
  name: string,
  identifier: string,
  password: string,
  preferredCharityId?: string,
  charityContributionPercent?: number
) => {
  const payload = identifier.includes('@')
    ? { name, email: identifier, password, preferredCharityId, charityContributionPercent }
    : { name, phone: identifier, password, preferredCharityId, charityContributionPercent };

  return request<SignupData>('/api/auth/user-register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const apiForgotPassword = async (email: string, redirectPath = '/admin') => {
  if (!isBackendConfigured) {
    const redirectTo = `${window.location.origin}${redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      throw new Error(error.message || 'Failed to send password reset email');
    }
    return { email };
  }

  return request<ForgotPasswordData>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email, redirectPath }),
  });
};

export const apiSubmitContact = async (name: string, email: string, message: string) => {
  return request<ContactData>('/api/contact', {
    method: 'POST',
    body: JSON.stringify({ name, email, message }),
  });
};

export const fetchPublicCharities = async () => {
  if (!isBackendConfigured) {
    const { data, error } = await supabase.from('charities').select('id, name, slug').order('name', { ascending: true });
    if (error) {
      throw new Error(error.message || 'Failed to fetch charities');
    }
    return (data || []) as PublicCharity[];
  }

  const data = await request<{ items: PublicCharity[] }>('/api/charities/public');
  return data.items || [];
};

export const updateAuthPreferences = async (
  token: string,
  payload: { preferredCharityId?: string | null; charityContributionPercent?: number }
) => {
  return request<Record<string, unknown>>(
    '/api/auth/preferences',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const fetchSubscriptionStatus = async (token: string) => {
  return request<SubscriptionStatusData>('/api/payments/subscription-status', {}, token);
};

export const createCheckoutSession = async (
  token: string,
  plan: 'monthly' | 'yearly',
  successPath = '/user?payment=success',
  cancelPath = '/user?payment=cancelled'
) => {
  return request<CheckoutSessionData>(
    '/api/payments/checkout-session',
    {
      method: 'POST',
      body: JSON.stringify({ plan, successPath, cancelPath }),
    },
    token
  );
};

export const fetchMe = async (token: string) => {
  const fetchMeFromSupabase = async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Session expired. Please login again.');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role, preferred_charity_id, charity_contribution_percent')
      .eq('id', authData.user.id)
      .maybeSingle();

    return {
      id: authData.user.id,
      name: (profile?.full_name as string | null | undefined) || null,
      email: authData.user.email || '',
      role: (profile?.role as string | undefined) || 'user',
      preferredCharityId:
        (profile?.preferred_charity_id as string | null | undefined) ?? null,
      charityContributionPercent:
        (profile?.charity_contribution_percent as number | null | undefined) ?? null,
    };
  };

  if (!isBackendConfigured) {
    return fetchMeFromSupabase();
  }

  try {
    return await request<{
      id: string;
      name: string | null;
      email: string;
      role: string;
      preferredCharityId?: string | null;
      charityContributionPercent?: number | null;
    }>('/api/auth/me', {}, token);
  } catch {
    return fetchMeFromSupabase();
  }
};

export const fetchScores = async (token: string, params: ListQueryParams = {}) => {
  if (!isBackendConfigured) {
    const { from, to } = tableQueryRange(params);
    const sortBy = params.sortBy || 'score_date';
    const ascending = params.sortDir === 'asc';

    let query = supabase
      .from('scores')
      .select('id, user_id, score_value, score_date, created_at', { count: 'exact' })
      .order(sortBy, { ascending })
      .range(from, to);

    if (params.search?.trim()) {
      query = query.or(`user_id.ilike.%${params.search.trim()}%`);
    }

    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(error.message || 'Failed to fetch scores');
    }

    return {
      items: (data || []) as Array<{ id: string; user_id: string; score_value: number; score_date: string }>,
      meta: toPaginationMeta(params, count || 0, 'score_date'),
    };
  }

  return request<PaginatedData<{ id: string; user_id: string; score_value: number; score_date: string }>>(
    `/api/scores${buildQuery(params)}`,
    {},
    token
  );
};

export const createScore = async (token: string, payload: Record<string, unknown>) => {
  return request<Record<string, unknown>>(
    '/api/scores',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const updateScore = async (
  token: string,
  id: string,
  payload: Record<string, unknown>
) => {
  return request<Record<string, unknown>>(
    `/api/scores/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const deleteScore = async (token: string, id: string) => {
  return request<Record<string, unknown>>(
    `/api/scores/${id}`,
    {
      method: 'DELETE',
    },
    token
  );
};

export const fetchDraws = async (token: string, params: ListQueryParams = {}) => {
  if (!isBackendConfigured) {
    const { from, to } = tableQueryRange(params);
    const sortBy = params.sortBy || 'draw_month';
    const ascending = params.sortDir === 'asc';

    let query = supabase
      .from('draws')
      .select('id, title, draw_month, status, created_at', { count: 'exact' })
      .order(sortBy, { ascending })
      .range(from, to);

    if (params.search?.trim()) {
      query = query.or(`title.ilike.%${params.search.trim()}%`);
    }

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(error.message || 'Failed to fetch draws');
    }

    return {
      items: (data || []) as Array<{ id: string; title: string; draw_month: string; status: string }>,
      meta: toPaginationMeta(params, count || 0, 'draw_month'),
    };
  }

  return request<PaginatedData<{ id: string; title: string; draw_month: string; status: string }>>(
    `/api/draws${buildQuery(params)}`,
    {},
    token
  );
};

export const createDraw = async (token: string, payload: Record<string, unknown>) => {
  return request<Record<string, unknown>>(
    '/api/draws',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const updateDraw = async (token: string, id: string, payload: Record<string, unknown>) => {
  return request<Record<string, unknown>>(
    `/api/draws/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const deleteDraw = async (token: string, id: string) => {
  return request<Record<string, unknown>>(
    `/api/draws/${id}`,
    {
      method: 'DELETE',
    },
    token
  );
};

export const simulateDraw = async (token: string, id: string, payload?: { winningNumbers?: number[] }) => {
  return request<Record<string, unknown>>(
    `/api/draws/${id}/simulate`,
    {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    },
    token
  );
};

export const runDraw = async (token: string, id: string, payload?: { winningNumbers?: number[] }) => {
  return request<Record<string, unknown>>(
    `/api/draws/${id}/run`,
    {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    },
    token
  );
};

export const publishDraw = async (token: string, id: string) => {
  return request<Record<string, unknown>>(
    `/api/draws/${id}/publish`,
    {
      method: 'POST',
    },
    token
  );
};

export const closeDraw = async (token: string, id: string) => {
  return request<Record<string, unknown>>(
    `/api/draws/${id}/close`,
    {
      method: 'POST',
    },
    token
  );
};

export const fetchCharities = async (token: string, params: ListQueryParams = {}) => {
  if (!isBackendConfigured) {
    const { from, to } = tableQueryRange(params);
    const sortBy = params.sortBy || 'name';
    const ascending = params.sortDir === 'asc';

    let query = supabase
      .from('charities')
      .select('id, name, slug, created_at', { count: 'exact' })
      .order(sortBy, { ascending })
      .range(from, to);

    if (params.search?.trim()) {
      query = query.or(`name.ilike.%${params.search.trim()}%,slug.ilike.%${params.search.trim()}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(error.message || 'Failed to fetch charities');
    }

    return {
      items: (data || []) as Array<{ id: string; name: string; slug: string }>,
      meta: toPaginationMeta(params, count || 0, 'name'),
    };
  }

  return request<PaginatedData<{ id: string; name: string; slug: string }>>(
    `/api/charities${buildQuery(params)}`,
    {},
    token
  );
};

export const createCharity = async (token: string, payload: Record<string, unknown>) => {
  return request<Record<string, unknown>>(
    '/api/charities',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const updateCharity = async (
  token: string,
  id: string,
  payload: Record<string, unknown>
) => {
  return request<Record<string, unknown>>(
    `/api/charities/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const deleteCharity = async (token: string, id: string) => {
  return request<Record<string, unknown>>(
    `/api/charities/${id}`,
    {
      method: 'DELETE',
    },
    token
  );
};

export const fetchWinners = async (token: string, params: ListQueryParams = {}) => {
  if (!isBackendConfigured) {
    const { from, to } = tableQueryRange(params);
    const sortBy = params.sortBy || 'created_at';
    const ascending = params.sortDir === 'asc';

    let query = supabase
      .from('winners')
      .select('id, user_id, draw_id, charity_id, payout_status, verification_status, prize_amount, created_at', { count: 'exact' })
      .order(sortBy, { ascending })
      .range(from, to);

    if (params.payoutStatus) {
      query = query.eq('payout_status', params.payoutStatus);
    }

    if (params.verificationStatus) {
      query = query.eq('verification_status', params.verificationStatus);
    }

    if (params.search?.trim()) {
      query = query.or(`user_id.ilike.%${params.search.trim()}%,draw_id.ilike.%${params.search.trim()}%,charity_id.ilike.%${params.search.trim()}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(error.message || 'Failed to fetch winners');
    }

    return {
      items: (data || []) as Array<{
        id: string;
        user_id: string;
        draw_id: string;
        charity_id: string;
        payout_status: string;
        prize_amount: number;
        created_at: string;
      }>,
      meta: toPaginationMeta(params, count || 0, 'created_at'),
    };
  }

  return request<
    PaginatedData<{
      id: string;
      user_id: string;
      draw_id: string;
      charity_id: string;
      payout_status: string;
      prize_amount: number;
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
    }>
  >(`/api/winners${buildQuery(params)}`, {}, token);
};

export const fetchContactMessages = async (token: string, params: ListQueryParams = {}) => {
  if (!isBackendConfigured) {
    const { from, to } = tableQueryRange(params);
    const sortBy = params.sortBy || 'submitted_at';
    const ascending = params.sortDir === 'asc';

    let query = supabase
      .from('contact_messages')
      .select('id, name, email, message, submitted_at, created_at', { count: 'exact' })
      .order(sortBy, { ascending })
      .range(from, to);

    if (params.search?.trim()) {
      query = query.or(
        `name.ilike.%${params.search.trim()}%,email.ilike.%${params.search.trim()}%,message.ilike.%${params.search.trim()}%`
      );
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(error.message || 'Failed to fetch contact messages');
    }

    return {
      items: (data || []) as Array<{
        id: string;
        name: string;
        email: string;
        message: string;
        submitted_at?: string;
        created_at?: string;
      }>,
      meta: toPaginationMeta(params, count || 0, 'submitted_at'),
    };
  }

  return request<
    PaginatedData<{
      id: string;
      name: string;
      email: string;
      message: string;
      submitted_at?: string;
      created_at?: string;
    }>
  >(`/api/contact${buildQuery(params)}`, {}, token);
};

export const fetchReportSummary = async (token: string) => {
  if (!isBackendConfigured) {
    const [scoresRes, drawsRes, charitiesRes, winnersRes, contactsRes] = await Promise.all([
      supabase.from('scores').select('id, score_date', { count: 'exact' }),
      supabase.from('draws').select('id', { count: 'exact', head: true }),
      supabase.from('charities').select('id', { count: 'exact', head: true }),
      supabase.from('winners').select('*', { count: 'exact' }),
      supabase.from('contact_messages').select('id, submitted_at, created_at', { count: 'exact' }),
    ]);

    const mainError = [scoresRes, drawsRes, charitiesRes, winnersRes].find((r) => r.error)?.error;
    if (mainError) {
      throw new Error(mainError.message || 'Failed to build reports');
    }

    const contactsData = contactsRes.error ? [] : contactsRes.data || [];
    const winnersData = winnersRes.data || [];

    const monthlyMap = new Map<
      string,
      { month: string; scores: number; winners: number; contacts: number; total_prize: number }
    >();

    const ensureMonth = (month: string) => {
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { month, scores: 0, winners: 0, contacts: 0, total_prize: 0 });
      }
      return monthlyMap.get(month)!;
    };

    for (const score of scoresRes.data || []) {
      const month = toIsoMonth((score as { score_date?: string }).score_date);
      if (!month) continue;
      ensureMonth(month).scores += 1;
    }

    for (const winner of winnersData) {
      const row = winner as Record<string, unknown>;
      const month =
        toIsoMonth((row.created_at as string | undefined) || (row.updated_at as string | undefined)) ||
        toIsoMonth(row.draw_month as string | undefined);
      if (!month) continue;

      const prize = Number(row.prize_amount || row.amount || row.prize || row.prize_value) || 0;
      const payoutCents = Number(row.payout_amount_cents) || 0;
      const totalPrize = prize || payoutCents / 100;

      const bucket = ensureMonth(month);
      bucket.winners += 1;
      bucket.total_prize += totalPrize;
    }

    for (const contact of contactsData) {
      const row = contact as Record<string, unknown>;
      const month = toIsoMonth((row.submitted_at as string | undefined) || (row.created_at as string | undefined));
      if (!month) continue;
      ensureMonth(month).contacts += 1;
    }

    const paidWinners = winnersData.filter(
      (row) => String((row as Record<string, unknown>).payout_status || (row as Record<string, unknown>).status || '') === 'paid'
    ).length;

    const totalPrize = winnersData.reduce((sum, row) => {
      const data = row as Record<string, unknown>;
      const prize = Number(data.prize_amount || data.amount || data.prize || data.prize_value) || 0;
      const payoutCents = Number(data.payout_amount_cents) || 0;
      return sum + (prize || payoutCents / 100);
    }, 0);

    return {
      totals: {
        scores: scoresRes.count || 0,
        draws: drawsRes.count || 0,
        charities: charitiesRes.count || 0,
        winners: winnersRes.count || 0,
        contacts: contactsRes.count || 0,
        paidWinners,
        pendingWinners: Math.max((winnersRes.count || 0) - paidWinners, 0),
        totalPrize,
      },
      monthly: Array.from(monthlyMap.values()).sort((a, b) => (a.month < b.month ? 1 : -1)),
    };
  }

  return request<ReportSummary>('/api/reports/summary', {}, token);
};

export const exportReportCsv = async (token: string) => {
  if (!isBackendConfigured) {
    const report = await fetchReportSummary(token);
    const header = 'month,scores,winners,contacts,total_prize';
    const rows = report.monthly.map((row) => {
      return [row.month, row.scores, row.winners, row.contacts, Number(row.total_prize || 0).toFixed(2)].join(',');
    });
    const csv = [header, ...rows].join('\n');
    return new Blob([csv], { type: 'text/csv;charset=utf-8' });
  }

  return requestBlob('/api/reports/export.csv', {}, token);
};

export const fetchAuditLogs = async (token: string, params: ListQueryParams = {}) => {
  if (!isBackendConfigured) {
    const { from, to } = tableQueryRange(params);
    const sortBy = params.sortBy || 'created_at';
    const ascending = params.sortDir === 'asc';

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending })
      .range(from, to);

    if (params.search?.trim()) {
      query = query.or(
        `actor_email.ilike.%${params.search.trim()}%,entity_type.ilike.%${params.search.trim()}%,action.ilike.%${params.search.trim()}%`
      );
    }

    if (params.action) {
      query = query.eq('action', params.action.trim().toLowerCase());
    }

    if (params.entityType) {
      query = query.eq('entity_type', params.entityType.trim().toLowerCase());
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(error.message || 'Failed to fetch audit logs');
    }

    return {
      items: (data || []) as AuditLog[],
      meta: {
        ...toPaginationMeta(params, count || 0, 'created_at'),
        filters: {
          action: params.action?.trim() || null,
          entityType: params.entityType?.trim() || null,
        },
      },
    };
  }

  return request<PaginatedData<AuditLog>>(`/api/audit-logs${buildQuery(params)}`, {}, token);
};

export const createWinner = async (token: string, payload: Record<string, unknown>) => {
  return request<Record<string, unknown>>(
    '/api/winners',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const updateWinner = async (
  token: string,
  id: string,
  payload: Record<string, unknown>
) => {
  return request<Record<string, unknown>>(
    `/api/winners/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const deleteWinner = async (token: string, id: string) => {
  return request<Record<string, unknown>>(
    `/api/winners/${id}`,
    {
      method: 'DELETE',
    },
    token
  );
};

export const submitWinnerProof = async (
  token: string,
  id: string,
  payload: {
    proofFileUrl?: string;
    proofNotes?: string;
    proofFileDataBase64?: string;
    proofFileName?: string;
    proofMimeType?: string;
  }
) => {
  return request<Record<string, unknown>>(
    `/api/winners/${id}/proof`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const verifyWinner = async (
  token: string,
  id: string,
  payload: { decision: 'approved' | 'rejected'; notes?: string }
) => {
  return request<Record<string, unknown>>(
    `/api/winners/${id}/verify`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const markWinnerPaid = async (
  token: string,
  id: string,
  payload: { payoutReference?: string; payoutProvider?: string }
) => {
  return request<Record<string, unknown>>(
    `/api/winners/${id}/mark-paid`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
};

export const fetchNotifications = async (token: string, params: ListQueryParams = {}) => {
  return request<PaginatedData<Notification>>(`/api/notifications${buildQuery(params)}`, {}, token);
};

export const markNotificationRead = async (token: string, id: string) => {
  return request<Record<string, unknown>>(
    `/api/notifications/${id}/read`,
    {
      method: 'PATCH',
    },
    token
  );
};

export const markAllNotificationsRead = async (token: string) => {
  return request<{ updatedCount: number }>(
    '/api/notifications/read-all',
    {
      method: 'POST',
    },
    token
  );
};

export const fetchMyCharityImpact = async (token: string) => {
  return request<CharityImpactData>('/api/charities/my-impact', {}, token);
};

export const fetchCharityContributions = async (token: string, params: ListQueryParams = {}) => {
  return request<PaginatedData<CharityContribution>>(`/api/charities/contributions${buildQuery(params)}`, {}, token);
};

export const fetchAdminUsers = async (token: string) => {
  if (!isBackendConfigured) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, subscription_status, subscription_plan, subscription_ends_at')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Failed to fetch users');
    }

    return { items: (data || []) as AdminUser[] };
  }

  return request<{ items: AdminUser[] }>('/api/admin/users', {}, token);
};

export const updateAdminUser = async (
  token: string,
  id: string,
  payload: Partial<Pick<AdminUser, 'role' | 'is_active' | 'subscription_status' | 'subscription_plan'>>
) => {
  return request<Record<string, unknown>>(
    `/api/admin/users/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
};
