const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { parseListQuery, paginationMeta, buildIlikeOr } = require('../utils/listQuery');

const listAuditLogs = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'created_at',
    allowedSortBy: ['created_at', 'action', 'entity_type', 'actor_email'],
    defaultPageSize: 25,
  });

  let query = db
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (parsed.search) {
    const orQuery = buildIlikeOr(['actor_email', 'entity_type', 'action'], parsed.search);
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  if (req.query.action) {
    query = query.eq('action', String(req.query.action).trim().toLowerCase());
  }

  if (req.query.entityType) {
    query = query.eq('entity_type', String(req.query.entityType).trim().toLowerCase());
  }

  const { data, error, count } = await query;

  if (error) {
    return sendError(res, 500, 'Failed to fetch audit logs', error.message);
  }

  return sendSuccess(res, 200, 'Audit logs fetched successfully', {
    items: data || [],
    meta: {
      ...paginationMeta(parsed, count),
      filters: {
        action: String(req.query.action || '').trim() || null,
        entityType: String(req.query.entityType || '').trim() || null,
      },
    },
  });
});

module.exports = {
  listAuditLogs,
};
