import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestNavigation, moveForward, remainingMeters, setForwardHeading } from '../../src/services/navigation.service';
import { calibratedStepLength, STREAK_TO_CONFIRM, useIndoorWalking, WalkingPeaks } from '../../src/composables/useIndoorWalking';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** One complete acceleration pulse lasting `duration` ms, starting at `time`. */
function pulse(detector: WalkingPeaks, time: number, duration = 100) {
  detector.sample(0, time);
  detector.sample(2, time + 20);
  return detector.sample(0, time + 20 + duration);
}

type MotionFields = {
  acceleration?: { x: number | null; y: number | null; z: number | null } | null;
  accelerationIncludingGravity?: { x: number; y: number; z: number };
  rotationRate?: { alpha: number | null; beta: number | null; gamma: number | null };
};

function dispatchMotion(fields: MotionFields) {
  const event = new Event('devicemotion');
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  window.dispatchEvent(event);
}

const sample = (x: number) => dispatchMotion({ acceleration: { x, y: 0, z: 0 } });
/** A 100 ms pulse followed by a 400 ms pause: a 500 ms stride. */
const stride = (send: (x: number) => void = sample) => {
  send(0); send(2); vi.advanceTimersByTime(100); send(0); vi.advanceTimersByTime(400);
};

describe('walking distance', () => {
  it('starts with a shared estimate without requiring calibration', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('DeviceMotionEvent', class {});
    const walking = useIndoorWalking(() => null, vi.fn(), { diagnostics: true });
    expect(walking.stepLength.value).toBe(0.7);
    expect(walking.diagnostics?.stepLengthSource).toBe('default');
    await walking.start();
    expect(walking.enabled.value).toBe(true);
    walking.stop();
  });
  it('keeps saved personal calibration and falls back for invalid storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '0.625' });
    const saved = useIndoorWalking(() => null, vi.fn(), { diagnostics: true });
    expect(saved.stepLength.value).toBe(0.625);
    expect(saved.diagnostics?.stepLengthSource).toBe('saved');
    vi.stubGlobal('localStorage', { getItem: () => 'invalid' });
    expect(useIndoorWalking(() => null, vi.fn()).stepLength.value).toBe(0.7);
  });
  it('calibrates using a measured distance and whole step count', () => {
    expect(calibratedStepLength(10, 16)).toBe(0.625);
    for (const [distance, steps] of [[0, 10], [10, 0], [10, 1.5], [Infinity, 10], [100, 10]]) {
      expect(calibratedStepLength(distance, steps)).toBeNull();
    }
  });
  it('rejects isolated adjustments, fast shaking and noise, and requires sustained cadence', () => {
    const detector = new WalkingPeaks();
    expect(pulse(detector, 0).steps).toBe(0);
    expect(pulse(detector, 2000).steps).toBe(0);
    expect(pulse(detector, 2500).steps).toBe(0);
    expect(pulse(detector, 3000).steps).toBe(0);
    expect(pulse(detector, 3500).steps).toBe(STREAK_TO_CONFIRM);
    expect(pulse(detector, 4000).steps).toBe(1);
    expect(pulse(detector, 6000)).toEqual({ steps: 0, candidate: true, reason: 'step gap 2000 ms (needs 350–1100 ms)' });
    const shaking = new WalkingPeaks();
    for (let time = 0; time < 2000; time += 180) expect(pulse(shaking, time).steps).toBe(0);
    expect(shaking.sample(NaN, 3000)).toEqual({ steps: 0, candidate: false, reason: 'invalid motion sample' });
  });
  it('credits every stride of a confirmed rhythm, so a steady walk is not shortened', () => {
    const detector = new WalkingPeaks();
    let credited = 0;
    for (let index = 0; index < 10; index += 1) credited += pulse(detector, index * 550).steps;
    expect(credited).toBe(10);
  });
  it('a single adjustment or a slow wobble adds nothing and says why', () => {
    const detector = new WalkingPeaks();
    expect(pulse(detector, 0)).toEqual({ steps: 0, candidate: true, reason: 'confirming rhythm (1/4)' });
    expect(pulse(detector, 1000, 500)).toEqual({ steps: 0, candidate: true, reason: 'pulse lasted 500 ms (needs 60–350 ms)' });
    detector.sample(0, 3000);
    expect(detector.sample(9, 3010)).toEqual({ steps: 0, candidate: false, reason: 'jolt over 8 m/s²' });
    const irregular = new WalkingPeaks();
    pulse(irregular, 0); pulse(irregular, 500); pulse(irregular, 1000);
    expect(pulse(irregular, 2000).reason).toBe('irregular rhythm (1000 ms vs 500 ms)');
  });
  it('updates distance from sensor steps only when guidance permits and removes listeners on stop', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('DeviceMotionEvent', class {});
    let blocked: string | null = null;
    const onStep = vi.fn();
    const walking = useIndoorWalking(() => blocked, onStep, { diagnostics: true });
    walking.calibrate(10, 16);
    await walking.start();
    stride();
    expect(onStep).not.toHaveBeenCalled();
    stride(); stride(); stride();
    expect(onStep).toHaveBeenCalledWith(4 * 0.625);
    stride();
    expect(onStep).toHaveBeenLastCalledWith(0.625);
    expect(walking.diagnostics).toMatchObject({ candidateSteps: 5, acceptedSteps: 5, source: 'linear' });

    blocked = 'phone 40° off the path';
    stride(); stride();
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(walking.diagnostics?.lastReason).toBe('blocked: phone 40° off the path');

    blocked = null;
    stride(); stride(); stride();
    expect(onStep).toHaveBeenCalledTimes(2);
    stride();
    expect(onStep).toHaveBeenCalledTimes(3);
    expect(onStep).toHaveBeenLastCalledWith(4 * 0.625);

    walking.stop();
    stride(); stride(); stride(); stride();
    expect(onStep).toHaveBeenCalledTimes(3);
  });
  it('fast phone rotation resets the rhythm and is reported', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('DeviceMotionEvent', class {});
    const onStep = vi.fn();
    const walking = useIndoorWalking(() => null, onStep, { diagnostics: true });
    await walking.start();
    const spinning = (x: number) => dispatchMotion({ acceleration: { x, y: 0, z: 0 }, rotationRate: { alpha: 0, beta: 0, gamma: 90 } });
    for (let index = 0; index < 6; index += 1) stride(spinning);
    expect(onStep).not.toHaveBeenCalled();
    expect(walking.diagnostics?.lastReason).toBe('phone rotating over 60°/s');
    expect(walking.diagnostics?.rotation).toEqual({ alpha: 0, beta: 0, gamma: 90 });
    walking.stop();
  });
  it('removes gravity itself when the device reports no linear acceleration', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('DeviceMotionEvent', class {});
    const onStep = vi.fn();
    const walking = useIndoorWalking(() => null, onStep, { diagnostics: true });
    await walking.start();
    const withGravity = (x: number) => dispatchMotion({
      acceleration: { x: null, y: null, z: null },
      accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 + x },
    });
    for (let index = 0; index < 4; index += 1) stride(withGravity);
    expect(onStep).toHaveBeenCalledWith(4 * 0.7);
    expect(walking.diagnostics?.source).toBe('gravity-filtered');
    walking.stop();
  });
  it('a phone held still under gravity alone never counts steps', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('DeviceMotionEvent', class {});
    const onStep = vi.fn();
    const walking = useIndoorWalking(() => null, onStep);
    await walking.start();
    for (let index = 0; index < 200; index += 1) {
      dispatchMotion({ accelerationIncludingGravity: { x: 0.05, y: 0, z: 9.81 } });
      vi.advanceTimersByTime(20);
    }
    expect(onStep).not.toHaveBeenCalled();
    expect(walking.diagnostics).toBeNull();
    walking.stop();
  });
  it('decreases route distance by calibrated steps and respects paused guidance and turns', () => {
    let route = setForwardHeading(createTestNavigation(), 0);
    const before = remainingMeters(route);
    route = moveForward(route, 0.625);
    expect(remainingMeters(route)).toBeCloseTo(before - 0.625);
    const paused = { ...route, paused: true };
    expect(moveForward(paused, 0.625)).toEqual(paused);
    const turnRoute = { ...route, walkedMeters: 0, steps: [
      { id: 1, direction: 'straight' as const, distance: 2, mode: 'indoor' as const },
      { id: 2, direction: 'right' as const, distance: 1, mode: 'indoor' as const },
    ] };
    expect(moveForward(turnRoute, 20).walkedMeters).toBe(2);
    expect(moveForward({ ...turnRoute, walkedMeters: 2 }, 1).walkedMeters).toBe(2);
  });
  it('handles denied permissions without enabling walking', async () => {
    vi.stubGlobal('DeviceMotionEvent', class { static requestPermission = async () => 'denied'; });
    const walking = useIndoorWalking(() => null, vi.fn());
    walking.calibrate(10, 16);
    await walking.start();
    expect(walking.enabled.value).toBe(false);
    expect(walking.message.value).toContain('denied');
  });
  it('falls back when no usable motion data arrives', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('DeviceMotionEvent', class {});
    const walking = useIndoorWalking(() => null, vi.fn());
    walking.calibrate(10, 16);
    await walking.start();
    vi.advanceTimersByTime(5000);
    expect(walking.enabled.value).toBe(false);
    expect(walking.message.value).toContain('manual controls');
  });
});
