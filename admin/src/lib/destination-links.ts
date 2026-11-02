import type { Building, DestinationRecord, Room } from '@/types';

export interface RouteSummary {
  steps: number;
  meters: number;
  valid: boolean;
}

/** Reads the fixed indoor route for display. */
export function routeSummary(route: DestinationRecord['indoor_route']): RouteSummary {
  if (!Array.isArray(route) || route.length === 0 || route.length > 50) return { steps: 0, meters: 0, valid: false };
  let meters = 0;
  let valid = true;
  for (const step of route) {
    const distance = step?.distance;
    if (typeof distance === 'number' && Number.isFinite(distance) && distance > 0 && distance <= 500) meters += distance;
    else valid = false;
    if (!['straight', 'left', 'right'].includes(String(step?.direction))) valid = false;
  }
  return { steps: route.length, meters: Math.round(meters * 10) / 10, valid };
}

/** Rooms that can be linked to this destination: not linked elsewhere (one route per room). */
export function linkableRooms(rooms: Room[], destinations: DestinationRecord[], destinationId: string): Room[] {
  const takenByOthers = new Set(
    destinations.filter((item) => item.id !== destinationId && item.room_id).map((item) => item.room_id as string),
  );
  return rooms.filter((room) => !takenByOthers.has(room.id));
}

/** Rooms without a destination have no route yet, so the mobile app cannot guide to them. */
export function roomsWithoutDestination(rooms: Room[], destinations: DestinationRecord[]): Room[] {
  const linked = new Set(destinations.map((item) => item.room_id).filter(Boolean));
  return rooms.filter((room) => !linked.has(room.id));
}

export type MobileVisibility =
  | 'visible-legacy'
  | 'visible-linked'
  | 'hidden-destination-off'
  | 'hidden-room-draft'
  | 'hidden-building-draft'
  | 'hidden-room-missing';

/** Mirrors the navigation_catalog filter in 20261030120300_destinations_transition.sql. */
export function mobileVisibility(
  destination: DestinationRecord,
  rooms: Map<string, Room>,
  buildings: Map<string, Building>,
): MobileVisibility {
  if (!destination.is_active) return 'hidden-destination-off';
  if (!destination.room_id) return 'visible-legacy';
  const room = rooms.get(destination.room_id);
  if (!room) return 'hidden-room-missing';
  if (!room.is_active) return 'hidden-room-draft';
  if (!buildings.get(room.building_id)?.is_active) return 'hidden-building-draft';
  return 'visible-linked';
}

export const VISIBILITY_TEXT: Record<MobileVisibility, string> = {
  'visible-legacy': 'Shown in the app with its original details',
  'visible-linked': 'Shown in the app with the linked room details',
  'hidden-destination-off': 'Hidden: destination is turned off',
  'hidden-room-draft': 'Hidden until the linked room is published',
  'hidden-building-draft': "Hidden until the room's building is published",
  'hidden-room-missing': 'Hidden: the linked room cannot be found',
};

export function isVisible(visibility: MobileVisibility): boolean {
  return visibility.startsWith('visible');
}
