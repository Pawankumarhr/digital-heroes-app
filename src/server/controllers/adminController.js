const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { logAuditEvent } = require('../utils/auditLogger');

const hasMissingSubscriptionColumnError = (error) => {
  const message = String(error?.message || '');
  return /subscription_status|subscription_plan|subscription_ends_at/i.test(message);
};

const listUsers = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  let { data, error } = await db
    .from('profiles')
    .select('id, full_name, email, role, is_active, preferred_charity_id, charity_contribution_percent, created_at, updated_at, subscription_status, subscription_plan, subscription_ends_at')
    .order('created_at', { ascending: false });

  if (error && hasMissingSubscriptionColumnError(error)) {
    const fallback = await db
      .from('profiles')
      .select('id, full_name, email, role, is_active, preferred_charity_id, charity_contribution_percent, created_at, updated_at')
      .order('created_at', { ascending: false });

    data = (fallback.data || []).map((row) => ({
      ...row,
      subscription_status: null,
      subscription_plan: null,
      subscription_ends_at: null,
    }));
    error = fallback.error;
  }

  if (error) {
    return sendError(res, 500, 'Failed to fetch users', error.message);
  }

  return sendSuccess(res, 200, 'Users fetched successfully', {
    items: data || [],
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const patch = {};
  const body = req.body || {};

  if (body.role !== undefined) {
    const role = String(body.role || '').trim().toLowerCase();
    if (!['user', 'admin'].includes(role)) {
      return sendError(res, 400, 'role must be user or admin');
    }
    patch.role = role;
  }

  if (body.is_active !== undefined) {
    patch.is_active = Boolean(body.is_active);
  }

  if (body.subscription_status !== undefined) {
    patch.subscription_status = String(body.subscription_status || '').trim().toLowerCase() || null;
  }

  if (body.subscription_plan !== undefined) {
    patch.subscription_plan = String(body.subscription_plan || '').trim().toLowerCase() || null;
  }

  if (Object.keys(patch).length === 0) {
    return sendError(res, 400, 'No valid fields provided for update');
  }

  let { data, error } = await db
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select('id, full_name, email, role, is_active, subscription_status, subscription_plan, subscription_ends_at')
    .maybeSingle();

  if (error && hasMissingSubscriptionColumnError(error)) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.subscription_status;
    delete fallbackPatch.subscription_plan;

    if (Object.keys(fallbackPatch).length === 0) {
      return sendError(
        res,
        400,
        'Profile subscription fields are not available yet. Run the latest migration first.'
      );
    }

    const fallback = await db
      .from('profiles')
      .update(fallbackPatch)
      .eq('id', req.params.id)
      .select('id, full_name, email, role, is_active')
      .maybeSingle();

    data = fallback.data
      ? {
          ...fallback.data,
          subscription_status: null,
          subscription_plan: null,
          subscription_ends_at: null,
        }
      : null;
    error = fallback.error;
  }

  if (error) {
    return sendError(res, 400, 'Failed to update user', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'User not found');
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'profile',
    entityId: data.id,
    details: { patch },
  });

  return sendSuccess(res, 200, 'User updated successfully', data);
});

module.exports = {
  listUsers,
  updateUser,
};
