import { describe, expect, test } from 'vitest';
import {
  ARRIVAL_STABLE_MS,
  ARRIVAL_STABLE_UPDATES,
  MAX_ACCEPTED_GPS_ACCURACY,
  MAX_CONSECUTIVE_REJECTS,
  type UserLocation,
} from '@/models/location';
import type { OutdoorTarget } from '@/models/navigation';
import {
  calculateBearing,
  calculateDistance,
  destinationPoint,
  isValidCoordinate,
} from '@/services/geo.service';
import { toLocationError, toUserLocation } from '@/services/location.service';
import {
  TEST_TARGET_INSTRUCTION,
  arrivalStatus,
  createOutdoorState,
  createTestTarget,
  isImprovingAccuracy,
  outdoorInstruction,
  processLocation,
  surveyedTarget,
  type GpsTarget,
  type OutdoorState,
} from '@/services/outdoor-navigation.service';

const ORIGIN = { latitude: 0, longitude: 0 };

const ENTRANCE: OutdoorTarget = {
  name: 'Administration Building Entrance',
  latitude: null,
  longitude: null,
  arrivalRadius: 10,
};

function fixAt(meters: number, bearing: number, accuracy: number, timestamp: number): UserLocation {
  const point = destinationPoint(ORIGIN.latitude, ORIGIN.longitude, meters, bearing);
  return { ...point, accuracy, speed: null, timestamp };
}

/** Target 50 m north of the origin. */
function target(): GpsTarget {
  return createTestTarget(ENTRANCE, ORIGIN, 0, 50);
}

describe('geo math', () => {
  test('Haversine distance matches known values', () => {
    expect(calculateDistance(0, 0, 0, 0)).toBe(0);
    expect(calculateDistance(0, 0, 1, 0)).toBeCloseTo(111_195, -1);
    expect(calculateDistance(0, 0, 0, 1)).toBeCloseTo(111_195, -1);
    expect(calculateDistance(0, 0, 0.0001, 0)).toBeCloseTo(11.12, 1);
  });

  test('bearing uses 0 North, 90 East, 180 South, 270 West', () => {
    expect(calculateBearing(0, 0, 1, 0)).toBeCloseTo(0, 5);
    expect(calculateBearing(0, 0, 0, 1)).toBeCloseTo(90, 5);
    expect(calculateBearing(0, 0, -1, 0)).toBeCloseTo(180, 5);
    expect(calculateBearing(0, 0, 0, -1)).toBeCloseTo(270, 5);
    const northWest = calculateBearing(0, 0, 0.001, -0.001);
    expect(northWest).toBeGreaterThanOrEqual(0);
    expect(northWest).toBeLessThan(360);
    expect(northWest).toBeCloseTo(315, 1);
  });

  test('destinationPoint walks the expected distance and bearing', () => {
    const point = destinationPoint(13.4, 121.2, 30, 45);
    expect(calculateDistance(13.4, 121.2, point.latitude, point.longitude)).toBeCloseTo(30, 3);
    expect(calculateBearing(13.4, 121.2, point.latitude, point.longitude)).toBeCloseTo(45, 2);
  });

  test('rejects invalid coordinates', () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
    expect(isValidCoordinate(null, 0)).toBe(false);
    expect(() => calculateDistance(100, 0, 0, 0)).toThrow(RangeError);
  });
});

describe('outdoor targets', () => {
  test('unsurveyed placeholders produce no target', () => {
    expect(surveyedTarget(ENTRANCE)).toBeNull();
    expect(surveyedTarget({ ...ENTRANCE, latitude: 13.4, longitude: 121.2, arrivalRadius: 0 })).toBeNull();
    expect(surveyedTarget({ ...ENTRANCE, latitude: 13.4, longitude: 121.2 })?.source).toBe('surveyed');
  });

  test('test targets are labeled and placed at the requested offset', () => {
    const placed = target();
    expect(placed.source).toBe('test');
    expect(calculateDistance(0, 0, placed.latitude, placed.longitude)).toBeCloseTo(50, 3);
  });

  test('asks for a test target only after a location exists', () => {
    const waiting = createOutdoorState(null);
    expect(outdoorInstruction(waiting, 0, 'Administration Building')).toBe('Getting your location...');
    const located = processLocation(waiting, fixAt(0, 0, 5, 1000));
    expect(outdoorInstruction(located, 0, 'Administration Building')).toBe(TEST_TARGET_INSTRUCTION);
  });
});

describe('GPS updates', () => {
  test('computes distance, bearing and the GPS heading instruction', () => {
    const state = processLocation(createOutdoorState(target()), fixAt(0, 0, 5, 1000));
    expect(state.distance).toBeCloseTo(50, 3);
    expect(state.bearing).toBeCloseTo(0, 3);
    expect(outdoorInstruction(state, 10, 'Administration Building')).toBe('Continue toward Administration Building');
    expect(outdoorInstruction(state, 300, 'Administration Building')).toBe('Turn right to face the path');
    expect(outdoorInstruction(state, 60, 'Administration Building')).toBe('Turn left to face the path');
  });

  test('ignores very poor accuracy but keeps it as raw data', () => {
    const state = processLocation(
      createOutdoorState(target()),
      fixAt(0, 0, MAX_ACCEPTED_GPS_ACCURACY + 1, 1000),
    );
    expect(state.location).toBeNull();
    expect(state.raw?.accuracy).toBe(MAX_ACCEPTED_GPS_ACCURACY + 1);
    expect(state.lastRejectReason).toBe('poor accuracy');
    expect(isImprovingAccuracy(state)).toBe(true);
  });

  test('rejects an impossible jump until it repeats', () => {
    let state = processLocation(createOutdoorState(target()), fixAt(0, 0, 5, 1000));
    for (let index = 1; index < MAX_CONSECUTIVE_REJECTS; index += 1) {
      state = processLocation(state, fixAt(500, 90, 5, 1000 + index * 1000));
      expect(state.lastRejectReason).toBe('jump');
      expect(calculateDistance(0, 0, state.location!.latitude, state.location!.longitude)).toBeLessThan(1);
    }
    state = processLocation(state, fixAt(500, 90, 5, 1000 + MAX_CONSECUTIVE_REJECTS * 1000));
    expect(state.lastRejectReason).toBeNull();
    expect(calculateDistance(0, 0, state.location!.latitude, state.location!.longitude)).toBeCloseTo(500, 0);
  });

  test('smooths small movements and drops stale readings', () => {
    let state = processLocation(createOutdoorState(target()), fixAt(0, 0, 5, 1000));
    state = processLocation(state, fixAt(4, 0, 5, 2000));
    const moved = calculateDistance(0, 0, state.location!.latitude, state.location!.longitude);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(4);
    const stale = processLocation(state, fixAt(10, 0, 5, 1500));
    expect(stale.lastRejectReason).toBe('stale');
    expect(stale.location).toEqual(state.location);
  });
});

describe('entrance arrival', () => {
  function walkInside(accuracy: number, updates: number, start = 10_000): OutdoorState {
    let state = processLocation(createOutdoorState(target()), fixAt(46, 0, accuracy, start - 1000));
    for (let index = 0; index < updates; index += 1) {
      state = processLocation(state, fixAt(48, 0, accuracy, start + index * 1000));
    }
    return state;
  }

  test('needs several good updates over time inside the radius', () => {
    const one = walkInside(5, 1);
    expect(one.arrived).toBe(false);
    expect(arrivalStatus(one)).toMatch(/^confirming/);
    const updates = Math.max(ARRIVAL_STABLE_UPDATES, Math.ceil(ARRIVAL_STABLE_MS / 1000) + 1);
    const enough = walkInside(5, updates);
    expect(enough.arrived).toBe(true);
    expect(outdoorInstruction(enough, 0, 'Administration Building')).toBe('You have reached Administration Building.');
  });

  test('never arrives on inaccurate readings', () => {
    const rough = walkInside(25, 10);
    expect(rough.distance).toBeLessThanOrEqual(10);
    expect(rough.arrived).toBe(false);
    expect(arrivalStatus(rough)).toBe('inside radius, waiting for better accuracy');
  });

  test('leaving the radius resets confirmation', () => {
    let state = walkInside(5, 1);
    expect(state.arrived).toBe(false);
    state = processLocation(state, fixAt(20, 0, 5, 20_000));
    expect(state.arrivalUpdates).toBe(0);
    expect(arrivalStatus(state)).toBe('outside radius');
  });
});

describe('plugin result mapping', () => {
  test('converts plugin positions into UserLocation', () => {
    const location = toUserLocation({
      timestamp: 42,
      coords: {
        latitude: 13.4,
        longitude: 121.2,
        accuracy: 6,
        altitude: null,
        altitudeAccuracy: null,
        speed: 1.2,
        heading: null,
        magneticHeading: null,
        trueHeading: null,
        headingAccuracy: null,
        course: null,
      },
    });
    expect(location).toEqual({ latitude: 13.4, longitude: 121.2, accuracy: 6, speed: 1.2, timestamp: 42 });
  });

  test('drops malformed positions', () => {
    expect(toUserLocation(null)).toBeNull();
    expect(toUserLocation({
      timestamp: 1,
      coords: {
        latitude: 200,
        longitude: 0,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
        magneticHeading: null,
        trueHeading: null,
        headingAccuracy: null,
        course: null,
      },
    })).toBeNull();
  });

  test('maps plugin error codes to app errors', () => {
    expect(toLocationError({ code: 'OS-PLUG-GLOC-0003' }).code).toBe('permission-denied');
    expect(toLocationError({ code: 'OS-PLUG-GLOC-0007' }).code).toBe('location-disabled');
    expect(toLocationError({ code: 'OS-PLUG-GLOC-0017' }).code).toBe('location-disabled');
    expect(toLocationError({ code: 'OS-PLUG-GLOC-0010' }).code).toBe('timeout');
    expect(toLocationError({ message: 'Location services are not enabled' }).code).toBe('location-disabled');
    expect(toLocationError(new Error('boom')).code).toBe('unavailable');
    expect(toLocationError({ code: 'OS-PLUG-GLOC-0007' }).message).toBe(
      'Please turn on Location Services to continue navigation.',
    );
  });
});
