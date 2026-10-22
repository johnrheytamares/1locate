import {
  ARRIVAL_MAX_ACCURACY,
  ARRIVAL_STABLE_MS,
  ARRIVAL_STABLE_UPDATES,
  GOOD_GPS_ACCURACY,
  MAX_ACCEPTED_GPS_ACCURACY,
  MAX_CONSECUTIVE_REJECTS,
  MAX_PLAUSIBLE_SPEED_MPS,
  POOR_GPS_ACCURACY,
  type UserLocation,
} from '@/models/location';
import { FACING_TOLERANCE_DEGREES, type OutdoorTarget } from '@/models/navigation';
import { calculateBearing, calculateDistance, destinationPoint, isValidCoordinate } from '@/services/geo.service';
import { headingOffset } from '@/services/navigation.service';

export type GpsTargetSource = 'surveyed' | 'test';

/** Outdoor target with usable coordinates. */
export interface GpsTarget {
  name: string;
  latitude: number;
  longitude: number;
  arrivalRadius: number;
  source: GpsTargetSource;
}

export interface OutdoorState {
  target: GpsTarget | null;
  /** Last reading as received, kept for debug. */
  raw: UserLocation | null;
  /** Accepted and smoothed position used for guidance. */
  location: UserLocation | null;
  distance: number | null;
  bearing: number | null;
  rejectedInRow: number;
  lastRejectReason: string | null;
  arrivalUpdates: number;
  arrivalSince: number | null;
  arrived: boolean;
}

export type AccuracyLevel = 'none' | 'good' | 'fair' | 'poor';

/** How far ahead a REAL GPS TEST target is placed. */
export const TEST_TARGET_DISTANCE_METERS = 30;

export const TEST_TARGET_INSTRUCTION = 'TEST target not set. Point toward an open path and tap Place Test Target.';

/** Usable target from destination data, or null while the coordinates are unverified placeholders. */
export function surveyedTarget(target: OutdoorTarget): GpsTarget | null {
  if (!isValidCoordinate(target.latitude, target.longitude)) return null;
  if (!Number.isFinite(target.arrivalRadius) || target.arrivalRadius <= 0) return null;
  return {
    name: target.name,
    latitude: target.latitude as number,
    longitude: target.longitude as number,
    arrivalRadius: target.arrivalRadius,
    source: 'surveyed',
  };
}

/** TEST target placed `distance` meters from a point along `bearing`. Never a real campus coordinate. */
export function createTestTarget(
  target: OutdoorTarget,
  from: { latitude: number; longitude: number },
  bearing: number,
  distance = TEST_TARGET_DISTANCE_METERS,
): GpsTarget {
  const point = destinationPoint(from.latitude, from.longitude, distance, bearing);
  return {
    name: target.name,
    latitude: point.latitude,
    longitude: point.longitude,
    arrivalRadius: target.arrivalRadius > 0 ? target.arrivalRadius : 10,
    source: 'test',
  };
}

export function createOutdoorState(target: GpsTarget | null): OutdoorState {
  return {
    target,
    raw: null,
    location: null,
    distance: null,
    bearing: null,
    rejectedInRow: 0,
    lastRejectReason: null,
    arrivalUpdates: 0,
    arrivalSince: null,
    arrived: false,
  };
}

function geometry(location: UserLocation | null, target: GpsTarget | null) {
  if (!location || !target) return { distance: null, bearing: null };
  return {
    distance: calculateDistance(location.latitude, location.longitude, target.latitude, target.longitude),
    bearing: calculateBearing(location.latitude, location.longitude, target.latitude, target.longitude),
  };
}

/** Replaces the target and restarts arrival confirmation. */
export function withTarget(state: OutdoorState, target: GpsTarget | null): OutdoorState {
  return {
    ...state,
    target,
    ...geometry(state.location, target),
    arrivalUpdates: 0,
    arrivalSince: null,
    arrived: false,
  };
}

/** Moves toward the new fix. More accurate fixes get more weight. */
export function smoothLocation(previous: UserLocation | null, next: UserLocation): UserLocation {
  if (!previous) return { ...next };
  const weight = Math.min(0.85, Math.max(0.3, previous.accuracy / (previous.accuracy + next.accuracy || 1)));
  return {
    ...next,
    latitude: previous.latitude + (next.latitude - previous.latitude) * weight,
    longitude: previous.longitude + (next.longitude - previous.longitude) * weight,
  };
}

/** True when the move is faster than walking even after allowing for both accuracy radii. */
export function isImpossibleJump(previous: UserLocation, next: UserLocation): boolean {
  const seconds = Math.max(1, (next.timestamp - previous.timestamp) / 1000);
  const moved = calculateDistance(previous.latitude, previous.longitude, next.latitude, next.longitude);
  return moved > MAX_PLAUSIBLE_SPEED_MPS * seconds + previous.accuracy + next.accuracy;
}

/** Applies one GPS reading. Poor, stale, and jumping readings are kept only as raw debug data. */
export function processLocation(state: OutdoorState, fix: UserLocation): OutdoorState {
  const withRaw: OutdoorState = { ...state, raw: fix };
  if (state.arrived) return withRaw;
  if (fix.accuracy > MAX_ACCEPTED_GPS_ACCURACY) {
    return { ...withRaw, lastRejectReason: 'poor accuracy' };
  }
  if (state.location && fix.timestamp <= state.location.timestamp) {
    return { ...withRaw, lastRejectReason: 'stale' };
  }

  let location: UserLocation;
  if (state.location && isImpossibleJump(state.location, fix)) {
    const rejectedInRow = state.rejectedInRow + 1;
    if (rejectedInRow < MAX_CONSECUTIVE_REJECTS) {
      return { ...withRaw, rejectedInRow, lastRejectReason: 'jump' };
    }
    location = { ...fix };
  } else {
    location = smoothLocation(state.location, fix);
  }

  const { distance, bearing } = geometry(location, state.target);
  const inside = state.target != null && distance != null && distance <= state.target.arrivalRadius;
  const accurate = fix.accuracy <= ARRIVAL_MAX_ACCURACY;

  let arrivalUpdates = 0;
  let arrivalSince: number | null = null;
  if (inside && accurate) {
    arrivalUpdates = state.arrivalUpdates + 1;
    arrivalSince = state.arrivalSince ?? fix.timestamp;
  } else if (inside) {
    arrivalUpdates = state.arrivalUpdates;
    arrivalSince = state.arrivalSince;
  }
  const arrived = inside
    && accurate
    && arrivalUpdates >= ARRIVAL_STABLE_UPDATES
    && arrivalSince != null
    && fix.timestamp - arrivalSince >= ARRIVAL_STABLE_MS;

  return {
    ...withRaw,
    location,
    distance,
    bearing,
    rejectedInRow: 0,
    lastRejectReason: null,
    arrivalUpdates,
    arrivalSince,
    arrived,
  };
}

export function accuracyLevel(location: UserLocation | null): AccuracyLevel {
  if (!location) return 'none';
  if (location.accuracy <= GOOD_GPS_ACCURACY) return 'good';
  if (location.accuracy <= POOR_GPS_ACCURACY) return 'fair';
  return 'poor';
}

/** True when the latest reading is too rough for confident guidance. */
export function isImprovingAccuracy(state: OutdoorState): boolean {
  return accuracyLevel(state.raw) === 'poor';
}

export function arrivalStatus(state: OutdoorState): string {
  if (state.arrived) return 'arrived';
  if (!state.target) return 'no target';
  if (!state.location || state.distance == null) return 'waiting for GPS';
  if (state.distance > state.target.arrivalRadius) return 'outside radius';
  if ((state.raw?.accuracy ?? Infinity) > ARRIVAL_MAX_ACCURACY) return 'inside radius, waiting for better accuracy';
  return `confirming (${Math.min(state.arrivalUpdates, ARRIVAL_STABLE_UPDATES)}/${ARRIVAL_STABLE_UPDATES})`;
}

/** Outdoor guidance. The required heading is the GPS bearing, so Set Forward is not needed. */
export function outdoorInstruction(state: OutdoorState, phoneHeading: number | null, building: string): string {
  if (state.arrived) return `You have reached ${building}.`;
  if (!state.location) return 'Getting your location...';
  if (!state.target) return TEST_TARGET_INSTRUCTION;
  const offset = headingOffset(phoneHeading, state.bearing);
  if (offset != null && Math.abs(offset) > FACING_TOLERANCE_DEGREES) {
    return offset > 0 ? 'Turn right to face the path' : 'Turn left to face the path';
  }
  return `Continue toward ${building}`;
}
