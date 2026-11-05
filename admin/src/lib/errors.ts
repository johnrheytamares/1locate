/** Thrown when an update or delete matched no row, which RLS reports as success. */
export class NoRowsChangedError extends Error {
  constructor() {
    super('Nothing was changed. You may not have permission, or the record was already removed.');
    this.name = 'NoRowsChangedError';
  }
}

/** Upload stored a file but its database record failed. */
export class PhotoUploadError extends Error {
  /** Set when the stored file could not be removed again. */
  readonly orphanPath: string | null;

  constructor(message: string, orphanPath: string | null) {
    super(message);
    this.name = 'PhotoUploadError';
    this.orphanPath = orphanPath;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  statusCode?: unknown;
  error?: unknown;
}

const UNIQUE_MESSAGES: Record<string, string> = {
  buildings_code_key: 'Another building already uses this code.',
  floors_building_level_key: 'This building already has a floor with that level.',
  rooms_building_room_number_key: 'Another room in this building already uses that room number.',
  destinations_room_id_key: 'That room is already linked to another destination.',
  navigation_feedback_session_id_key: 'Feedback for this navigation session was already submitted.',
  user_roles_pkey: 'This user already has a role. Change the existing role instead.',
  building_images_storage_path_key: 'This photo is already saved.',
  room_images_storage_path_key: 'This photo is already saved.',
};

const FOREIGN_KEY_MESSAGES: Record<string, string> = {
  user_roles_user_id_fkey: 'No Supabase Auth user has this ID. Create the user in the Dashboard first.',
  rooms_floor_in_building_fkey: 'The selected floor does not belong to the selected building.',
  rooms_building_id_fkey: 'The selected building no longer exists.',
  floors_building_id_fkey: 'The selected building no longer exists.',
  destinations_room_id_fkey: 'The selected room no longer exists.',
};

const BLOCKING_TABLES: Record<string, string> = {
  floors: 'floors',
  rooms: 'rooms or offices',
  building_images: 'building photos',
  room_images: 'room photos',
  floor_maps: 'floor maps',
};

const CHECK_MESSAGES: Record<string, string> = {
  buildings_entrance_pair: 'Enter both latitude and longitude, or leave both blank.',
  buildings_code_check: 'The building code format is not allowed.',
  building_images_path_check: 'The photo path does not match the building.',
  room_images_path_check: 'The photo path does not match the room.',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function constraintIn(source: string, names: Record<string, string>): string | null {
  const found = Object.keys(names).find((name) => source.includes(name));
  return found ? names[found] : null;
}

/** Postgres names the deleted table first and the table that still refers to it last. */
function blockingTable(source: string): string | null {
  const matches = [...source.matchAll(/(?:on|from) table "([a-z_]+)"/g)];
  const table = matches.at(-1)?.[1];
  return table ? BLOCKING_TABLES[table] ?? table.replace(/_/g, ' ') : null;
}

/** Turns Supabase, Storage, Auth, and network errors into a sentence for the screen. */
export function describeError(error: unknown): string {
  if (error instanceof NoRowsChangedError || error instanceof PhotoUploadError || error instanceof ValidationError) {
    return error.message;
  }
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';

  const value = error as ErrorLike;
  const code = text(value.code);
  const message = text(value.message);
  const source = `${message} ${text(value.details)} ${text(value.hint)}`;
  const status = String(value.statusCode ?? value.status ?? '');

  if (error instanceof TypeError && /fetch|network/i.test(message)) {
    return 'Cannot reach Supabase. Check your internet connection and try again.';
  }
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'This email address is not confirmed yet.';
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt expired/i.test(message)) {
    return 'Your session expired. Please sign in again.';
  }

  switch (code) {
    case '42501':
      return "You don't have permission to do this. Ask an Admin to check your role.";
    case '23505':
      return constraintIn(source, UNIQUE_MESSAGES) ?? 'This value is already used by another record.';
    case '23503':
    case '23001': {
      const insertProblem = constraintIn(source, FOREIGN_KEY_MESSAGES);
      if (insertProblem && !/still referenced|RESTRICT|update or delete/i.test(source)) return insertProblem;
      const table = blockingTable(source);
      return table
        ? `This record still has linked ${table}. Remove or move them first.`
        : 'This record is still used by other records. Remove or move them first.';
    }
    case '23514':
      return constraintIn(source, CHECK_MESSAGES) ?? 'A value is outside the allowed range.';
    case '22P02':
      return 'One of the values has the wrong format.';
    default:
      break;
  }

  if (status === '413' || /exceeded the maximum allowed size|payload too large|too large/i.test(source)) {
    return 'The file is larger than the allowed size.';
  }
  if (status === '415' || /mime type .* is not supported|invalid_mime_type/i.test(source)) {
    return 'This file type is not allowed. Use JPEG, PNG, or WebP.';
  }
  if (/row-level security|violates row level security/i.test(source) || status === '403') {
    return "You don't have permission to do this. Ask an Admin to check your role.";
  }
  return message || 'Something went wrong. Please try again.';
}
