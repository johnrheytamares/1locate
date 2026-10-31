import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** False when .env is missing or malformed. The app then keeps using bundled local data. */
export const isSupabaseConfigured = isHttpsUrl(url) && anonKey.length > 0;

/**
 * Public client using the anon key only. Table access is limited by Row Level Security.
 * There is no login yet, so no session is stored.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
