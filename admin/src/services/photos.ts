import type { SupabaseClient } from '@supabase/supabase-js';
import { describeError, NoRowsChangedError, PhotoUploadError, ValidationError } from '@/lib/errors';
import { photoPath, validateImageFile } from '@/lib/images';
import { requireClient, supabase } from '@/lib/supabase';
import { validateCaption } from '@/lib/validation';
import type { Photo, PhotoKind } from '@/types';

type Client = SupabaseClient | null;

export const SIGNED_URL_SECONDS = 60 * 60;

const TABLE: Record<PhotoKind, string> = { building: 'building_images', room: 'room_images' };
const PARENT: Record<PhotoKind, string> = { building: 'building_id', room: 'room_id' };
export const BUCKET: Record<PhotoKind, string> = { building: 'building-photos', room: 'room-photos' };

interface PhotoRow {
  id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
  building_id?: string;
  room_id?: string;
}

function columns(kind: PhotoKind): string {
  return `id, ${PARENT[kind]}, storage_path, caption, sort_order, created_at`;
}

function toPhoto(kind: PhotoKind, row: PhotoRow): Photo {
  return {
    id: row.id,
    parentId: (kind === 'building' ? row.building_id : row.room_id) ?? '',
    storagePath: row.storage_path,
    caption: row.caption,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function listPhotos(kind: PhotoKind, parentId: string, client: Client = supabase): Promise<Photo[]> {
  const { data, error } = await requireClient(client)
    .from(TABLE[kind])
    .select(columns(kind))
    .eq(PARENT[kind], parentId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as unknown as PhotoRow[]).map((row) => toPhoto(kind, row));
}

/**
 * Uploads the file, then records it. If the record fails, the file is removed again so
 * Storage does not keep an unreferenced photo.
 */
export async function uploadPhoto(
  kind: PhotoKind,
  parentId: string,
  file: File,
  caption: string,
  sortOrder: number,
  client: Client = supabase,
): Promise<Photo> {
  const db = requireClient(client);
  const check = await validateImageFile(file);
  if (!check.ok) throw new ValidationError(check.error);
  const captionCheck = validateCaption(caption);
  if (!captionCheck.ok) throw new ValidationError(captionCheck.errors.caption ?? 'Invalid caption.');

  const path = photoPath(parentId, check.extension);
  const bucket = db.storage.from(BUCKET[kind]);
  const upload = await bucket.upload(path, file, { contentType: check.contentType, upsert: false, cacheControl: '3600' });
  if (upload.error) throw upload.error;

  const { data, error } = await db
    .from(TABLE[kind])
    .insert({ [PARENT[kind]]: parentId, storage_path: path, caption: captionCheck.value, sort_order: sortOrder })
    .select(columns(kind));
  const row = (data as unknown as PhotoRow[] | null)?.[0];
  if (!error && row) return toPhoto(kind, row);

  const reason = error ? describeError(error) : 'The photo record was not saved.';
  const cleanup = await bucket.remove([path])
    .catch((cleanupError: unknown) => ({ data: null, error: cleanupError }));
  if (cleanup.error || !cleanup.data?.length) {
    throw new PhotoUploadError(
      `${reason} The uploaded file could not be removed and is left at ${BUCKET[kind]}/${path}.`,
      path,
    );
  }
  throw new PhotoUploadError(`${reason} The upload was undone.`, null);
}

export interface DeletePhotoResult {
  fileRemoved: boolean;
  warning: string | null;
}

/**
 * Removes the record first so the photo disappears from the app right away, then the file.
 * A failed file removal is reported, because the record is already gone.
 */
export async function deletePhoto(kind: PhotoKind, photo: Photo, client: Client = supabase): Promise<DeletePhotoResult> {
  const db = requireClient(client);
  const { data, error } = await db.from(TABLE[kind]).delete().eq('id', photo.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NoRowsChangedError();

  const removal = await db.storage.from(BUCKET[kind]).remove([photo.storagePath])
    .catch((removeError: unknown) => ({ data: null, error: removeError }));
  if (removal.error || !removal.data?.length) {
    const reason = removal.error ? ` ${describeError(removal.error)}` : '';
    return {
      fileRemoved: false,
      warning: `The photo was removed from the app, but its file is still in storage at ${BUCKET[kind]}/${photo.storagePath}.${reason}`,
    };
  }
  return { fileRemoved: true, warning: null };
}

export async function updatePhoto(
  kind: PhotoKind,
  id: string,
  changes: { caption?: string | null; sort_order?: number },
  client: Client = supabase,
): Promise<Photo> {
  if (changes.caption !== undefined) {
    const captionCheck = validateCaption(changes.caption ?? '');
    if (!captionCheck.ok) throw new ValidationError(captionCheck.errors.caption ?? 'Invalid caption.');
    changes = { ...changes, caption: captionCheck.value };
  }
  const { data, error } = await requireClient(client)
    .from(TABLE[kind])
    .update(changes)
    .eq('id', id)
    .select(columns(kind));
  if (error) throw error;
  const row = (data as unknown as PhotoRow[] | null)?.[0];
  if (!row) throw new NoRowsChangedError();
  return toPhoto(kind, row);
}

/** New sort orders after moving one photo. Returns only the photos whose order changed. */
export function reorderPhotos(photos: Photo[], from: number, to: number): { id: string; sortOrder: number }[] {
  if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return [];
  const ordered = [...photos];
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return ordered
    .map((photo, index) => ({ id: photo.id, sortOrder: (index + 1) * 10, previous: photo.sortOrder }))
    .filter((item) => item.sortOrder !== item.previous)
    .map(({ id, sortOrder }) => ({ id, sortOrder }));
}

export function nextSortOrder(photos: Photo[]): number {
  return photos.length === 0 ? 10 : Math.max(...photos.map((photo) => photo.sortOrder)) + 10;
}

export interface SignedUrl {
  url: string;
  expiresAt: number;
}

export async function signPhotoUrls(
  kind: PhotoKind,
  paths: string[],
  client: Client = supabase,
  now: () => number = Date.now,
): Promise<Map<string, SignedUrl>> {
  const result = new Map<string, SignedUrl>();
  if (paths.length === 0) return result;
  const { data, error } = await requireClient(client).storage.from(BUCKET[kind]).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw error;
  const expiresAt = now() + SIGNED_URL_SECONDS * 1000;
  for (const item of data ?? []) {
    if (!item.error && item.path && item.signedUrl?.startsWith('https://')) {
      result.set(item.path, { url: item.signedUrl, expiresAt });
    }
  }
  return result;
}
