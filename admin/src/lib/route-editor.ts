import type { Building, Room } from '@/types';

export interface EditableStep { direction: string; distance: number }
export interface SavedStep { id: number; direction: 'straight' | 'left' | 'right'; distance: number; mode: 'indoor' }

export function validatedRoute(steps: EditableStep[]): SavedStep[] {
  if (!steps.length || steps.length > 50) throw new Error('Enter 1–50 route segments.');
  return steps.map((step, index) => {
    if (!['straight', 'left', 'right'].includes(step.direction) || !Number.isFinite(step.distance) || step.distance <= 0 || step.distance > 500) {
      throw new Error(`Segment ${index + 1}: choose a direction and a distance above 0 and at most 500 meters.`);
    }
    return { id: index + 1, direction: step.direction as SavedStep['direction'], distance: step.distance, mode: 'indoor' };
  });
}

export function destinationPayload(id: string, room: Room, building: Building, steps: EditableStep[]) {
  const key = id.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(key)) throw new Error('Use a unique ID of 1–120 lowercase letters, digits, hyphens or underscores.');
  if (room.building_id !== building.id) throw new Error('The room must belong to the selected building.');
  const entrance = building.entrance_name?.trim();
  if (!entrance) throw new Error('Set the building entrance name before creating a destination.');
  return {
    id: key, room_id: room.id, name: room.name, type: room.type, building: building.name,
    entrance_name: entrance, entrance_lat: building.entrance_lat, entrance_lng: building.entrance_lng,
    arrival_radius: building.arrival_radius, indoor_route: validatedRoute(steps), is_active: false,
    sort_order: room.sort_order,
  };
}

/** Conservative motion heuristic, not a native pedometer. Short walks may undercount.
 * Complete pulses and sustained cadence reject isolated handling noise; rhythmic
 * shaking can still resemble walking, so distances always need field review.
 */
export class WalkingPeaks {
  private low = false;
  private pulse: number | null = null;
  private last = -Infinity;
  private interval: number | null = null;
  private streak = 0;
  sample(magnitude: number, time: number): boolean {
    if (!Number.isFinite(magnitude) || !Number.isFinite(time)) return false;
    if (magnitude > 8) { this.reset(); return false; }
    if (magnitude >= 1.4 && this.low && this.pulse === null) {
      this.pulse = time; this.low = false;
    }
    if (magnitude >= 0.7) return false;
    this.low = true;
    if (this.pulse === null) return false;
    const duration = time - this.pulse;
    this.pulse = null;
    if (duration < 60 || duration > 350) { this.reset(); return false; }
    const gap = time - this.last;
    if (gap < 350 || gap > 1100 || (this.interval !== null && Math.abs(gap - this.interval) > this.interval * 0.35)) {
      this.streak = 1; this.interval = null;
    } else {
      this.streak++;
      this.interval = this.interval === null ? gap : this.interval * 0.7 + gap * 0.3;
    }
    this.last = time;
    return this.streak >= 4;
  }
  private reset() {
    this.low = false; this.pulse = null; this.last = -Infinity;
    this.interval = null; this.streak = 0;
  }
}
