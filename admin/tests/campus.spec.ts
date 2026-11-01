import { describe, expect, test } from 'vitest';
import { describeError, NoRowsChangedError } from '@/lib/errors';
import { configProblem, isPrivilegedKey } from '@/lib/supabase';
import {
  buildingDependents,
  changeRole,
  createBuilding,
  deleteBuilding,
  getOwnRole,
  grantRole,
  removeRole,
  setDestinationRoom,
  updateRoom,
} from '@/services/campus';
import { BUILDING_ID, fakeClient, OTHER_USER_ID, ROOM_ID, USER_ID } from './helpers/fake-supabase';

const RLS_ERROR = { code: '42501', message: 'new row violates row-level security policy for table "buildings"' };

function jwt(payload: object): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

describe('permission-denied responses', () => {
  test('an insert blocked by RLS shows a permission message', async () => {
    const { client } = fakeClient(() => ({ error: RLS_ERROR }));
    const error = await createBuilding({
      code: 'ZZ', name: 'Test', description: null, entrance_name: null, entrance_lat: null, entrance_lng: null,
      arrival_radius: 10, sort_order: 0, is_active: false,
    }, client).catch((err) => err);
    expect(describeError(error)).toMatch(/don't have permission/);
  });

  test('an update that RLS silently filters out is reported', async () => {
    const { client, calls } = fakeClient(() => ({ data: [] }));
    await expect(updateRoom(ROOM_ID, { is_active: true }, client)).rejects.toBeInstanceOf(NoRowsChangedError);
    expect(calls[0]).toMatchObject({ table: 'rooms', action: 'update', payload: { is_active: true }, filters: [['id', ROOM_ID]] });
  });

  test('a delete that RLS silently filters out is reported', async () => {
    const { client } = fakeClient(() => ({ data: [] }));
    const error = await deleteBuilding(BUILDING_ID, client).catch((err) => err);
    expect(error).toBeInstanceOf(NoRowsChangedError);
    expect(describeError(error)).toMatch(/may not have permission/);
  });

  test('an expired session asks the user to sign in again', () => {
    expect(describeError({ code: 'PGRST303', message: 'JWT expired' })).toMatch(/session expired/);
  });

  test('network failures are explained', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toMatch(/Cannot reach Supabase/);
  });
});

describe('blocked deletes', () => {
  test('names the table that still refers to the record', () => {
    expect(describeError({
      code: '23503',
      message: 'update or delete on table "buildings" violates foreign key constraint "floors_building_id_fkey" on table "floors"',
      details: 'Key (id)=(x) is still referenced from table "floors".',
    })).toBe('This record still has linked floors. Remove or move them first.');
    expect(describeError({
      code: '23001',
      message: 'update or delete on table "rooms" violates RESTRICT setting of foreign key constraint "room_images_room_id_fkey" on table "room_images"',
    })).toBe('This record still has linked room photos. Remove or move them first.');
  });

  test('counts dependents before a building delete', async () => {
    const counts: Record<string, number> = { floors: 2, rooms: 3, building_images: 0 };
    const { client, calls } = fakeClient((call) => ({ count: counts[call.table] }));
    expect(await buildingDependents(BUILDING_ID, client)).toEqual({ floors: 2, rooms: 3, photos: 0 });
    expect(calls.every((call) => call.filters[0][1] === BUILDING_ID)).toBe(true);
  });
});

describe('constraint messages', () => {
  test.each([
    [{ code: '23505', message: 'duplicate key value violates unique constraint "buildings_code_key"' }, /building already uses this code/],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "rooms_building_room_number_key"' }, /room number/],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "floors_building_level_key"' }, /floor with that level/],
    [{ code: '23503', message: 'insert or update on table "rooms" violates foreign key constraint "rooms_floor_in_building_fkey"' }, /floor does not belong/],
    [{ code: '23514', message: 'new row violates check constraint "buildings_entrance_pair"' }, /both latitude and longitude/],
    [{ statusCode: '415', message: 'mime type text/plain is not supported' }, /JPEG, PNG, or WebP/],
    [{ message: 'Invalid login credentials' }, /Wrong email or password/],
  ])('%o', (error, expected) => {
    expect(describeError(error)).toMatch(expected);
  });
});

describe('destination linking', () => {
  test('linking only changes room_id, so the fixed route is kept', async () => {
    const { client, calls } = fakeClient((call) => ({ data: [{ id: 'registrar', room_id: (call.payload as { room_id: string }).room_id }] }));
    await setDestinationRoom('registrar', ROOM_ID, client);
    expect(calls[0]).toMatchObject({ table: 'destinations', action: 'update', payload: { room_id: ROOM_ID }, filters: [['id', 'registrar']] });
    expect(Object.keys(calls[0].payload as object)).toEqual(['room_id']);
  });

  test('unlinking sets room_id to null', async () => {
    const { client, calls } = fakeClient(() => ({ data: [{ id: 'registrar', room_id: null }] }));
    await setDestinationRoom('registrar', null, client);
    expect(calls[0].payload).toEqual({ room_id: null });
  });

  test('a duplicate room link is explained', async () => {
    const { client } = fakeClient(() => ({
      error: { code: '23505', message: 'duplicate key value violates unique constraint "destinations_room_id_key"' },
    }));
    const error = await setDestinationRoom('library', ROOM_ID, client).catch((err) => err);
    expect(describeError(error)).toBe('That room is already linked to another destination.');
  });
});

describe('roles', () => {
  test('reads only the signed-in user role', async () => {
    const { client, calls } = fakeClient(() => ({ data: [{ role: 'editor' }] }));
    expect(await getOwnRole(USER_ID, client)).toBe('editor');
    expect(calls[0]).toMatchObject({ table: 'user_roles', filters: [['user_id', USER_ID]], single: true });
  });

  test('unknown or missing roles count as no role', async () => {
    expect(await getOwnRole(USER_ID, fakeClient(() => ({ data: [] })).client)).toBeNull();
    expect(await getOwnRole(USER_ID, fakeClient(() => ({ data: [{ role: 'owner' }] })).client)).toBeNull();
  });

  test('grant records who granted it', async () => {
    const { client, calls } = fakeClient((call) => ({ data: [call.payload] }));
    await grantRole(OTHER_USER_ID, 'editor', USER_ID, client);
    expect(calls[0].payload).toEqual({ user_id: OTHER_USER_ID, role: 'editor', granted_by: USER_ID });
  });

  test('changing or removing your own role is refused by RLS and reported', async () => {
    const { client } = fakeClient(() => ({ data: [] }));
    await expect(changeRole(USER_ID, 'editor', USER_ID, client)).rejects.toBeInstanceOf(NoRowsChangedError);
    await expect(removeRole(USER_ID, client)).rejects.toBeInstanceOf(NoRowsChangedError);
  });

  test('granting to a UUID that is not an Auth user is explained', () => {
    expect(describeError({
      code: '23503',
      message: 'insert or update on table "user_roles" violates foreign key constraint "user_roles_user_id_fkey"',
    })).toMatch(/No Supabase Auth user has this ID/);
  });
});

describe('client configuration', () => {
  test('refuses keys that bypass RLS', () => {
    expect(isPrivilegedKey('sb_secret_abc')).toBe(true);
    expect(isPrivilegedKey(jwt({ role: 'service_role' }))).toBe(true);
    expect(isPrivilegedKey(jwt({ role: 'anon' }))).toBe(false);
    expect(isPrivilegedKey('sb_publishable_abc')).toBe(false);
    expect(configProblem('https://x.supabase.co', jwt({ role: 'service_role' }))).toBe('privileged-key');
    expect(configProblem('http://x.supabase.co', 'sb_publishable_abc')).toBe('missing');
    expect(configProblem('https://x.supabase.co', '')).toBe('missing');
    expect(configProblem('https://x.supabase.co', 'sb_publishable_abc')).toBeNull();
  });
});
