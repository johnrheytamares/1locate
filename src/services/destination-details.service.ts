import { ROOM_TYPE_LABELS, ROOM_TYPES, type DestinationImage, type RoomType } from '@/models/campus';
import type { Destination } from '@/models/navigation';
import { indoorRouteMeters } from '@/services/navigation.service';

/** What the Confirm Destination screen shows. Null fields are hidden. */
export interface DestinationSummary {
  id: string;
  name: string;
  typeLabel: string;
  building: string;
  floor: string | null;
  roomNumber: string | null;
  description: string | null;
  entranceName: string;
  indoorMeters: number;
  images: DestinationImage[];
}

function isRoomType(value: string): value is RoomType {
  return (ROOM_TYPES as readonly string[]).includes(value);
}

/** Room types are stored in lowercase. Older rows already hold a display label. */
export function destinationTypeLabel(type: string): string {
  return isRoomType(type) ? ROOM_TYPE_LABELS[type] : type;
}

export function floorLabel(name: string | null, level: number | null): string | null {
  if (name) return name;
  if (level == null) return null;
  if (level === 0) return 'Ground level';
  return level > 0 ? `Level ${level}` : `Basement ${Math.abs(level)}`;
}

export function summarizeDestination(destination: Destination): DestinationSummary {
  const details = destination.details;
  return {
    id: destination.id,
    name: destination.name,
    typeLabel: destinationTypeLabel(destination.type),
    building: destination.building,
    floor: details ? floorLabel(details.floorName, details.floorLevel) : null,
    roomNumber: details?.roomNumber ?? null,
    description: details?.description ?? null,
    entranceName: destination.outdoorTarget.name,
    indoorMeters: indoorRouteMeters(destination),
    images: details?.images.map((image) => ({ ...image })) ?? [],
  };
}
