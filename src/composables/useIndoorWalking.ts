import { WalkingPulseDetector, stepMethodLabel } from '../../shared/indoor-tracking';
import { reactive, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { IndoorStepSource } from '@/services/indoor-steps';

/** Shared starting estimate; personal measurements can override it. */
export const DEFAULT_STEP_LENGTH_METERS = 0.7;
export const STEP_LENGTH_STORAGE_KEY = '1locate.walking-step-length';
/** Consistent strides needed before any of them count. */
export const STREAK_TO_CONFIRM = 4;
const ROTATION_LIMIT_DEG_PER_S = 60;
/** Time constant of the gravity estimate used when the device gives no linear acceleration. */
const GRAVITY_TIME_CONSTANT_MS = 500;
const DIAGNOSTIC_INTERVAL_MS = 250;

export function calibratedStepLength(distance: number, steps: number): number | null {
  const length = distance / steps;
  return Number.isFinite(distance) && distance > 0 && Number.isInteger(steps) && steps > 0
    && length >= 0.2 && length <= 1.5 ? length : null;
}

export { type StepSample } from '../../shared/indoor-tracking';
export class WalkingPeaks extends WalkingPulseDetector {}

type MotionConstructor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
type Vector = { x: number; y: number; z: number };
export type MotionSource = 'linear' | 'gravity-filtered';

export interface WalkingDiagnostics {
  source: MotionSource | 'none';
  sampleRateHz: number | null;
  acceleration: Vector & { magnitude: number } | null;
  rotation: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  candidateSteps: number;
  acceptedSteps: number;
  lastReason: string;
  stepLengthSource: 'default' | 'saved';
}

export interface WalkingOptions {
  /** Collects sensor readouts for the debug panel. Leave off in release builds. */
  diagnostics?: boolean;
}

function vector(value: DeviceMotionEventAcceleration | null | undefined): Vector | null {
  if (value?.x == null || value.y == null || value.z == null) return null;
  return [value.x, value.y, value.z].every(Number.isFinite) ? { x: value.x, y: value.y, z: value.z } : null;
}

/**
 * Estimates walked distance from detected steps × step length.
 * `walkBlock` returns why steps must not count right now (or null); blocked steps are dropped.
 */
export function useIndoorWalking(
  walkBlock: () => string | null,
  onStep: (meters: number) => void,
  options: WalkingOptions = {},
) {
  const stepLength = ref(DEFAULT_STEP_LENGTH_METERS);
  const enabled = ref(false);
  const message = ref('Automatic walking is ready. Default step length is 0.70 m; personal calibration is optional.');
  let stepLengthSource: WalkingDiagnostics['stepLengthSource'] = 'default';
  let detector = new WalkingPeaks();
  const nativeSource = new IndoorStepSource();
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gravity: Vector | null = null;
  let gravityTime = 0;
  let rateStart = 0;
  let rateCount = 0;
  let lastReadout = -Infinity;
  try {
    const saved = Number(localStorage.getItem(STEP_LENGTH_STORAGE_KEY));
    if (saved >= 0.2 && saved <= 1.5) {
      stepLength.value = saved;
      stepLengthSource = 'saved';
    }
  } catch { /* Calibration still works when storage is unavailable. */ }

  const diagnostics = options.diagnostics
    ? reactive<WalkingDiagnostics>({
      source: 'none',
      sampleRateHz: null,
      acceleration: null,
      rotation: null,
      candidateSteps: 0,
      acceptedSteps: 0,
      lastReason: 'none',
      stepLengthSource,
    })
    : null;

  function note(reason: string) {
    if (diagnostics) diagnostics.lastReason = reason;
  }

  function calibrate(distance: number, steps: number) {
    const length = calibratedStepLength(distance, steps);
    if (length == null) {
      message.value = 'Enter a measured distance and whole step count giving 0.2–1.5 meters per step.';
      return;
    }
    stop();
    stepLength.value = length;
    stepLengthSource = 'saved';
    if (diagnostics) diagnostics.stepLengthSource = 'saved';
    try { localStorage.setItem(STEP_LENGTH_STORAGE_KEY, String(length)); } catch { /* Optional persistence. */ }
    message.value = 'Calibration saved. Tap Enable automatic walking.';
  }

  /** Device-provided linear acceleration, or gravity removed with a low-pass estimate when that is missing. */
  function linearAcceleration(event: DeviceMotionEvent, now: number): { value: Vector; source: MotionSource } | null {
    const linear = vector(event.acceleration);
    if (linear) return { value: linear, source: 'linear' };
    const raw = vector(event.accelerationIncludingGravity);
    if (!raw) return null;
    if (!gravity) {
      gravity = { ...raw };
    } else {
      const dt = Math.max(0, now - gravityTime);
      const k = dt / (GRAVITY_TIME_CONSTANT_MS + dt);
      gravity = {
        x: gravity.x + k * (raw.x - gravity.x),
        y: gravity.y + k * (raw.y - gravity.y),
        z: gravity.z + k * (raw.z - gravity.z),
      };
    }
    gravityTime = now;
    return { value: { x: raw.x - gravity.x, y: raw.y - gravity.y, z: raw.z - gravity.z }, source: 'gravity-filtered' };
  }

  function readout(event: DeviceMotionEvent, value: Vector, magnitude: number, source: MotionSource, now: number) {
    if (!diagnostics) return;
    rateCount += 1;
    if (now - rateStart >= 1000) {
      diagnostics.sampleRateHz = rateStart > 0 ? Math.round((rateCount * 1000) / (now - rateStart)) : null;
      rateStart = now;
      rateCount = 0;
    }
    if (now - lastReadout < DIAGNOSTIC_INTERVAL_MS) return;
    lastReadout = now;
    diagnostics.source = source;
    diagnostics.acceleration = { ...value, magnitude };
    const rotation = event.rotationRate;
    diagnostics.rotation = rotation ? { alpha: rotation.alpha, beta: rotation.beta, gamma: rotation.gamma } : null;
  }

  function motion(event: DeviceMotionEvent) {
    if (!enabled.value) return;
    const now = performance.now();
    const reading = linearAcceleration(event, now);
    if (!reading) return;
    clearTimeout(timer);
    timer = setTimeout(() => { stop(); message.value = 'Motion data stopped. Use manual controls or enable walking again.'; }, 5000);
    message.value = 'Automatic walking enabled. Distance is estimated from detected steps.';
    const { x, y, z } = reading.value;
    const magnitude = Math.hypot(x, y, z);
    readout(event, reading.value, magnitude, reading.source, now);
    const rotation = event.rotationRate;
    if (rotation && [rotation.alpha, rotation.beta, rotation.gamma]
      .some(value => value != null && Math.abs(value) > ROTATION_LIMIT_DEG_PER_S)) {
      detector = new WalkingPeaks();
      note(`phone rotating over ${ROTATION_LIMIT_DEG_PER_S}°/s`);
      return;
    }
    const blocked = walkBlock() ?? (document.hidden ? 'app hidden' : null);
    if (blocked) {
      detector = new WalkingPeaks();
      note(`blocked: ${blocked}`);
      return;
    }
    const result = detector.sample(magnitude, now);
    if (diagnostics && result.candidate) diagnostics.candidateSteps += 1;
    if (result.reason) note(result.reason);
    if (result.steps > 0) {
      if (diagnostics) {
        diagnostics.acceptedSteps += result.steps;
        diagnostics.lastReason = 'step accepted';
      }
      onStep(result.steps * stepLength.value);
    }
  }
  function stop() {
    generation += 1;
    enabled.value = false;
    message.value = 'Automatic walking stopped. Enable it again to continue.';
    clearTimeout(timer);
    window.removeEventListener('devicemotion', motion);
    void nativeSource.stop();
    detector = new WalkingPeaks();
    gravity = null;
    rateStart = 0;
    rateCount = 0;
  }
  async function start() {
    stop();
    if (Capacitor.isNativePlatform()) {
      const request = generation;
      try {
        enabled.value = true;
        message.value = 'Starting Android step sensor…';
        const method = await nativeSource.start(
          (steps, method) => {
            if (request !== generation || !enabled.value) return;
            const blocked = walkBlock() ?? (document.hidden ? 'app hidden' : null);
            if (blocked) { note(`blocked: ${blocked}`); return; }
            if (diagnostics) {
              diagnostics.acceptedSteps += steps;
              diagnostics.lastReason = `native ${method}: ${steps} step(s) accepted`;
            }
            onStep(steps * stepLength.value);
          },
          status => { if (request === generation) message.value = status; },
        );
        if (request !== generation) return;
        message.value = `${stepMethodLabel(method)} active. Walking distance is estimated from actual sensor steps.`;
        return;
      } catch (error) {
        if (request !== generation) return;
        enabled.value = false;
        message.value = `${error instanceof Error ? error.message : 'Android step sensor unavailable.'} Use manual checkpoints or retry.`;
        return;
      }
    }
    if (typeof DeviceMotionEvent === 'undefined') { message.value = 'Motion sensors unavailable. Use manual controls.'; return; }
    const request = generation;
    try {
      const api = DeviceMotionEvent as MotionConstructor;
      if (api.requestPermission && await api.requestPermission() !== 'granted') {
        if (request === generation) message.value = 'Motion permission denied. Use manual controls.';
        return;
      }
      if (request !== generation) return;
      enabled.value = true;
      message.value = 'Waiting for motion data…';
      window.addEventListener('devicemotion', motion);
      timer = setTimeout(() => { stop(); message.value = 'No motion data received. Use manual controls.'; }, 5000);
    } catch {
      if (request === generation) { stop(); message.value = 'Could not access motion sensors. Use manual controls.'; }
    }
  }
  return { stepLength, enabled, message, diagnostics, calibrate, start, stop };
}
