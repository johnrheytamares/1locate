import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** True for keys that bypass RLS. Those must never reach the browser. */
export function isPrivilegedKey(key: string): boolean {
  return key.startsWith('sb_secret_') || jwtRole(key) === 'service_role';
}

export type ConfigProblem = 'missing' | 'privileged-key' | null;

export function configProblem(url: string, key: string): ConfigProblem {
  if (!isHttpsUrl(url) || key.length === 0) return 'missing';
  if (isPrivilegedKey(key)) return 'privileged-key';
  return null;
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const supabaseConfigProblem = configProblem(url, anonKey);

export const supabase: SupabaseClient | null = supabaseConfigProblem === null
  ? createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: '1locate-admin-auth',
    },
  })
  : null;

export class NotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured. Check the .env file.');
    this.name = 'NotConfiguredError';
  }
}

export function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) throw new NotConfiguredError();
  return client;
}
