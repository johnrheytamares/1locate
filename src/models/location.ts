/** App-owned location model. Plugin results are converted into this shape. */
export interface UserLocation {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy radius in meters. Lower is better. */
  accuracy: number;
  /** Meters per second when the platform reports it. */
  speed?: number | null;
  timestamp: number;
}

export type GpsSource = 'real' | 'simulated';

/** Accuracy at or below this is treated as good GPS. */
export const GOOD_GPS_ACCURACY = 15;

/** Accuracy worse than this shows "Improving GPS accuracy..." */
export const POOR_GPS_ACCURACY = 30;

/** Fixes worse than this are ignored for guidance. They still appear as raw debug values. */
export const MAX_ACCEPTED_GPS_ACCURACY = 60;

/** Arrival only counts fixes at or below this accuracy. */
export const ARRIVAL_MAX_ACCURACY = 20;

/** Consecutive good fixes inside the arrival radius before arrival is confirmed. */
export const ARRIVAL_STABLE_UPDATES = 3;

/** Minimum time inside the arrival radius before arrival is confirmed. */
export const ARRIVAL_STABLE_MS = 2000;

/** Faster than this between fixes, beyond both accuracy radii, counts as a GPS jump. */
export const MAX_PLAUSIBLE_SPEED_MPS = 7;

/** After this many rejected jumps in a row the new position is accepted as a reset. */
export const MAX_CONSECUTIVE_REJECTS = 3;

/** Requested update interval for the native watcher. */
export const GPS_UPDATE_INTERVAL_MS = 1000;
