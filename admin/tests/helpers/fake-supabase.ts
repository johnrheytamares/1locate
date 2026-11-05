import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueryCall {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  columns?: string;
  options?: unknown;
  filters: [string, unknown][];
  single: boolean;
}

export interface QueryResponse {
  data?: unknown;
  error?: unknown;
  count?: number;
}

export type QueryHandler = (call: QueryCall) => QueryResponse | Promise<QueryResponse>;

export interface StorageHandlers {
  upload?: (bucket: string, path: string, body: unknown, options: unknown) => Promise<{ data: unknown; error: unknown }>;
  remove?: (bucket: string, paths: string[]) => Promise<{ data: unknown; error: unknown }>;
  createSignedUrls?: (bucket: string, paths: string[], expiresIn: number) => Promise<{ data: unknown; error: unknown }>;
}

export function fakeClient(handler: QueryHandler, storage: StorageHandlers = {}, auth: Record<string, unknown> = {}) {
  const calls: QueryCall[] = [];
  const storageCalls: { method: string; bucket: string; args: unknown[] }[] = [];

  function from(table: string) {
    const call: QueryCall = { table, action: 'select', filters: [], single: false };
    calls.push(call);
    const builder = {
      select(columns?: string, options?: unknown) {
        call.columns = columns;
        call.options = options;
        return builder;
      },
      insert(payload: unknown) { call.action = 'insert'; call.payload = payload; return builder; },
      update(payload: unknown) { call.action = 'update'; call.payload = payload; return builder; },
      delete() { call.action = 'delete'; return builder; },
      eq(column: string, value: unknown) { call.filters.push([column, value]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      range() { return builder; },
      maybeSingle() { call.single = true; return builder; },
      then<T>(resolve: (value: { data: unknown; error: unknown; count: number | null }) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve(handler(call))
          .then((response) => {
            const data = response.data ?? null;
            return {
              data: call.single ? (Array.isArray(data) ? data[0] ?? null : data) : data,
              error: response.error ?? null,
              count: response.count ?? null,
            };
          })
          .then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from,
    storage: {
      from(bucket: string) {
        return {
          upload: (path: string, body: unknown, options: unknown) => {
            storageCalls.push({ method: 'upload', bucket, args: [path, body, options] });
            return storage.upload?.(bucket, path, body, options) ?? Promise.resolve({ data: { path }, error: null });
          },
          remove: (paths: string[]) => {
            storageCalls.push({ method: 'remove', bucket, args: [paths] });
            return storage.remove?.(bucket, paths)
              ?? Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
          },
          createSignedUrls: (paths: string[], expiresIn: number) => {
            storageCalls.push({ method: 'createSignedUrls', bucket, args: [paths, expiresIn] });
            return storage.createSignedUrls?.(bucket, paths, expiresIn)
              ?? Promise.resolve({
                data: paths.map((path) => ({ path, error: null, signedUrl: `https://example.test/${bucket}/${path}?token=1` })),
                error: null,
              });
          },
        };
      },
    },
    auth,
  };

  return { client: client as unknown as SupabaseClient, calls, storageCalls };
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
export const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

export function imageFile(bytes: Uint8Array, name: string, type: string, padTo = 0): File {
  const parts: BlobPart[] = [bytes as unknown as BlobPart];
  if (padTo > bytes.length) parts.push(new Uint8Array(padTo - bytes.length) as unknown as BlobPart);
  return new File(parts, name, { type });
}

export const BUILDING_ID = '10000000-0000-4000-8000-000000000001';
export const ROOM_ID = '30000000-0000-4000-8000-000000000001';
export const USER_ID = 'a0000000-0000-4000-8000-000000000001';
export const OTHER_USER_ID = 'b0000000-0000-4000-8000-000000000002';
