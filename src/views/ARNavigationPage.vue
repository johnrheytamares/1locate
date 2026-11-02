<template>
  <ion-page class="nav-page">
    <ion-header class="nav-header">
      <ion-toolbar class="nav-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/destinations" text="" color="light" />
        </ion-buttons>
        <div class="brand-lockup">
          <div class="brand-title">
            <span class="pin" aria-hidden="true"><ion-icon :icon="location" /></span>
            <strong>1Locate</strong>
          </div>
          <span class="brand-sub">Camera Navigation</span>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="nav-content">
      <div v-if="showMapWait" class="sheet">
        <div class="map-card" aria-hidden="true">
          <span class="map-pin"><ion-icon :icon="location" /></span>
        </div>
        <h1 class="wait-title">{{ waitTitle }}</h1>
        <p v-if="waitSubtitle" class="wait-sub">{{ waitSubtitle }}</p>
        <div v-if="isOutdoor" class="status-chips">
          <span v-if="improvingAccuracy" class="chip pill">
            <ion-icon :icon="navigateOutline" aria-hidden="true" />
            Improving GPS accuracy...
            <ion-spinner name="crescent" />
          </span>
          <span v-if="gpsSource === 'real' && gpsStatus === 'tracking' && !gpsPrecise" class="chip pill">
            Precise location is off
          </span>
        </div>
        <div v-if="locationPrompt && (locationPrompt.action || locationPrompt.back)" class="prompt-actions">
          <p v-if="locationPrompt.hint" class="hint">{{ locationPrompt.hint }}</p>
          <ion-button v-if="locationPrompt.action" expand="block" @click="onAllowLocation">{{ locationPrompt.action }}</ion-button>
          <ion-button v-if="locationPrompt.back" expand="block" fill="outline" class="back" @click="backToDestinations">
            Back to destinations
          </ion-button>
        </div>
      </div>

      <template v-else>
        <div class="sheet">
          <div class="instruction-banner">
            <ion-icon :icon="paperPlaneOutline" aria-hidden="true" />
            <strong>{{ instruction }}</strong>
          </div>
          <div v-if="isOutdoor" class="status-chips chips-row">
            <span v-if="gpsSource === 'simulated'" class="chip sim">SIMULATED GPS</span>
            <span v-if="outdoor.target?.source === 'test'" class="chip test">TEST target</span>
            <span v-if="improvingAccuracy" class="chip pill">Improving GPS accuracy...</span>
            <span v-if="gpsSource === 'real' && gpsStatus === 'tracking' && !gpsPrecise" class="chip pill">
              Precise location is off
            </span>
          </div>
        </div>
        <div class="camera-frame">
          <span class="corner tl" /><span class="corner tr" /><span class="corner bl" /><span class="corner br" />
          <NavigationOverlay
            :arrows="arrows"
            :destination-name="markerName"
            :distance-label="distanceLabel"
            :instruction="''"
            :heading-offset="pathOffset"
          />
        </div>
      </template>

      <div class="sheet">
        <div v-if="cameraMessage" class="camera-banner">
          <ion-icon :icon="cameraOutline" aria-hidden="true" />
          <p class="camera-message">{{ cameraMessage }}</p>
        </div>
        <ion-button v-if="cameraMessage" expand="block" class="retry" @click="openCamera">
          <ion-icon slot="start" :icon="cameraOutline" aria-hidden="true" />
          Try camera again
        </ion-button>

        <article v-if="showMapWait" class="dest-card">
          <span class="dest-icon" aria-hidden="true"><ion-icon :icon="iconForDestination" /></span>
          <div>
            <p class="dest-kicker">Destination</p>
            <strong>{{ destinationName }}</strong>
            <p class="dest-place">
              <ion-icon :icon="locationOutline" aria-hidden="true" />
              {{ outdoorTargetName }}
            </p>
          </div>
        </article>
        <div v-if="showMapWait" class="distance-row">
          <span><ion-icon :icon="locationOutline" aria-hidden="true" /> Distance</span>
          <strong>{{ distanceLabel }}</strong>
        </div>
        <p v-if="!showMapWait" class="live-note">{{ destinationName }} · {{ distanceLabel }}</p>
        <p v-if="isOutdoor && outdoor.raw" class="path-note">GPS Accuracy ±{{ Math.round(outdoor.raw.accuracy) }} m</p>
        <p v-if="showPathNote" class="path-note">Follow the blue path</p>

        <div class="debug">
          <details>
            <summary>Debug</summary>
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
          </details>
          <div v-if="isOutdoor" class="debug-actions">
            <ion-button @click="onToggleSource">
              <ion-icon slot="start" :icon="paperPlaneOutline" aria-hidden="true" />
              {{ gpsSource === 'simulated' ? 'Use Real GPS' : 'Use Simulated GPS' }}
            </ion-button>
            <ion-button
              v-if="gpsSource === 'real' && !hasSurveyedTarget"
              :disabled="!outdoor.location"
              @click="onPlaceTestTarget"
            >
              Place Test Target
            </ion-button>
            <ion-button v-if="gpsSource === 'simulated'" @click="onSimulateWalk">
              <ion-icon slot="start" :icon="walkOutline" aria-hidden="true" />
              Sim Walk 3 m
            </ion-button>
            <ion-button v-if="gpsSource === 'simulated'" @click="gps.toggleSimulatedAccuracy">
              <ion-icon slot="start" :icon="locateOutline" aria-hidden="true" />
              Sim Accuracy {{ simulatedAccuracy }} m
            </ion-button>
            <ion-button class="reset" @click="onReset">
              <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
              Reset
            </ion-button>
          </div>
          <div v-else class="debug-actions">
            <ion-button :disabled="heading == null" @click="onSetForward">Set Forward</ion-button>
            <ion-button @click="onMoveForward">Move Forward</ion-button>
            <ion-button @click="onNext">Next Step</ion-button>
            <ion-button @click="onTurnRight">Turn Right</ion-button>
            <ion-button class="reset" @click="onReset">
              <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
              Reset
            </ion-button>
          </div>
        </div>
      </div>
    </ion-content>

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
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonToolbar,
  onIonViewDidEnter,
  onIonViewWillLeave,
  useIonRouter,
} from '@ionic/vue';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  bookOutline,
  businessOutline,
  cameraOutline,
  cashOutline,
  flaskOutline,
  locateOutline,
  location,
  locationOutline,
  navigateOutline,
  paperPlaneOutline,
  peopleOutline,
  refreshOutline,
  schoolOutline,
  walkOutline,
} from 'ionicons/icons';
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
const showMapWait = computed(() => isOutdoor.value && !outdoorGuiding.value);
const waitTitle = computed(() => (locationPrompt.value ? 'Location needed' : 'Getting your location...'));
const waitSubtitle = computed(() => {
  if (locationPrompt.value) return locationPrompt.value.text;
  if (!outdoor.value.location) return 'Please wait while we find your current position.';
  return instruction.value;
});
const iconForDestination = computed(() => {
  const item = destination.value;
  const key = `${item?.id ?? ''} ${item?.name ?? ''} ${item?.type ?? ''}`.toLowerCase();
  if (key.includes('library')) return bookOutline;
  if (key.includes('cashier') || key.includes('cash') || key.includes('finance')) return cashOutline;
  if (key.includes('guidance') || key.includes('counsel')) return peopleOutline;
  if (key.includes('lab')) return flaskOutline;
  if (key.includes('class') || key.includes('school')) return schoolOutline;
  return businessOutline;
});
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
  --background: #0c2d52;
  --color: #ffffff;
  --border-width: 0;
  --min-height: 56px;
}

.brand-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pin {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #1d4ed8;
  color: #fff;
  font-size: 15px;
}

.brand-sub {
  margin-left: 34px;
  color: #c5d4e8;
  font-size: 13px;
  font-weight: 500;
}

.brand-lockup {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 44px;
}

.brand-lockup strong {
  color: #ffffff;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}

.nav-content {
  --background: #eef5fb;
}

.sheet {
  padding: 12px 16px 4px;
  background: #eef5fb;
}

.map-card {
  position: relative;
  height: 168px;
  margin-bottom: 16px;
  border-radius: 24px;
  background:
    linear-gradient(#d7e4f2, #d7e4f2) 18% 42% / 46% 8px no-repeat,
    linear-gradient(#d7e4f2, #d7e4f2) 62% 28% / 8px 48% no-repeat,
    linear-gradient(#e7eef6, #e7eef6) 30% 70% / 28% 8px no-repeat,
    radial-gradient(circle at 50% 46%, rgba(37, 99, 235, 0.18), transparent 42%),
    #f7fbff;
  box-shadow: inset 0 0 0 1px #e1ebf5;
}

.map-pin {
  position: absolute;
  left: 50%;
  top: 42%;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-size: 22px;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 10px rgba(37, 99, 235, 0.18);
}

.wait-title {
  margin: 0;
  color: #12263f;
  font-size: 22px;
  font-weight: 800;
  text-align: center;
}

.wait-sub,
.hint,
.path-note,
.live-note {
  margin: 6px 0 0;
  color: #6b8096;
  font-size: 14px;
  text-align: center;
}

.status-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
}

.chips-row {
  margin-top: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.chip.pill {
  background: #fff;
  color: #1d4ed8;
  box-shadow: 0 4px 14px rgba(15, 42, 74, 0.06);
}

.chip.sim {
  background: #f5c518;
  color: #3b2f00;
}

.chip.test {
  background: #fff;
  color: #12263f;
  box-shadow: 0 4px 14px rgba(15, 42, 74, 0.06);
}

.prompt-actions {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.prompt-actions ion-button {
  --border-radius: 12px;
  --background: #1d4ed8;
  text-transform: none;
  font-weight: 700;
}

.prompt-actions ion-button.back {
  --background: #fff;
  --color: #1d4ed8;
  --border-color: #d5e0ec;
}

.instruction-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #fff;
  color: #12263f;
  box-shadow: 0 8px 20px rgba(15, 42, 74, 0.06);
}

.instruction-banner ion-icon {
  color: #1d4ed8;
  font-size: 22px;
}

.instruction-banner strong {
  font-size: 16px;
}

.camera-frame {
  position: relative;
  height: 230px;
  margin: 0 16px;
  overflow: hidden;
  background: transparent;
}

.camera-frame :deep(.guide) {
  display: none;
}

.corner {
  position: absolute;
  width: 22px;
  height: 22px;
  z-index: 2;
  border: 3px solid #fff;
}

.corner.tl { top: 10px; left: 10px; border-right: 0; border-bottom: 0; }
.corner.tr { top: 10px; right: 10px; border-left: 0; border-bottom: 0; }
.corner.bl { bottom: 10px; left: 10px; border-right: 0; border-top: 0; }
.corner.br { bottom: 10px; right: 10px; border-left: 0; border-top: 0; }

.camera-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fde8e8;
  color: #9f1239;
}

.camera-banner ion-icon {
  margin-top: 2px;
  font-size: 20px;
}

.camera-message {
  margin: 0;
  font-size: 14px;
  text-align: left;
}

.retry {
  margin-top: 10px;
  --background: #1d4ed8;
  --border-radius: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.dest-card {
  display: flex;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(15, 42, 74, 0.06);
}

.dest-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: #e8f1fb;
  color: #1d4ed8;
  font-size: 22px;
}

.dest-kicker,
.dest-place {
  margin: 0;
  color: #6b8096;
  font-size: 13px;
}

.dest-card strong {
  display: block;
  color: #12263f;
  font-size: 18px;
}

.dest-place {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dest-place ion-icon {
  color: #3b82f6;
}

.distance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 14px;
  border-radius: 18px;
  background: #fff;
  color: #12263f;
}

.distance-row span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #5d738a;
}

.distance-row strong {
  color: #1d4ed8;
  font-size: 18px;
}

.debug {
  margin: 14px 0 24px;
}

.debug summary {
  color: #6b8096;
  font-size: 13px;
  font-weight: 700;
}

.debug-readout {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  color: #35586d;
  font-size: 12px;
  line-height: 1.4;
}

.debug-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.debug-actions ion-button {
  --background: #fff;
  --color: #1d4ed8;
  --border-radius: 14px;
  --box-shadow: 0 6px 16px rgba(15, 42, 74, 0.06);
  margin: 0;
  height: 52px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.debug-actions ion-button.reset {
  grid-column: 1 / -1;
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
