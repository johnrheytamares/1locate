import { describe, expect, test, vi } from 'vitest';
import { createSignedUrlCache, RENEW_BEFORE_MS } from '@/composables/useSignedUrls';
import { NoRowsChangedError, PhotoUploadError, ValidationError } from '@/lib/errors';
import { MAX_PHOTO_BYTES, photoPath, sniffImageType, validateImageFile } from '@/lib/images';
import { deletePhoto, reorderPhotos, signPhotoUrls, uploadPhoto } from '@/services/photos';
import type { Photo } from '@/types';
import {
  fakeClient,
  imageFile,
  JPEG_BYTES,
  PNG_BYTES,
  ROOM_ID,
  WEBP_BYTES,
  type QueryCall,
} from './helpers/fake-supabase';

const PATH_PATTERN = new RegExp(`^${ROOM_ID}/[0-9a-f-]{36}\\.png$`);

function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'p1',
    parentId: ROOM_ID,
    storagePath: `${ROOM_ID}/40000000-0000-4000-8000-000000000001.png`,
    caption: null,
    sortOrder: 10,
    createdAt: '2026-10-31T00:00:00Z',
    ...overrides,
  };
}

function insertedRow(call: QueryCall) {
  const payload = call.payload as Record<string, unknown>;
  return { id: 'new-photo', room_id: payload.room_id, storage_path: payload.storage_path, caption: payload.caption, sort_order: payload.sort_order, created_at: 'now' };
}

describe('image file validation', () => {
  test.each([
    [PNG_BYTES, 'front.png', 'image/png', 'png'],
    [JPEG_BYTES, 'front.JPEG', 'image/jpeg', 'jpg'],
    [JPEG_BYTES, 'front.jpg', 'image/jpeg', 'jpg'],
    [WEBP_BYTES, 'front.webp', 'image/webp', 'webp'],
  ])('accepts %s as %s', async (bytes, name, type, extension) => {
    expect(await validateImageFile(imageFile(bytes, name, type))).toEqual({ ok: true, contentType: type, extension });
  });

  test('rejects files over 5 MB and empty files', async () => {
    const big = await validateImageFile(imageFile(PNG_BYTES, 'big.png', 'image/png', MAX_PHOTO_BYTES + 1));
    expect(big).toEqual({ ok: false, error: expect.stringMatching(/limit is 5.0 MB/) });
    expect(await validateImageFile(imageFile(PNG_BYTES, 'exact.png', 'image/png', MAX_PHOTO_BYTES))).toMatchObject({ ok: true });
    expect(await validateImageFile(new File([], 'empty.png', { type: 'image/png' }))).toMatchObject({ ok: false });
  });

  test('rejects other types, wrong extensions, and renamed files', async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(await validateImageFile(imageFile(gif, 'anim.gif', 'image/gif'))).toMatchObject({ ok: false });
    expect(await validateImageFile(imageFile(PNG_BYTES, 'front.jpg', 'image/png'))).toMatchObject({ ok: false });
    const text = new TextEncoder().encode('<svg>not a png</svg>');
    expect(await validateImageFile(imageFile(text, 'fake.png', 'image/png')))
      .toEqual({ ok: false, error: 'The file content does not match its image type.' });
    expect(await validateImageFile(imageFile(JPEG_BYTES, 'front.png', 'image/png'))).toMatchObject({ ok: false });
  });

  test('detects image types from bytes', () => {
    expect(sniffImageType(PNG_BYTES)).toBe('image/png');
    expect(sniffImageType(JPEG_BYTES)).toBe('image/jpeg');
    expect(sniffImageType(WEBP_BYTES)).toBe('image/webp');
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  test('builds unique paths in the database format', () => {
    expect(photoPath(ROOM_ID, 'png')).toMatch(PATH_PATTERN);
    expect(photoPath(ROOM_ID, 'png')).not.toBe(photoPath(ROOM_ID, 'png'));
    expect(() => photoPath('../etc', 'png')).toThrow();
    expect(() => photoPath(ROOM_ID, 'gif')).toThrow();
  });
});

describe('uploadPhoto', () => {
  const file = () => imageFile(PNG_BYTES, 'front.png', 'image/png');

  test('uploads to a unique path, then records it', async () => {
    const { client, calls, storageCalls } = fakeClient((call) => ({ data: [insertedRow(call)] }));
    const saved = await uploadPhoto('room', ROOM_ID, file(), ' Front desk ', 20, client);

    const [path, , options] = storageCalls[0].args as [string, File, Record<string, unknown>];
    expect(storageCalls[0]).toMatchObject({ method: 'upload', bucket: 'room-photos' });
    expect(path).toMatch(PATH_PATTERN);
    expect(options).toMatchObject({ contentType: 'image/png', upsert: false });
    expect(calls[0]).toMatchObject({ table: 'room_images', action: 'insert' });
    expect(calls[0].payload).toEqual({ room_id: ROOM_ID, storage_path: path, caption: 'Front desk', sort_order: 20 });
    expect(saved).toMatchObject({ parentId: ROOM_ID, storagePath: path, caption: 'Front desk' });
  });

  test('invalid files never reach Storage', async () => {
    const { client, storageCalls } = fakeClient(() => ({ data: [] }));
    const text = imageFile(new TextEncoder().encode('hello world!'), 'x.png', 'image/png');
    await expect(uploadPhoto('room', ROOM_ID, text, '', 10, client)).rejects.toBeInstanceOf(ValidationError);
    await expect(uploadPhoto('room', ROOM_ID, file(), 'x'.repeat(201), 10, client)).rejects.toBeInstanceOf(ValidationError);
    expect(storageCalls).toHaveLength(0);
  });

  test('a Storage rejection stops before the database insert', async () => {
    const { client, calls } = fakeClient(() => ({ data: [] }), {
      upload: async () => ({ data: null, error: { statusCode: '413', message: 'The object exceeded the maximum allowed size' } }),
    });
    await expect(uploadPhoto('room', ROOM_ID, file(), '', 10, client)).rejects.toMatchObject({ statusCode: '413' });
    expect(calls).toHaveLength(0);
  });

  test('a failed record insert removes the uploaded file', async () => {
    const { client, storageCalls } = fakeClient(() => ({ error: { code: '42501', message: 'new row violates row-level security policy' } }));
    const error = await uploadPhoto('room', ROOM_ID, file(), '', 10, client).catch((err) => err);
    expect(error).toBeInstanceOf(PhotoUploadError);
    expect(error.message).toMatch(/permission.*upload was undone/s);
    expect(error.orphanPath).toBeNull();
    const uploadedPath = storageCalls[0].args[0];
    expect(storageCalls[1]).toMatchObject({ method: 'remove', bucket: 'room-photos', args: [[uploadedPath]] });
  });

  test('reports the orphaned file when cleanup also fails', async () => {
    const { client } = fakeClient(() => ({ error: { code: '23514', message: 'violates check constraint "room_images_path_check"' } }), {
      remove: async () => ({ data: null, error: { message: 'network down' } }),
    });
    const error = await uploadPhoto('room', ROOM_ID, file(), '', 10, client).catch((err) => err);
    expect(error).toBeInstanceOf(PhotoUploadError);
    expect(error.orphanPath).toMatch(PATH_PATTERN);
    expect(error.message).toMatch(/could not be removed and is left at room-photos\//);
  });

  test('treats a cleanup that removed nothing as a failure', async () => {
    const { client } = fakeClient(() => ({ error: { code: '42501', message: 'denied' } }), {
      remove: async () => ({ data: [], error: null }),
    });
    const error = await uploadPhoto('room', ROOM_ID, file(), '', 10, client).catch((err) => err);
    expect(error.orphanPath).toMatch(PATH_PATTERN);
  });
});

describe('deletePhoto', () => {
  test('removes the record, then the file', async () => {
    const { client, calls, storageCalls } = fakeClient(() => ({ data: [{ id: 'p1' }] }));
    expect(await deletePhoto('room', photo(), client)).toEqual({ fileRemoved: true, warning: null });
    expect(calls[0]).toMatchObject({ table: 'room_images', action: 'delete', filters: [['id', 'p1']] });
    expect(storageCalls[0]).toMatchObject({ method: 'remove', args: [[photo().storagePath]] });
  });

  test('a record blocked by RLS keeps the file', async () => {
    const { client, storageCalls } = fakeClient(() => ({ data: [] }));
    await expect(deletePhoto('room', photo(), client)).rejects.toBeInstanceOf(NoRowsChangedError);
    expect(storageCalls).toHaveLength(0);
  });

  test('reports a partial failure when the file stays in Storage', async () => {
    const { client } = fakeClient(() => ({ data: [{ id: 'p1' }] }), {
      remove: async () => ({ data: null, error: { message: 'Failed to fetch' } }),
    });
    const result = await deletePhoto('building', photo({ storagePath: 'b/x.png' }), client);
    expect(result.fileRemoved).toBe(false);
    expect(result.warning).toMatch(/still in storage at building-photos\/b\/x\.png/);
  });
});

describe('photo order and signed URLs', () => {
  test('moving a photo renumbers only what changed', () => {
    const photos = [photo({ id: 'a', sortOrder: 10 }), photo({ id: 'b', sortOrder: 20 }), photo({ id: 'c', sortOrder: 30 })];
    expect(reorderPhotos(photos, 2, 0)).toEqual([
      { id: 'c', sortOrder: 10 },
      { id: 'a', sortOrder: 20 },
      { id: 'b', sortOrder: 30 },
    ]);
    expect(reorderPhotos(photos, 0, 0)).toEqual([]);
    expect(reorderPhotos(photos, 0, 5)).toEqual([]);
  });

  test('signs paths and drops unsafe or failed URLs', async () => {
    const { client } = fakeClient(() => ({}), {
      createSignedUrls: async (_bucket, paths) => ({
        data: [
          { path: paths[0], error: null, signedUrl: 'https://example.test/ok' },
          { path: paths[1], error: null, signedUrl: 'http://example.test/plain' },
          { path: paths[2], error: 'Object not found', signedUrl: null },
        ],
        error: null,
      }),
    });
    const result = await signPhotoUrls('room', ['a', 'b', 'c'], client, () => 1000);
    expect([...result.keys()]).toEqual(['a']);
    expect(result.get('a')?.expiresAt).toBe(1000 + 3600 * 1000);
  });

  test('the cache renews URLs that are about to expire', async () => {
    let now = 0;
    const sign = vi.fn(async (paths: string[]) => new Map(paths.map((path) => [path, { url: `https://x/${path}?t=${now}`, expiresAt: now + 3_600_000 }])));
    const cache = createSignedUrlCache(sign, () => now);
    await cache.ensure(['a', 'b']);
    await cache.ensure(['a', 'b']);
    expect(sign).toHaveBeenCalledTimes(1);
    now = 3_600_000 - RENEW_BEFORE_MS + 1;
    await cache.ensure(['a']);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(cache.url('a')).toContain(`t=${now}`);
  });

  test('an image load error re-signs once', async () => {
    const sign = vi.fn(async (paths: string[]) => new Map(paths.map((path) => [path, { url: `https://x/${path}`, expiresAt: Date.now() + 3_600_000 }])));
    const cache = createSignedUrlCache(sign);
    await cache.ensure(['a']);
    expect(await cache.renewAfterError('a')).toBe(true);
    expect(await cache.renewAfterError('a')).toBe(false);
    expect(sign).toHaveBeenCalledTimes(2);
  });
});
