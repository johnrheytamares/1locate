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
export const PAUSED_INSTRUCTION = 'Guidance paused';

let selectedDestinationId: string | null = null;

function cloneDestination(destination: Destination): Destination {
  const copy: Destination = {
    ...destination,
    outdoorTarget: { ...destination.outdoorTarget },
    indoorRoute: destination.indoorRoute.map((step) => ({ ...step })),
    ...(destination.indoorJourney?{indoorJourney:JSON.parse(JSON.stringify(destination.indoorJourney))}:{}),
  };
  if (destination.details) {
    copy.details = {
      ...destination.details,
      images: destination.details.images.map((image) => ({ ...image })),
    };
  }
  return copy;
}

/** Bundled data until Supabase data is loaded. */
let catalog: Destination[] = DESTINATIONS.map(cloneDestination);

/** Replaces the destination list, for example with validated Supabase rows. */
export function setDestinationCatalog(destinations: Destination[]) {
  catalog = destinations.map(cloneDestination);
  if (selectedDestinationId != null && !catalog.some((item) => item.id === selectedDestinationId)) {
    selectedDestinationId = null;
  }
}

function findDestination(id: string): Destination | null {
  return catalog.find((destination) => destination.id === id) ?? null;
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
    turnAlignedAt: null,
    paused: false,
  };
}

/** Route progress only moves after Set Forward, and never while guidance is paused. */
function canProgress(state: NavigationSnapshot): boolean {
  return !state.paused && state.steps.length > 0;
}

export function getDestinations(): Destination[] {
  return catalog.map(cloneDestination);
}

/** Looks up a destination for display without selecting it. */
export function getDestination(id: string): Destination | null {
  const destination = findDestination(id);
  return destination ? cloneDestination(destination) : null;
}

export function indoorRouteMeters(destination: Destination): number {
  return destination.indoorJourney ? destination.indoorJourney.instructions.reduce((sum,s)=>sum+(s.kind==='walk'?s.distance:0),0) : destination.indoorRoute.reduce((sum, step) => sum + step.distance, 0);
}

export function selectDestination(id: string): Destination | null {
  const destination = findDestination(id);
  selectedDestinationId = destination?.id ?? null;
  return destination ? cloneDestination(destination) : null;
}

/** Forgets the selected destination, for example when the user chooses another one. */
export function clearSelectedDestination() {
  selectedDestinationId = null;
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
  const destination = DESTINATIONS.find((item) => item.id === 'registrar') ?? DESTINATIONS[0];
  return snapshotFrom(destination);
}

/** Save the direction the phone is facing as the path's forward direction. */
export function setForwardHeading(state: NavigationSnapshot, heading: number): NavigationSnapshot {
  if (state.paused) return state;
  return { ...state, forwardHeading: normalizeHeading(heading) };
}

/**
 * Heading the phone should face for the current indoor step.
 * Straight uses the calibrated forward heading. A turn not yet made adds 90° (right) or
 * subtracts 90° (left); once made, the forward heading already points along the turn.
 * Later this can read an indoor node direction instead of Set Forward.
 */
export function requiredHeading(state: NavigationSnapshot): number | null {
  if (state.forwardHeading == null) return null;
  const direction = needsTurn(state) ? currentSegment(state)?.direction : 'straight';
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

function turnPending(state: NavigationSnapshot, segment: RouteSegment | null): boolean {
  return segment != null && segment.direction !== 'straight' && state.turnAlignedAt !== segment.startMeters;
}

/** True while the phone still has to rotate into the current turn before its distance can be walked. */
export function needsTurn(state: NavigationSnapshot): boolean {
  return !hasArrived(state) && turnPending(state, currentSegment(state));
}

/**
 * Why estimated walking cannot add distance right now, or null when it can.
 * Steps only count while the phone faces the path the route expects.
 */
export function walkBlockReason(
  state: NavigationSnapshot,
  _phoneHeading: number | null
): string | null {
  // Keep the argument for compatibility with existing navigation callers.
  void _phoneHeading;
  if (state.paused) return 'guidance paused';

  if (hasArrived(state)) {
    return 'estimated route complete';
  }

  if (needsTurn(state)) {
    return 'confirm the turn before continuing';
  }

  return null;
}

export function isApproachingTurn(state: NavigationSnapshot): boolean {
  const segment = currentSegment(state);
  const upcoming = nextSegment(state);
  if (!segment || turnPending(state, segment) || !upcoming || upcoming.direction === 'straight') return false;
  return currentStepIndex(state) === segment.endIndex;
}

/** Arrows for the current stretch only. A turn ahead is included once that turn is the next step. */
export function guideArrows(state: NavigationSnapshot): GuideArrow[] {
  if (state.paused || hasArrived(state) || state.steps.length === 0) return [];
  const segment = currentSegment(state);
  if (!segment) return [];
  const arrows: GuideArrow[] = [];
  const turning = turnPending(state, segment);
  let covered = 0;
  for (let index = 0; index < state.steps.length; index += 1) {
    const step = state.steps[index];
    const stepEnd = covered + step.distance;
    const inSegment = index >= segment.startIndex && index <= segment.endIndex;
    if (inSegment && state.walkedMeters < stepEnd) {
      arrows.push({
        id: `step-${step.id}`,
        direction: turning ? step.direction : 'straight',
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
  if (turnPending(state, segment)) return segment.startMeters;
  const upcoming = nextSegment(state);
  if (upcoming && upcoming.direction !== 'straight') return upcoming.startMeters;
  return totalMeters(state);
}

/**
 * Accept the turn the phone is facing: the new heading becomes forward.
 * Rotating does not add distance; the turn segment is then walked like a straight one.
 */
export function completeCurrentTurn(state: NavigationSnapshot): NavigationSnapshot {
  if (!canProgress(state) || hasArrived(state)) return state;
  const segment = currentSegment(state);
  if (!segment || !turnPending(state, segment)) return state;
  const alignedHeading = requiredHeading(state);
  return {
    ...state,
    forwardHeading: alignedHeading ?? state.forwardHeading,
    turnAlignedAt: segment.startMeters,
  };
}

/** Said when estimated walking covers the whole route. It cannot confirm the user is at the room. */
export function arrivalInstruction(destinationName: string): string {
  return `Route distance complete. Look for the ${destinationName} sign.`;
}

export function navigationInstruction(state: NavigationSnapshot, phoneHeading: number | null = null): string {
  if (hasArrived(state)) return arrivalInstruction(state.destinationName);
  if (state.paused) return PAUSED_INSTRUCTION;
  if (state.forwardHeading == null) {
  return routeInstruction(state);
  }

  const required = requiredHeading(state);
  const offset = headingOffset(phoneHeading, required);
  if (offset != null && Math.abs(offset) > FACING_TOLERANCE_DEGREES) {
    return offset > 0 ? 'Turn right to face the path' : 'Turn left to face the path';
  }
  return routeInstruction(state);
}

function routeInstruction(state: NavigationSnapshot): string {
  const turn = needsTurn(state)
    ? currentSegment(state)?.direction
    : isApproachingTurn(state) ? nextSegment(state)?.direction : null;
  if (turn === 'right') return 'Turn right ahead';
  if (turn === 'left') return 'Turn left ahead';
  if (state.walkedMeters === 0) return 'Follow the blue path';
  return 'Continue straight';
}

export function updateRouteProgress(state: NavigationSnapshot, meters = 1): NavigationSnapshot {
  if (!canProgress(state)) return state;
  const walkedMeters = Math.min(progressLimit(state), state.walkedMeters + meters);
  return { ...state, walkedMeters };
}

export function moveForward(state: NavigationSnapshot, meters = 1): NavigationSnapshot {
  return updateRouteProgress(state, meters);
}

/** Skip to the start of the next route step. */
export function advanceInstruction(state: NavigationSnapshot): NavigationSnapshot {
  if (!canProgress(state) || hasArrived(state)) return state;
  if (needsTurn(state)) return state;
  const index = currentStepIndex(state);
  let boundary = 0;
  for (let cursor = 0; cursor <= index; cursor += 1) {
    boundary += state.steps[cursor].distance;
  }
  return { ...state, walkedMeters: Math.min(progressLimit(state), boundary) };
}

/**
 * Debug shortcut: jump to the current or next right-turn step so that part of the overlay can be
 * checked quickly. Works before Set Forward so the turn arrows can be inspected, but not while paused.
 */
export function jumpToRightTurn(state: NavigationSnapshot): NavigationSnapshot {
  if (state.paused) return state;
  let boundary = 0;
  for (const step of state.steps) {
    if (step.direction === 'right' && state.walkedMeters < boundary + step.distance) {
      return { ...state, walkedMeters: boundary };
    }
    boundary += step.distance;
  }
  return state;
}

/** Restart the same destination. Clears distance, the saved forward heading, and any pause. */
export function resetNavigation(state: NavigationSnapshot): NavigationSnapshot {
  const destination = findDestination(state.destinationId);
  return destination
    ? snapshotFrom(destination)
    : {
      ...state,
      steps: state.steps.map((step) => ({ ...step })),
      walkedMeters: 0,
      forwardHeading: null,
      turnAlignedAt: null,
      paused: false,
    };
}

/** "I lost my way": freezes route progress. It does not move or guess the user's position. */
export function pauseNavigation(state: NavigationSnapshot): NavigationSnapshot {
  if (state.paused || hasArrived(state)) return state;
  return { ...state, paused: true };
}

/** Continues from the same route position and calibration. Only for a user still at that spot. */
export function resumeNavigation(state: NavigationSnapshot): NavigationSnapshot {
  if (!state.paused) return state;
  return { ...state, paused: false };
}

/**
 * Starts the fixed route over. Requires the user to confirm they are standing at the
 * designated entrance; afterwards Set Forward is needed again.
 */
export function restartFromEntrance(state: NavigationSnapshot, confirmedAtEntrance: boolean): NavigationSnapshot {
  if (!confirmedAtEntrance) return state;
  return resetNavigation(state);
}

/** Advances one instruction only after an explicit physical checkpoint confirmation. No heading or GPS is inferred. */
export function confirmRouteCheckpoint(state: NavigationSnapshot): NavigationSnapshot {
  if (state.paused || hasArrived(state) || !state.steps.length) return state;
  const index = currentStepIndex(state);
  return { ...state, walkedMeters: state.steps.slice(0, index + 1).reduce((sum, step) => sum + step.distance, 0) };
}
