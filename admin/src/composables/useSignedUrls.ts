import { reactive } from 'vue';
import type { SignedUrl } from '@/services/photos';

/** Renew a URL when it has less than this left. */
export const RENEW_BEFORE_MS = 2 * 60 * 1000;

type Signer = (paths: string[]) => Promise<Map<string, SignedUrl>>;

/** Keeps signed photo URLs fresh: signs missing or expiring paths and re-signs after a load error. */
export function createSignedUrlCache(sign: Signer, now: () => number = Date.now) {
  const entries = reactive(new Map<string, SignedUrl>());
  const retried = new Set<string>();

  function needsSigning(path: string): boolean {
    const entry = entries.get(path);
    return !entry || entry.expiresAt - now() < RENEW_BEFORE_MS;
  }

  async function ensure(paths: string[]): Promise<void> {
    const pending = paths.filter(needsSigning);
    if (pending.length === 0) return;
    const signed = await sign(pending);
    signed.forEach((value, path) => entries.set(path, value));
  }

  /** Called when an <img> fails, usually because its URL expired. Retries once per path. */
  async function renewAfterError(path: string): Promise<boolean> {
    if (retried.has(path)) return false;
    retried.add(path);
    entries.delete(path);
    await ensure([path]);
    return entries.has(path);
  }

  function url(path: string): string | null {
    return entries.get(path)?.url ?? null;
  }

  function forget(path: string) {
    entries.delete(path);
    retried.delete(path);
  }

  function clear() {
    entries.clear();
    retried.clear();
  }

  return { ensure, renewAfterError, url, forget, clear };
}
