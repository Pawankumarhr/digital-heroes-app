const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { parseListQuery, paginationMeta, buildIlikeOr } = require('../utils/listQuery');
const { logAuditEvent } = require('../utils/auditLogger');

const isMissingColumnError = (error, columnName) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(`'${String(columnName).toLowerCase()}'`) && message.includes('could not find');
};

const normalizeScoreRow = (row) => {
  if (!row) {
    return row;
  }

  if (Object.prototype.hasOwnProperty.call(row, 'score_value')) {
    return row;
  }

  if (Object.prototype.hasOwnProperty.call(row, 'stableford_points')) {
    return {
      ...row,
      score_value: row.stableford_points,
    };
  }

  if (Object.prototype.hasOwnProperty.call(row, 'score')) {
    return {
      ...row,
      score_value: row.score,
    };
  }

  return row;
};

const trimToLatestFiveScores = async (db, userId) => {
  const { data, error } = await db
    .from('scores')
    .select('id, score_date, created_at')
    .eq('user_id', userId)
    .order('score_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error || !Array.isArray(data) || data.length <= 5) {
    return;
  }

  const staleIds = data.slice(5).map((row) => row.id).filter(Boolean);
  if (staleIds.length === 0) {
    return;
  }

  await db.from('scores').delete().in('id', staleIds);
};

const listScores = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'score_date',
    allowedSortBy: ['score_date', 'score_value', 'created_at', 'user_id'],
  });

  const sortBy = parsed.sortBy === 'score_value' ? 'stableford_points' : parsed.sortBy;

  let query = db
    .from('scores')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (req.query.userId) {
    query = query.eq('user_id', req.query.userId);
  }

  if (parsed.search) {
    const orQuery = buildIlikeOr(['user_id'], parsed.search);
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  let { data, error, count } = await query;

  if (error && isMissingColumnError(error, 'stableford_points')) {
    ({ data, error, count } = await db
      .from('scores')
      .select('*', { count: 'exact' })
      .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
      .range(parsed.from, parsed.to));
  }

  if (error) {
    return sendError(res, 500, 'Failed to fetch scores', error.message);
  }

  return sendSuccess(res, 200, 'Scores fetched successfully', {
    items: (data || []).map(normalizeScoreRow),
    meta: paginationMeta(parsed, count),
  });
});

const createScore = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  let payload = {
    ...req.body,
    course_name: String(req.body.course_name || 'General Course').trim(),
  };
  let { data, error } = await db.from('scores').insert([payload]).select('*').single();

  if (error && isMissingColumnError(error, 'score_value') && 'score_value' in payload) {
    payload = {
      ...payload,
      stableford_points: payload.score_value,
    };
    delete payload.score_value;
    ({ data, error } = await db.from('scores').insert([payload]).select('*').single());
  }

  if (error && isMissingColumnError(error, 'stableford_points') && 'stableford_points' in payload) {
    payload = {
      ...payload,
      score: payload.stableford_points,
    };
    delete payload.stableford_points;
    ({ data, error } = await db.from('scores').insert([payload]).select('*').single());
  }

  if (error) {
    return sendError(res, 400, 'Failed to create score', error.message);
  }

  await logAuditEvent(req, {
    action: 'create',
    entityType: 'score',
    entityId: data?.id,
    details: { new: data },
  });

  if (data?.user_id) {
    await trimToLatestFiveScores(db, data.user_id);
  }

  return sendSuccess(res, 201, 'Score created successfully', normalizeScoreRow(data));
});

const getScoreById = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('scores').select('*').eq('id', req.params.id).maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid score id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Score not found');
  }

  return sendSuccess(res, 200, 'Score fetched successfully', normalizeScoreRow(data));
});

const updateScore = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  let payload = { ...req.body };
  let { data, error } = await db
    .from('scores')
    .update(payload)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  if (error && isMissingColumnError(error, 'score_value') && 'score_value' in payload) {
    payload = {
      ...payload,
      stableford_points: payload.score_value,
    };
    delete payload.score_value;
    ({ data, error } = await db
      .from('scores')
      .update(payload)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle());
  }

  if (error && isMissingColumnError(error, 'stableford_points') && 'stableford_points' in payload) {
    payload = {
      ...payload,
      score: payload.stableford_points,
    };
    delete payload.stableford_points;
    ({ data, error } = await db
      .from('scores')
      .update(payload)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle());
  }

  if (error) {
    return sendError(res, 400, 'Failed to update score', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Score not found');
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'score',
    entityId: data?.id,
    details: { patch: req.body, updated: data },
  });

  return sendSuccess(res, 200, 'Score updated successfully', normalizeScoreRow(data));
});

const deleteScore = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('scores').delete().eq('id', req.params.id).select('id').maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid score id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Score not found');
  }

  await logAuditEvent(req, {
    action: 'delete',
    entityType: 'score',
    entityId: data?.id || req.params.id,
    details: { deletedId: data?.id || req.params.id },
  });

  return sendSuccess(res, 200, 'Score deleted');
});

module.exports = {
  listScores,
  createScore,
  getScoreById,
  updateScore,
  deleteScore,
};
