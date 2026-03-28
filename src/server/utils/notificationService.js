const { getDbClient } = require('./supabaseRequest');

const safeStringify = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
};

const isMissingSchemaResource = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find') || message.includes('relation');
};

const createNotification = async (req, payload) => {
  try {
    const db = getDbClient(req);
    const row = {
      user_id: payload.userId || null,
      channel: payload.channel || 'email',
      event_type: payload.eventType,
      subject: payload.subject || null,
      body: payload.body || null,
      status: payload.status || 'queued',
      metadata: payload.metadata || {},
      created_at: new Date().toISOString(),
    };

    const { error } = await db.from('notifications').insert([row]);

    if (error) {
      if (!isMissingSchemaResource(error)) {
        console.warn('[notification] Failed to persist notification:', error.message);
      }
      return;
    }
  } catch (error) {
    console.warn('[notification] Unexpected notification error:', error.message);
  }
};

const notifyMany = async (req, rows) => {
  for (const row of rows) {
    await createNotification(req, row);
  }
};

module.exports = {
  createNotification,
  notifyMany,
  safeStringify,
};
