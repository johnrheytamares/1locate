import { normalizeHeading } from '@/services/orientation.service';

/** Mean Earth radius used by the Haversine formula. */
export const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return isValidLatitude(latitude) && isValidLongitude(longitude);
}

function assertCoordinates(...pairs: [number, number][]) {
  for (const [latitude, longitude] of pairs) {
    if (!isValidCoordinate(latitude, longitude)) {
      throw new RangeError(`Invalid coordinate: ${latitude}, ${longitude}`);
    }
  }
}

/** Great-circle distance in meters (Haversine). */
export function calculateDistance(userLat: number, userLng: number, destLat: number, destLng: number): number {
  assertCoordinates([userLat, userLng], [destLat, destLng]);
  const dLat = toRadians(destLat - userLat);
  const dLng = toRadians(destLng - userLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(userLat)) * Math.cos(toRadians(destLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial bearing from the user to the destination, in [0, 360).
 * 0 = North, 90 = East, 180 = South, 270 = West.
 */
export function calculateBearing(userLat: number, userLng: number, destLat: number, destLng: number): number {
  assertCoordinates([userLat, userLng], [destLat, destLng]);
  const lat1 = toRadians(userLat);
  const lat2 = toRadians(destLat);
  const dLng = toRadians(destLng - userLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeHeading(toDegrees(Math.atan2(y, x)));
}

/** Point reached by walking `distanceMeters` from a start point along `bearingDegrees`. */
export function destinationPoint(
  latitude: number,
  longitude: number,
  distanceMeters: number,
  bearingDegrees: number,
): { latitude: number; longitude: number } {
  assertCoordinates([latitude, longitude]);
  const angular = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(latitude);
  const lng1 = toRadians(longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  return {
    latitude: toDegrees(lat2),
    longitude: ((toDegrees(lng2) + 540) % 360) - 180,
  };
}
