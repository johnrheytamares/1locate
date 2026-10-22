/** How quickly the displayed heading follows the sensor. Higher is snappier. */
const HEADING_SMOOTHING = 0.45;

type HeadingListener = (heading: number | null) => void;

/** Wrap any degree value into [0, 360). */
export function normalizeHeading(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Shortest signed turn from `from` to `to`.
 * Positive is clockwise. The result is in (-180, 180].
 * A step from 359° to 1° is +2°, not a long turn the other way.
 */
export function shortestSignedDelta(from: number, to: number): number {
  const delta = normalizeHeading(to - from);
  return delta > 180 ? delta - 360 : delta;
}

/** Ease toward the next reading without taking the long way around 0°. */
export function smoothHeading(previous: number | null, next: number, factor = HEADING_SMOOTHING): number {
  const target = normalizeHeading(next);
  if (previous == null || !Number.isFinite(previous)) return target;
  const delta = shortestSignedDelta(previous, target);
  return normalizeHeading(previous + delta * factor);
}

interface OrientationWithPermission {
  requestPermission?: () => Promise<PermissionState>;
}

/**
 * Reads compass heading when the phone provides it.
 * A missing sensor leaves navigation usable and reports null.
 */
export function watchHeading(listener: HeadingListener): () => void {
  let active = true;
  let received = false;
  let smoothed: number | null = null;
  let published: number | null = null;

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (!active) return;
    if (event.alpha == null || Number.isNaN(event.alpha)) return;
    received = true;
    const raw = normalizeHeading(360 - event.alpha);
    smoothed = smoothHeading(smoothed, raw);
    const rounded = Math.round(smoothed) % 360;
    if (rounded === published) return;
    published = rounded;
    listener(rounded);
  };

  const eventName = 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute'
    : 'deviceorientation';
  window.addEventListener(eventName, onOrientation as EventListener);

  const timeout = window.setTimeout(() => {
    if (active && !received) listener(null);
  }, 2500);

  const orientationApi = DeviceOrientationEvent as unknown as OrientationWithPermission;
  if (typeof orientationApi.requestPermission === 'function') {
    orientationApi.requestPermission().catch(() => {
      if (active) listener(null);
    });
  }

  return () => {
    active = false;
    window.clearTimeout(timeout);
    window.removeEventListener(eventName, onOrientation as EventListener);
  };
}
