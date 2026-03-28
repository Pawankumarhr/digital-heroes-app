const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { parseListQuery, paginationMeta, buildIlikeOr } = require('../utils/listQuery');
const { logAuditEvent } = require('../utils/auditLogger');
const env = require('../config/env');
const { createNotification, notifyMany } = require('../utils/notificationService');

const MAX_NUMBER = 45;
const DRAW_SIZE = 5;
const TIER_SHARE = {
  5: 0.4,
  4: 0.35,
  3: 0.25,
};

const parseWinningNumbers = (value) => {
  if (!Array.isArray(value)) {
    return null;
  }

  const numbers = value.map((entry) => Number(entry));
  if (
    numbers.length !== DRAW_SIZE ||
    numbers.some((entry) => !Number.isInteger(entry) || entry < 1 || entry > MAX_NUMBER)
  ) {
    return null;
  }

  const unique = Array.from(new Set(numbers));
  if (unique.length !== DRAW_SIZE) {
    return null;
  }

  return unique.sort((a, b) => a - b);
};

const nextSeed = (seed) => {
  return (seed * 1664525 + 1013904223) % 4294967296;
};

const randomInt = (seed, maxExclusive) => {
  const next = nextSeed(seed);
  return {
    seed: next,
    value: next % maxExclusive,
  };
};

const generateRandomWinningNumbers = (seed = Date.now()) => {
  let currentSeed = Number(seed) || Date.now();
  const picked = new Set();

  while (picked.size < DRAW_SIZE) {
    const next = randomInt(currentSeed, MAX_NUMBER);
    currentSeed = next.seed;
    picked.add(next.value + 1);
  }

  return {
    numbers: Array.from(picked).sort((a, b) => a - b),
    seed: currentSeed,
  };
};

const generateAlgorithmWinningNumbers = (scores, seed = Date.now()) => {
  const frequency = new Map();

  for (const score of scores) {
    const points = Number(score.stableford_points ?? score.score_value ?? score.score);
    if (!Number.isInteger(points) || points < 1 || points > MAX_NUMBER) {
      continue;
    }
    frequency.set(points, (frequency.get(points) || 0) + 1);
  }

  const ranked = Array.from(frequency.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0] - b[0];
    })
    .map(([points]) => points);

  const selected = ranked.slice(0, DRAW_SIZE);

  if (selected.length < DRAW_SIZE) {
    const randomFill = generateRandomWinningNumbers(seed).numbers;
    for (const n of randomFill) {
      if (!selected.includes(n)) {
        selected.push(n);
      }
      if (selected.length >= DRAW_SIZE) {
        break;
      }
    }
  }

  return {
    numbers: selected.slice(0, DRAW_SIZE).sort((a, b) => a - b),
    seed,
  };
};

const normalizeDraw = (row) => {
  if (!row) {
    return row;
  }
  return {
    ...row,
    winning_numbers: Array.isArray(row.winning_numbers) ? row.winning_numbers : [],
    entries: Array.isArray(row.entries) ? row.entries : [],
    algorithm_config:
      row.algorithm_config && typeof row.algorithm_config === 'object' ? row.algorithm_config : {},
  };
};

const listDraws = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'draw_month',
    allowedSortBy: ['draw_month', 'title', 'status', 'created_at'],
  });

  let query = db
    .from('draws')
    .select('*', { count: 'exact' })
    .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (parsed.search) {
    const orQuery = buildIlikeOr(['title', 'status', 'draw_type'], parsed.search);
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  if (req.query.status) {
    query = query.eq('status', String(req.query.status).trim().toLowerCase());
  }

  const { data, error, count } = await query;

  if (error) {
    return sendError(res, 500, 'Failed to fetch draws', error.message);
  }

  return sendSuccess(res, 200, 'Draws fetched successfully', {
    items: (data || []).map(normalizeDraw),
    meta: {
      ...paginationMeta(parsed, count),
      filters: {
        status: String(req.query.status || '').trim() || null,
      },
    },
  });
});

const createDraw = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const payload = {
    ...req.body,
    status: req.body.status || 'draft',
    draw_type: req.body.draw_type || 'random',
  };

  const { data, error } = await db.from('draws').insert([payload]).select('*').single();

  if (error) {
    return sendError(res, 400, 'Failed to create draw', error.message);
  }

  await logAuditEvent(req, {
    action: 'create',
    entityType: 'draw',
    entityId: data?.id,
    details: { new: data },
  });

  return sendSuccess(res, 201, 'Draw created successfully', normalizeDraw(data));
});

const getDrawById = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('draws').select('*').eq('id', req.params.id).maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid draw id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Draw not found');
  }

  return sendSuccess(res, 200, 'Draw fetched successfully', normalizeDraw(data));
});

const updateDraw = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db
    .from('draws')
    .update(req.body)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  if (error) {
    return sendError(res, 400, 'Failed to update draw', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Draw not found');
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'draw',
    entityId: data?.id,
    details: { patch: req.body, updated: data },
  });

  return sendSuccess(res, 200, 'Draw updated successfully', normalizeDraw(data));
});

const deleteDraw = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('draws').delete().eq('id', req.params.id).select('id').maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid draw id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Draw not found');
  }

  await logAuditEvent(req, {
    action: 'delete',
    entityType: 'draw',
    entityId: data?.id || req.params.id,
    details: { deletedId: data?.id || req.params.id },
  });

  return sendSuccess(res, 200, 'Draw deleted');
});

const calculatePrizePool = async (db, draw) => {
  const { data, error } = await db.from('profiles').select('*').eq('role', 'user').eq('is_active', true);

  if (error || !Array.isArray(data)) {
    return {
      prizePoolCents: Number(draw.prize_pool_cents) || 0,
      eligibleUsers: [],
    };
  }

  const activeSubscribers = data.filter((profile) => {
    if (Object.prototype.hasOwnProperty.call(profile, 'subscription_status')) {
      return profile.subscription_status === 'active';
    }
    return true;
  });

  const monthlyFee = Number(env.stripeMonthlyAmountCents) || 1999;

  const grossPool = activeSubscribers.reduce((sum, profile) => {
    const contributionPercent = Number(profile.charity_contribution_percent);
    const safeContribution = Number.isFinite(contributionPercent)
      ? Math.min(100, Math.max(10, contributionPercent))
      : 10;
    const prizeShare = Math.round((monthlyFee * (100 - safeContribution)) / 100);
    return sum + prizeShare;
  }, 0);

  const rollover = Number(draw.prize_pool_cents) || 0;

  return {
    prizePoolCents: grossPool + rollover,
    eligibleUsers: activeSubscribers,
  };
};

const buildLatestFiveMap = (scores) => {
  const grouped = new Map();

  for (const score of scores) {
    const userId = score.user_id;
    if (!userId) {
      continue;
    }

    if (!grouped.has(userId)) {
      grouped.set(userId, []);
    }

    const points = Number(score.stableford_points ?? score.score_value ?? score.score);
    if (!Number.isFinite(points)) {
      continue;
    }

    grouped.get(userId).push({
      score_date: score.score_date,
      created_at: score.created_at,
      points,
    });
  }

  const latestFive = new Map();

  for (const [userId, rows] of grouped.entries()) {
    rows.sort((a, b) => {
      const aDate = new Date(a.score_date || a.created_at || 0).getTime();
      const bDate = new Date(b.score_date || b.created_at || 0).getTime();
      return bDate - aDate;
    });

    latestFive.set(userId, rows.slice(0, 5));
  }

  return latestFive;
};

const pickCharityForUser = (userId, profilesById, charities) => {
  const profile = profilesById.get(userId);
  const preferred = profile?.preferred_charity_id;
  if (preferred && charities.some((c) => c.id === preferred)) {
    return preferred;
  }
  return charities[0]?.id || null;
};

const executeDrawEngine = async (db, draw, options = {}) => {
  const seed = Number(options.seed) || Date.now();
  const overrideWinningNumbers = parseWinningNumbers(options.winningNumbers);

  const [scoresRes, charitiesRes] = await Promise.all([
    db.from('scores').select('*').order('score_date', { ascending: false }),
    db.from('charities').select('id, name').order('created_at', { ascending: true }),
  ]);

  if (scoresRes.error) {
    throw new Error(`Failed to load scores: ${scoresRes.error.message}`);
  }

  if (charitiesRes.error) {
    throw new Error(`Failed to load charities: ${charitiesRes.error.message}`);
  }

  const scores = scoresRes.data || [];
  const charities = charitiesRes.data || [];

  if (charities.length === 0) {
    throw new Error('At least one charity is required before running a draw');
  }

  const winningResult = overrideWinningNumbers
    ? { numbers: overrideWinningNumbers, seed }
    : draw.draw_type === 'algorithm'
      ? generateAlgorithmWinningNumbers(scores, seed)
      : generateRandomWinningNumbers(seed);

  const winningNumbers = winningResult.numbers;

  const latestFiveMap = buildLatestFiveMap(scores);

  const { data: profilesData } = await db.from('profiles').select('*');
  const profilesById = new Map((profilesData || []).map((profile) => [profile.id, profile]));

  const { prizePoolCents } = await calculatePrizePool(db, draw);

  const entryPreview = [];
  const winnersRaw = [];

  for (const [userId, rows] of latestFiveMap.entries()) {
    const picks = rows.map((row) => Number(row.points));
    const matched = picks.filter((value) => winningNumbers.includes(value)).length;

    entryPreview.push({ user_id: userId, picks, matched_numbers: matched });

    if (matched >= 3) {
      winnersRaw.push({
        user_id: userId,
        matched_numbers: matched,
        tier: matched,
        charity_id: pickCharityForUser(userId, profilesById, charities),
      });
    }
  }

  const winnersByTier = {
    5: winnersRaw.filter((row) => row.tier === 5),
    4: winnersRaw.filter((row) => row.tier === 4),
    3: winnersRaw.filter((row) => row.tier === 3),
  };

  let rolloverCents = 0;
  for (const tier of [5, 4, 3]) {
    const tierPool = Math.floor(prizePoolCents * TIER_SHARE[tier]);
    const bucket = winnersByTier[tier];

    if (!bucket.length) {
      rolloverCents += tierPool;
      continue;
    }

    const perWinner = Math.floor(tierPool / bucket.length);
    for (const winner of bucket) {
      winner.payout_amount_cents = perWinner;
      winner.verification_status = 'pending';
      winner.payout_status = 'pending';
    }
  }

  return {
    winningNumbers,
    randomSeed: winningResult.seed,
    prizePoolCents,
    rolloverCents,
    entries: entryPreview,
    winners: winnersRaw,
  };
};

const simulateDraw = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data: draw, error } = await db.from('draws').select('*').eq('id', req.params.id).maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid draw id', error.message);
  }

  if (!draw) {
    return sendError(res, 404, 'Draw not found');
  }

  const simulation = await executeDrawEngine(db, draw, req.body || {});

  const updatedPayload = {
    winning_numbers: simulation.winningNumbers,
    entries: simulation.entries,
    random_seed: simulation.randomSeed,
    prize_pool_cents: simulation.rolloverCents,
    simulated_at: new Date().toISOString(),
    status: 'simulated',
    algorithm_config: {
      ...(draw.algorithm_config || {}),
      mode: 'simulation',
      prize_pool_cents: simulation.prizePoolCents,
      rollover_cents: simulation.rolloverCents,
      winners_count: simulation.winners.length,
    },
  };

  const { data: updated, error: updateError } = await db
    .from('draws')
    .update(updatedPayload)
    .eq('id', draw.id)
    .select('*')
    .maybeSingle();

  if (updateError) {
    return sendError(res, 400, 'Failed to save draw simulation', updateError.message);
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'draw',
    entityId: draw.id,
    details: {
      operation: 'simulate',
      winning_numbers: simulation.winningNumbers,
      winners_count: simulation.winners.length,
      prize_pool_cents: simulation.prizePoolCents,
      rollover_cents: simulation.rolloverCents,
    },
  });

  return sendSuccess(res, 200, 'Draw simulated successfully', {
    draw: normalizeDraw(updated),
    summary: {
      winnersCount: simulation.winners.length,
      prizePoolCents: simulation.prizePoolCents,
      rolloverCents: simulation.rolloverCents,
    },
    winnersPreview: simulation.winners,
  });
});

const runDraw = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data: draw, error } = await db.from('draws').select('*').eq('id', req.params.id).maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid draw id', error.message);
  }

  if (!draw) {
    return sendError(res, 404, 'Draw not found');
  }

  const outcome = await executeDrawEngine(db, draw, req.body || {});

  await db.from('winners').delete().eq('draw_id', draw.id);

  let winners = [];
  if (outcome.winners.length > 0) {
    const rows = outcome.winners.map((winner) => ({
      draw_id: draw.id,
      user_id: winner.user_id,
      charity_id: winner.charity_id,
      matched_numbers: winner.matched_numbers,
      tier: winner.tier,
      payout_amount_cents: winner.payout_amount_cents || 0,
      verification_status: 'pending',
      payout_status: 'pending',
    }));

    const winnerInsert = await db.from('winners').insert(rows).select('*');
    if (winnerInsert.error) {
      return sendError(res, 400, 'Failed to persist winners', winnerInsert.error.message);
    }
    winners = winnerInsert.data || [];
  }

  const drawUpdatePayload = {
    winning_numbers: outcome.winningNumbers,
    entries: outcome.entries,
    random_seed: outcome.randomSeed,
    simulated_at: new Date().toISOString(),
    status: 'simulated',
    prize_pool_cents: outcome.rolloverCents,
    algorithm_config: {
      ...(draw.algorithm_config || {}),
      mode: 'run',
      winners_count: winners.length,
      prize_pool_cents: outcome.prizePoolCents,
      rollover_cents: outcome.rolloverCents,
      distribution: TIER_SHARE,
    },
  };

  const { data: updatedDraw, error: updateError } = await db
    .from('draws')
    .update(drawUpdatePayload)
    .eq('id', draw.id)
    .select('*')
    .maybeSingle();

  if (updateError) {
    return sendError(res, 400, 'Failed to update draw after run', updateError.message);
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'draw',
    entityId: draw.id,
    details: {
      operation: 'run',
      winning_numbers: outcome.winningNumbers,
      winners_count: winners.length,
      prize_pool_cents: outcome.prizePoolCents,
      rollover_cents: outcome.rolloverCents,
    },
  });

  return sendSuccess(res, 200, 'Draw executed successfully', {
    draw: normalizeDraw(updatedDraw),
    winners,
    summary: {
      winnersCount: winners.length,
      prizePoolCents: outcome.prizePoolCents,
      rolloverCents: outcome.rolloverCents,
    },
  });
});

const publishDraw = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data: draw, error } = await db.from('draws').select('*').eq('id', req.params.id).maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid draw id', error.message);
  }

  if (!draw) {
    return sendError(res, 404, 'Draw not found');
  }

  if (!Array.isArray(draw.winning_numbers) || draw.winning_numbers.length !== DRAW_SIZE) {
    return sendError(res, 400, 'Simulate or run this draw before publishing');
  }

  const publishAt = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from('draws')
    .update({
      status: 'published',
      published_at: publishAt,
    })
    .eq('id', draw.id)
    .select('*')
    .maybeSingle();

  if (updateError) {
    return sendError(res, 400, 'Failed to publish draw', updateError.message);
  }

  const winnersRes = await db
    .from('winners')
    .select('id, user_id, tier, payout_amount_cents')
    .eq('draw_id', draw.id);
  const winners = winnersRes.data || [];

  await createNotification(req, {
    channel: 'email',
    eventType: 'draw.published',
    subject: `Draw ${draw.title} published`,
    body: `Winning numbers: ${draw.winning_numbers.join(', ')}`,
    metadata: {
      drawId: draw.id,
      winningNumbers: draw.winning_numbers,
      winnersCount: winners.length,
    },
  });

  await notifyMany(
    req,
    winners.map((winner) => ({
      userId: winner.user_id,
      channel: 'email',
      eventType: 'winner.alert',
      subject: `You won in draw ${draw.title}`,
      body: `Tier ${winner.tier} winner. Payout: $${(Number(winner.payout_amount_cents || 0) / 100).toFixed(2)}`,
      metadata: {
        drawId: draw.id,
        winnerId: winner.id,
      },
    }))
  );

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'draw',
    entityId: draw.id,
    details: { operation: 'publish', published_at: publishAt },
  });

  return sendSuccess(res, 200, 'Draw published successfully', normalizeDraw(updated));
});

const closeDraw = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db
    .from('draws')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  if (error) {
    return sendError(res, 400, 'Failed to close draw', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Draw not found');
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'draw',
    entityId: data.id,
    details: { operation: 'close' },
  });

  return sendSuccess(res, 200, 'Draw closed successfully', normalizeDraw(data));
});

module.exports = {
  listDraws,
  createDraw,
  getDrawById,
  updateDraw,
  deleteDraw,
  simulateDraw,
  runDraw,
  publishDraw,
  closeDraw,
};
