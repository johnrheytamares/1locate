export type AppRole = 'admin' | 'editor';

export const APP_ROLES: AppRole[] = ['admin', 'editor'];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
};

/** Same list as the rooms.type check constraint. */
export const ROOM_TYPES = ['office', 'classroom', 'laboratory', 'facility', 'restroom', 'other'] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  office: 'Office',
  classroom: 'Classroom',
  laboratory: 'Laboratory',
  facility: 'Facility',
  restroom: 'Restroom',
  other: 'Other',
};

export interface Building {
  id: string;
  code: string;
  name: string;
  description: string | null;
  entrance_name: string | null;
  entrance_lat: number | null;
  entrance_lng: number | null;
  arrival_radius: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: string;
  building_id: string;
  level: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  building_id: string;
  floor_id: string | null;
  name: string;
  room_number: string | null;
  type: RoomType;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PhotoKind = 'building' | 'room';

export interface Photo {
  id: string;
  parentId: string;
  storagePath: string;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface RouteStepRecord {
  direction?: unknown;
  distance?: unknown;
}

/** A row of the legacy destinations table. The fixed route is read-only here. */
export interface DestinationRecord {
  id: string;
  name: string;
  building: string;
  type: string;
  entrance_name: string;
  room_id: string | null;
  is_active: boolean;
  sort_order: number;
  indoor_route: RouteStepRecord[] | null;
  indoor_journey?: import('../../shared/indoor-tracking').IndoorJourney | null;
}

export interface MapLabel {
  id: string;
  name: string;
  category: string;
  building_id: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
}

export interface UserRoleRecord {
  user_id: string;
  role: AppRole;
  granted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NavigationFeedback {
  id: string;
  session_id: string;
  user_id: string | null;
  destination_id: string | null;
  destination_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}
