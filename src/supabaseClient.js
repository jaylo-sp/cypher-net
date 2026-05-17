// Single Supabase client shared by storage.js (admin data) and auth.js
// (audience auth + watchlist + claims). Sharing avoids the "Multiple
// GoTrueClient instances" warning from supabase-js.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabase = !!(SUPABASE_URL && SUPABASE_KEY);
export const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  : null;
