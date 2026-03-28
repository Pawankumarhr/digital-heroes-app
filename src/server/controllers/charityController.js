const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { parseListQuery, paginationMeta, buildIlikeOr } = require('../utils/listQuery');
const { logAuditEvent } = require('../utils/auditLogger');

const isMissingSchemaResource = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find') || message.includes('relation');
};

const listPublicCharities = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db
    .from('charities')
    .select('id, name, slug')
    .order('name', { ascending: true });

  if (error) {
    return sendError(res, 500, 'Failed to fetch public charities', error.message);
  }

  return sendSuccess(res, 200, 'Public charities fetched successfully', {
    items: data || [],
  });
});

const listCharities = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'created_at',
    allowedSortBy: ['created_at', 'name', 'slug'],
  });

  let query = db
    .from('charities')
    .select('*', { count: 'exact' })
    .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (parsed.search) {
    const orQuery = buildIlikeOr(['name', 'slug'], parsed.search);
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return sendError(res, 500, 'Failed to fetch charities', error.message);
  }

  return sendSuccess(res, 200, 'Charities fetched successfully', {
    items: data || [],
    meta: paginationMeta(parsed, count),
  });
});

const listCharityContributions = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'created_at',
    allowedSortBy: ['created_at', 'contribution_percent', 'charity_amount_cents', 'player_amount_cents'],
  });

  let query = db
    .from('charity_contributions')
    .select('*', { count: 'exact' })
    .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  } else if (req.query.userId) {
    query = query.eq('user_id', String(req.query.userId).trim());
  }

  if (req.query.charityId) {
    query = query.eq('charity_id', String(req.query.charityId).trim());
  }

  if (req.query.drawId) {
    query = query.eq('draw_id', String(req.query.drawId).trim());
  }

  if (parsed.search) {
    const orQuery = buildIlikeOr(['user_id', 'charity_id', 'draw_id', 'status'], parsed.search);
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    if (isMissingSchemaResource(error)) {
      return sendSuccess(res, 200, 'Charity contributions table not configured yet', {
        items: [],
        meta: paginationMeta(parsed, 0),
      });
    }
    return sendError(res, 500, 'Failed to fetch charity contributions', error.message);
  }

  return sendSuccess(res, 200, 'Charity contributions fetched successfully', {
    items: data || [],
    meta: paginationMeta(parsed, count),
  });
});

const getMyCharityImpact = asyncHandler(async (req, res) => {
  const db = getDbClient(req);

  const { data, error } = await db
    .from('charity_contributions')
    .select('charity_amount_cents, player_amount_cents, total_payout_cents, contribution_percent, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (!isMissingSchemaResource(error)) {
      return sendError(res, 500, 'Failed to fetch charity impact', error.message);
    }

    return sendSuccess(res, 200, 'Charity impact unavailable until contributions table is configured', {
      totalCharityAmount: 0,
      totalPlayerAmount: 0,
      totalPayoutAmount: 0,
      averageContributionPercent: Number(req.user.charityContributionPercent || 10),
      recordsCount: 0,
      lastContributionAt: null,
    });
  }

  const totals = (data || []).reduce(
    (acc, row) => {
      acc.totalCharityAmountCents += Number(row.charity_amount_cents || 0);
      acc.totalPlayerAmountCents += Number(row.player_amount_cents || 0);
      acc.totalPayoutAmountCents += Number(row.total_payout_cents || 0);
      acc.percentSum += Number(row.contribution_percent || 0);
      return acc;
    },
    {
      totalCharityAmountCents: 0,
      totalPlayerAmountCents: 0,
      totalPayoutAmountCents: 0,
      percentSum: 0,
    }
  );

  const count = (data || []).length;

  return sendSuccess(res, 200, 'Charity impact fetched successfully', {
    totalCharityAmount: totals.totalCharityAmountCents / 100,
    totalPlayerAmount: totals.totalPlayerAmountCents / 100,
    totalPayoutAmount: totals.totalPayoutAmountCents / 100,
    averageContributionPercent: count > 0 ? Number((totals.percentSum / count).toFixed(2)) : 0,
    recordsCount: count,
    lastContributionAt: count > 0 ? data[0].created_at : null,
  });
});

const createCharity = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('charities').insert([req.body]).select('*').single();

  if (error) {
    return sendError(res, 400, 'Failed to create charity', error.message);
  }

  await logAuditEvent(req, {
    action: 'create',
    entityType: 'charity',
    entityId: data?.id,
    details: { new: data },
  });

  return sendSuccess(res, 201, 'Charity created successfully', data);
});

const getCharityById = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('charities').select('*').eq('id', req.params.id).maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid charity id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Charity not found');
  }

  return sendSuccess(res, 200, 'Charity fetched successfully', data);
});

const updateCharity = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db
    .from('charities')
    .update(req.body)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  if (error) {
    return sendError(res, 400, 'Failed to update charity', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Charity not found');
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'charity',
    entityId: data?.id,
    details: { patch: req.body, updated: data },
  });

  return sendSuccess(res, 200, 'Charity updated successfully', data);
});

const deleteCharity = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('charities').delete().eq('id', req.params.id).select('id').maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid charity id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Charity not found');
  }

  await logAuditEvent(req, {
    action: 'delete',
    entityType: 'charity',
    entityId: data?.id || req.params.id,
    details: { deletedId: data?.id || req.params.id },
  });

  return sendSuccess(res, 200, 'Charity deleted');
});

module.exports = {
  listPublicCharities,
  listCharities,
  listCharityContributions,
  getMyCharityImpact,
  createCharity,
  getCharityById,
  updateCharity,
  deleteCharity,
};
