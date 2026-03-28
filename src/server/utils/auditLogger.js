const { getDbClient } = require('./supabaseRequest');

const logAuditEvent = async (req, payload) => {
  try {
    const db = getDbClient(req);

    const row = {
      actor_id: req.user?.id || null,
      actor_email: req.user?.email || null,
      actor_role: req.user?.role || null,
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId || null,
      details: payload.details || {},
      created_at: new Date().toISOString(),
    };

    const { error } = await db.from('audit_logs').insert([row]);

    if (error) {
      console.warn('[audit] Failed to persist audit log:', error.message);
    }
  } catch (error) {
    console.warn('[audit] Unexpected audit logging error:', error.message);
  }
};

module.exports = {
  logAuditEvent,
};
