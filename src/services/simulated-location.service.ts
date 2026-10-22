import { GPS_UPDATE_INTERVAL_MS, type UserLocation } from '@/models/location';
import { destinationPoint } from '@/services/geo.service';

/**
 * SIMULATED GPS origin. Deliberately 0°, 0° in the open ocean so it can never be mistaken
 * for a MINSU campus coordinate.
 */
export const SIMULATED_ORIGIN = { latitude: 0, longitude: 0 };

/** Where SIMULATED GPS starts relative to the target. */
export const SIMULATED_START_DISTANCE_METERS = 40;
export const SIMULATED_START_BEARING_FROM_TARGET = 225;

export const SIMULATED_GOOD_ACCURACY = 5;
export const SIMULATED_POOR_ACCURACY = 40;

export interface GpsSimulator {
  start(): void;
  stop(): void;
  /** Moves the simulated user and emits a new reading. */
  walk(meters: number, bearing: number): void;
  setAccuracy(meters: number): void;
  current(): UserLocation;
}

export function createGpsSimulator(
  start: { latitude: number; longitude: number },
  emit: (location: UserLocation) => void,
  intervalMs = GPS_UPDATE_INTERVAL_MS,
): GpsSimulator {
  let position = { ...start };
  let accuracy = SIMULATED_GOOD_ACCURACY;
  let speed: number | null = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTimestamp = 0;

  const reading = (): UserLocation => {
    lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
    return { ...position, accuracy, speed, timestamp: lastTimestamp };
  };

  return {
    start() {
      if (timer != null) return;
      emit(reading());
      timer = setInterval(() => {
        speed = 0;
        emit(reading());
      }, intervalMs);
    },
    stop() {
      if (timer != null) clearInterval(timer);
      timer = null;
    },
    walk(meters, bearing) {
      if (!Number.isFinite(meters) || meters <= 0 || !Number.isFinite(bearing)) return;
      position = destinationPoint(position.latitude, position.longitude, meters, bearing);
      speed = 1.4;
      if (timer != null) emit(reading());
    },
    setAccuracy(meters) {
      if (Number.isFinite(meters) && meters > 0) accuracy = meters;
    },
    current: reading,
  };
}
