import type { AppRole } from '@/types';
import type { SessionStatus } from '@/stores/session';

export type Requirement = 'content' | 'admin';

export interface AccessMeta {
  /** Reachable without signing in (login page). */
  public?: boolean;
  authFlow?: boolean;
  /** Signed in, any role (access-denied page). */
  signedIn?: boolean;
  requires?: Requirement;
}

export interface AccessSession {
  status: SessionStatus;
  role: AppRole | null;
}

export type AccessDecision =
  | { allow: true }
  | { allow: false; redirect: { name: string; query?: Record<string, string> } };

/** Frontend gate only. Supabase RLS still decides what each request may do. */
export function decideAccess(meta: AccessMeta, session: AccessSession, fullPath: string): AccessDecision {
  const hasContentRole = session.role === 'admin' || session.role === 'editor';

  if (meta.public && meta.authFlow) return { allow: true };
  if (meta.public) {
    if (session.status === 'signed-in') {
      return { allow: false, redirect: { name: hasContentRole ? 'dashboard' : 'access-denied' } };
    }
    return { allow: true };
  }

  if (session.status !== 'signed-in') {
    return { allow: false, redirect: { name: 'login', query: { redirect: fullPath } } };
  }
  if (meta.signedIn) return { allow: true };
  if (!hasContentRole) return { allow: false, redirect: { name: 'access-denied' } };
  if (meta.requires === 'admin' && session.role !== 'admin') {
    return { allow: false, redirect: { name: 'access-denied', query: { reason: 'admin' } } };
  }
  return { allow: true };
}
