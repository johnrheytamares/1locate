import type { Building, Floor, MapLabel, Room, UserRoleRecord } from '@/types';

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  at: string;
  kind: 'building' | 'floor' | 'room' | 'role';
}

export interface MapPin {
  id: string;
  name: string;
  x: number;
  y: number;
}

function changed(createdAt: string, updatedAt: string): boolean {
  return Math.abs(Date.parse(updatedAt) - Date.parse(createdAt)) > 2000;
}

export function buildActivity(input: {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  roles: UserRoleRecord[];
  buildingName: (id: string) => string;
}, limit = 8): ActivityItem[] {
  const items: ActivityItem[] = [
    ...input.buildings.map((building) => ({
      id: `building-${building.id}`,
      title: `${changed(building.created_at, building.updated_at) ? 'Updated' : 'Added'} building`,
      detail: `${building.name}${building.is_active ? ' · Published' : ' · Draft'}`,
      at: building.updated_at,
      kind: 'building' as const,
    })),
    ...input.floors.map((floor) => ({
      id: `floor-${floor.id}`,
      title: `${changed(floor.created_at, floor.updated_at) ? 'Updated' : 'Added'} floor`,
      detail: `${floor.name} · ${input.buildingName(floor.building_id)}`,
      at: floor.updated_at,
      kind: 'floor' as const,
    })),
    ...input.rooms.map((room) => ({
      id: `room-${room.id}`,
      title: `${changed(room.created_at, room.updated_at) ? 'Updated' : 'Added'} room`,
      detail: `${room.name}${room.is_active ? ' · Published' : ' · Draft'}`,
      at: room.updated_at,
      kind: 'room' as const,
    })),
    ...input.roles.map((role) => ({
      id: `role-${role.user_id}`,
      title: changed(role.created_at, role.updated_at) ? 'Updated role' : 'Granted role',
      detail: role.role === 'admin' ? 'Admin' : 'Editor',
      at: role.updated_at,
      kind: 'role' as const,
    })),
  ];
  return items
    .filter((item) => Number.isFinite(Date.parse(item.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export function layoutPins(points: { id: string; name: string; lat: number; lng: number }[]): MapPin[] {
  if (points.length === 0) return [];
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.0008);
  const lngSpan = Math.max(maxLng - minLng, 0.0008);
  return points.map((point) => ({
    id: point.id,
    name: point.name,
    x: ((point.lng - minLng) / lngSpan) * 76 + 12,
    y: (1 - (point.lat - minLat) / latSpan) * 70 + 14,
  }));
}

export function mapPoints(buildings: Building[], labels: MapLabel[]): { id: string; name: string; lat: number; lng: number }[] {
  const fromBuildings = buildings
    .filter((building) => building.entrance_lat !== null && building.entrance_lng !== null)
    .map((building) => ({
      id: building.id,
      name: building.name,
      lat: building.entrance_lat as number,
      lng: building.entrance_lng as number,
    }));
  const used = new Set(fromBuildings.map((point) => point.id));
  const fromLabels = labels
    .filter((label) => label.latitude !== null && label.longitude !== null && !(label.building_id && used.has(label.building_id)))
    .map((label) => ({
      id: label.id,
      name: label.name,
      lat: label.latitude as number,
      lng: label.longitude as number,
    }));
  return [...fromBuildings, ...fromLabels];
}

export function relativeTime(iso: string, now = Date.now()): string {
  const delta = now - Date.parse(iso);
  if (!Number.isFinite(delta)) return '';
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}
