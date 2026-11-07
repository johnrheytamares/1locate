import type { SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { requireClient } from '@/lib/supabase';
import { describeError } from '@/lib/errors';

export const NATIVE_AUTH_CALLBACK = 'com.onelocate.admin://auth/callback';
export function isNativeAuthCallback(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'com.onelocate.admin:' && url.host === 'auth' && url.pathname === '/callback' && !url.username && !url.password; }
  catch { return false; }
}
function checkedEmail(email: string): string {
  const value = email.trim();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid email address.');
  return value;
}
export function createAccountAuth(client: SupabaseClient | null) {
  return {
    async google() {
      const native = Capacitor.isNativePlatform();
      const redirectTo = native ? NATIVE_AUTH_CALLBACK : new URL('/auth/callback', window.location.origin).href;
      const { data, error } = await requireClient(client).auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
      if (error) throw new Error(describeError(error));
      if (!data.url) throw new Error('Google sign-in could not start.');
      if (native) await Browser.open({ url: data.url });
      else window.location.assign(data.url);
    },
    async exchange(code: string) {
      if (!code || code.length > 4096) throw new Error('The sign-in callback is invalid.');
      const { error } = await requireClient(client).auth.exchangeCodeForSession(code);
      if (error) throw new Error('Sign-in expired or could not be completed. Please try again.');
    },
    async sendRecovery(email: string) {
      const { error } = await requireClient(client).auth.resetPasswordForEmail(checkedEmail(email));
      if (error) throw new Error('Unable to send a reset code right now. Please wait and try again.');
    },
    async verifyRecovery(email: string, token: string) {
      if (!/^\d{6,10}$/.test(token.trim())) throw new Error('Enter the numeric code from your email.');
      const { data, error } = await requireClient(client).auth.verifyOtp({ email: checkedEmail(email), token: token.trim(), type: 'recovery' });
      if (error || !data.session) throw new Error('The code is invalid or expired. Request a new code and try again.');
    },
    async updatePassword(password: string, confirmation: string) {
      if (password.length < 12 || password.length > 128) throw new Error('Use a password between 12 and 128 characters.');
      if (password !== confirmation) throw new Error('Passwords do not match.');
      const { error } = await requireClient(client).auth.updateUser({ password });
      if (error) throw new Error('Password could not be updated. Check the password requirements or request a new code.');
    },
  };
}
