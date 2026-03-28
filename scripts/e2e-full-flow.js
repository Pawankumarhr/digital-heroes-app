require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const base = 'http://localhost:5000';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nowStamp = Date.now();

const adminCreds = {
  email: `e2e-admin-${nowStamp}@gmail.com`,
  password: 'Password123!',
  name: 'E2E Admin',
};

const userCreds = {
  email: `e2e-user-${nowStamp}@gmail.com`,
  password: 'Password123!',
  name: 'E2E User',
};

const buildDrawMonthAtOffset = (offsetDays) => {
  const date = new Date(Date.UTC(2031, 0, 1 + offsetDays));
  return date.toISOString().slice(0, 10);
};

const assert = (condition, label, details) => {
  if (!condition) {
    const extra = details ? ` | ${details}` : '';
    throw new Error(`ASSERT_FAIL: ${label}${extra}`);
  }
  console.log(`PASS: ${label}`);
};

const req = async (path, init = {}) => {
  const headers = {
    'content-type': 'application/json',
    ...(init.headers || {}),
  };

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
};

const createAuthUserWithProfile = async ({ email, password, name, role, charityContributionPercent }) => {
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (created.error) {
    throw new Error(`createUser failed for ${email}: ${created.error.message}`);
  }

  const userId = created.data?.user?.id;
  if (!userId) {
    throw new Error(`createUser missing id for ${email}`);
  }

  const upsert = await supabase.from('profiles').upsert({
    id: userId,
    email,
    full_name: name,
    role,
    is_active: true,
    charity_contribution_percent: charityContributionPercent,
    updated_at: new Date().toISOString(),
  });

  if (upsert.error) {
    throw new Error(`profile upsert failed for ${email}: ${upsert.error.message}`);
  }

  return userId;
};

const loginGetToken = async ({ email, password }) => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: email, password }),
  });

  assert(login.ok, `login ${email}`, JSON.stringify(login.body));

  const token = login.body?.data?.token;
  assert(Boolean(token), `token available ${email}`);
  return token;
};

const createDrawWithRetry = async (authAdmin) => {
  for (let offset = 0; offset < 365; offset += 1) {
    const drawMonth = buildDrawMonthAtOffset((nowStamp % 365) + offset);
    const candidate = await req('/api/draws', {
      method: 'POST',
      headers: authAdmin,
      body: JSON.stringify({
        title: `E2E Draw ${nowStamp}-${offset}`,
        draw_month: drawMonth,
        status: 'draft',
        draw_type: 'random',
      }),
    });

    if (candidate.ok) {
      return candidate;
    }

    const errorText = JSON.stringify(candidate.body || {});
    if (!/draws_draw_month_key|duplicate key/i.test(errorText)) {
      return candidate;
    }
  }

  return {
    ok: false,
    status: 409,
    body: {
      success: false,
      message: 'Failed to create draw',
      errors: 'No unique draw_month found for retry window',
    },
  };
};

(async () => {
  console.log('E2E: starting full flow');

  const adminId = await createAuthUserWithProfile({
    ...adminCreds,
    role: 'admin',
    charityContributionPercent: 10,
  });
  const userId = await createAuthUserWithProfile({
    ...userCreds,
    role: 'user',
    charityContributionPercent: 25,
  });

  console.log(`E2E: created admin=${adminId} user=${userId}`);

  const adminToken = await loginGetToken(adminCreds);
  const userToken = await loginGetToken(userCreds);

  const authAdmin = { Authorization: `Bearer ${adminToken}` };
  const authUser = { Authorization: `Bearer ${userToken}` };

  const charityCreate = await req('/api/charities', {
    method: 'POST',
    headers: authAdmin,
    body: JSON.stringify({
      name: `E2E Charity ${nowStamp}`,
      slug: `e2e-charity-${nowStamp}`,
    }),
  });
  assert(charityCreate.ok, 'create charity', JSON.stringify(charityCreate.body));

  const charityId = charityCreate.body?.data?.id;
  assert(Boolean(charityId), 'charity id available');

  const prefUpdate = await req('/api/auth/preferences', {
    method: 'PATCH',
    headers: authUser,
    body: JSON.stringify({ preferredCharityId: charityId, charityContributionPercent: 25 }),
  });
  assert(prefUpdate.ok, 'set user charity preferences', JSON.stringify(prefUpdate.body));

  const seededScores = [1, 2, 3, 4, 5];
  for (const points of seededScores) {
    const scoreCreate = await req('/api/scores', {
      method: 'POST',
      headers: authAdmin,
      body: JSON.stringify({
        user_id: userId,
        score_value: points,
        stableford_points: points,
        course_name: 'E2E Course',
        score_date: new Date().toISOString(),
      }),
    });
    assert(scoreCreate.ok, `seed score ${points}`, JSON.stringify(scoreCreate.body));
  }

  const drawCreate = await createDrawWithRetry(authAdmin);
  assert(drawCreate.ok, 'create draw', JSON.stringify(drawCreate.body));

  const drawId = drawCreate.body?.data?.id;
  assert(Boolean(drawId), 'draw id available');

  const runDraw = await req(`/api/draws/${drawId}/run`, {
    method: 'POST',
    headers: authAdmin,
    body: JSON.stringify({ winningNumbers: [1, 2, 3, 4, 5], seed: 12345 }),
  });
  assert(runDraw.ok, 'run draw', JSON.stringify(runDraw.body));

  const winnersFromRun = runDraw.body?.data?.winners || [];
  assert(Array.isArray(winnersFromRun), 'run returns winners array');
  assert(winnersFromRun.length >= 1, 'run produced at least one winner');

  const publishDraw = await req(`/api/draws/${drawId}/publish`, {
    method: 'POST',
    headers: authAdmin,
    body: JSON.stringify({}),
  });
  assert(publishDraw.ok, 'publish draw', JSON.stringify(publishDraw.body));

  const listWinners = await req('/api/winners?page=1&pageSize=100', {
    method: 'GET',
    headers: authAdmin,
  });
  assert(listWinners.ok, 'list winners after publish', JSON.stringify(listWinners.body));

  const winner = (listWinners.body?.data?.items || []).find((item) => item.user_id === userId && item.draw_id === drawId);
  assert(Boolean(winner), 'winner exists for seeded user');

  const winnerId = winner.id;

  const approveWinner = await req(`/api/winners/${winnerId}/verify`, {
    method: 'POST',
    headers: authAdmin,
    body: JSON.stringify({ decision: 'approved', notes: 'E2E approved' }),
  });
  assert(approveWinner.ok, 'approve winner', JSON.stringify(approveWinner.body));
  const verificationStatus = String(approveWinner.body?.data?.verification_status || '').toLowerCase();
  assert(
    ['approved', 'verified', 'accepted'].includes(verificationStatus),
    'winner verification status approved/compatible',
    verificationStatus
  );

  const markPaid = await req(`/api/winners/${winnerId}/mark-paid`, {
    method: 'POST',
    headers: authAdmin,
    body: JSON.stringify({ payoutReference: `E2E-${nowStamp}`, payoutProvider: 'manual' }),
  });
  assert(markPaid.ok, 'mark winner paid', JSON.stringify(markPaid.body));
  const payoutStatus = String(markPaid.body?.data?.payout_status || '').toLowerCase();
  assert(
    ['paid', 'completed', 'processed', 'success'].includes(payoutStatus),
    'winner payout status paid/compatible',
    payoutStatus
  );

  const contributionLedger = await req(`/api/charities/contributions?page=1&pageSize=50&userId=${userId}`, {
    method: 'GET',
    headers: authAdmin,
  });
  assert(contributionLedger.ok, 'fetch charity contribution ledger', JSON.stringify(contributionLedger.body));

  const ledgerItems = contributionLedger.body?.data?.items || [];
  const ledgerEntry = ledgerItems.find((entry) => entry.winner_id === winnerId);

  assert(Boolean(ledgerEntry), 'ledger contains winner contribution entry');

  const impact = await req('/api/charities/my-impact', {
    method: 'GET',
    headers: authUser,
  });
  assert(impact.ok, 'fetch user charity impact', JSON.stringify(impact.body));

  const impactData = impact.body?.data || {};
  const charityAmount = Number(ledgerEntry.charity_amount_cents || 0) / 100;
  const playerAmount = Number(ledgerEntry.player_amount_cents || 0) / 100;

  assert(Number(impactData.totalCharityAmount || 0) >= charityAmount, 'impact charity total includes ledger amount');
  assert(Number(impactData.totalPlayerAmount || 0) >= playerAmount, 'impact player total includes ledger amount');
  assert(Number(impactData.recordsCount || 0) >= 1, 'impact records count updated');

  console.log('E2E_RESULT: SUCCESS');
  console.log(
    JSON.stringify(
      {
        drawId,
        winnerId,
        charityId,
        ledgerEntry: {
          contribution_percent: ledgerEntry.contribution_percent,
          total_payout_cents: ledgerEntry.total_payout_cents,
          charity_amount_cents: ledgerEntry.charity_amount_cents,
          player_amount_cents: ledgerEntry.player_amount_cents,
        },
        impact: {
          totalCharityAmount: impactData.totalCharityAmount,
          totalPlayerAmount: impactData.totalPlayerAmount,
          totalPayoutAmount: impactData.totalPayoutAmount,
          averageContributionPercent: impactData.averageContributionPercent,
          recordsCount: impactData.recordsCount,
        },
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error('E2E_RESULT: FAILED');
  console.error(error?.message || error);
  process.exit(1);
});
