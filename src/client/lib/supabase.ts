import { createClient } from '@supabase/supabase-js';
import { appConfig } from '../config/appConfig';

const supabaseUrl = appConfig.supabaseUrl;
const supabaseAnonKey = appConfig.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
