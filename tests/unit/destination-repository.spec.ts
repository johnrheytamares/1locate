import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Each test starts with empty browser storage, including Node versions with native localStorage.
beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); },
    removeItem: (key: string) => { saved.delete(key); },
    clear: () => saved.clear(),
  });
});
import {
  fetchDestinations,
  getDestinationImageUrls,
  toCatalogDestination,
  toDestination,
} from '@/services/destination-repository';
import {
  getDestinations,
  getSelectedDestination,
  selectDestination,
  setDestinationCatalog,
} from '@/services/navigation.service';
import { DESTINATIONS } from '@/data/destinations';
import type { DestinationImage } from '@/models/campus';

const ROOM_ID = '30000000-0000-4000-8000-000000000001';
const BUILDING_ID = '10000000-0000-4000-8000-000000000001';
const ROOM_PHOTO = `${ROOM_ID}/40000000-0000-4000-8000-000000000001.jpg`;
const BUILDING_PHOTO = `${BUILDING_ID}/40000000-0000-4000-8000-000000000002.webp`;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'registrar',
    name: 'Registrar Office',
    building: 'Administration Building',
    type: 'Office',
    entrance_name: 'Administration Building Entrance',
    entrance_lat: null,
    entrance_lng: null,
    arrival_radius: 10,
    indoor_route: [
      { id: 1, direction: 'straight', distance: 3, mode: 'indoor' },
      { id: 2, direction: 'right', distance: 2, mode: 'indoor' },
    ],
    ...overrides,
  };
}

function catalogRow(overrides: Record<string, unknown> = {}) {
  return row({
    type: 'office',
    room_id: ROOM_ID,
    building_id: BUILDING_ID,
    floor_name: 'Ground Floor',
    floor_level: 1,
    room_number: 'A-101',
    description: 'Enrollment records and transcripts.',
    room_images: [{ storage_path: ROOM_PHOTO, caption: 'Front desk' }],
    building_images: [{ storage_path: BUILDING_PHOTO, caption: null }],
    ...overrides,
  });
}

type Response = { data?: unknown[] | null; error?: { code?: string; message: string } | null } | Error;

function fakeClient(responses: Record<string, Response>) {
  const calls: { relation: string; columns: string; order: string }[] = [];
  const client = {
    from(relation: string) {
      const call = { relation, columns: '', order: '' };
      calls.push(call);
      const response = responses[relation] ?? { error: { code: 'PGRST205', message: 'relation missing' } };
      const builder = {
        select(columns: string) { call.columns = columns; return builder; },
        order(column: string) { call.order = column; return builder; },
        abortSignal() {
          return response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

afterEach(() => {
  setDestinationCatalog(DESTINATIONS);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Supabase destination rows', () => {
  test('maps a valid row into the app model', () => {
    const destination = toDestination(row());
    expect(destination?.outdoorTarget).toEqual({
      name: 'Administration Building Entrance',
      latitude: null,
      longitude: null,
      arrivalRadius: 10,
    });
    expect(destination?.indoorRoute.map((step) => step.direction)).toEqual(['straight', 'right']);
    expect(destination?.details).toBeUndefined();
  });

  test('keeps surveyed coordinates when both are valid', () => {
    const destination = toDestination(row({ entrance_lat: 13.4, entrance_lng: 121.2 }));
    expect(destination?.outdoorTarget.latitude).toBe(13.4);
    expect(destination?.outdoorTarget.longitude).toBe(121.2);
  });

  test('rejects invalid rows', () => {
    expect(toDestination(null)).toBeNull();
    expect(toDestination(row({ name: '' }))).toBeNull();
    expect(toDestination(row({ name: 'x'.repeat(121) }))).toBeNull();
    expect(toDestination(row({ entrance_lat: 95, entrance_lng: 121 }))).toBeNull();
    expect(toDestination(row({ entrance_lat: 13.4, entrance_lng: null }))).toBeNull();
    expect(toDestination(row({ entrance_lat: '13.4', entrance_lng: '121.2' }))).toBeNull();
    expect(toDestination(row({ arrival_radius: 0 }))).toBeNull();
    expect(toDestination(row({ arrival_radius: '10' }))).toBeNull();
    expect(toDestination(row({ indoor_route: [] }))).toBeNull();
    expect(toDestination(row({ indoor_route: [{ id: 1, direction: 'up', distance: 3 }] }))).toBeNull();
    expect(toDestination(row({ indoor_route: [{ id: 1, direction: 'left', distance: -1 }] }))).toBeNull();
  });

  test('forces route steps to indoor mode', () => {
    const destination = toDestination(row({
      indoor_route: [{ id: 1, direction: 'straight', distance: 3, mode: 'outdoor' }],
    }));
    expect(destination?.indoorRoute[0].mode).toBe('indoor');
  });

  test('a loaded catalog replaces the bundled list and clears a missing selection', () => {
    selectDestination('library');
    setDestinationCatalog([toDestination(row())!]);
    expect(getDestinations().map((item) => item.id)).toEqual(['registrar']);
    expect(selectDestination('library')).toBeNull();
    setDestinationCatalog(DESTINATIONS);
    expect(getDestinations()).toHaveLength(4);
  });

  test('reopening navigation after a catalog refresh uses the updated entrance coordinates', () => {
    setDestinationCatalog([toDestination(row({ entrance_lat: 80, entrance_lng: 78 }))!]);
    selectDestination('registrar');
    expect(getSelectedDestination()?.outdoorTarget).toMatchObject({ latitude: 80, longitude: 78 });

    setDestinationCatalog([toDestination(row({ entrance_lat: 13.4, entrance_lng: 121.2 }))!]);
    expect(getSelectedDestination()?.outdoorTarget).toMatchObject({ latitude: 13.4, longitude: 121.2 });
  });
});

describe('navigation_catalog rows', () => {
  test('maps room, floor, and photo details', () => {
    const destination = toCatalogDestination(catalogRow());
    expect(destination?.details).toEqual({
      roomId: ROOM_ID,
      buildingId: BUILDING_ID,
      floorName: 'Ground Floor',
      floorLevel: 1,
      roomNumber: 'A-101',
      description: 'Enrollment records and transcripts.',
      images: [
        { bucket: 'room-photos', storagePath: ROOM_PHOTO, caption: 'Front desk' },
        { bucket: 'building-photos', storagePath: BUILDING_PHOTO, caption: null },
      ],
    });
  });

  test('a legacy row without room data gets empty details', () => {
    const destination = toCatalogDestination(row());
    expect(destination?.details).toEqual({
      roomId: null,
      buildingId: null,
      floorName: null,
      floorLevel: null,
      roomNumber: null,
      description: null,
      images: [],
    });
  });

  test('drops malformed photo references and keeps the destination', () => {
    const destination = toCatalogDestination(catalogRow({
      room_images: [
        { storage_path: '../secret.jpg' },
        { storage_path: `${ROOM_ID}/photo.gif` },
        { storage_path: ROOM_PHOTO, caption: 'x'.repeat(201) },
        'not an object',
      ],
      building_images: null,
    }));
    expect(destination?.details?.images).toEqual([
      { bucket: 'room-photos', storagePath: ROOM_PHOTO, caption: null },
    ]);
  });

  test('rejects rows with invalid detail fields', () => {
    expect(toCatalogDestination(catalogRow({ room_id: 'not-a-uuid' }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ building_id: 42 }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ floor_level: 1.5 }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ floor_level: 999 }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ floor_name: 'x'.repeat(61) }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ room_number: 'x'.repeat(21) }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ description: 'x'.repeat(2001) }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ room_images: 'photo.jpg' }))).toBeNull();
    expect(toCatalogDestination(catalogRow({ name: '' }))).toBeNull();
  });
});

describe('fetchDestinations', () => {
  test('uses the navigation_catalog view when it exists', async () => {
    const { client, calls } = fakeClient({ navigation_catalog: { data: [catalogRow()] } });
    const result = await fetchDestinations(client);
    expect(result.source).toBe('supabase');
    expect(result.failed).toBe(false);
    expect(result.destinations[0].details?.roomNumber).toBe('A-101');
    expect(calls).toHaveLength(1);
    expect(calls[0].order).toBe('sort_order');
    expect(calls[0].columns).toContain('room_images');
  });

  test('falls back to the destinations table when the view is missing', async () => {
    const { client, calls } = fakeClient({
      navigation_catalog: { error: { code: 'PGRST205', message: 'Could not find the table' } },
      destinations: { data: [row()] },
    });
    const result = await fetchDestinations(client);
    expect(result.source).toBe('supabase-legacy');
    expect(result.failed).toBe(false);
    expect(result.destinations[0].details).toBeUndefined();
    expect(calls.map((call) => call.relation)).toEqual(['navigation_catalog', 'destinations']);
    expect(calls[1].columns).not.toContain('room_images');
  });

  test('also treats Postgres 42P01 as a missing view', async () => {
    const { client } = fakeClient({
      navigation_catalog: { error: { code: '42P01', message: 'relation does not exist' } },
      destinations: { data: [row()] },
    });
    expect((await fetchDestinations(client)).source).toBe('supabase-legacy');
  });

  test('uses bundled data without a failure flag when Supabase is not configured', async () => {
    const result = await fetchDestinations(null);
    expect(result.source).toBe('local');
    expect(result.failed).toBe(false);
    expect(result.destinations).toBe(DESTINATIONS);
  });

  test.each([
    ['a view error that is not "missing"', { navigation_catalog: { error: { code: '42501', message: 'permission denied' } } }],
    ['both relations missing', {}],
    ['a legacy table error', {
      navigation_catalog: { error: { code: 'PGRST205', message: 'missing' } },
      destinations: { error: { code: '500', message: 'server error' } },
    }],
    ['a network error', { navigation_catalog: new Error('Failed to fetch') }],
    ['no rows', { navigation_catalog: { data: [] } }],
    ['only invalid rows', { navigation_catalog: { data: [catalogRow({ arrival_radius: -1 })] } }],
    ['duplicate ids', { navigation_catalog: { data: [catalogRow(), catalogRow({ room_id: null })] } }],
  ] as [string, Record<string, Response>][])('falls back to bundled data on %s', async (_name, responses) => {
    const { client } = fakeClient(responses);
    const result = await fetchDestinations(client);
    expect(result.source).toBe('local');
    expect(result.failed).toBe(true);
    expect(result.destinations).toBe(DESTINATIONS);
    expect(result.reason).toBeTruthy();
  });

  test('uses the last successful catalog when a later request fails', async () => {
    const online = fakeClient({ navigation_catalog: { data: [catalogRow()] } });
    expect((await fetchDestinations(online.client)).source).toBe('supabase');
    const offline = fakeClient({ navigation_catalog: new Error('offline') });
    const result = await fetchDestinations(offline.client);
    expect(result.source).toBe('cache');
    expect(result.failed).toBe(true);
    expect(result.destinations[0].details?.roomNumber).toBe('A-101');
  });

  test('skips individual invalid rows and keeps the valid ones', async () => {
    const { client } = fakeClient({
      navigation_catalog: { data: [catalogRow(), catalogRow({ id: 'broken', indoor_route: [] })] },
    });
    const result = await fetchDestinations(client);
    expect(result.destinations.map((item) => item.id)).toEqual(['registrar']);
  });
});

describe('getDestinationImageUrls', () => {
  const images: DestinationImage[] = [
    { bucket: 'room-photos', storagePath: ROOM_PHOTO, caption: 'Front desk' },
    { bucket: 'building-photos', storagePath: BUILDING_PHOTO, caption: null },
  ];

  function storageClient(handler: (bucket: string, paths: string[], expiresIn: number) => Promise<unknown>) {
    return {
      storage: {
        from: (bucket: string) => ({
          createSignedUrls: (paths: string[], expiresIn: number) => handler(bucket, paths, expiresIn),
        }),
      },
    } as unknown as SupabaseClient;
  }

  test('signs each bucket and keeps photo order', async () => {
    const handler = vi.fn(async (bucket: string, paths: string[]) => ({
      data: paths.map((path) => ({ path, error: null, signedUrl: `https://example.test/${bucket}/${path}?token=t` })),
      error: null,
    }));
    const urls = await getDestinationImageUrls(images, storageClient(handler));
    expect(urls).toEqual([
      { url: `https://example.test/room-photos/${ROOM_PHOTO}?token=t`, caption: 'Front desk' },
      { url: `https://example.test/building-photos/${BUILDING_PHOTO}?token=t`, caption: null },
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][2]).toBeGreaterThan(0);
  });

  test('skips photos that cannot be signed or have unsafe URLs', async () => {
    const client = storageClient(async (bucket, paths) => (
      bucket === 'room-photos'
        ? { data: paths.map((path) => ({ path, error: null, signedUrl: 'javascript:alert(1)' })), error: null }
        : { data: null, error: { message: 'Object not found' } }
    ));
    expect(await getDestinationImageUrls(images, client)).toEqual([]);
  });

  test('a storage exception leaves only the other bucket', async () => {
    const client = storageClient(async (bucket, paths) => {
      if (bucket === 'building-photos') throw new Error('offline');
      return { data: paths.map((path) => ({ path, error: null, signedUrl: `https://example.test/${path}` })), error: null };
    });
    expect(await getDestinationImageUrls(images, client)).toEqual([
      { url: `https://example.test/${ROOM_PHOTO}`, caption: 'Front desk' },
    ]);
  });

  test('returns nothing without a client or photos', async () => {
    expect(await getDestinationImageUrls(images, null)).toEqual([]);
    expect(await getDestinationImageUrls([], storageClient(async () => { throw new Error('unused'); }))).toEqual([]);
  });
});
