import { Capacitor, type PermissionState } from '@capacitor/core';
import { Geolocation, type PermissionStatus, type Position, type PositionOptions } from '@capacitor/geolocation';
import { GPS_UPDATE_INTERVAL_MS, type UserLocation } from '@/models/location';
import { isValidCoordinate } from '@/services/geo.service';

export type LocationPermission = 'granted' | 'prompt' | 'denied';

export interface LocationPermissionResult {
  state: LocationPermission;
  /** False when Android only granted Approximate location. */
  precise: boolean;
}

export type LocationErrorCode = 'permission-denied' | 'location-disabled' | 'timeout' | 'unavailable';

export const LOCATION_MESSAGES: Record<LocationErrorCode, string> = {
  'permission-denied': 'Location permission is required for outdoor navigation.',
  'location-disabled': 'Please turn on Location Services to continue navigation.',
  timeout: 'Waiting for a GPS signal. Move to an open area if this continues.',
  unavailable: 'Your location could not be read right now.',
};

export class LocationError extends Error {
  constructor(readonly code: LocationErrorCode, message = LOCATION_MESSAGES[code]) {
    super(message);
    this.name = 'LocationError';
  }
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
  interval: GPS_UPDATE_INTERVAL_MS,
  minimumUpdateInterval: GPS_UPDATE_INTERVAL_MS,
};

const DISABLED_CODES = new Set(['OS-PLUG-GLOC-0007', 'OS-PLUG-GLOC-0009', 'OS-PLUG-GLOC-0016', 'OS-PLUG-GLOC-0017']);

/** Maps plugin and browser errors to the app's error codes. */
export function toLocationError(error: unknown): LocationError {
  if (error instanceof LocationError) return error;
  const record = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof record.code === 'string' || typeof record.code === 'number' ? String(record.code) : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

  if (code === 'OS-PLUG-GLOC-0003' || code === '1' || (message.includes('denied') && message.includes('permission'))) {
    return new LocationError('permission-denied');
  }
  if (DISABLED_CODES.has(code) || message.includes('location services are not enabled') || message.includes('location disabled')) {
    return new LocationError('location-disabled');
  }
  if (code === 'OS-PLUG-GLOC-0010' || code === '3' || message.includes('timeout')) {
    return new LocationError('timeout');
  }
  return new LocationError('unavailable');
}

/** Converts a plugin position into the app model. Returns null for malformed readings. */
export function toUserLocation(position: Position | null | undefined): UserLocation | null {
  const coords = position?.coords;
  if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) return null;
  if (!Number.isFinite(coords.accuracy) || coords.accuracy < 0) return null;
  const speed = typeof coords.speed === 'number' && Number.isFinite(coords.speed) && coords.speed >= 0
    ? coords.speed
    : null;
  const timestamp = Number.isFinite(position?.timestamp) ? Number(position?.timestamp) : Date.now();
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    speed,
    timestamp,
  };
}

function normalizePermission(state: PermissionState | undefined): LocationPermission {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

function toPermissionResult(status: PermissionStatus): LocationPermissionResult {
  const precise = normalizePermission(status.location);
  const coarse = normalizePermission(status.coarseLocation);
  if (precise === 'granted') return { state: 'granted', precise: true };
  if (coarse === 'granted') return { state: 'granted', precise: false };
  if (precise === 'denied' || coarse === 'denied') return { state: 'denied', precise: false };
  return { state: 'prompt', precise: false };
}

/** Throws LocationError('location-disabled') when Android location services are off. */
export async function checkPermission(): Promise<LocationPermissionResult> {
  try {
    return toPermissionResult(await Geolocation.checkPermissions());
  } catch (error) {
    throw toLocationError(error);
  }
}

export async function requestPermission(): Promise<LocationPermissionResult> {
  try {
    if (!Capacitor.isNativePlatform()) {
      // The web implementation has no request method; reading a position shows the browser prompt.
      await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      return checkPermission();
    }
    return toPermissionResult(await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] }));
  } catch (error) {
    throw toLocationError(error);
  }
}

export async function getCurrentLocation(): Promise<UserLocation> {
  try {
    const location = toUserLocation(await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }));
    if (!location) throw new LocationError('unavailable');
    return location;
  } catch (error) {
    throw toLocationError(error);
  }
}

let activeWatchId: string | null = null;
let watchGeneration = 0;

/**
 * Starts the single active location watcher. Any previous watcher is cleared first.
 * Malformed readings are dropped. Errors go to `onError`.
 */
export async function startLocationWatch(
  callback: (location: UserLocation) => void,
  onError: (error: LocationError) => void = () => {},
): Promise<void> {
  await stopLocationWatch();
  const generation = ++watchGeneration;
  try {
    const id = await Geolocation.watchPosition(WATCH_OPTIONS, (position, error) => {
      if (generation !== watchGeneration) return;
      if (error) {
        onError(toLocationError(error));
        return;
      }
      const location = toUserLocation(position);
      if (location) callback(location);
    });
    if (generation !== watchGeneration) {
      await Geolocation.clearWatch({ id }).catch(() => {});
      return;
    }
    activeWatchId = id;
  } catch (error) {
    if (generation === watchGeneration) throw toLocationError(error);
  }
}

export async function stopLocationWatch(): Promise<void> {
  watchGeneration += 1;
  const id = activeWatchId;
  activeWatchId = null;
  if (id == null) return;
  try {
    await Geolocation.clearWatch({ id });
  } catch {
    // Already cleared by the platform.
  }
}

export function isLocationWatchActive(): boolean {
  return activeWatchId != null;
}
