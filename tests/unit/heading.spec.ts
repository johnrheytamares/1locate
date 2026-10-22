import { describe, expect, test } from 'vitest';
import { FACING_TOLERANCE_DEGREES, type NavigationSnapshot } from '@/models/navigation';
import {
  completeCurrentTurn,
  createTestNavigation,
  getCurrentMode,
  getDestinations,
  guideArrows,
  indoorRouteMeters,
  jumpToRightTurn,
  moveForward,
  navigationInstruction,
  requiredHeading,
  resetNavigation,
  selectDestination,
  setForwardHeading,
  updateRouteProgress,
} from '@/services/navigation.service';
import { normalizeHeading, shortestSignedDelta, smoothHeading } from '@/services/orientation.service';

/** Longer fixed route used to exercise turn handling. */
function turnRoute(): NavigationSnapshot {
  return {
    destinationId: 'registrar',
    destinationName: 'Registrar Office',
    building: 'Administration Building',
    steps: [
      { id: 1, direction: 'straight', distance: 4, mode: 'indoor' },
      { id: 2, direction: 'straight', distance: 4, mode: 'indoor' },
      { id: 3, direction: 'right', distance: 3, mode: 'indoor' },
      { id: 4, direction: 'straight', distance: 3, mode: 'indoor' },
      { id: 5, direction: 'right', distance: 2, mode: 'indoor' },
      { id: 6, direction: 'straight', distance: 2, mode: 'indoor' },
    ],
    walkedMeters: 0,
    forwardHeading: null,
  };
}

describe('heading math', () => {
  test('wraps headings into 0 inclusive and 360 exclusive', () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(359)).toBe(359);
    expect(normalizeHeading(-1)).toBe(359);
    expect(normalizeHeading(720.5)).toBe(720.5 % 360);
  });

  test('uses the short turn across 0 degrees', () => {
    expect(shortestSignedDelta(359, 0)).toBe(1);
    expect(shortestSignedDelta(0, 359)).toBe(-1);
    expect(shortestSignedDelta(359, 1)).toBe(2);
    expect(shortestSignedDelta(1, 359)).toBe(-2);
    expect(shortestSignedDelta(10, 190)).toBe(180);
    expect(shortestSignedDelta(10, 200)).toBe(-170);
  });

  test('smooths across the 0 degree wrap', () => {
    expect(smoothHeading(359, 0, 0.5)).toBeCloseTo(359.5, 5);
    expect(smoothHeading(359, 1, 0.5)).toBeCloseTo(0, 5);
    expect(smoothHeading(1, 359, 0.5)).toBeCloseTo(0, 5);
    expect(smoothHeading(null, 12, 0.5)).toBe(12);
  });
});

describe('indoor compass calibration', () => {
  test('asks for Set Forward before any facing instruction', () => {
    const state = createTestNavigation();
    expect(navigationInstruction(state, 90)).toBe(
      'Point your phone toward the path and tap Set Forward.',
    );
    expect(requiredHeading(state)).toBeNull();
  });

  test('keeps route instructions inside the facing tolerance', () => {
    const state = setForwardHeading(turnRoute(), 80);
    expect(requiredHeading(state)).toBe(80);
    expect(navigationInstruction(state, 80 + FACING_TOLERANCE_DEGREES)).toBe('Follow the blue path');
    expect(navigationInstruction(state, 80 - FACING_TOLERANCE_DEGREES - 1)).toBe('Turn right to face the path');
    expect(navigationInstruction(state, 80 + FACING_TOLERANCE_DEGREES + 1)).toBe('Turn left to face the path');
  });

  test('adds 90 degrees on the right-turn step and wraps at 360', () => {
    const state = setForwardHeading(jumpToRightTurn(turnRoute()), 300);
    expect(requiredHeading(state)).toBe(30);
    expect(navigationInstruction(state, 30)).toBe('Turn right ahead');
    expect(navigationInstruction(state, 120)).toBe('Turn left to face the path');
  });

  test('reset state clears the saved forward heading', () => {
    const reset = resetNavigation(setForwardHeading(createTestNavigation(), 40));
    expect(reset.forwardHeading).toBeNull();
    expect(reset.walkedMeters).toBe(0);
    expect(reset.destinationName).toBe('Registrar Office');
    expect(navigationInstruction(setForwardHeading(turnRoute(), 10), null)).toBe('Follow the blue path');
  });
});

describe('campus destinations', () => {
  test('stores four destinations with an outdoor target and an indoor route', () => {
    const destinations = getDestinations();
    expect(destinations.map((destination) => destination.name)).toEqual([
      'Registrar Office',
      'Library',
      'Cashier',
      'Guidance Office',
    ]);
    for (const destination of destinations) {
      expect(destination.outdoorTarget.name).toMatch(/Entrance$/);
      expect(destination.outdoorTarget.name).not.toBe(destination.name);
      expect(destination.outdoorTarget.arrivalRadius).toBeGreaterThan(0);
      expect(destination.indoorRoute.length).toBeGreaterThan(0);
      expect(destination.indoorRoute.every((step) => step.mode === 'indoor')).toBe(true);
      expect(indoorRouteMeters(destination)).toBeGreaterThan(0);
    }
  });

  test('keeps unsurveyed coordinates as null placeholders', () => {
    for (const destination of getDestinations()) {
      expect(destination.outdoorTarget.latitude).toBeNull();
      expect(destination.outdoorTarget.longitude).toBeNull();
    }
  });

  test('loads the indoor route of the selected destination', () => {
    const selected = selectDestination('registrar');
    expect(selected?.outdoorTarget.name).toBe('Administration Building Entrance');
    expect(getCurrentMode(createTestNavigation())).toBe('indoor');
    expect(selectDestination('library')?.indoorRoute).toHaveLength(1);
    expect(selectDestination('missing')).toBeNull();
  });

  test('shows only the current straight stretch until the turn is next', () => {
    const start = turnRoute();
    expect(guideArrows(start).map((arrow) => arrow.direction)).toEqual(['straight', 'straight']);
    const approaching = updateRouteProgress(start, 4);
    expect(guideArrows(approaching).map((arrow) => arrow.direction)).toEqual(['straight', 'right']);
    expect(navigationInstruction(setForwardHeading(approaching, 20), 20)).toBe('Turn right ahead');
  });

  test('holds the route on a turn until that turn is completed by heading', () => {
    const atTurn = jumpToRightTurn(setForwardHeading(turnRoute(), 80));
    expect(guideArrows(atTurn).map((arrow) => arrow.direction)).toEqual(['right']);
    expect(moveForward(atTurn, 5).walkedMeters).toBe(atTurn.walkedMeters);
    const continued = completeCurrentTurn(atTurn);
    expect(continued.forwardHeading).toBe(170);
    expect(continued.walkedMeters).toBeGreaterThan(atTurn.walkedMeters);
    expect(guideArrows(continued).some((arrow) => arrow.direction === 'straight')).toBe(true);
    expect(guideArrows(continued).filter((arrow) => arrow.direction === 'right')).toHaveLength(1);
    expect(navigationInstruction(continued, 170)).toBe('Turn right ahead');
  });

  test('reaches the final indoor destination after the last step', () => {
    const indoor = setForwardHeading(createTestNavigation(), 0);
    const atTurn = updateRouteProgress(indoor, 10);
    expect(atTurn.walkedMeters).toBe(3);
    const finished = updateRouteProgress(completeCurrentTurn(atTurn), 10);
    expect(navigationInstruction(finished, 90)).toBe('You have reached Registrar Office.');
  });
});
