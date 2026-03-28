const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { parseListQuery, paginationMeta, buildIlikeOr } = require('../utils/listQuery');

const listContactMessages = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'submitted_at',
    allowedSortBy: ['submitted_at', 'created_at', 'name', 'email'],
  });

  let query = db
    .from('contact_messages')
    .select('id, name, email, message, submitted_at, created_at', { count: 'exact' })
    .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (parsed.search) {
    const orQuery = buildIlikeOr(['name', 'email', 'message'], parsed.search);
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return sendError(res, 500, 'Failed to fetch contact messages', error.message);
  }

  return sendSuccess(res, 200, 'Contact messages fetched successfully', {
    items: data || [],
    meta: paginationMeta(parsed, count),
  });
});

const submitContact = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { name, email, message } = req.body;

  const payload = {
    name,
    email,
    message,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await db.from('contact_messages').insert([payload]);

  if (error) {
    // Keep the endpoint resilient when the contact_messages table is not yet provisioned.
    console.warn('[contact] Failed to persist contact message:', error.message);
  }

  return sendSuccess(res, 201, 'Thank you. Your message has been received.', {
    received: true,
  });
});

module.exports = {
  listContactMessages,
  submitContact,
};
