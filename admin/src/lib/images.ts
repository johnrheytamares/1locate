import { isUuid } from '@/lib/validation';

/** Matches the bucket settings in 20261030120200_storage.sql. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSIONS: Record<ImageMime, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

const STORED_EXTENSION: Record<ImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ACCEPTED_IMAGE_TYPES = Object.keys(EXTENSIONS).join(',');

export type ImageCheck =
  | { ok: true; contentType: ImageMime; extension: string }
  | { ok: false; error: string };

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readHeader(file: Blob, length: number): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  if (typeof slice.arrayBuffer === 'function') return new Uint8Array(await slice.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(slice);
  });
}

/** Detects the real image type from the first bytes, so a renamed file is caught. */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function validateImageFile(file: File): Promise<ImageCheck> {
  if (file.size === 0) return { ok: false, error: 'The file is empty.' };
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: `The file is ${formatMegabytes(file.size)}. The limit is ${formatMegabytes(MAX_PHOTO_BYTES)}.` };
  }

  const declared = file.type as ImageMime;
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!(declared in EXTENSIONS) || !EXTENSIONS[declared].includes(extension)) {
    return { ok: false, error: 'Only JPEG, PNG, and WebP images are allowed.' };
  }

  const detected = sniffImageType(await readHeader(file, 12));
  if (detected !== declared) {
    return { ok: false, error: 'The file content does not match its image type.' };
  }
  return { ok: true, contentType: detected, extension: STORED_EXTENSION[detected] };
}

/** "<parent uuid>/<new uuid>.<ext>", the format required by the database and Storage policies. */
export function photoPath(parentId: string, extension: string, fileId: string = crypto.randomUUID()): string {
  if (!isUuid(parentId) || !isUuid(fileId) || !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
    throw new Error('Invalid photo path parts.');
  }
  return `${parentId.toLowerCase()}/${fileId.toLowerCase()}.${extension}`;
}
