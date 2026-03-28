const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { parseListQuery, paginationMeta, buildIlikeOr } = require('../utils/listQuery');

const isMissingSchemaResource = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find') || message.includes('relation');
};

const updateReadPayload = () => ({
  status: 'read',
  read_at: new Date().toISOString(),
});

const updateReadPayloadFallback = () => ({
  status: 'read',
});

const listNotifications = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'created_at',
    allowedSortBy: ['created_at', 'event_type', 'channel', 'status'],
  });

  let query = db
    .from('notifications')
    .select('*', { count: 'exact' })
    .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (parsed.search) {
    const orQuery = buildIlikeOr(['event_type', 'channel', 'status', 'subject'], parsed.search);
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  const { data, error, count } = await query;

  if (error) {
    if (isMissingSchemaResource(error)) {
      return sendSuccess(res, 200, 'Notifications table not configured yet', {
        items: [],
        meta: paginationMeta(parsed, 0),
      });
    }

    return sendError(res, 500, 'Failed to fetch notifications', error.message);
  }

  return sendSuccess(res, 200, 'Notifications fetched successfully', {
    items: data || [],
    meta: paginationMeta(parsed, count),
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  let query = db.from('notifications').update(updateReadPayload()).eq('id', req.params.id);

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  let { data, error } = await query.select('*').maybeSingle();

  if (error && /read_at/i.test(String(error.message || ''))) {
    let fallbackQuery = db.from('notifications').update(updateReadPayloadFallback()).eq('id', req.params.id);
    if (req.user.role !== 'admin') {
      fallbackQuery = fallbackQuery.eq('user_id', req.user.id);
    }
    const fallback = await fallbackQuery.select('*').maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingSchemaResource(error)) {
      return sendSuccess(res, 200, 'Notifications table not configured yet', null);
    }
    return sendError(res, 500, 'Failed to update notification', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Notification not found');
  }

  return sendSuccess(res, 200, 'Notification marked as read', data);
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  let query = db.from('notifications').update(updateReadPayload());

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  let { data, error } = await query.select('id');

  if (error && /read_at/i.test(String(error.message || ''))) {
    let fallbackQuery = db.from('notifications').update(updateReadPayloadFallback());
    if (req.user.role !== 'admin') {
      fallbackQuery = fallbackQuery.eq('user_id', req.user.id);
    }
    const fallback = await fallbackQuery.select('id');
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingSchemaResource(error)) {
      return sendSuccess(res, 200, 'Notifications table not configured yet', { updatedCount: 0 });
    }
    return sendError(res, 500, 'Failed to update notifications', error.message);
  }

  return sendSuccess(res, 200, 'Notifications marked as read', {
    updatedCount: Array.isArray(data) ? data.length : 0,
  });
});

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
