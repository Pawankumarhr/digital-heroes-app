const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

if (!env.supabaseUrl || !env.supabaseAnonKey) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_ANON_KEY is missing in backend/.env');
}

const supabasePublic = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false },
});

const supabaseAdmin = env.supabaseServiceRoleKey
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })
  : null;

const getSupabaseForToken = (token) => {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
};

module.exports = {
  supabasePublic,
  supabaseAdmin,
  getSupabaseForToken,
};