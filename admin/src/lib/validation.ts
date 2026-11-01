import { APP_ROLES, ROOM_TYPES, type AppRole, type Floor, type RoomType } from '@/types';

/** Limits copied from the Phase 4A check constraints. */
export const LIMITS = {
  buildingCode: 20,
  name: 120,
  floorName: 60,
  roomNumber: 20,
  description: 2000,
  caption: 200,
  minFloorLevel: -5,
  maxFloorLevel: 200,
  maxArrivalRadius: 100,
  minSortOrder: -2147483648,
  maxSortOrder: 2147483647,
} as const;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILDING_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const INTEGER_PATTERN = /^-?\d+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors<Form> = Partial<Record<keyof Form, string>>;

export type ValidationResult<Form, Payload> =
  | { ok: true; value: Payload }
  | { ok: false; errors: FieldErrors<Form> };

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function requiredText(value: string, max: number, label: string): [string | null, string | undefined] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [null, `${label} is required.`];
  if (trimmed.length > max) return [null, `${label} must be ${max} characters or fewer.`];
  return [trimmed, undefined];
}

function optionalText(value: string, max: number, label: string): [string | null, string | undefined] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [null, undefined];
  if (trimmed.length > max) return [null, `${label} must be ${max} characters or fewer.`];
  return [trimmed, undefined];
}

function integer(value: string, min: number, max: number, label: string, fallback?: number): [number | null, string | undefined] {
  const trimmed = value.trim();
  if (trimmed.length === 0 && fallback !== undefined) return [fallback, undefined];
  if (!INTEGER_PATTERN.test(trimmed)) return [null, `${label} must be a whole number.`];
  const parsed = Number(trimmed);
  if (parsed < min || parsed > max) return [null, `${label} must be between ${min} and ${max}.`];
  return [parsed, undefined];
}

function decimal(value: string): number | null {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function finish<Form, Payload>(errors: FieldErrors<Form>, build: () => Payload): ValidationResult<Form, Payload> {
  return Object.values(errors).some(Boolean) ? { ok: false, errors } : { ok: true, value: build() };
}

// Buildings --------------------------------------------------------------------

export interface BuildingForm {
  code: string;
  name: string;
  description: string;
  entranceName: string;
  entranceLat: string;
  entranceLng: string;
  arrivalRadius: string;
  sortOrder: string;
  isActive: boolean;
}

export interface BuildingPayload {
  code: string;
  name: string;
  description: string | null;
  entrance_name: string | null;
  entrance_lat: number | null;
  entrance_lng: number | null;
  arrival_radius: number;
  sort_order: number;
  is_active: boolean;
}

export function emptyBuildingForm(): BuildingForm {
  return {
    code: '',
    name: '',
    description: '',
    entranceName: '',
    entranceLat: '',
    entranceLng: '',
    arrivalRadius: '10',
    sortOrder: '0',
    isActive: false,
  };
}

export function validateBuilding(form: BuildingForm): ValidationResult<BuildingForm, BuildingPayload> {
  const errors: FieldErrors<BuildingForm> = {};

  const code = form.code.trim().toUpperCase();
  if (code.length === 0) errors.code = 'Code is required.';
  else if (!BUILDING_CODE_PATTERN.test(code)) {
    errors.code = 'Use 1-20 characters: A-Z, 0-9, "_" or "-", starting with a letter or number.';
  }

  const [name, nameError] = requiredText(form.name, LIMITS.name, 'Name');
  errors.name = nameError;
  const [description, descriptionError] = optionalText(form.description, LIMITS.description, 'Description');
  errors.description = descriptionError;
  const [entranceName, entranceNameError] = optionalText(form.entranceName, LIMITS.name, 'Entrance name');
  errors.entranceName = entranceNameError;

  const latBlank = form.entranceLat.trim().length === 0;
  const lngBlank = form.entranceLng.trim().length === 0;
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (latBlank !== lngBlank) {
    const message = 'Enter both latitude and longitude, or leave both blank until the entrance is surveyed.';
    if (latBlank) errors.entranceLat = message;
    else errors.entranceLng = message;
  } else if (!latBlank) {
    latitude = decimal(form.entranceLat);
    longitude = decimal(form.entranceLng);
    if (latitude === null || latitude < -90 || latitude > 90) {
      errors.entranceLat = 'Latitude must be a number between -90 and 90.';
    }
    if (longitude === null || longitude < -180 || longitude > 180) {
      errors.entranceLng = 'Longitude must be a number between -180 and 180.';
    }
  }

  const radius = decimal(form.arrivalRadius);
  if (radius === null || radius <= 0 || radius > LIMITS.maxArrivalRadius) {
    errors.arrivalRadius = `Arrival radius must be more than 0 and at most ${LIMITS.maxArrivalRadius} meters.`;
  }

  const [sortOrder, sortError] = integer(form.sortOrder, LIMITS.minSortOrder, LIMITS.maxSortOrder, 'Display order', 0);
  errors.sortOrder = sortError;

  return finish(errors, () => ({
    code,
    name: name!,
    description,
    entrance_name: entranceName,
    entrance_lat: latitude,
    entrance_lng: longitude,
    arrival_radius: radius!,
    sort_order: sortOrder!,
    is_active: form.isActive,
  }));
}

// Floors -----------------------------------------------------------------------

export interface FloorForm {
  buildingId: string;
  level: string;
  name: string;
}

export interface FloorPayload {
  building_id: string;
  level: number;
  name: string;
}

export function validateFloor(form: FloorForm): ValidationResult<FloorForm, FloorPayload> {
  const errors: FieldErrors<FloorForm> = {};
  if (!isUuid(form.buildingId)) errors.buildingId = 'Choose a building.';
  const [level, levelError] = integer(form.level, LIMITS.minFloorLevel, LIMITS.maxFloorLevel, 'Level');
  errors.level = levelError;
  const [name, nameError] = requiredText(form.name, LIMITS.floorName, 'Floor name');
  errors.name = nameError;
  return finish(errors, () => ({ building_id: form.buildingId, level: level!, name: name! }));
}

// Rooms ------------------------------------------------------------------------

export interface RoomForm {
  buildingId: string;
  floorId: string;
  name: string;
  roomNumber: string;
  type: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
}

export interface RoomPayload {
  building_id: string;
  floor_id: string | null;
  name: string;
  room_number: string | null;
  type: RoomType;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export function emptyRoomForm(): RoomForm {
  return {
    buildingId: '',
    floorId: '',
    name: '',
    roomNumber: '',
    type: 'office',
    description: '',
    sortOrder: '0',
    isActive: false,
  };
}

/** `floors` is used to make sure the chosen floor belongs to the chosen building. */
export function validateRoom(form: RoomForm, floors: Pick<Floor, 'id' | 'building_id'>[]): ValidationResult<RoomForm, RoomPayload> {
  const errors: FieldErrors<RoomForm> = {};
  if (!isUuid(form.buildingId)) errors.buildingId = 'Choose a building.';

  let floorId: string | null = null;
  if (form.floorId) {
    const floor = floors.find((item) => item.id === form.floorId);
    if (!floor || floor.building_id !== form.buildingId) errors.floorId = 'Choose a floor of the selected building.';
    else floorId = floor.id;
  }

  const [name, nameError] = requiredText(form.name, LIMITS.name, 'Name');
  errors.name = nameError;
  const [roomNumber, roomNumberError] = optionalText(form.roomNumber, LIMITS.roomNumber, 'Room number');
  errors.roomNumber = roomNumberError;
  if (!(ROOM_TYPES as readonly string[]).includes(form.type)) errors.type = 'Choose a room type.';
  const [description, descriptionError] = optionalText(form.description, LIMITS.description, 'Description');
  errors.description = descriptionError;
  const [sortOrder, sortError] = integer(form.sortOrder, LIMITS.minSortOrder, LIMITS.maxSortOrder, 'Display order', 0);
  errors.sortOrder = sortError;

  return finish(errors, () => ({
    building_id: form.buildingId,
    floor_id: floorId,
    name: name!,
    room_number: roomNumber,
    type: form.type as RoomType,
    description,
    sort_order: sortOrder!,
    is_active: form.isActive,
  }));
}

// Photos -----------------------------------------------------------------------

export function validateCaption(value: string): ValidationResult<{ caption: string }, string | null> {
  const [caption, error] = optionalText(value, LIMITS.caption, 'Caption');
  return error ? { ok: false, errors: { caption: error } } : { ok: true, value: caption };
}

// Roles ------------------------------------------------------------------------

export interface RoleGrantForm {
  userId: string;
  role: string;
}

export function validateRoleGrant(
  form: RoleGrantForm,
  currentUserId: string,
): ValidationResult<RoleGrantForm, { user_id: string; role: AppRole }> {
  const errors: FieldErrors<RoleGrantForm> = {};
  const userId = form.userId.trim().toLowerCase();
  if (!isUuid(userId)) errors.userId = 'Paste the User UID from Supabase Dashboard → Authentication → Users.';
  else if (userId === currentUserId.toLowerCase()) errors.userId = 'You cannot change your own role.';
  if (!(APP_ROLES as string[]).includes(form.role)) errors.role = 'Choose Admin or Editor.';
  return finish(errors, () => ({ user_id: userId, role: form.role as AppRole }));
}

// Sign in ----------------------------------------------------------------------

export function validateCredentials(email: string, password: string): string | null {
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.';
  if (password.length === 0) return 'Enter your password.';
  return null;
}

/** Only allow redirects to paths inside this app. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  return value;
}
