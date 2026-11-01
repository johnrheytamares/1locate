import { describe, expect, test } from 'vitest';
import {
  emptyBuildingForm,
  emptyRoomForm,
  safeRedirect,
  validateBuilding,
  validateCaption,
  validateCredentials,
  validateFloor,
  validateRoleGrant,
  validateRoom,
  type BuildingForm,
  type RoomForm,
} from '@/lib/validation';
import { BUILDING_ID, OTHER_USER_ID, USER_ID } from './helpers/fake-supabase';

const FLOOR_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_BUILDING_ID = '10000000-0000-4000-8000-000000000002';

function building(overrides: Partial<BuildingForm> = {}): BuildingForm {
  return { ...emptyBuildingForm(), code: 'admin', name: '  Administration Building  ', ...overrides };
}

function room(overrides: Partial<RoomForm> = {}): RoomForm {
  return { ...emptyRoomForm(), buildingId: BUILDING_ID, floorId: FLOOR_ID, name: 'Registrar', ...overrides };
}

const floors = [{ id: FLOOR_ID, building_id: BUILDING_ID }];

describe('building validation', () => {
  test('builds a payload with trimmed text, uppercase code, and blank coordinates as null', () => {
    const result = validateBuilding(building());
    expect(result).toEqual({
      ok: true,
      value: {
        code: 'ADMIN',
        name: 'Administration Building',
        description: null,
        entrance_name: null,
        entrance_lat: null,
        entrance_lng: null,
        arrival_radius: 10,
        sort_order: 0,
        is_active: false,
      },
    });
  });

  test('accepts surveyed coordinates when both are given', () => {
    const result = validateBuilding(building({ entranceLat: '13.4105', entranceLng: '121.1802' }));
    expect(result.ok && [result.value.entrance_lat, result.value.entrance_lng]).toEqual([13.4105, 121.1802]);
  });

  test('requires latitude and longitude together', () => {
    const onlyLat = validateBuilding(building({ entranceLat: '13.4' }));
    expect(onlyLat.ok).toBe(false);
    expect(!onlyLat.ok && onlyLat.errors.entranceLng).toMatch(/both latitude and longitude/);
    const onlyLng = validateBuilding(building({ entranceLng: '121.2' }));
    expect(!onlyLng.ok && onlyLng.errors.entranceLat).toMatch(/both latitude and longitude/);
  });

  test.each([
    [{ code: '' }, 'code'],
    [{ code: '-ADMIN' }, 'code'],
    [{ code: 'A'.repeat(21) }, 'code'],
    [{ code: 'ADMIN BLDG' }, 'code'],
    [{ name: '   ' }, 'name'],
    [{ name: 'x'.repeat(121) }, 'name'],
    [{ description: 'x'.repeat(2001) }, 'description'],
    [{ entranceName: 'x'.repeat(121) }, 'entranceName'],
    [{ entranceLat: '95', entranceLng: '121' }, 'entranceLat'],
    [{ entranceLat: '13', entranceLng: '-181' }, 'entranceLng'],
    [{ entranceLat: '13.4abc', entranceLng: '121' }, 'entranceLat'],
    [{ entranceLat: '1e2', entranceLng: '121' }, 'entranceLat'],
    [{ arrivalRadius: '0' }, 'arrivalRadius'],
    [{ arrivalRadius: '100.5' }, 'arrivalRadius'],
    [{ arrivalRadius: '' }, 'arrivalRadius'],
    [{ sortOrder: '1.5' }, 'sortOrder'],
    [{ sortOrder: '99999999999' }, 'sortOrder'],
  ] as [Partial<BuildingForm>, keyof BuildingForm][])('rejects %o on %s', (overrides, field) => {
    const result = validateBuilding(building(overrides));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[field]).toBeTruthy();
  });
});

describe('floor validation', () => {
  test('accepts a valid floor', () => {
    expect(validateFloor({ buildingId: BUILDING_ID, level: '1', name: ' Ground Floor ' }))
      .toEqual({ ok: true, value: { building_id: BUILDING_ID, level: 1, name: 'Ground Floor' } });
  });

  test('rejects missing building, out-of-range level, and long names', () => {
    const result = validateFloor({ buildingId: '', level: '201', name: 'x'.repeat(61) });
    expect(!result.ok && Object.keys(result.errors).filter((key) => result.errors[key as keyof typeof result.errors]))
      .toEqual(['buildingId', 'level', 'name']);
    expect(validateFloor({ buildingId: BUILDING_ID, level: '-6', name: 'B6' }).ok).toBe(false);
    expect(validateFloor({ buildingId: BUILDING_ID, level: '', name: 'B6' }).ok).toBe(false);
  });
});

describe('room validation', () => {
  test('accepts a valid room', () => {
    const result = validateRoom(room({ roomNumber: ' A-101 ', type: 'laboratory' }), floors);
    expect(result.ok && result.value).toMatchObject({
      building_id: BUILDING_ID,
      floor_id: FLOOR_ID,
      name: 'Registrar',
      room_number: 'A-101',
      type: 'laboratory',
    });
  });

  test('floor is optional', () => {
    const result = validateRoom(room({ floorId: '' }), floors);
    expect(result.ok && result.value.floor_id).toBeNull();
  });

  test('rejects a floor from another building', () => {
    const result = validateRoom(room({ buildingId: OTHER_BUILDING_ID }), floors);
    expect(!result.ok && result.errors.floorId).toMatch(/selected building/);
  });

  test('rejects invalid type, long room number, and long description', () => {
    expect(validateRoom(room({ type: 'cafeteria' }), floors).ok).toBe(false);
    expect(validateRoom(room({ roomNumber: 'x'.repeat(21) }), floors).ok).toBe(false);
    expect(validateRoom(room({ description: 'x'.repeat(2001) }), floors).ok).toBe(false);
    expect(validateRoom(room({ name: '' }), floors).ok).toBe(false);
  });
});

describe('other inputs', () => {
  test('caption is optional and limited to 200 characters', () => {
    expect(validateCaption('  ')).toEqual({ ok: true, value: null });
    expect(validateCaption(' Front ')).toEqual({ ok: true, value: 'Front' });
    expect(validateCaption('x'.repeat(201)).ok).toBe(false);
  });

  test('role grants need a valid UUID of another user', () => {
    expect(validateRoleGrant({ userId: OTHER_USER_ID.toUpperCase(), role: 'editor' }, USER_ID))
      .toEqual({ ok: true, value: { user_id: OTHER_USER_ID, role: 'editor' } });
    const self = validateRoleGrant({ userId: USER_ID, role: 'admin' }, USER_ID);
    expect(!self.ok && self.errors.userId).toMatch(/own role/);
    expect(validateRoleGrant({ userId: 'someone@example.com', role: 'editor' }, USER_ID).ok).toBe(false);
    expect(validateRoleGrant({ userId: OTHER_USER_ID, role: 'owner' }, USER_ID).ok).toBe(false);
  });

  test('credentials need an email and a password', () => {
    expect(validateCredentials('admin@example.com', 'secret')).toBeNull();
    expect(validateCredentials('not-an-email', 'secret')).toMatch(/email/);
    expect(validateCredentials('admin@example.com', '')).toMatch(/password/);
  });

  test('login redirects stay inside the app', () => {
    expect(safeRedirect('/rooms?x=1')).toBe('/rooms?x=1');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect('/\\evil.example')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});
