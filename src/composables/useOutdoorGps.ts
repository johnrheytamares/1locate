import { ref, type Ref } from 'vue';
import type { GpsSource, UserLocation } from '@/models/location';
import type { OutdoorTarget } from '@/models/navigation';
import { destinationPoint } from '@/services/geo.service';
import {
  LOCATION_MESSAGES,
  LocationError,
  checkPermission,
  requestPermission,
  startLocationWatch,
  stopLocationWatch,
  toLocationError,
} from '@/services/location.service';
import {
  createOutdoorState,
  createTestTarget,
  processLocation,
  surveyedTarget,
  withTarget,
  type OutdoorState,
} from '@/services/outdoor-navigation.service';
import {
  SIMULATED_GOOD_ACCURACY,
  SIMULATED_ORIGIN,
  SIMULATED_POOR_ACCURACY,
  SIMULATED_START_BEARING_FROM_TARGET,
  SIMULATED_START_DISTANCE_METERS,
  createGpsSimulator,
  type GpsSimulator,
} from '@/services/simulated-location.service';

export type GpsStatus =
  | 'idle'
  | 'checking'
  | 'needs-permission'
  | 'requesting'
  | 'denied'
  | 'disabled'
  | 'searching'
  | 'tracking'
  | 'stopped'
  | 'error';

export const LOCATION_RATIONALE = '1Locate needs your location to guide you to your destination.';

/**
 * Outdoor GPS session: permission flow, the active location source, and the outdoor guidance state.
 * Kept outside the camera page so a later map view can read the same state.
 */
export function useOutdoorGps(heading: Ref<number | null>) {
  const source = ref<GpsSource>('real');
  const status = ref<GpsStatus>('idle');
  const message = ref('');
  const precise = ref(true);
  const state = ref<OutdoorState>(createOutdoorState(null));
  const simulatedAccuracy = ref(SIMULATED_GOOD_ACCURACY);

  let destinationTarget: OutdoorTarget | null = null;
  let simulator: GpsSimulator | null = null;
  let session = 0;
  let active = false;

  function onFix(fix: UserLocation) {
    if (!active) return;
    state.value = processLocation(state.value, fix);
    status.value = 'tracking';
    message.value = '';
  }

  function onError(error: LocationError) {
    if (!active) return;
    if (error.code === 'timeout') {
      if (status.value !== 'tracking') message.value = error.message;
      return;
    }
    status.value = error.code === 'permission-denied'
      ? 'denied'
      : error.code === 'location-disabled' ? 'disabled' : 'error';
    message.value = error.message;
    void stopLocationWatch();
  }

  function stopFeeds() {
    void stopLocationWatch();
    simulator?.stop();
  }

  async function beginWatch(current: number) {
    status.value = 'searching';
    message.value = '';
    try {
      await startLocationWatch(onFix, onError);
    } catch (error) {
      if (current === session) onError(toLocationError(error));
    }
  }

  function startSimulator() {
    if (!destinationTarget) return;
    if (!state.value.target) {
      state.value = withTarget(state.value, createTestTarget(destinationTarget, SIMULATED_ORIGIN, 0, 0));
    }
    if (!simulator) {
      const target = state.value.target as NonNullable<OutdoorState['target']>;
      const start = destinationPoint(
        target.latitude,
        target.longitude,
        SIMULATED_START_DISTANCE_METERS,
        SIMULATED_START_BEARING_FROM_TARGET,
      );
      simulator = createGpsSimulator(start, onFix);
      simulator.setAccuracy(simulatedAccuracy.value);
    }
    status.value = 'tracking';
    message.value = '';
    simulator.start();
  }

  /** Starts (or restarts) the current source without clearing outdoor progress. */
  async function resume() {
    if (!active) return;
    const current = ++session;
    stopFeeds();
    if (source.value === 'simulated') {
      startSimulator();
      return;
    }
    status.value = 'checking';
    try {
      const permission = await checkPermission();
      if (current !== session || !active) return;
      precise.value = permission.precise;
      if (permission.state === 'granted') {
        await beginWatch(current);
        return;
      }
      status.value = permission.state === 'denied' ? 'denied' : 'needs-permission';
      message.value = permission.state === 'denied' ? LOCATION_MESSAGES['permission-denied'] : LOCATION_RATIONALE;
    } catch (error) {
      if (current === session) onError(toLocationError(error));
    }
  }

  /** Called when the user taps Allow Location or Retry. */
  async function allowLocation() {
    if (!active) return;
    if (status.value === 'disabled' || status.value === 'error') {
      await resume();
      return;
    }
    const current = ++session;
    status.value = 'requesting';
    try {
      const permission = await requestPermission();
      if (current !== session || !active) return;
      precise.value = permission.precise;
      if (permission.state === 'granted') {
        await beginWatch(current);
        return;
      }
      status.value = 'denied';
      message.value = LOCATION_MESSAGES['permission-denied'];
    } catch (error) {
      if (current === session) onError(toLocationError(error));
    }
  }

  async function start(target: OutdoorTarget) {
    destinationTarget = { ...target };
    simulator = null;
    state.value = createOutdoorState(surveyedTarget(destinationTarget));
    active = true;
    await resume();
  }

  /** Stops updates but keeps the session so it can resume after the app returns to the foreground. */
  function pause() {
    session += 1;
    stopFeeds();
  }

  /** Ends the outdoor session and clears the watcher. */
  function stop() {
    active = false;
    session += 1;
    stopFeeds();
    status.value = 'stopped';
    message.value = '';
  }

  function reset() {
    if (!destinationTarget) return;
    simulator?.stop();
    simulator = null;
    state.value = createOutdoorState(surveyedTarget(destinationTarget));
    if (source.value === 'simulated') void resume();
  }

  function setSource(next: GpsSource) {
    if (source.value === next) return;
    source.value = next;
    reset();
    if (next === 'real') void resume();
  }

  /** REAL GPS only, for destinations without surveyed coordinates. */
  function placeTestTarget(): boolean {
    if (!destinationTarget || source.value !== 'real' || !state.value.location) return false;
    if (surveyedTarget(destinationTarget)) return false;
    const bearing = heading.value ?? 0;
    state.value = withTarget(state.value, createTestTarget(destinationTarget, state.value.location, bearing));
    return true;
  }

  function simulateWalk(meters = 3) {
    if (source.value !== 'simulated' || !simulator) return;
    const bearing = heading.value ?? state.value.bearing ?? 0;
    simulator.walk(meters, bearing);
  }

  function toggleSimulatedAccuracy() {
    simulatedAccuracy.value = simulatedAccuracy.value === SIMULATED_GOOD_ACCURACY
      ? SIMULATED_POOR_ACCURACY
      : SIMULATED_GOOD_ACCURACY;
    simulator?.setAccuracy(simulatedAccuracy.value);
  }

  function hasSurveyedTarget(): boolean {
    return destinationTarget != null && surveyedTarget(destinationTarget) != null;
  }

  return {
    source,
    status,
    message,
    precise,
    state,
    simulatedAccuracy,
    start,
    resume,
    pause,
    stop,
    reset,
    allowLocation,
    setSource,
    placeTestTarget,
    simulateWalk,
    toggleSimulatedAccuracy,
    hasSurveyedTarget,
  };
}
