import { describe, expect, test } from 'vitest';
import {
  isVisible,
  linkableRooms,
  mobileVisibility,
  roomsWithoutDestination,
  routeSummary,
} from '@/lib/destination-links';
import type { Building, DestinationRecord, Room } from '@/types';

function room(id: string, overrides: Partial<Room> = {}): Room {
  return {
    id, building_id: 'b1', floor_id: null, name: id, room_number: null, type: 'office', description: null,
    is_active: true, sort_order: 0, created_at: '', updated_at: '', ...overrides,
  };
}

function destination(id: string, roomId: string | null, overrides: Partial<DestinationRecord> = {}): DestinationRecord {
  return {
    id, name: id, building: 'Admin', type: 'Office', entrance_name: 'Entrance', room_id: roomId, is_active: true,
    sort_order: 0, indoor_route: [{ direction: 'straight', distance: 3 }, { direction: 'right', distance: 2 }], ...overrides,
  };
}

const building = (active: boolean) => ({ id: 'b1', is_active: active } as Building);

describe('destination links', () => {
  const rooms = [room('r1'), room('r2'), room('r3')];
  const destinations = [destination('registrar', 'r1'), destination('library', 'r2'), destination('cashier', null)];

  test('a destination can keep its own room but not take another destination room', () => {
    expect(linkableRooms(rooms, destinations, 'registrar').map((item) => item.id)).toEqual(['r1', 'r3']);
    expect(linkableRooms(rooms, destinations, 'cashier').map((item) => item.id)).toEqual(['r3']);
  });

  test('lists rooms that are not yet available for navigation', () => {
    expect(roomsWithoutDestination(rooms, destinations).map((item) => item.id)).toEqual(['r3']);
  });

  test('summarizes the fixed route without changing it', () => {
    const route = destinations[0].indoor_route;
    expect(routeSummary(route)).toEqual({ steps: 2, meters: 5, valid: true });
    expect(destinations[0].indoor_route).toBe(route);
    expect(routeSummary([])).toEqual({ steps: 0, meters: 0, valid: false });
    expect(routeSummary(null)).toMatchObject({ valid: false });
    expect(routeSummary([{ distance: -1 }])).toMatchObject({ valid: false });
  });

  test('mobile visibility follows the navigation_catalog rules', () => {
    const roomMap = new Map([['r1', room('r1')], ['draft', room('draft', { is_active: false })]]);
    const published = new Map([['b1', building(true)]]);
    const hiddenBuilding = new Map([['b1', building(false)]]);

    expect(mobileVisibility(destination('d', null), roomMap, published)).toBe('visible-legacy');
    expect(mobileVisibility(destination('d', 'r1'), roomMap, published)).toBe('visible-linked');
    expect(mobileVisibility(destination('d', 'r1', { is_active: false }), roomMap, published)).toBe('hidden-destination-off');
    expect(mobileVisibility(destination('d', 'draft'), roomMap, published)).toBe('hidden-room-draft');
    expect(mobileVisibility(destination('d', 'r1'), roomMap, hiddenBuilding)).toBe('hidden-building-draft');
    expect(mobileVisibility(destination('d', 'gone'), roomMap, published)).toBe('hidden-room-missing');
    expect(isVisible('visible-linked')).toBe(true);
    expect(isVisible('hidden-room-draft')).toBe(false);
  });
});
