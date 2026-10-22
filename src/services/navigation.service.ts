import { DESTINATIONS } from '@/data/destinations';
import {
  FACING_TOLERANCE_DEGREES,
  type Destination,
  type NavigationMode,
  type NavigationSnapshot,
  type RouteDirection,
  type RouteStep,
} from '@/models/navigation';
import { normalizeHeading, shortestSignedDelta } from '@/services/orientation.service';

export const CALIBRATION_INSTRUCTION = 'Point your phone toward the path and tap Set Forward.';

let selectedDestinationId: string | null = null;

function cloneDestination(destination: Destination): Destination {
  return {
    ...destination,
    outdoorTarget: { ...destination.outdoorTarget },
    indoorRoute: destination.indoorRoute.map((step) => ({ ...step })),
  };
}

function findDestination(id: string): Destination | null {
  return DESTINATIONS.find((destination) => destination.id === id) ?? null;
}

function snapshotFrom(destination: Destination): NavigationSnapshot {
  const copy = cloneDestination(destination);
  return {
    destinationId: copy.id,
    destinationName: copy.name,
    building: copy.building,
    steps: copy.indoorRoute,
    walkedMeters: 0,
    forwardHeading: null,
  };
}

export function getDestinations(): Destination[] {
  return DESTINATIONS.map(cloneDestination);
}

export function indoorRouteMeters(destination: Destination): number {
  return destination.indoorRoute.reduce((sum, step) => sum + step.distance, 0);
}

export function selectDestination(id: string): Destination | null {
  const destination = findDestination(id);
  selectedDestinationId = destination?.id ?? null;
  return destination ? cloneDestination(destination) : null;
}

export function getSelectedDestination(): Destination | null {
  if (selectedDestinationId == null) return null;
  const destination = findDestination(selectedDestinationId);
  return destination ? cloneDestination(destination) : null;
}

/** Fixed indoor route of the selected destination, used after the building entrance is reached. */
export function loadSelectedRoute(): NavigationSnapshot | null {
  const destination = getSelectedDestination();
  return destination ? snapshotFrom(destination) : null;
}

/** Starts the Registrar indoor route without changing the picker's selection. */
export function createTestNavigation(): NavigationSnapshot {
  const destination = findDestination('registrar');
  return snapshotFrom(destination as Destination);
}

/** Save the direction the phone is facing as the path's forward direction. */
export function setForwardHeading(state: NavigationSnapshot, heading: number): NavigationSnapshot {
  return { ...state, forwardHeading: normalizeHeading(heading) };
}

/**
 * Heading the phone should face for the current indoor step.
 * Straight uses the calibrated forward heading. Right adds 90°. Left subtracts 90°.
 * Later this can read an indoor node direction instead of Set Forward.
 */
export function requiredHeading(state: NavigationSnapshot): number | null {
  if (state.forwardHeading == null) return null;
  const direction = currentStep(state)?.direction;
  const turn = direction === 'right' ? 90 : direction === 'left' ? -90 : 0;
  return normalizeHeading(state.forwardHeading + turn);
}

/** Signed degrees from the phone heading to the required heading. Positive means turn right. */
export function headingOffset(phoneHeading: number | null, required: number | null): number | null {
  if (phoneHeading == null || required == null) return null;
  return shortestSignedDelta(phoneHeading, required);
}

export function totalMeters(state: NavigationSnapshot): number {
  return state.steps.reduce((sum, step) => sum + step.distance, 0);
}

export function remainingMeters(state: NavigationSnapshot): number {
  return Math.max(0, totalMeters(state) - state.walkedMeters);
}

export function detectArrival(state: NavigationSnapshot): boolean {
  return remainingMeters(state) <= 0;
}

export function hasArrived(state: NavigationSnapshot): boolean {
  return detectArrival(state);
}

export function currentStepIndex(state: NavigationSnapshot): number {
  if (state.steps.length === 0 || hasArrived(state)) {
    return Math.max(0, state.steps.length - 1);
  }
  let covered = 0;
  for (let index = 0; index < state.steps.length; index += 1) {
    covered += state.steps[index].distance;
    if (state.walkedMeters < covered) return index;
  }
  return state.steps.length - 1;
}

export function getCurrentRouteStep(state: NavigationSnapshot): RouteStep | null {
  return state.steps[currentStepIndex(state)] ?? null;
}

export function currentStep(state: NavigationSnapshot): RouteStep | null {
  return getCurrentRouteStep(state);
}

export function getCurrentMode(state: NavigationSnapshot): NavigationMode | null {
  return currentStep(state)?.mode ?? null;
}

export interface RouteSegment {
  direction: RouteDirection;
  startIndex: number;
  endIndex: number;
  startMeters: number;
  endMeters: number;
}

export interface GuideArrow {
  id: string;
  direction: RouteDirection;
  active: boolean;
}

export function routeSegments(steps: RouteStep[]): RouteSegment[] {
  const segments: RouteSegment[] = [];
  let covered = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const previous = segments[segments.length - 1];
    if (previous && previous.direction === step.direction && previous.endIndex === index - 1) {
      previous.endIndex = index;
      previous.endMeters += step.distance;
    } else {
      segments.push({
        direction: step.direction,
        startIndex: index,
        endIndex: index,
        startMeters: covered,
        endMeters: covered + step.distance,
      });
    }
    covered += step.distance;
  }
  return segments;
}

export function currentSegment(state: NavigationSnapshot): RouteSegment | null {
  const segments = routeSegments(state.steps);
  return segments.find((segment) => (
    state.walkedMeters >= segment.startMeters && state.walkedMeters < segment.endMeters
  )) ?? segments[segments.length - 1] ?? null;
}

export function nextSegment(state: NavigationSnapshot): RouteSegment | null {
  const current = currentSegment(state);
  if (!current) return null;
  const segments = routeSegments(state.steps);
  const index = segments.findIndex((segment) => segment.startIndex === current.startIndex);
  return index >= 0 ? segments[index + 1] ?? null : null;
}

export function nextRouteStep(state: NavigationSnapshot): RouteStep | null {
  return state.steps[currentStepIndex(state) + 1] ?? null;
}

export function isApproachingTurn(state: NavigationSnapshot): boolean {
  const segment = currentSegment(state);
  const upcoming = nextSegment(state);
  if (!segment || segment.direction !== 'straight' || !upcoming || upcoming.direction === 'straight') return false;
  return currentStepIndex(state) === segment.endIndex;
}

/** Arrows for the current stretch only. A turn ahead is included once that turn is the next step. */
export function guideArrows(state: NavigationSnapshot): GuideArrow[] {
  if (hasArrived(state) || state.steps.length === 0) return [];
  const segment = currentSegment(state);
  if (!segment) return [];
  const arrows: GuideArrow[] = [];
  let covered = 0;
  for (let index = 0; index < state.steps.length; index += 1) {
    const step = state.steps[index];
    const stepEnd = covered + step.distance;
    const inSegment = index >= segment.startIndex && index <= segment.endIndex;
    if (inSegment && state.walkedMeters < stepEnd) {
      arrows.push({
        id: `step-${step.id}`,
        direction: step.direction,
        active: index === currentStepIndex(state),
      });
    }
    covered = stepEnd;
  }
  const upcoming = nextSegment(state);
  if (isApproachingTurn(state) && upcoming) {
    const turnStep = state.steps[upcoming.startIndex];
    arrows.push({
      id: `turn-${turnStep.id}`,
      direction: upcoming.direction,
      active: false,
    });
  }
  return arrows;
}

function progressLimit(state: NavigationSnapshot): number {
  const segment = currentSegment(state);
  if (!segment) return totalMeters(state);
  if (segment.direction !== 'straight') return segment.startMeters;
  const upcoming = nextSegment(state);
  if (upcoming && upcoming.direction !== 'straight') return upcoming.startMeters;
  return totalMeters(state);
}

/** Finish the turn the phone is facing and continue on the new heading. */
export function completeCurrentTurn(state: NavigationSnapshot): NavigationSnapshot {
  const segment = currentSegment(state);
  if (!segment || segment.direction === 'straight' || hasArrived(state)) return state;
  const alignedHeading = requiredHeading(state);
  return {
    ...state,
    walkedMeters: Math.min(totalMeters(state), segment.endMeters),
    forwardHeading: alignedHeading ?? state.forwardHeading,
  };
}

export function navigationInstruction(state: NavigationSnapshot, phoneHeading: number | null = null): string {
  if (hasArrived(state)) return `You have reached ${state.destinationName}.`;
  if (state.forwardHeading == null) return CALIBRATION_INSTRUCTION;

  const required = requiredHeading(state);
  const offset = headingOffset(phoneHeading, required);
  if (offset != null && Math.abs(offset) > FACING_TOLERANCE_DEGREES) {
    return offset > 0 ? 'Turn right to face the path' : 'Turn left to face the path';
  }
  return routeInstruction(state);
}

function routeInstruction(state: NavigationSnapshot): string {
  const step = currentStep(state);
  if (step?.direction === 'right' || (isApproachingTurn(state) && nextSegment(state)?.direction === 'right')) {
    return 'Turn right ahead';
  }
  if (step?.direction === 'left' || (isApproachingTurn(state) && nextSegment(state)?.direction === 'left')) {
    return 'Turn left ahead';
  }
  if (state.walkedMeters === 0) return 'Follow the blue path';
  return 'Continue straight';
}

export function updateRouteProgress(state: NavigationSnapshot, meters = 1): NavigationSnapshot {
  const walkedMeters = Math.min(progressLimit(state), state.walkedMeters + meters);
  return { ...state, walkedMeters };
}

export function moveForward(state: NavigationSnapshot, meters = 1): NavigationSnapshot {
  return updateRouteProgress(state, meters);
}

/** Skip to the start of the next route step. */
export function advanceInstruction(state: NavigationSnapshot): NavigationSnapshot {
  if (hasArrived(state)) return state;
  const segment = currentSegment(state);
  if (segment && segment.direction !== 'straight') return state;
  const index = currentStepIndex(state);
  let boundary = 0;
  for (let cursor = 0; cursor <= index; cursor += 1) {
    boundary += state.steps[cursor].distance;
  }
  return { ...state, walkedMeters: Math.min(progressLimit(state), boundary) };
}

/** Jump to the current or next right-turn step so that part of the overlay can be checked quickly. */
export function jumpToRightTurn(state: NavigationSnapshot): NavigationSnapshot {
  let boundary = 0;
  for (const step of state.steps) {
    if (step.direction === 'right' && state.walkedMeters < boundary + step.distance) {
      return { ...state, walkedMeters: boundary };
    }
    boundary += step.distance;
  }
  return state;
}

/** Restart the same destination. Clears distance and the saved forward heading. */
export function resetNavigation(state: NavigationSnapshot): NavigationSnapshot {
  const destination = findDestination(state.destinationId);
  return destination ? snapshotFrom(destination) : state;
}
