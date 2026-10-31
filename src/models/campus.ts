/** Room types allowed by the rooms.type check constraint. */
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

/** Private Storage buckets that hold destination photos. */
export type ImageBucket = 'room-photos' | 'building-photos';

/** A photo reference from the database. The file itself needs a signed URL. */
export interface DestinationImage {
  bucket: ImageBucket;
  /** "<parent uuid>/<file uuid>.<jpg|jpeg|png|webp>" */
  storagePath: string;
  caption: string | null;
}

/** A photo ready to display. */
export interface DisplayImage {
  url: string;
  caption: string | null;
}

/**
 * Descriptive data from the campus tables. Absent for bundled and legacy destinations.
 * Every field stays null until an Admin or Editor fills it in.
 */
export interface DestinationDetails {
  roomId: string | null;
  buildingId: string | null;
  floorName: string | null;
  floorLevel: number | null;
  roomNumber: string | null;
  description: string | null;
  /** Room photos first, then building photos. */
  images: DestinationImage[];
}
