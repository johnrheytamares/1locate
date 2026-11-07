import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountAuth, isNativeAuthCallback, NATIVE_AUTH_CALLBACK } from '@/services/account-auth';
import { decideAccess } from '@/router/access';
const native = vi.hoisted(() => ({ enabled: true, open: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: native.open } }));
function setup() {
  const auth = {
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: 'https://example.supabase.co/auth/v1/authorize' }, error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user' } } }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
  };
  return { auth, service: createAccountAuth({ auth } as unknown as SupabaseClient) };
}
beforeEach(() => { vi.clearAllMocks(); native.enabled = true; });
describe('Google and recovery authentication', () => {
  test('Google opens the system browser with a fixed native callback', async () => {
    const { auth, service } = setup(); await service.google();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', options: expect.objectContaining({ redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true }) }));
    expect(native.open).toHaveBeenCalledWith({ url: 'https://example.supabase.co/auth/v1/authorize' });
  });
  test('only accepts the exact native callback endpoint', () => {
    expect(isNativeAuthCallback(NATIVE_AUTH_CALLBACK + '?code=test')).toBe(true);
    for (const url of ['https://evil.test/callback', 'com.onelocate.admin://evil/callback', 'com.onelocate.admin://auth/other', 'com.onelocate.admin://evil@auth/callback', 'com.onelocate.admin://auth:123/callback']) expect(isNativeAuthCallback(url)).toBe(false);
  });
  test('rejects missing authorization codes without contacting Supabase', async () => {
    const { auth, service } = setup(); await expect(service.exchange('')).rejects.toThrow();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  test('uses recovery email and validates the address first', async () => {
    const { auth, service } = setup(); await expect(service.sendRecovery('invalid')).rejects.toThrow();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    await service.sendRecovery(' admin@example.com ');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('admin@example.com');
  });
  test('verifies recovery OTP rather than a login or signup token', async () => {
    const { auth, service } = setup(); await service.verifyRecovery('admin@example.com', '123456');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'admin@example.com', token: '123456', type: 'recovery' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  test('invalid or expired OTP cannot advance recovery', async () => {
    const { auth, service } = setup(); auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } });
    await expect(service.verifyRecovery('admin@example.com', '123456')).rejects.toThrow(/invalid or expired/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  test('password rules and confirmation are checked before update', async () => {
    const { auth, service } = setup();
    await expect(service.updatePassword('short', 'short')).rejects.toThrow();
    await expect(service.updatePassword('long-password-123', 'different')).rejects.toThrow(/match/);
    expect(auth.updateUser).not.toHaveBeenCalled();
    await service.updatePassword('long-password-123', 'long-password-123');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'long-password-123' });
  });
  test('recovery and callback pages remain available during session establishment without granting content access', () => {
    const user = { status: 'signed-in' as const, role: null };
    expect(decideAccess({ public: true, authFlow: true }, user, '/forgot-password')).toEqual({ allow: true });
    expect(decideAccess({ requires: 'content' }, user, '/rooms')).toMatchObject({ allow: false });
  });
});
