const { supabaseAdmin, supabasePublic, getSupabaseForToken } = require('../config/supabase');

const getDbClient = (req) => {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  if (req && req.authToken) {
    return getSupabaseForToken(req.authToken);
  }

  return supabasePublic;
};

module.exports = {
  getDbClient,
};
