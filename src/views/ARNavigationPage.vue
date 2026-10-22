<template>
  <ion-page class="nav-page">
    <ion-header class="nav-header">
      <ion-toolbar class="nav-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/destinations" />
        </ion-buttons>
        <div class="brand-lockup">
          <strong>1Locate</strong>
          <span>Camera Navigation</span>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content :scroll-y="false" class="nav-content">
      <div class="stage">
        <NavigationOverlay
          :arrows="arrows"
          :destination-name="markerName"
          :distance-label="distanceLabel"
          :instruction="instruction"
          :heading-offset="pathOffset"
        />
        <div v-if="isOutdoor" class="status-chips">
          <span v-if="gpsSource === 'simulated'" class="chip sim">SIMULATED GPS</span>
          <span v-if="outdoor.target?.source === 'test'" class="chip test">TEST target</span>
          <span v-if="improvingAccuracy" class="chip warn">Improving GPS accuracy...</span>
          <span v-if="gpsSource === 'real' && gpsStatus === 'tracking' && !gpsPrecise" class="chip warn">
            Precise location is off
          </span>
        </div>
        <div v-if="locationPrompt && (locationPrompt.action || locationPrompt.back)" class="location-card">
          <p v-if="locationPrompt.hint" class="hint">{{ locationPrompt.hint }}</p>
          <ion-button v-if="locationPrompt.action" @click="onAllowLocation">{{ locationPrompt.action }}</ion-button>
          <ion-button v-if="locationPrompt.back" fill="outline" class="back" @click="backToDestinations">
            Back to destinations
          </ion-button>
        </div>
        <template v-else>
          <p v-if="cameraMessage" class="camera-message">{{ cameraMessage }}</p>
          <ion-button v-if="cameraMessage" class="retry" @click="openCamera">Try camera again</ion-button>
        </template>
      </div>
    </ion-content>

    <ion-footer class="nav-footer">
      <div class="info-card">
        <div class="info-row">
          <span>Destination</span>
          <strong>{{ destinationName }}</strong>
        </div>
        <div v-if="isOutdoor" class="info-row">
          <span>Heading to</span>
          <strong class="small">{{ outdoorTargetName }}</strong>
        </div>
        <div class="info-row">
          <span>Distance</span>
          <strong>{{ distanceLabel }}</strong>
        </div>
        <p class="instruction">{{ instruction }}</p>
        <p v-if="isOutdoor && outdoor.raw" class="path-note">GPS Accuracy ±{{ Math.round(outdoor.raw.accuracy) }} m</p>
        <p v-if="showPathNote" class="path-note">Follow the blue path</p>

        <div class="debug">
          <p>Debug</p>
          <ul v-if="isOutdoor" class="debug-readout">
            <li>Navigation Mode: {{ modeLabel }}</li>
            <li>GPS Source: {{ gpsSource === 'simulated' ? 'SIMULATED GPS' : 'REAL GPS' }}</li>
            <li>Location Status: {{ gpsStatus }}</li>
            <li>Latitude: {{ formatCoordinate(outdoor.location?.latitude) }}</li>
            <li>Longitude: {{ formatCoordinate(outdoor.location?.longitude) }}</li>
            <li>Raw: {{ formatCoordinate(outdoor.raw?.latitude) }}, {{ formatCoordinate(outdoor.raw?.longitude) }}</li>
            <li>GPS Accuracy: {{ accuracyLabel }}</li>
            <li>GPS Speed: {{ speedLabel }}</li>
            <li>Target: {{ targetLabel }}</li>
            <li>Destination Latitude: {{ formatCoordinate(outdoor.target?.latitude) }}</li>
            <li>Destination Longitude: {{ formatCoordinate(outdoor.target?.longitude) }}</li>
            <li>Distance: {{ distanceLabel }}</li>
            <li>GPS Bearing: {{ outdoor.bearing == null ? 'unavailable' : formatHeading(outdoor.bearing) }}</li>
            <li>Phone Heading: {{ phoneHeadingLabel }}</li>
            <li>Heading Offset: {{ offsetLabel }}</li>
            <li>Arrival Radius: {{ outdoor.target ? `${outdoor.target.arrivalRadius} m` : 'unavailable' }}</li>
            <li>Arrival Status: {{ outdoorArrivalStatus }}</li>
            <li>Last Rejected Fix: {{ outdoor.lastRejectReason ?? 'none' }}</li>
          </ul>
          <ul v-else class="debug-readout">
            <li>Navigation Mode: {{ modeLabel }}</li>
            <li>Current Step: {{ stepIndex + 1 }} · {{ currentDirection }}</li>
            <li>Current Segment: {{ segmentLabel }}</li>
            <li>Required Heading: {{ requiredHeadingLabel }}</li>
            <li>Heading Offset: {{ offsetLabel }}</li>
            <li>Turn Alignment: {{ turnAlignment }}</li>
            <li>Next Step: {{ nextStepLabel }}</li>
            <li>Selected Destination: {{ navigation.destinationName }}</li>
            <li>Phone Heading: {{ phoneHeadingLabel }}</li>
            <li>Forward Heading: {{ forwardHeadingLabel }}</li>
            <li>Remaining Distance: {{ distanceLabel }}</li>
          </ul>
          <div v-if="isOutdoor" class="debug-actions">
            <ion-button size="small" @click="onToggleSource">
              {{ gpsSource === 'simulated' ? 'Use Real GPS' : 'Use Simulated GPS' }}
            </ion-button>
            <ion-button
              v-if="gpsSource === 'real' && !hasSurveyedTarget"
              size="small"
              :disabled="!outdoor.location"
              @click="onPlaceTestTarget"
            >
              Place Test Target
            </ion-button>
            <ion-button v-if="gpsSource === 'simulated'" size="small" @click="onSimulateWalk">Sim Walk 3 m</ion-button>
            <ion-button v-if="gpsSource === 'simulated'" size="small" @click="gps.toggleSimulatedAccuracy">
              Sim Accuracy {{ simulatedAccuracy }} m
            </ion-button>
            <ion-button size="small" fill="clear" @click="onReset">Reset</ion-button>
          </div>
          <div v-else class="debug-actions">
            <ion-button size="small" :disabled="heading == null" @click="onSetForward">Set Forward</ion-button>
            <ion-button size="small" @click="onMoveForward">Move Forward</ion-button>
            <ion-button size="small" @click="onNext">Next Step</ion-button>
            <ion-button size="small" @click="onTurnRight">Turn Right</ion-button>
            <ion-button size="small" fill="clear" @click="onReset">Reset</ion-button>
          </div>
        </div>
      </div>
    </ion-footer>

    <ion-alert
      :is-open="showEntrance"
      :header="`You have reached ${buildingName}.`"
      :message="`Continue to ${destinationName}.`"
      :backdrop-dismiss="false"
      :buttons="[{ text: 'Continue', role: 'confirm' }]"
      @didDismiss="onEntranceDismiss"
    />

    <ion-alert
      :is-open="showArrival"
      header="You have reached your destination."
      :message="arrivalMessage"
      :buttons="[{ text: 'Done', role: 'confirm' }]"
      @didDismiss="onArrivalDismiss"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  IonAlert,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonPage,
  IonToolbar,
  onIonViewDidEnter,
  onIonViewWillLeave,
  useIonRouter,
} from '@ionic/vue';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import NavigationOverlay from '@/components/navigation/NavigationOverlay.vue';
import { LOCATION_RATIONALE, useOutdoorGps } from '@/composables/useOutdoorGps';
import { FACING_TOLERANCE_DEGREES, TURN_ALIGNMENT_HOLD_MS, type Destination } from '@/models/navigation';
import { startRearPreview, stopRearPreview } from '@/services/camera.service';
import { LOCATION_MESSAGES } from '@/services/location.service';
import {
  advanceInstruction,
  completeCurrentTurn,
  createTestNavigation,
  currentSegment,
  currentStep,
  currentStepIndex,
  getSelectedDestination,
  guideArrows,
  hasArrived,
  headingOffset,
  jumpToRightTurn,
  loadSelectedRoute,
  moveForward,
  navigationInstruction,
  nextRouteStep,
  remainingMeters,
  requiredHeading,
  resetNavigation,
  setForwardHeading,
  type GuideArrow,
} from '@/services/navigation.service';
import {
  accuracyLevel,
  arrivalStatus,
  isImprovingAccuracy,
  outdoorInstruction,
} from '@/services/outdoor-navigation.service';
import { watchHeading } from '@/services/orientation.service';

type NavigationStage = 'outdoor' | 'entrance' | 'indoor';

const OUTDOOR_ARROWS: GuideArrow[] = [
  { id: 'gps-1', direction: 'straight', active: true },
  { id: 'gps-2', direction: 'straight', active: false },
  { id: 'gps-3', direction: 'straight', active: false },
];

const ionRouter = useIonRouter();
const destination = ref<Destination | null>(null);
const navigation = ref(createTestNavigation());
const stage = ref<NavigationStage>('outdoor');
const heading = ref<number | null>(null);
const cameraMessage = ref('');
const showArrival = ref(false);
const showEntrance = ref(false);
const pageOpen = ref(false);
const turnAlignment = ref('not a turn');

const gps = useOutdoorGps(heading);
const {
  source: gpsSource,
  status: gpsStatus,
  precise: gpsPrecise,
  message: gpsMessage,
  state: outdoor,
  simulatedAccuracy,
} = gps;

let cameraSession = 0;
let stopHeading = () => {};
let appHandle: PluginListenerHandle | null = null;
let alignTimer: number | null = null;
let wentBackground = false;

const isOutdoor = computed(() => stage.value !== 'indoor');
const destinationName = computed(() => destination.value?.name ?? navigation.value.destinationName);
const buildingName = computed(() => destination.value?.building ?? navigation.value.building);
const outdoorTargetName = computed(() => (
  outdoor.value.target?.name ?? destination.value?.outdoorTarget.name ?? buildingName.value
));
const markerName = computed(() => (isOutdoor.value ? outdoorTargetName.value : destinationName.value));
const hasSurveyedTarget = computed(() => destination.value != null && gps.hasSurveyedTarget());

const arrived = computed(() => hasArrived(navigation.value));
const stepIndex = computed(() => currentStepIndex(navigation.value));
const currentDirection = computed(() => currentStep(navigation.value)?.direction ?? 'straight');
const modeLabel = computed(() => (isOutdoor.value ? 'OUTDOOR (GPS)' : 'INDOOR (fixed route)'));
const arrivalMessage = computed(() => `You have reached ${navigation.value.destinationName}.`);

const locationPrompt = computed(() => {
  if (!isOutdoor.value || gpsSource.value !== 'real') return null;
  switch (gpsStatus.value) {
    case 'needs-permission':
      return { text: LOCATION_RATIONALE, action: 'Allow Location', back: false, hint: '' };
    case 'requesting':
      return { text: LOCATION_RATIONALE, action: '', back: false, hint: '' };
    case 'denied':
      return {
        text: LOCATION_MESSAGES['permission-denied'],
        action: 'Retry',
        back: true,
        hint: 'If no prompt appears, allow Location for 1Locate in Android Settings.',
      };
    case 'disabled':
      return { text: LOCATION_MESSAGES['location-disabled'], action: 'Retry', back: true, hint: '' };
    case 'error':
      return { text: gpsMessage.value || LOCATION_MESSAGES.unavailable, action: 'Retry', back: true, hint: '' };
    default:
      return null;
  }
});

const improvingAccuracy = computed(() => isImprovingAccuracy(outdoor.value));
const outdoorGuiding = computed(() => (
  outdoor.value.location != null && outdoor.value.target != null && !outdoor.value.arrived
));

const required = computed(() => (isOutdoor.value ? outdoor.value.bearing : requiredHeading(navigation.value)));
const offset = computed(() => headingOffset(heading.value, required.value));

const distanceLabel = computed(() => {
  if (!isOutdoor.value) return `${remainingMeters(navigation.value)} m`;
  const distance = outdoor.value.distance;
  return distance == null ? '-- m' : `${Math.round(distance)} m`;
});

const instruction = computed(() => {
  if (!isOutdoor.value) return navigationInstruction(navigation.value, heading.value);
  if (locationPrompt.value) return locationPrompt.value.text;
  if (gpsSource.value === 'real' && !outdoor.value.location && gpsMessage.value) return gpsMessage.value;
  return outdoorInstruction(outdoor.value, heading.value, buildingName.value);
});

const arrows = computed(() => {
  if (!isOutdoor.value) return guideArrows(navigation.value);
  return outdoorGuiding.value && !locationPrompt.value ? OUTDOOR_ARROWS : [];
});

const pathOffset = computed(() => {
  if (isOutdoor.value) return outdoorGuiding.value ? offset.value : null;
  return navigation.value.forwardHeading == null ? null : offset.value;
});

const showPathNote = computed(() => (
  isOutdoor.value ? outdoorGuiding.value && !locationPrompt.value : navigation.value.forwardHeading != null
));

const accuracyLabel = computed(() => {
  const raw = outdoor.value.raw;
  return raw ? `±${raw.accuracy.toFixed(1)} m (${accuracyLevel(raw)})` : 'unavailable';
});
const speedLabel = computed(() => {
  const speed = outdoor.value.raw?.speed;
  return speed == null ? 'unavailable' : `${speed.toFixed(1)} m/s`;
});
const targetLabel = computed(() => {
  const target = outdoor.value.target;
  if (!target) return hasSurveyedTarget.value ? 'loading' : 'TEST target not set';
  return target.source === 'test' ? `${target.name} (TEST)` : `${target.name} (surveyed)`;
});
const outdoorArrivalStatus = computed(() => arrivalStatus(outdoor.value));

const segmentLabel = computed(() => {
  const segment = currentSegment(navigation.value);
  if (!segment) return 'unavailable';
  const start = segment.startIndex + 1;
  const end = segment.endIndex + 1;
  return start === end ? `${segment.direction} (step ${start})` : `${segment.direction} (steps ${start}–${end})`;
});
const nextStepLabel = computed(() => {
  const step = nextRouteStep(navigation.value);
  return step ? `${step.direction}` : 'destination';
});
const phoneHeadingLabel = computed(() => (
  heading.value == null ? 'unavailable' : formatHeading(heading.value)
));
const forwardHeadingLabel = computed(() => (
  navigation.value.forwardHeading == null ? 'not set' : formatHeading(navigation.value.forwardHeading)
));
const requiredHeadingLabel = computed(() => (
  required.value == null ? 'not set' : formatHeading(required.value)
));
const offsetLabel = computed(() => (
  heading.value == null ? 'unavailable' : formatSigned(offset.value)
));

watch(() => outdoor.value.arrived, (isArrived) => {
  if (!isArrived || stage.value !== 'outdoor') return;
  stage.value = 'entrance';
  gps.stop();
  showEntrance.value = true;
});

watch(arrived, (isArrived, wasArrived) => {
  if (stage.value !== 'indoor') return;
  if (isArrived && !wasArrived) showArrival.value = true;
  if (!isArrived) showArrival.value = false;
});

watch(
  () => [stage.value, navigation.value.walkedMeters, navigation.value.forwardHeading, heading.value, offset.value],
  () => {
    syncTurnAlignment();
  },
);

function clearAlignTimer() {
  if (alignTimer == null) return;
  window.clearTimeout(alignTimer);
  alignTimer = null;
}

function syncTurnAlignment() {
  const step = currentStep(navigation.value);
  const onTurn = stage.value === 'indoor'
    && step != null
    && step.direction !== 'straight'
    && !hasArrived(navigation.value);
  if (!onTurn) {
    clearAlignTimer();
    turnAlignment.value = 'not a turn';
    return;
  }
  if (heading.value == null || offset.value == null) {
    clearAlignTimer();
    turnAlignment.value = 'unavailable';
    return;
  }
  if (Math.abs(offset.value) > FACING_TOLERANCE_DEGREES) {
    clearAlignTimer();
    turnAlignment.value = 'not aligned';
    return;
  }
  turnAlignment.value = 'holding';
  if (alignTimer != null) return;
  const startedWalked = navigation.value.walkedMeters;
  const startedForward = navigation.value.forwardHeading;
  alignTimer = window.setTimeout(() => {
    alignTimer = null;
    const still = currentStep(navigation.value);
    const stillAligned = stage.value === 'indoor'
      && still != null
      && still.direction !== 'straight'
      && navigation.value.walkedMeters === startedWalked
      && navigation.value.forwardHeading === startedForward
      && offset.value != null
      && Math.abs(offset.value) <= FACING_TOLERANCE_DEGREES;
    if (!stillAligned) {
      turnAlignment.value = 'not aligned';
      return;
    }
    navigation.value = completeCurrentTurn(navigation.value);
    turnAlignment.value = 'aligned';
  }, TURN_ALIGNMENT_HOLD_MS);
}

function setCameraChrome(active: boolean) {
  document.documentElement.classList.toggle('camera-nav-active', active);
}

async function openCamera() {
  const session = cameraSession;
  cameraMessage.value = '';
  try {
    await startRearPreview();
    if (session !== cameraSession || !pageOpen.value) {
      await stopRearPreview();
      return;
    }
    setCameraChrome(true);
  } catch (error) {
    if (session !== cameraSession) return;
    setCameraChrome(false);
    cameraMessage.value = error instanceof Error
      ? error.message
      : 'The camera could not start.';
  }
}

async function closeCamera() {
  cameraSession += 1;
  pageOpen.value = false;
  setCameraChrome(false);
  await stopRearPreview();
}

function onAllowLocation() {
  void gps.allowLocation();
}

function backToDestinations() {
  gps.stop();
  ionRouter.replace('/destinations');
}

function onToggleSource() {
  gps.setSource(gpsSource.value === 'simulated' ? 'real' : 'simulated');
}

function onPlaceTestTarget() {
  gps.placeTestTarget();
}

function onSimulateWalk() {
  gps.simulateWalk(3);
}

function enterIndoor() {
  const indoor = loadSelectedRoute();
  if (!indoor) {
    ionRouter.replace('/destinations');
    return;
  }
  clearAlignTimer();
  navigation.value = indoor;
  turnAlignment.value = 'not a turn';
  stage.value = 'indoor';
}

function onEntranceDismiss() {
  showEntrance.value = false;
  if (stage.value === 'entrance') enterIndoor();
}

function onMoveForward() {
  navigation.value = moveForward(navigation.value, 1);
}

function onNext() {
  navigation.value = advanceInstruction(navigation.value);
}

function onTurnRight() {
  navigation.value = jumpToRightTurn(navigation.value);
}

function onSetForward() {
  if (heading.value == null) return;
  navigation.value = setForwardHeading(navigation.value, heading.value);
}

function onReset() {
  if (isOutdoor.value) {
    gps.reset();
    return;
  }
  clearAlignTimer();
  navigation.value = resetNavigation(navigation.value);
  showArrival.value = false;
  turnAlignment.value = 'not a turn';
}

function formatHeading(value: number): string {
  return `${Math.round(value)}°`;
}

function formatSigned(value: number | null): string {
  if (value == null) return 'not set';
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}°`;
  return `${rounded}°`;
}

function formatCoordinate(value: number | null | undefined): string {
  return value == null ? 'unavailable' : value.toFixed(6);
}

function onArrivalDismiss(event: CustomEvent<{ role?: string }>) {
  showArrival.value = false;
  if (event.detail.role === 'confirm') {
    ionRouter.replace('/destinations');
  }
}

function endSession() {
  clearAlignTimer();
  gps.stop();
  void closeCamera();
  stopHeading();
  void appHandle?.remove();
  appHandle = null;
}

onIonViewDidEnter(() => {
  const selected = getSelectedDestination();
  const indoor = loadSelectedRoute();
  if (!selected || !indoor) {
    ionRouter.replace('/destinations');
    return;
  }
  destination.value = selected;
  navigation.value = indoor;
  stage.value = 'outdoor';
  showArrival.value = false;
  showEntrance.value = false;
  turnAlignment.value = 'not a turn';
  wentBackground = false;
  pageOpen.value = true;
  void openCamera();
  stopHeading();
  stopHeading = watchHeading((value) => {
    heading.value = value;
  });
  void gps.start(selected.outdoorTarget);
  void appHandle?.remove();
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!pageOpen.value) return;
    if (!isActive) {
      wentBackground = true;
      setCameraChrome(false);
      void stopRearPreview();
      gps.pause();
      return;
    }
    // Android also reports "active" after permission dialogs close; only resume after a real background trip.
    if (!wentBackground) return;
    wentBackground = false;
    void openCamera();
    if (stage.value === 'outdoor') void gps.resume();
  }).then((handle) => {
    if (!pageOpen.value) {
      void handle.remove();
      return;
    }
    appHandle = handle;
  });
});

onIonViewWillLeave(endSession);

onUnmounted(endSession);
</script>

<style scoped>
.nav-toolbar {
  --background: #0b3a5b;
  --color: #ffffff;
  --border-width: 0;
}

.brand-lockup {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 44px;
}

.brand-lockup strong {
  color: #ffffff;
  font-size: 18px;
  line-height: 1.1;
}

.brand-lockup span {
  color: #9fdfff;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.nav-content {
  --background: #071820;
}

.stage {
  position: relative;
  height: 100%;
}

.status-chips {
  position: absolute;
  top: 64px;
  left: 12px;
  right: 12px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
}

.chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.chip.sim {
  background: #f5b700;
  color: #1d1600;
}

.chip.test {
  background: #ff7a45;
  color: #2b0d00;
}

.chip.warn {
  background: rgba(7, 24, 32, 0.85);
  color: #ffd166;
  border: 1px solid #ffd166;
}

.location-card {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(7, 24, 32, 0.9);
  color: #f4fbff;
}

.location-card .hint {
  margin: 0;
  color: #9fdfff;
  font-size: 13px;
  text-align: center;
}

.location-card ion-button {
  --background: #1493c7;
  margin: 0;
}

.location-card ion-button.back {
  --background: transparent;
  --color: #9fdfff;
  --border-color: #9fdfff;
}

.camera-message {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 72px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(120, 24, 24, 0.9);
  color: #ffd0d0;
  text-align: center;
}

.retry {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  --background: #1493c7;
}

.nav-footer {
  background: #0b3a5b;
}

.info-card {
  max-height: 46vh;
  overflow-y: auto;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  color: #f4fbff;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
}

.info-row span,
.path-note,
.debug p {
  color: #9fdfff;
  font-size: 13px;
}

.info-row strong {
  font-size: 20px;
}

.info-row strong.small {
  font-size: 15px;
  text-align: right;
}

.instruction,
.path-note,
.debug p,
.debug-readout {
  margin: 4px 0 0;
}

.instruction {
  font-size: 16px;
}

.debug {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(159, 223, 255, 0.25);
}

.debug-readout {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  color: #d7f3ff;
  font-size: 12px;
  line-height: 1.35;
}

.debug-readout li {
  margin: 0;
}

.debug-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.debug-actions ion-button {
  --background: #1493c7;
  --border-radius: 999px;
  margin: 0;
}
</style>

<style>
html.camera-nav-active,
html.camera-nav-active body,
html.camera-nav-active ion-app,
html.camera-nav-active ion-router-outlet,
html.camera-nav-active ion-page.nav-page,
html.camera-nav-active ion-content.nav-content,
html.camera-nav-active ion-content.nav-content::part(background) {
  background: transparent !important;
  --background: transparent;
  --ion-background-color: transparent;
}
</style>
