import { describe, expect, it } from 'vitest';
import { destinationPayload, validatedRoute, WalkingPeaks } from '../src/lib/route-editor';
import type { Building, Room } from '../src/types';
import { createDestination, saveDestinationRoute } from '../src/services/campus';
import { fakeClient } from './helpers/fake-supabase';

describe('route authoring', () => {
  it('reports database uniqueness and permission failures without claiming a save', async () => {
    const payload = { id: 'test', room_id: 'room', name: 'Test', type: 'office', building: 'Main', entrance_name: 'Entry', entrance_lat: null, entrance_lng: null, arrival_radius: 10, indoor_route: validatedRoute([{ direction: 'straight', distance: 1 }]), is_active: false, sort_order: 0 };
    for (const code of ['23505', '42501']) {
      const { client } = fakeClient(() => ({ error: { code } }));
      await expect(createDestination({ ...payload, type: 'office' }, client)).rejects.toMatchObject({ code });
    }
    const { client, calls } = fakeClient(() => ({ data: [{ id: 'test', is_active: false }] }));
    await saveDestinationRoute('test', payload.indoor_route, client);
    expect(calls[0]).toMatchObject({ table: 'destinations', action: 'update', payload: { is_active: false }, filters: [['id', 'test']] });
  });
  it('produces ordered mobile-compatible segments', () => {
    expect(validatedRoute([{ direction: 'straight', distance: 4 }, { direction: 'right', distance: 2 }])).toEqual([
      { id: 1, direction: 'straight', distance: 4, mode: 'indoor' },
      { id: 2, direction: 'right', distance: 2, mode: 'indoor' },
    ]);
  });
  it('rejects unsupported routes and mobile-loader boundary violations', () => {
    for (const route of [[], [{ direction: 'stairs', distance: 1 }], [{ direction: 'left', distance: 0 }], [{ direction: 'straight', distance: NaN }], [{ direction: 'right', distance: 501 }], Array.from({ length: 51 }, () => ({ direction: 'straight', distance: 1 }))]) {
      expect(() => validatedRoute(route)).toThrow();
    }
  });
  it('derives campus details, keeps coordinates null and forces draft visibility', () => {
    const room = { id: 'room', building_id: 'building', name: 'Library', type: 'facility', sort_order: 0 } as Room;
    const building = { id: 'building', name: 'Main', entrance_name: 'Main entrance', entrance_lat: null, entrance_lng: null, arrival_radius: 10 } as Building;
    expect(destinationPayload('library', room, building, [{ direction: 'straight', distance: 5 }])).toMatchObject({ room_id: 'room', name: 'Library', entrance_lat: null, entrance_lng: null, is_active: false });
    expect(() => destinationPayload('', room, building, [])).toThrow();
    expect(() => destinationPayload('library', room, { ...building, id: 'other' }, [])).toThrow();
    expect(() => destinationPayload('library', room, { ...building, entrance_name: null }, [])).toThrow();
  });
  it('counts distinct walking peaks, with debounce and low-crossing rearming', () => {
    const detector = new WalkingPeaks();
    expect(detector.sample(2, 0)).toBe(true);
    expect(detector.sample(3, 400)).toBe(false);
    detector.sample(0, 410);
    expect(detector.sample(2, 500)).toBe(true);
    detector.sample(0, 510);
    expect(detector.sample(2, 600)).toBe(false);
    expect(detector.sample(NaN, 1000)).toBe(false);
  });
});
