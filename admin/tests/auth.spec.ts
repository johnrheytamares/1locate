import type { Session } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import { decideAccess, type AccessMeta } from '@/router/access';
import { createSessionStore } from '@/stores/session';
import { fakeClient, OTHER_USER_ID, USER_ID } from './helpers/fake-supabase';

function session(userId = USER_ID, email = 'admin@example.com'): Session {
  return { user: { id: userId, email } } as unknown as Session;
}

type Listener = (event: string, value: Session | null) => void;

function authFake(initial: Session | null, options: { signInError?: unknown } = {}) {
  let listener: Listener | null = null;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
    onAuthStateChange: vi.fn((callback: Listener) => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; }),
    signInWithPassword: vi.fn(async ({ email }: { email: string }) => (
      options.signInError
        ? { data: { session: null }, error: options.signInError }
        : { data: { session: session(OTHER_USER_ID, email) }, error: null }
    )),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { auth, emit: (value: Session | null) => listener?.('EVENT', value) };
}

function store(initial: Session | null, roles: Record<string, string | null | Error>, options: { signInError?: unknown } = {}, now?: () => number) {
  const { auth, emit } = authFake(initial, options);
  const { client, calls } = fakeClient((call) => {
    const userId = call.filters[0]?.[1] as string;
    const role = roles[userId];
    if (role instanceof Error) return { error: { message: role.message } };
    return { data: role ? [{ role }] : [] };
  }, {}, auth);
  return { store: createSessionStore(client, now), auth, emit, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('route guard', () => {
  const content: AccessMeta = { requires: 'content' };
  const admin: AccessMeta = { requires: 'admin' };
  const signedOut = { status: 'signed-out' as const, role: null };
  const noRole = { status: 'signed-in' as const, role: null };
  const editor = { status: 'signed-in' as const, role: 'editor' as const };
  const adminUser = { status: 'signed-in' as const, role: 'admin' as const };

  test('signed-out users go to login and keep the requested page', () => {
    expect(decideAccess(content, signedOut, '/rooms')).toEqual({ allow: false, redirect: { name: 'login', query: { redirect: '/rooms' } } });
    expect(decideAccess({ signedIn: true }, signedOut, '/access-denied')).toMatchObject({ allow: false });
  });

  test('signed-in users without a role see access denied', () => {
    expect(decideAccess(content, noRole, '/')).toEqual({ allow: false, redirect: { name: 'access-denied' } });
    expect(decideAccess({ signedIn: true }, noRole, '/access-denied')).toEqual({ allow: true });
  });

  test('editors manage content but not roles', () => {
    expect(decideAccess(content, editor, '/rooms')).toEqual({ allow: true });
    expect(decideAccess(admin, editor, '/roles')).toEqual({ allow: false, redirect: { name: 'access-denied', query: { reason: 'admin' } } });
  });

  test('admins reach every page', () => {
    expect(decideAccess(content, adminUser, '/')).toEqual({ allow: true });
    expect(decideAccess(admin, adminUser, '/roles')).toEqual({ allow: true });
  });

  test('the login page sends signed-in users onward', () => {
    expect(decideAccess({ public: true }, signedOut, '/login')).toEqual({ allow: true });
    expect(decideAccess({ public: true }, editor, '/login')).toEqual({ allow: false, redirect: { name: 'dashboard' } });
    expect(decideAccess({ public: true }, noRole, '/login')).toEqual({ allow: false, redirect: { name: 'access-denied' } });
  });
});

describe('session store', () => {
  test('restores a saved session and looks up the role', async () => {
    const { store: s } = store(session(), { [USER_ID]: 'admin' });
    await s.init();
    expect(s.state).toMatchObject({ status: 'signed-in', userId: USER_ID, email: 'admin@example.com', role: 'admin' });
    expect(s.isAdmin.value).toBe(true);
    expect(s.canManageContent.value).toBe(true);
  });

  test('no saved session means signed out', async () => {
    const { store: s, calls } = store(null, {});
    await s.init();
    expect(s.state.status).toBe('signed-out');
    expect(calls).toHaveLength(0);
  });

  test('a user without a role cannot manage content', async () => {
    const { store: s } = store(session(), { [USER_ID]: null });
    await s.init();
    expect(s.state.role).toBeNull();
    expect(s.canManageContent.value).toBe(false);
  });

  test('a failed role lookup is shown and never grants access', async () => {
    const { store: s } = store(session(), { [USER_ID]: new Error('Failed to fetch') });
    await s.init();
    expect(s.state.role).toBeNull();
    expect(s.state.roleError).toBe('Failed to fetch');
  });

  test('sign in validates input before calling Supabase', async () => {
    const { store: s, auth } = store(null, {});
    await s.init();
    await expect(s.signIn('not-an-email', 'x')).rejects.toThrow(/valid email/);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test('wrong credentials show a readable message', async () => {
    const { store: s } = store(null, {}, { signInError: { message: 'Invalid login credentials', status: 400 } });
    await s.init();
    await expect(s.signIn('admin@example.com', 'wrong')).rejects.toThrow('Wrong email or password.');
    expect(s.state.status).toBe('signed-out');
  });

  test('successful sign in loads the role of the new user', async () => {
    const { store: s } = store(null, { [OTHER_USER_ID]: 'editor' });
    await s.init();
    await s.signIn(' editor@example.com ', 'secret');
    expect(s.state).toMatchObject({ status: 'signed-in', userId: OTHER_USER_ID, role: 'editor' });
  });

  test('sign out clears user data and notifies screens', async () => {
    const { store: s, auth } = store(session(), { [USER_ID]: 'admin' });
    await s.init();
    const cleared = vi.fn();
    s.onCleared(cleared);
    await s.signOut();
    expect(auth.signOut).toHaveBeenCalled();
    expect(s.state).toMatchObject({ status: 'signed-out', userId: null, email: null, role: null });
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  test('a lost session (expiry or sign out elsewhere) clears data', async () => {
    const { store: s, emit } = store(session(), { [USER_ID]: 'editor' });
    await s.init();
    const cleared = vi.fn();
    s.onCleared(cleared);
    emit(null);
    await flush();
    expect(s.state.status).toBe('signed-out');
    expect(s.state.role).toBeNull();
    expect(cleared).toHaveBeenCalled();
  });

  test('a removed role takes effect on the next stale check', async () => {
    let now = 0;
    const roles: Record<string, string | null> = { [USER_ID]: 'editor' };
    const { store: s } = store(session(), roles, {}, () => now);
    await s.init();
    roles[USER_ID] = null;
    now = 30_000;
    await s.refreshRoleIfStale(60_000);
    expect(s.state.role).toBe('editor');
    now = 61_000;
    await s.refreshRoleIfStale(60_000);
    expect(s.state.role).toBeNull();
  });
});
