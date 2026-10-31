import { afterEach, describe, expect, test, vi } from 'vitest';
import { DESTINATIONS } from '@/data/destinations';
import type { DestinationLoadResult } from '@/services/destination-repository';
import { createDestinationCatalog } from '@/composables/useDestinationCatalog';
import {
  destinationTypeLabel,
  floorLabel,
  summarizeDestination,
} from '@/services/destination-details.service';
import {
  getDestination,
  getDestinations,
  getSelectedDestination,
  selectDestination,
  setDestinationCatalog,
} from '@/services/navigation.service';
import type { Destination } from '@/models/navigation';

const ROOM_ID = '30000000-0000-4000-8000-000000000001';

function roomDestination(): Destination {
  return {
    ...DESTINATIONS[0],
    id: 'registrar',
    type: 'office',
    details: {
      roomId: ROOM_ID,
      buildingId: null,
      floorName: 'Ground Floor',
      floorLevel: 1,
      roomNumber: 'A-101',
      description: 'Enrollment records.',
      images: [{ bucket: 'room-photos', storagePath: `${ROOM_ID}/40000000-0000-4000-8000-000000000001.png`, caption: null }],
    },
  };
}

function result(overrides: Partial<DestinationLoadResult>): DestinationLoadResult {
  return { destinations: DESTINATIONS, source: 'local', failed: false, ...overrides };
}

afterEach(() => {
  setDestinationCatalog(DESTINATIONS);
  selectDestination('__none__');
  vi.restoreAllMocks();
});

describe('destination summary', () => {
  test('shows room details when the catalog has them', () => {
    const summary = summarizeDestination(roomDestination());
    expect(summary).toMatchObject({
      name: 'Registrar Office',
      typeLabel: 'Office',
      building: 'Administration Building',
      floor: 'Ground Floor',
      roomNumber: 'A-101',
      description: 'Enrollment records.',
      entranceName: 'Administration Building Entrance',
      indoorMeters: 7,
    });
    expect(summary.images).toHaveLength(1);
  });

  test('hides missing details for bundled destinations', () => {
    const summary = summarizeDestination(DESTINATIONS[1]);
    expect(summary.floor).toBeNull();
    expect(summary.roomNumber).toBeNull();
    expect(summary.description).toBeNull();
    expect(summary.images).toEqual([]);
    expect(summary.typeLabel).toBe('Library');
  });

  test('maps stored room types to labels and keeps older labels', () => {
    expect(destinationTypeLabel('laboratory')).toBe('Laboratory');
    expect(destinationTypeLabel('Office')).toBe('Office');
    expect(destinationTypeLabel('Clinic')).toBe('Clinic');
  });

  test('floor label prefers the name and falls back to the level', () => {
    expect(floorLabel('Second Floor', 2)).toBe('Second Floor');
    expect(floorLabel(null, 0)).toBe('Ground level');
    expect(floorLabel(null, 3)).toBe('Level 3');
    expect(floorLabel(null, -1)).toBe('Basement 1');
    expect(floorLabel(null, null)).toBeNull();
  });
});

describe('confirm flow in the navigation service', () => {
  test('looking up a destination does not select it', () => {
    setDestinationCatalog([roomDestination()]);
    expect(getDestination('registrar')?.details?.roomNumber).toBe('A-101');
    expect(getSelectedDestination()).toBeNull();
    expect(getDestination('missing')).toBeNull();
  });

  test('details are deep copies', () => {
    setDestinationCatalog([roomDestination()]);
    const copy = getDestination('registrar')!;
    copy.details!.images[0].caption = 'changed';
    copy.details!.roomNumber = 'changed';
    expect(getDestination('registrar')?.details?.images[0].caption).toBeNull();
    expect(getDestination('registrar')?.details?.roomNumber).toBe('A-101');
  });

  test('confirming selects the destination with its details', () => {
    setDestinationCatalog([roomDestination()]);
    expect(selectDestination('registrar')).not.toBeNull();
    expect(getSelectedDestination()?.details?.floorName).toBe('Ground Floor');
  });
});

describe('shared destination catalog', () => {
  test('labels match the catalog that was loaded', async () => {
    const cases: [DestinationLoadResult, string, boolean][] = [
      [result({ source: 'supabase', destinations: [roomDestination()] }), 'Live campus data', true],
      [result({ source: 'supabase-legacy' }), 'Live campus data (basic details)', true],
      [result({ source: 'local', failed: false }), 'Offline data', false],
      [result({ source: 'local', failed: true, reason: 'offline' }), 'Offline data · campus server unavailable', false],
    ];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const [loadResult, label, live] of cases) {
      const catalog = createDestinationCatalog(async () => loadResult);
      expect(catalog.sourceLabel.value).toBe('Loading campus data...');
      await catalog.load();
      expect(catalog.sourceLabel.value).toBe(label);
      expect(catalog.isLive.value).toBe(live);
      expect(getDestinations().map((item) => item.id)).toEqual(loadResult.destinations.map((item) => item.id));
    }
  });

  test('offline fallback replaces an earlier catalog when nothing live was loaded', async () => {
    setDestinationCatalog([roomDestination()]);
    const catalog = createDestinationCatalog(async () => result({ failed: true }));
    await catalog.load();
    expect(getDestinations()).toHaveLength(DESTINATIONS.length);
    expect(catalog.failed.value).toBe(true);
  });

  test('a failed refresh keeps the live catalog and its label', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(result({ source: 'supabase', destinations: [roomDestination()] }))
      .mockResolvedValueOnce(result({ source: 'local', failed: true, reason: 'offline' }));
    const catalog = createDestinationCatalog(fetcher);
    await catalog.load();
    await catalog.load();
    expect(catalog.sourceLabel.value).toBe('Live campus data');
    expect(getDestinations().map((item) => item.id)).toEqual(['registrar']);
    expect(getDestination('registrar')?.details?.roomNumber).toBe('A-101');
  });

  test('retry after a failure can switch to live data', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(result({ source: 'local', failed: true, reason: 'offline' }))
      .mockResolvedValueOnce(result({ source: 'supabase', destinations: [roomDestination()] }));
    const catalog = createDestinationCatalog(fetcher);
    await catalog.load();
    expect(catalog.failed.value).toBe(true);
    await catalog.load();
    expect(catalog.failed.value).toBe(false);
    expect(catalog.sourceLabel.value).toBe('Live campus data');
  });

  test('concurrent loads share one request and ensureLoaded loads once', async () => {
    const fetcher = vi.fn(async () => result({ source: 'supabase-legacy' }));
    const catalog = createDestinationCatalog(fetcher);
    await Promise.all([catalog.load(), catalog.load(), catalog.ensureLoaded()]);
    await catalog.ensureLoaded();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
