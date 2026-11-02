import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { computed, reactive, readonly } from 'vue';
import { describeError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { validateCredentials } from '@/lib/validation';
import { getOwnRole } from '@/services/campus';
import type { AppRole } from '@/types';

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

interface SessionState {
  status: SessionStatus;
  userId: string | null;
  email: string | null;
  role: AppRole | null;
  roleError: string | null;
}

function initialState(status: SessionStatus): SessionState {
  return { status, userId: null, email: null, role: null, roleError: null };
}

/** Auth state for the whole app. Protected screens read from here. */
export function createSessionStore(client: SupabaseClient | null, now: () => number = Date.now) {
  const state = reactive<SessionState>(initialState('loading'));
  const clearListeners = new Set<() => void>();
  let ready: Promise<void> | null = null;
  let roleRequest = 0;
  let roleCheckedAt = 0;
  let roleInFlight: Promise<void> | null = null;
  let roleInFlightUser: string | null = null;

  function clear() {
    roleRequest += 1;
    roleInFlight = null;
    roleInFlightUser = null;
    Object.assign(state, initialState('signed-out'));
    clearListeners.forEach((listener) => listener());
  }

  function loadRole(userId: string): Promise<void> {
    if (roleInFlight && roleInFlightUser === userId) return roleInFlight;
    const request = ++roleRequest;
    roleInFlightUser = userId;
    state.roleError = null;
    roleCheckedAt = now();
    const pending = Promise.resolve().then(async () => {
      try {
        const role = await getOwnRole(userId, client);
        if (request === roleRequest && state.userId === userId) state.role = role;
      } catch (error) {
        if (request === roleRequest && state.userId === userId) {
          state.role = null;
          state.roleError = describeError(error);
        }
      } finally {
        if (roleInFlight === pending) {
          roleInFlight = null;
          roleInFlightUser = null;
        }
      }
    });
    roleInFlight = pending;
    return pending;
  }

  async function applySession(session: Session | null) {
    if (!session) {
      clear();
      return;
    }
    const sameUser = state.userId === session.user.id && state.status === 'signed-in';
    state.userId = session.user.id;
    state.email = session.user.email ?? null;
    if (!sameUser) {
      const alreadyLoading = roleInFlight !== null && roleInFlightUser === session.user.id;
      if (!alreadyLoading) state.role = null;
      await loadRole(session.user.id);
    }
    state.status = 'signed-in';
  }

  /** Restores a saved session and follows sign-in, sign-out, and expiry events. */
  function init(): Promise<void> {
    if (ready) return ready;
    if (!client) {
      Object.assign(state, initialState('signed-out'));
      ready = Promise.resolve();
      return ready;
    }
    ready = (async () => {
      const { data } = await client.auth.getSession();
      await applySession(data.session);
      client.auth.onAuthStateChange((_event, session) => {
        // Supabase advises against awaiting other Supabase calls inside this callback.
        setTimeout(() => { void applySession(session); }, 0);
      });
    })().catch(() => {
      clear();
    });
    return ready;
  }

  async function signIn(email: string, password: string): Promise<void> {
    const problem = validateCredentials(email, password);
    if (problem) throw new Error(problem);
    if (!client) throw new Error('Supabase is not configured. Check the .env file.');
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(describeError(error));
    await applySession(data.session);
  }

  async function signOut(): Promise<void> {
    try {
      await client?.auth.signOut();
    } finally {
      clear();
    }
  }

  async function refreshRole(): Promise<void> {
    if (state.userId) await loadRole(state.userId);
  }

  /** Re-reads the role when the last check is older than maxAgeMs, so a removed role takes effect. */
  async function refreshRoleIfStale(maxAgeMs: number): Promise<void> {
    if (state.status === 'signed-in' && now() - roleCheckedAt > maxAgeMs) await refreshRole();
  }

  /** Runs when the user signs out or the session is lost, so screens can drop cached data. */
  function onCleared(listener: () => void): () => void {
    clearListeners.add(listener);
    return () => clearListeners.delete(listener);
  }

  return {
    state: readonly(state),
    canManageContent: computed(() => state.role === 'admin' || state.role === 'editor'),
    isAdmin: computed(() => state.role === 'admin'),
    init,
    signIn,
    signOut,
    refreshRole,
    refreshRoleIfStale,
    onCleared,
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

let shared: SessionStore | null = null;

export function useSession(): SessionStore {
  shared ??= createSessionStore(supabase);
  return shared;
}
