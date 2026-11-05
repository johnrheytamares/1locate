import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_RATINGS,
  type FeedbackRating,
  type NavigationFeedbackDraft,
} from '@/models/feedback';
import { supabase } from '@/services/supabase';

const QUEUE_KEY = '1locate-navigation-feedback-queue';

export const FEEDBACK_SAVED_MESSAGE = 'Thank you. Your navigation feedback was submitted.';
export const FEEDBACK_QUEUED_MESSAGE = 'Saved on this device. It will upload when you are back online.';
export const FEEDBACK_ERROR_MESSAGE = 'Your feedback could not be sent. Check your connection and try again.';

export type FeedbackSubmitStatus = 'saved' | 'queued' | 'duplicate';

export interface QueuedFeedback {
  sessionId: string;
  destinationId: string | null;
  destinationName: string;
  rating: FeedbackRating;
  comment: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = (8 + Math.floor(Math.random() * 4)).toString(16);
  const text = hex.join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

export function isFeedbackRating(value: number): value is FeedbackRating {
  return (FEEDBACK_RATINGS as readonly number[]).includes(value);
}

function normalizeComment(value: string): string | null {
  const comment = value.trim().slice(0, FEEDBACK_COMMENT_MAX);
  return comment.length === 0 ? null : comment;
}

function normalizeName(value: string): string {
  const name = value.trim().slice(0, 120);
  return name.length === 0 ? 'Destination' : name;
}

function normalizeDestinationId(value: string | null): string | null {
  const id = value?.trim().slice(0, 120) ?? '';
  return id.length === 0 ? null : id;
}

export function loadQueuedFeedback(): QueuedFeedback[] {
  const raw = storage()?.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedItem);
  } catch {
    return [];
  }
}

function isQueuedItem(value: unknown): value is QueuedFeedback {
  if (!value || typeof value !== 'object') return false;
  const item = value as QueuedFeedback;
  return typeof item.sessionId === 'string'
    && (item.destinationId === null || typeof item.destinationId === 'string')
    && typeof item.destinationName === 'string'
    && isFeedbackRating(item.rating)
    && typeof item.comment === 'string';
}

function saveQueue(items: QueuedFeedback[]): void {
  const db = storage();
  if (!db) return;
  if (items.length === 0) {
    db.removeItem(QUEUE_KEY);
    return;
  }
  db.setItem(QUEUE_KEY, JSON.stringify(items));
}

function enqueue(item: QueuedFeedback): void {
  const items = loadQueuedFeedback().filter((queued) => queued.sessionId !== item.sessionId);
  items.push(item);
  saveQueue(items);
}

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!error || typeof error !== 'object') return false;
  const value = error as { message?: unknown; code?: unknown; name?: unknown };
  const message = typeof value.message === 'string' ? value.message : '';
  const code = typeof value.code === 'string' ? value.code : '';
  return error instanceof TypeError
    || value.name === 'TypeError'
    || code === 'ENOTFOUND'
    || /fetch|network|offline|failed to fetch|timeout/i.test(message);
}

function isDuplicateSession(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  const source = `${value.code ?? ''} ${value.message ?? ''}`;
  return source.includes('23505') || source.includes('navigation_feedback_session_id');
}

async function insertFeedback(item: QueuedFeedback): Promise<void> {
  if (!supabase) {
    throw new TypeError('Supabase is not configured; network unavailable');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id ?? null;
  const { error } = await supabase.from('navigation_feedback').insert({
    session_id: item.sessionId,
    user_id: userId,
    destination_id: normalizeDestinationId(item.destinationId),
    destination_name: normalizeName(item.destinationName),
    rating: item.rating,
    comment: normalizeComment(item.comment),
  });
  if (error) throw error;
}

let flushing: Promise<void> | null = null;

/** Uploads queued feedback. Stops at the first network failure; drops items the server rejects for good. */
export function flushQueuedFeedback(): Promise<void> {
  if (!flushing) {
    flushing = runFlush().finally(() => { flushing = null; });
  }
  return flushing;
}

async function runFlush(): Promise<void> {
  const pending = loadQueuedFeedback();
  if (pending.length === 0 || !supabase) return;
  const done = new Set<string>();
  for (const item of pending) {
    try {
      await insertFeedback(item);
      done.add(item.sessionId);
    } catch (error) {
      if (isNetworkError(error)) break;
      done.add(item.sessionId);
    }
  }
  // Re-read so feedback queued while uploading is kept.
  saveQueue(loadQueuedFeedback().filter((item) => !done.has(item.sessionId)));
}

let watching = false;

export function watchFeedbackSync(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('online', () => {
    void flushQueuedFeedback();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushQueuedFeedback();
  });
  void flushQueuedFeedback();
}

export async function submitNavigationFeedback(draft: NavigationFeedbackDraft): Promise<FeedbackSubmitStatus> {
  if (!isFeedbackRating(draft.rating)) {
    throw new Error('Choose a star rating before submitting.');
  }
  const item: QueuedFeedback = {
    sessionId: draft.sessionId,
    destinationId: normalizeDestinationId(draft.destinationId),
    destinationName: normalizeName(draft.destinationName),
    rating: draft.rating,
    comment: draft.comment.trim().slice(0, FEEDBACK_COMMENT_MAX),
  };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueue(item);
    return 'queued';
  }

  try {
    await insertFeedback(item);
    void flushQueuedFeedback();
    return 'saved';
  } catch (error) {
    if (isDuplicateSession(error)) return 'duplicate';
    if (isNetworkError(error)) {
      enqueue(item);
      return 'queued';
    }
    throw error;
  }
}

export function messageForSubmitStatus(status: FeedbackSubmitStatus): string {
  return status === 'queued' ? FEEDBACK_QUEUED_MESSAGE : FEEDBACK_SAVED_MESSAGE;
}
