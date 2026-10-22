export type RouteDirection = 'straight' | 'left' | 'right';

export type NavigationMode = 'outdoor' | 'indoor';

/** One segment of a fixed indoor route. Later this can come from indoor nodes. */
export interface RouteStep {
  id: number;
  direction: RouteDirection;
  distance: number;
  mode: NavigationMode;
}

/**
 * Outdoor GPS goal, usually a building entrance.
 * Reaching it never means the indoor room was reached.
 */
export interface OutdoorTarget {
  name: string;
  /** Surveyed latitude. Null until verified campus coordinates are available. */
  latitude: number | null;
  /** Surveyed longitude. Null until verified campus coordinates are available. */
  longitude: number | null;
  /** Meters from the target that count as arriving at the entrance. */
  arrivalRadius: number;
}

export interface Destination {
  id: string;
  name: string;
  building: string;
  type: string;
  outdoorTarget: OutdoorTarget;
  indoorRoute: RouteStep[];
}

export interface NavigationSnapshot {
  destinationId: string;
  destinationName: string;
  building: string;
  steps: RouteStep[];
  walkedMeters: number;
  /**
   * Compass heading saved by Set Forward for the fixed indoor route.
   * Outdoors the required heading comes from the GPS bearing instead.
   */
  forwardHeading: number | null;
}

/** How far the phone can face away from the step before a turn instruction appears. */
export const FACING_TOLERANCE_DEGREES = 25;

/** How long the phone must stay aligned before a turn counts as completed. */
export const TURN_ALIGNMENT_HOLD_MS = 750;
