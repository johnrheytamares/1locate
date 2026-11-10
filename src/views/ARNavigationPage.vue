<template>
  <ion-page class="nav-page">
    <ion-header v-if="!preparing" class="nav-header">
      <ion-toolbar class="nav-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/destinations" text="" color="light" />
        </ion-buttons>
        <div class="brand-lockup">
          <div class="brand-title">
            <img class="header-logo" src="/images/1locate-logo.png" alt="" />
            <strong>1Locate</strong>
          </div>
          <span class="brand-sub">{{ destinationName }} &middot; {{ buildingName }}</span>
        </div>
        <ion-buttons slot="end">
          <ion-button
            color="light"
            :aria-label="voiceMuted ? 'Turn voice guidance on' : 'Mute voice guidance'"
            :aria-pressed="voiceMuted"
            data-test="voice-toggle"
            @click="toggleVoice"
          >
            <ion-icon slot="icon-only" :icon="voiceMuted ? volumeMuteOutline : volumeHighOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content v-if="preparing" class="preparation-content">
      <section class="preparation" aria-label="Preparing navigation">
        <ion-icon :icon="paperPlaneOutline" class="preparation-icon" aria-hidden="true" />
        <h1>Preparing AR Navigation...</h1>
        <div v-if="routeReady" style="display: none" aria-hidden="true"><NavigationOverlay :arrows="arrows" :destination-name="markerName" :distance-label="distanceLabel" :instruction="''" :heading-offset="pathOffset" @vue:mounted="guidanceReady = true" /></div>
        <ul><li>{{ routeReady ? '✓' : '...' }} Loading route</li><li>{{ cameraReady ? '✓ Camera enabled' : cameraMessage ? 'Camera needs attention' : 'Enabling camera...' }}</li><li>{{ guidanceReady ? '✓ Directional overlay initialized' : 'Setting up guidance...' }}</li></ul>
        <progress :value="Number(routeReady) + Number(cameraReady) + Number(guidanceReady)" max="3" aria-label="Completed initialization tasks" />
        <p>Location: {{ gpsStatus }}<template v-if="heading == null"> &middot; Heading unavailable or waiting for sensor readings. Manual checkpoints are available.</template></p>
        <p v-if="cameraMessage" role="alert">{{ cameraMessage }}</p>
        <ion-button v-if="cameraMessage" expand="block" :disabled="cameraBusy" @click="prepareNavigation">Retry camera</ion-button>
        <ion-button v-if="cameraMessage" expand="block" fill="outline" @click="useMapGuidance">Use Map Navigation</ion-button>
        <ion-button expand="block" fill="clear" @click="chooseAnotherDestination">Cancel</ion-button>
      </section>
    </ion-content>
    <ion-content v-else class="nav-content" :scroll-y="showMapWait">
      <main :class="{ 'navigation-layout': !showMapWait, 'map-guidance': mapVisible }">
      <div v-if="simulationUsed" class="simulation-notice" role="status">TEST SESSION - progress is not a real journey.</div>
      <DestinationMapPreview v-if="mapVisible && destination" :entrance="destination.outdoorTarget" fullscreen external :live-location="outdoor.location" :live-route="outdoorRouting.route.value" />
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
        <div v-if="isOutdoor" class="prompt-actions">
          <ion-button expand="block" data-test="at-entrance" @click="onAtEntrance">I'm at the entrance</ion-button>
          <ion-button expand="block" fill="outline" class="back" @click="backToDestinations">
            Back to destinations
          </ion-button>
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
        <div v-if="isOutdoor" class="sheet">
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
        <div v-if="!mapVisible" class="camera-frame">
          <span class="corner tl" /><span class="corner tr" /><span class="corner bl" /><span class="corner br" />
          <NavigationOverlay
            :arrows="isOutdoor ? arrows : []"
            :destination-name="isOutdoor ? markerName : 'Route guide · not live room position'"
            :distance-label="distanceLabel"
            :instruction="''"
            :heading-offset="pathOffset"
          />
        </div>
      </template>

      <div class="sheet" :class="{ 'guidance-sheet': !showMapWait }">
        <div v-if="!showMapWait" class="journey-card">
          <div class="journey-identity"><span class="journey-pin"><ion-icon :icon="location" aria-hidden="true" /></span><div><span class="dest-kicker">{{ isOutdoor ? 'Building entrance' : 'Destination' }}</span><h2>{{ markerName }}</h2><p data-test="journey-distance">{{ isOutdoor ? (outdoorRouting.progress.value ? 'Walking remaining' : 'Straight-line to entrance') : 'Est. remaining' }}: <strong>{{ distanceLabel }}</strong></p></div></div>
          <div class="journey-instruction"><ion-icon :icon="paperPlaneOutline" aria-hidden="true" /><strong>{{ instruction }}</strong></div>
        </div>
        <div v-if="cameraMessage && !mapVisible" class="camera-banner">
          <ion-icon :icon="cameraOutline" aria-hidden="true" />
          <p class="camera-message">{{ cameraMessage }}</p>
        </div>
        <ion-button v-if="cameraMessage && !mapVisible" expand="block" class="retry" @click="openCamera">
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

        <div class="navigation-controls">
          <ion-button size="small" fill="outline" data-test="map-view" @click="toggleMap">{{ mapVisible ? 'Camera View' : 'Map View' }}</ion-button>
          <ion-button size="small" fill="outline" data-test="stop-navigation" @click="chooseAnotherDestination">Stop</ion-button>
          <ion-button v-if="stage === 'indoor' && !navigation.paused && !arrived" size="small" fill="outline" @click="showCheckpoint = true">Confirm checkpoint</ion-button>
          <ion-button v-if="stage === 'indoor' && !navigation.paused && !arrived && needsTurn(navigation)" size="small" color="primary" @click="confirmTurn">I completed the turn</ion-button>
        </div>
        <p v-if="isOutdoor" class="evidence-note" role="status">{{ outdoorRouting.message.value }} {{ outdoorRouting.route.value?.source === 'campus' ? 'Campus walking network.' : outdoorRouting.route.value ? 'OpenStreetMap route; check access on site.' : '' }} Camera arrows are direction overlays, not ground-anchored AR.</p>
        <ion-button v-if="isOutdoor" size="small" fill="outline" :disabled="outdoorRouting.status.value === 'loading'" @click="outdoorRouting.retry">Retry walking route</ion-button>
        <ion-button v-if="isOutdoor && !showMapWait" size="small" fill="outline" data-test="at-entrance" @click="onAtEntrance">I'm at the entrance</ion-button>
        <p v-if="mapVisible && stage === 'indoor'" class="evidence-note">Satellite GPS is an outdoor reference only. It does not track the floor or room.</p>
        <p v-if="stage === 'indoor'" class="evidence-note">Indoor camera marker is informational only, not the physical room location. {{ manualProgress ? 'Progress includes user-confirmed checkpoints.' : 'Step-estimated route progress; not room positioning.' }}<template v-if="heading == null"> Heading unavailable. Follow the written route and confirm checkpoints.</template></p>
        <div v-if="stage === 'indoor' && arrived && !confirmingRestart" class="route-complete">
          <p>Estimated route complete. Check the room sign before confirming arrival.</p>
          <ion-button expand="block" @click="showArrival = true">Confirm destination</ion-button>
          <ion-button expand="block" fill="outline" @click="restartCompletedRoute">Restart from entrance</ion-button>
        </div>
        <section v-if="showIndoorHelp" class="indoor-help">
          <template v-if="!navigation.paused">
            <div v-if="walkingUnavailable" class="walking-fallback" role="status">
              <p>{{ walkingMessage }}</p>
              <ion-button fill="outline" @click="walking.start">Retry motion access</ion-button>
            </div>
            <ion-button expand="block" fill="outline" class="lost" data-test="lost-way" @click="onLostWay">
              <ion-icon slot="start" :icon="helpCircleOutline" aria-hidden="true" />
              I lost my way
            </ion-button>
          </template>
          <div v-else-if="!confirmingRestart" class="recovery" role="region" aria-label="Guidance paused" data-test="recovery">
            <h2>Guidance paused</h2>
            <p>
              1Locate cannot tell where you are inside the building. It only follows the fixed route from
              {{ entranceName }}, so it cannot find you or give directions from here.
            </p>
            <ion-button expand="block" data-test="resume" @click="onResume">Resume guidance</ion-button>
            <p class="option-hint">Only if you are still standing where you paused.</p>
            <ion-button expand="block" fill="outline" data-test="restart" @click="confirmingRestart = true">
              Restart from entrance
            </ion-button>
            <ion-button expand="block" fill="clear" data-test="choose-another" @click="chooseAnotherDestination">
              Choose another destination
            </ion-button>
          </div>
          <div v-else class="recovery" role="region" aria-label="Restart from entrance" data-test="restart-confirm">
            <h2>Go back to {{ entranceName }}</h2>
            <p>
              Restart only when you are standing at the entrance. Route progress will reset.
              Face the corridor; the forward direction is set automatically.
            </p>
            <ion-button expand="block" data-test="confirm-entrance" @click="onRestartConfirmed">
              I'm at the entrance
            </ion-button>
            <ion-button expand="block" fill="outline" data-test="cancel-restart" @click="confirmingRestart = false">
              Not yet
            </ion-button>
          </div>
        </section>
        <p v-if="isOutdoor && outdoor.raw" class="path-note">GPS Accuracy ±{{ Math.round(outdoor.raw.accuracy) }} m</p>

        <div v-if="devTools" class="debug" data-test="debug">
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
            <li>Guidance: {{ navigation.paused ? 'paused' : 'active' }}</li>
          </ul>
          <ul v-if="!isOutdoor && walkingDiagnostics" class="debug-readout" data-test="walking-diagnostics">
            <li>Motion: {{ walkingEnabled ? 'listening' : 'off' }} · {{ walkingDiagnostics.source }} · {{ walkingDiagnostics.sampleRateHz ?? '--' }} Hz</li>
            <li>Acceleration: {{ accelerationLabel }}</li>
            <li>Rotation α/β/γ: {{ rotationLabel }}</li>
            <li>Steps: {{ walkingDiagnostics.candidateSteps }} candidate · {{ walkingDiagnostics.acceptedSteps }} accepted</li>
            <li>Walking Blocked: {{ walkBlock ?? 'no' }}</li>
            <li>Last Step Reason: {{ walkingDiagnostics.lastReason }}</li>
            <li>Step Length: {{ walkingStepLength.toFixed(2) }} m ({{ walkingDiagnostics.stepLengthSource }})</li>
            <li>Walked: {{ navigation.walkedMeters.toFixed(2) }} m of {{ routeMeters }} m</li>
            <li>Arrival Trigger: estimated walked ≥ route length ({{ arrived ? 'met' : 'not met' }})</li>
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
            <ion-button data-test="move-forward" @click="onMoveForward">Move Forward</ion-button>
            <ion-button @click="onNext">Next Step</ion-button>
            <ion-button @click="onTurnRight">Turn Right</ion-button>            <ion-button class="reset" @click="onReset">
              <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
              Reset
            </ion-button>
          </div>
        </div>
      </div>
      </main>
    </ion-content>

    <ion-alert
      css-class="navigation-alert"
      :is-open="showEntrance"
      :header="`Are you at ${entranceName}?`"
      :message="entranceMessage"
      :backdrop-dismiss="false"
      :buttons="[
        { text: 'Choose another destination', role: 'cancel' },
        { text: 'Start indoor route', role: 'confirm' },
      ]"
      @didDismiss="onEntranceDismiss"
    />

    <ion-alert css-class="navigation-alert" :is-open="showCheckpoint" header="Confirm physical checkpoint" :message="checkpointMessage" :backdrop-dismiss="false" :buttons="[{ text: 'Not yet', role: 'cancel' }, { text: 'I reached this checkpoint', role: 'confirm' }]" @didDismiss="onCheckpointDismiss" />
    <ion-alert
      css-class="navigation-alert arrival-alert"
      :backdrop-dismiss="false"
      :is-open="showArrival"
      :header="simulationUsed ? 'TEST route complete' : 'Confirm destination'"
      :message="arrivalMessage"
      :buttons="[{ text: 'Not yet', role: 'cancel' }, { text: simulationUsed ? 'End test' : 'I am at the room', role: 'confirm' }]"
      @didDismiss="onArrivalDismiss"
    />

    <ArrivalFeedbackModal
      :is-open="showFeedback"
      :session-id="feedbackSessionId"
      :destination-id="destination?.id ?? null"
      :destination-name="destinationName"
      @close="onFeedbackClose"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { authorizeIndoorJourney } from '@/services/journey.service';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
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
  toastController,
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
  helpCircleOutline,
  locateOutline,
  location,
  locationOutline,
  navigateOutline,
  paperPlaneOutline,
  peopleOutline,
  refreshOutline,
  schoolOutline,
  volumeHighOutline,
  volumeMuteOutline,
  walkOutline,
} from 'ionicons/icons';
import ArrivalFeedbackModal from '@/components/navigation/ArrivalFeedbackModal.vue';
import NavigationOverlay from '@/components/navigation/NavigationOverlay.vue';
import DestinationMapPreview from '@/components/DestinationMapPreview.vue';
import { confirmRoomArrival, markTestJourney, clearJourney } from '@/services/journey.service';
import { useArrivalFeedback } from '@/composables/useArrivalFeedback';
import { LOCATION_RATIONALE, useOutdoorGps } from '@/composables/useOutdoorGps';
import { useOutdoorRouting } from '@/composables/useOutdoorRouting';
import { useIndoorWalking } from '@/composables/useIndoorWalking';
import { useVoice } from '@/composables/useVoice';
import { SHOW_DEV_TOOLS } from '@/config/dev-tools';
import { Destination } from '@/models/navigation';
import { startRearPreview, stopRearPreview } from '@/services/camera.service';
import { LOCATION_MESSAGES } from '@/services/location.service';
import {
  advanceInstruction,
  arrivalInstruction,
  clearSelectedDestination,
  completeCurrentTurn,
  confirmRouteCheckpoint,
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
  needsTurn,
  nextRouteStep,
  pauseNavigation,
  remainingMeters,
  requiredHeading,
  resetNavigation,
  restartFromEntrance,
  resumeNavigation,
  setForwardHeading,
  totalMeters,
  walkBlockReason,
  type GuideArrow,
} from '@/services/navigation.service';
import {
  accuracyLevel,
  arrivalStatus,
  isImprovingAccuracy,
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
const headingUpdatedAt = ref(0);
const cameraMessage = ref('');
const preparing = ref(true);
const routeReady = ref(false);
const cameraReady = ref(false);
const guidanceReady = ref(false);
const cameraBusy = ref(false);
const mapVisible = ref(false);
const manualProgress = ref(false);
const simulationUsed = ref(false);
const showCheckpoint = ref(false);
const checkpointMessage = computed(() => {
  const step = currentStep(navigation.value);
  return step ? `Confirm only after physically following instruction ${stepIndex.value + 1}: ${step.direction}, ${step.distance} m, and reaching its endpoint. The app cannot verify your indoor location.` : '';
});
const walking = useIndoorWalking(
  () => walkBlock.value,
  (meters) => { navigation.value = moveForward(navigation.value, meters); },
  { diagnostics: SHOW_DEV_TOOLS },
);
const {
  enabled: walkingEnabled,
  message: walkingMessage,
  stepLength: walkingStepLength,
  diagnostics: walkingDiagnostics,
} = walking;
const walkingUnavailable = computed(() => !walkingEnabled.value && /unavailable|denied|No motion|stopped|Could not/.test(walkingMessage.value));
const appActive = ref(true);

const showArrival = ref(false);
const {
  showFeedback,
  sessionId: feedbackSessionId,
  beginSession: beginFeedbackSession,
  offerAfterArrival,
  closeFeedback,
} = useArrivalFeedback();
const showEntrance = ref(false);
const pageOpen = ref(false);
const turnAlignment = ref('not a turn');
const confirmingRestart = ref(false);
const voiceSession = ref(0);
const devTools = SHOW_DEV_TOOLS;
/** False when the user said they reached the entrance because it has no surveyed GPS location. */
const entranceByGps = ref(true);
const { muted: voiceMuted, guide: speakGuidance, announce, reset: resetVoice, toggleMuted: toggleVoice } = useVoice();

const gps = useOutdoorGps(heading);
const {
  source: gpsSource,
  status: gpsStatus,
  precise: gpsPrecise,
  message: gpsMessage,
  state: outdoor,
  simulatedAccuracy,
} = gps;
const outdoorRoutingActive = computed(() => pageOpen.value && appActive.value && stage.value === 'outdoor' && !outdoor.value.arrived);
const outdoorRouting = useOutdoorRouting(outdoor, outdoorRoutingActive, heading, headingUpdatedAt);

let cameraSession = 0;
let navigationSession = 0;
let stopHeading = () => {};
let appHandle: PluginListenerHandle | null = null;
let alignTimer: number | null = null;
const wentBackground = ref(false);

const isOutdoor = computed(() => stage.value !== 'indoor');
const showMapWait = computed(() => isOutdoor.value && !outdoorGuiding.value);
const waitTitle = computed(() => {
  if (locationPrompt.value) return 'Location needed';
  if (entranceUnmapped.value) return 'Entrance location not set';
  return 'Getting your location...';
});
const waitSubtitle = computed(() => {
  if (locationPrompt.value) return locationPrompt.value.text;
  if (entranceUnmapped.value) return instruction.value;
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
/** The designated entrance every fixed indoor route starts from. */
const entranceName = computed(() => destination.value?.outdoorTarget.name ?? buildingName.value);
const hasSurveyedTarget = computed(() => destination.value != null && gps.hasSurveyedTarget());
/** REAL GPS cannot guide to an entrance without surveyed coordinates, so the user says when they are there. */
const entranceUnmapped = computed(() => (
  stage.value === 'outdoor'
  && gpsSource.value === 'real'
  && !hasSurveyedTarget.value
  && outdoor.value.target == null
  && locationPrompt.value == null
));
const entranceMessage = computed(() => (
  entranceByGps.value
    ? `GPS shows you near the entrance, but it cannot tell where you are inside. Start the route to ${destinationName.value} only when you are standing at ${entranceName.value}, with your phone facing the first corridor.`
    : `1Locate cannot check this with GPS. Start the route to ${destinationName.value} only when you are standing at ${entranceName.value}, with your phone facing the first corridor.`
));

const arrived = computed(() => hasArrived(navigation.value));
const stepIndex = computed(() => currentStepIndex(navigation.value));
const currentDirection = computed(() => currentStep(navigation.value)?.direction ?? 'straight');
const modeLabel = computed(() => (isOutdoor.value ? 'OUTDOOR (GPS)' : 'INDOOR (fixed route)'));
const arrivalMessage = computed(() => (
  `${arrivalInstruction(navigation.value.destinationName)} Distance is estimated from your steps, so 1Locate cannot confirm you are at the room.`
));
/** Why detected steps cannot add distance right now; null while walking counts. */
const walkBlock = computed(() => {
  if (!pageOpen.value) return 'page closed';
  if (preparing.value || mapVisible.value) return 'camera guidance is not active';
  if (stage.value !== 'indoor') return 'not on the indoor route';
  if (wentBackground.value) return 'app was in background';
  return walkBlockReason(navigation.value, heading.value);
});
const showIndoorHelp = computed(() => stage.value === 'indoor' && (!arrived.value || confirmingRestart.value));

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

const required = computed(() => (isOutdoor.value ? (outdoorRouting.canGuide.value ? outdoorRouting.progress.value?.bearing ?? null : null) : requiredHeading(navigation.value)));
const offset = computed(() => headingOffset(heading.value, required.value));

const distanceLabel = computed(() => {
  if (!isOutdoor.value) return `${Number(remainingMeters(navigation.value).toFixed(1))} m`;
  const distance = outdoorRouting.progress.value?.remaining ?? outdoor.value.distance;
  return distance == null ? '-- m' : `${Math.round(distance)} m`;
});

const instruction = computed(() => {
  if (!isOutdoor.value) {
    if (!navigation.value.paused && heading.value == null && !arrived.value) {
      const step = currentStep(navigation.value);
      return `Instruction ${stepIndex.value + 1}: ${step?.direction ?? 'straight'}, ${step?.distance ?? 0} m. Confirm the checkpoint when physically reached.`;
    }
    if (!navigation.value.paused && navigation.value.forwardHeading == null) return navigationInstruction(navigation.value, heading.value);
    return navigationInstruction(navigation.value, heading.value);
  }
  if (locationPrompt.value) return locationPrompt.value.text;
  if (gpsSource.value === 'real' && !outdoor.value.location && gpsMessage.value) return gpsMessage.value;
  if (entranceUnmapped.value) {
    return `The GPS location of ${entranceName.value} is not set yet. Walk to ${entranceName.value}, then tap I'm at the entrance.`;
  }
  return outdoorRouting.message.value;
});

const arrows = computed(() => {
  if (!isOutdoor.value) return guideArrows(navigation.value);
  return outdoorGuiding.value && !locationPrompt.value && outdoorRouting.canGuide.value
    ? OUTDOOR_ARROWS.map(arrow => ({ ...arrow, direction: outdoorRouting.direction.value })) : [];
});

const pathOffset = computed(() => {
  if (isOutdoor.value) return outdoorGuiding.value ? offset.value : null;
  return navigation.value.forwardHeading == null || navigation.value.paused ? null : offset.value;
});

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
const routeMeters = computed(() => Number(totalMeters(navigation.value).toFixed(1)));
const accelerationLabel = computed(() => {
  const a = walkingDiagnostics?.acceleration;
  return a
    ? `${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)} (|a| ${a.magnitude.toFixed(2)} m/s²)`
    : 'no samples';
});
const rotationLabel = computed(() => {
  const r = walkingDiagnostics?.rotation;
  const show = (value: number | null) => (value == null ? '--' : value.toFixed(0));
  return r ? `${show(r.alpha)}, ${show(r.beta)}, ${show(r.gamma)} °/s` : 'unavailable';
});

watch(() => outdoor.value.arrived, (isArrived) => {
  if (!isArrived || stage.value !== 'outdoor') return;
  entranceByGps.value = true;
  stage.value = 'entrance';
  gps.stop();
  showEntrance.value = true;
  announce(`You are near ${entranceName.value}. Start the indoor route only when you are standing at the entrance.`);
});

/** Spoken while guidance is on screen: outdoor guiding or any indoor instruction. */
const spokenGuidance = computed(() => {
  if (!pageOpen.value || preparing.value || mapVisible.value) return null;
  if (stage.value === 'indoor' || (stage.value === 'outdoor' && !showMapWait.value)) return instruction.value;
  return null;
});

watch([spokenGuidance, voiceSession], ([text]) => {
  if (text) speakGuidance(text);
});

watch(arrived, (isArrived, wasArrived) => {
  if (stage.value !== 'indoor') return;
  if (isArrived && !wasArrived) { walking.stop(); clearAlignTimer(); }
  if (!isArrived) showArrival.value = false;
});

watch(
  () => [
    stage.value,
    navigation.value.walkedMeters,
    navigation.value.forwardHeading,
    navigation.value.paused,
    heading.value,
    offset.value,
  ],
  () => {
    syncTurnAlignment();
  },
);

function clearAlignTimer() {
  if (alignTimer == null) return;
  window.clearTimeout(alignTimer);
  alignTimer = null;
}

function confirmTurn() {
  if (stage.value !== 'indoor' || navigation.value.paused || !needsTurn(navigation.value)) return;
  clearAlignTimer();
  navigation.value = completeCurrentTurn(navigation.value);
  manualProgress.value = true;
}

function syncTurnAlignment() {
  // A compass change cannot verify that the student physically turned at an indoor junction.
  clearAlignTimer();
  turnAlignment.value = needsTurn(navigation.value)
    ? 'confirm the turn at the real hallway junction'
    : 'not a turn';
}

function setCameraChrome(active: boolean) {
  document.documentElement.classList.toggle('camera-nav-active', active);
}

async function openCamera() {
  if (!pageOpen.value || (!preparing.value && showMapWait.value) || !appActive.value || mapVisible.value || cameraBusy.value) return;
  const session = cameraSession;
  cameraBusy.value = true;
  cameraMessage.value = '';
  try {
    await startRearPreview();
    if (session !== cameraSession || !pageOpen.value || !appActive.value || mapVisible.value) {
      await stopRearPreview();
      return;
    }
    cameraReady.value = true;
    setCameraChrome(!preparing.value && !showMapWait.value);
  } catch (error) {
    if (session !== cameraSession) return;
    cameraReady.value = false;
    setCameraChrome(false);
    cameraMessage.value = error instanceof Error ? error.message : 'The camera could not start.';
  } finally { cameraBusy.value = false; }
}

async function prepareNavigation() {
  if (!pageOpen.value || cameraBusy.value) return;
  const session = navigationSession;
  preparing.value = true;
  await openCamera();
  if (!pageOpen.value || session !== navigationSession) return;
  await nextTick();
  if (cameraReady.value && guidanceReady.value) preparing.value = false;
}
function useMapGuidance() {
  mapVisible.value = true; preparing.value = false;
}
function toggleMap() {
  if (!mapVisible.value && stage.value === 'indoor' && !arrived.value) onLostWay();
  mapVisible.value = !mapVisible.value;
  if (!mapVisible.value && stage.value === 'indoor' && !navigation.value.paused && !arrived.value) void walking.start();
}
function onCheckpointDismiss(event: CustomEvent<{ role?: string }>) {
  showCheckpoint.value = false;
  if (event.detail.role !== 'confirm' || stage.value !== 'indoor') return;
  clearAlignTimer(); walking.stop(); manualProgress.value = true;
  navigation.value = confirmRouteCheckpoint(navigation.value);
  if (!arrived.value && !navigation.value.paused && !mapVisible.value) void walking.start();
}
function restartCompletedRoute() {
  if (stage.value !== 'indoor') return;
  navigation.value = { ...navigation.value, paused: true };
  confirmingRestart.value = true;
}

// If the user re-enters while an old camera startup is finishing, retry only the current session.
watch(cameraBusy, (busy, wasBusy) => {
  if (wasBusy && !busy && preparing.value && pageOpen.value && appActive.value && !cameraReady.value && !cameraMessage.value) void prepareNavigation();
});

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
  if (gpsSource.value === 'real') { simulationUsed.value = true; markTestJourney(); }
  gps.setSource(gpsSource.value === 'simulated' ? 'real' : 'simulated');
}

function onPlaceTestTarget() {
  simulationUsed.value = true; markTestJourney();
  gps.placeTestTarget();
}

function onSimulateWalk() {
  simulationUsed.value = true; markTestJourney();
  gps.simulateWalk(3);
}

function onAtEntrance() {
  if (stage.value !== 'outdoor') return;
  entranceByGps.value = false;
  stage.value = 'entrance';
  gps.stop();
  showEntrance.value = true;
  announce(`Start the indoor route only when you are standing at ${entranceName.value}.`);
}

function enterIndoor() {
  const chosen=getSelectedDestination();
  if(chosen?.indoorJourney){authorizeIndoorJourney(chosen.id);void ionRouter.replace(`/indoor-journey/${encodeURIComponent(chosen.id)}`);return;}
  const indoor = loadSelectedRoute();
  if (!indoor) {
    ionRouter.replace('/destinations');
    return;
  }
  clearAlignTimer();
  navigation.value = indoor;
  turnAlignment.value = 'not a turn';
  confirmingRestart.value = false;
  stage.value = 'indoor';
  initializeForward();
  if (!mapVisible.value) void walking.start();
}

/** The indoor route starts only after the user confirms they are at the entrance. */
function onEntranceDismiss(event: CustomEvent<{ role?: string }>) {
  showEntrance.value = false;
  if (stage.value !== 'entrance') return;
  const role = event.detail?.role;
  if (role === 'confirm') {
    enterIndoor();
  } else if (role === 'cancel') {
    chooseAnotherDestination();
  } else {
    void nextTick(() => { showEntrance.value = true; });
  }
}

function onLostWay() {
  walking.stop();
  clearAlignTimer();
  turnAlignment.value = 'not a turn';
  confirmingRestart.value = false;
  navigation.value = pauseNavigation(navigation.value);
}

function onResume() {
  confirmingRestart.value = false;
  navigation.value = resumeNavigation(navigation.value);
  initializeForward();
  void walking.start();
}

function onRestartConfirmed() {
  clearAlignTimer();
  confirmingRestart.value = false;
  showArrival.value = false;
  beginFeedbackSession();
  turnAlignment.value = 'not a turn';
  navigation.value = restartFromEntrance(navigation.value, true);
  initializeForward();
  void walking.start();
}

function chooseAnotherDestination() {
  clearJourney();
  clearAlignTimer();
  resetVoice();
  clearSelectedDestination();
  confirmingRestart.value = false;
  showEntrance.value = false;
  showArrival.value = false;
  showFeedback.value = false;
  turnAlignment.value = 'not a turn';
  navigation.value = resetNavigation(navigation.value);
  stage.value = 'outdoor';
  backToDestinations();
}

function onMoveForward() {
  simulationUsed.value = true; markTestJourney();
  navigation.value = moveForward(navigation.value, 1);
}

function onNext() {
  simulationUsed.value = true; markTestJourney();
  navigation.value = advanceInstruction(navigation.value);
}

function onTurnRight() {
  simulationUsed.value = true; markTestJourney();
  navigation.value = jumpToRightTurn(navigation.value);
}
/** Capture the initial phone direction once; subsequent readings guide turns. */
function initializeForward() {
  if (stage.value !== 'indoor' || navigation.value.paused || heading.value == null
    || navigation.value.forwardHeading != null) return;
  navigation.value = setForwardHeading(navigation.value, heading.value);
}
watch(heading, initializeForward);

// Configuration screens stay opaque and never start a camera preview behind their cards.
watch([showMapWait, pageOpen, appActive, preparing, mapVisible], ([waiting, open, active, pending, map]) => {
  if (pending) return;
  if (open && active && !waiting && !map) {
    if (cameraReady.value) setCameraChrome(true);
    else void openCamera();
  }
  else {
    cameraSession += 1;
    cameraReady.value = false;
    setCameraChrome(false);
    void stopRearPreview();
    cameraMessage.value = '';
  }
});

function onReset() {
  walking.stop();
  if (isOutdoor.value) {
    gps.reset();
    return;
  }
  // Restarting the indoor route goes through the same entrance confirmation as "I lost my way".
  if (!arrived.value) {
    onLostWay();
    confirmingRestart.value = true;
    return;
  }
  clearAlignTimer();
  navigation.value = resetNavigation(navigation.value);
  showArrival.value = false;
  beginFeedbackSession();
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

async function onArrivalDismiss(event: CustomEvent<{ role?: string }>) {
  showArrival.value = false;
  if (event.detail.role !== 'confirm' || !destination.value || !arrived.value) return;
  if (simulationUsed.value) { chooseAnotherDestination(); return; }
  confirmRoomArrival(destination.value);
  await endSession();
  offerAfterArrival();
}

function onFeedbackClose(message?: string) {
  closeFeedback();
  if (message) {
    void toastController
      .create({ message, duration: 2500, position: 'top', color: 'success' })
      .then((toast) => toast.present())
      .catch(() => undefined);
  }
  ionRouter.replace('/arrival');
}

function endSession() {
  navigationSession += 1;
  showCheckpoint.value = false;
  showFeedback.value = false;
  walking.stop();
  clearAlignTimer();
  resetVoice();
  gps.stop();
  const cameraStopped = closeCamera();
  stopHeading();
  void appHandle?.remove();
  appHandle = null;
  return cameraStopped;
}

onIonViewDidEnter(async () => {
  const currentSession = ++navigationSession;
  const selected = getSelectedDestination();
  const indoor = loadSelectedRoute();
  if (!selected || !indoor) {
    ionRouter.replace('/destinations');
    return;
  }
  preparing.value = true; routeReady.value = true; cameraReady.value = false; guidanceReady.value = false;
  mapVisible.value = false; manualProgress.value = false; simulationUsed.value = false;
  destination.value = selected;
  navigation.value = indoor;
  stage.value = 'outdoor';
  beginFeedbackSession();
  showArrival.value = false;
  showEntrance.value = false;
  turnAlignment.value = 'not a turn';
  confirmingRestart.value = false;
  wentBackground.value = false;
  pageOpen.value = true;
  voiceSession.value += 1;
  appActive.value = true;
  stopHeading();
  stopHeading = watchHeading((value) => {
    heading.value = value;
    headingUpdatedAt.value = Date.now();
  });
  void appHandle?.remove();
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!pageOpen.value) return;
    if (!isActive) {
      appActive.value = false;
      wentBackground.value = true;
      walking.stop();
      if (stage.value === 'indoor') navigation.value = pauseNavigation(navigation.value);
      setCameraChrome(false);
      void stopRearPreview();
      gps.pause();
      resetVoice();
      return;
    }
    // Android also reports "active" after permission dialogs close; only resume after a real background trip.
    if (!wentBackground.value) return;
    wentBackground.value = false;
    appActive.value = true;
    voiceSession.value += 1;
    if (stage.value === 'outdoor') void gps.resume();
    if (preparing.value) void prepareNavigation();
  }).then((handle) => {
    if (!pageOpen.value) {
      void handle.remove();
      return;
    }
    appHandle = handle;
  });
  await gps.start(selected.outdoorTarget);
  if (!pageOpen.value || currentSession !== navigationSession) return;
  simulationUsed.value = gpsSource.value === 'simulated';
  if (simulationUsed.value) markTestJourney();
  void prepareNavigation();
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

.walking-calibration { margin: 12px 0; color: #35586d; font-size: 14px; }
.walking-calibration label { display: block; margin: 8px 0; }
.walking-calibration input { width: 90px; padding: 8px; }

.indoor-help {
  margin-top: 12px;
}

.scope-note,
.option-hint {
  margin: 0 0 8px;
  color: #5d738a;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
}

.option-hint {
  margin: -2px 0 10px;
}

.indoor-help ion-button {
  --border-radius: 12px;
  margin: 0 0 8px;
  text-transform: none;
  font-weight: 700;
}

.indoor-help ion-button:not([fill]),
.indoor-help ion-button[fill='solid'] {
  --background: #1d4ed8;
}

.indoor-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.indoor-controls ion-button {
  min-height: 48px;
}

.indoor-help ion-button[fill='outline'] {
  --color: #1d4ed8;
  --border-color: #b9cbe2;
  --background: #fff;
}

.indoor-help ion-button[fill='clear'] {
  --color: #1d4ed8;
}

.recovery {
  padding: 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(15, 42, 74, 0.06);
}

.recovery h2 {
  margin: 0 0 6px;
  color: #12263f;
  font-size: 18px;
  font-weight: 800;
}

.recovery p:not(.option-hint) {
  margin: 0 0 14px;
  color: #35586d;
  font-size: 14px;
  line-height: 1.45;
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
.header-logo { width: 30px; height: 34px; object-fit: contain; flex-shrink: 0; }
.camera-frame { height: clamp(280px, 44dvh, 460px); margin: 0; }
.corner { display: none; }
.guidance-sheet { position: relative; margin-top: -12px; padding-top: 18px; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); border-radius: 28px 28px 0 0; background: rgba(248, 252, 255, .96); box-shadow: 0 -8px 28px #05274820; }
.guidance-sheet::before { content: ''; position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 38px; height: 4px; border-radius: 8px; background: #c6d3e1; }
.journey-card { padding: 8px 2px 12px; }
.journey-identity { display: flex; align-items: center; gap: 12px; }
.journey-identity > div { min-width: 0; }
.journey-pin { width: 48px; height: 48px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; color: #fff; background: linear-gradient(135deg,#00aff5,#1258bb); box-shadow: 0 4px 14px #0089df25; }
.journey-pin ion-icon { font-size: 27px; }
.journey-identity h2 { margin: 3px 0; color: #102e52; font-size: 19px; font-weight: 800; overflow-wrap: anywhere; }
.journey-identity p { margin: 0; color: #68829e; font-size: 12px; }
.journey-identity p strong { color: #1263dd; }
.journey-instruction { display: flex; align-items: center; gap: 10px; border-top: 1px solid #dce8f3; margin-top: 14px; padding-top: 12px; color: #18385c; font-size: 13px; line-height: 1.5; }
.journey-instruction ion-icon { flex-shrink: 0; padding: 9px; background: #e1f1ff; color: #1672d6; font-size: 19px; border-radius: 50%; }
.guidance-sheet .path-note { border-radius: 12px; background: #e3f3ff; color: #166cc7; padding: 10px; font-size: 12px; text-align: center; }
@media (max-width: 380px) { .journey-identity h2 { font-size: 17px; } .camera-frame { height: 300px; } }
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
.header-logo { width: 30px; height: 34px; object-fit: contain; flex-shrink: 0; }
</style>

<style scoped>
.navigation-layout { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
.navigation-layout .camera-frame { flex: 1 0 240px; height: auto; min-height: 240px; }
.navigation-layout .guidance-sheet { flex: 0 0 auto; margin-top: 0; }
.walking-fallback { color: #35586d; font-size: 13px; }
</style>

<style>
/* Alert overlays inherit camera transparency unless their own surface is explicit. */
ion-alert.navigation-alert {
  --background: #ffffff;
  --ion-background-color: #ffffff;
  --ion-text-color: #12263f;
  --color: #12263f;
  --backdrop-opacity: .55;
  --max-width: 340px;
}
ion-alert.navigation-alert .alert-wrapper { background: #ffffff; color: #12263f; border-radius: 22px; box-shadow: 0 16px 48px #001c4050; }
ion-alert.navigation-alert .alert-title { color: #12263f; font-size: 21px; font-weight: 800; line-height: 1.3; }
ion-alert.navigation-alert .alert-message { color: #526b82; font-size: 15px; line-height: 1.5; }
ion-alert.navigation-alert .alert-button { color: #1d4ed8; font-weight: 700; }
ion-alert.arrival-alert .alert-head { padding: 24px 24px 8px; text-align: center; }
ion-alert.arrival-alert .alert-message { padding: 8px 24px 20px; text-align: center; }
ion-alert.arrival-alert .alert-button-group { padding: 0 20px 20px; }
ion-alert.arrival-alert .alert-button { flex: 1; margin: 0; min-height: 46px; border-radius: 12px; background: #1d4ed8; color: #ffffff; text-transform: none; }
ion-alert.arrival-alert .alert-button-group .alert-button .alert-button-inner { width: 100%; justify-content: center; text-align: center; }
</style>

<style scoped>
.preparation-content { --background: linear-gradient(145deg, #0c2d52, #184e83); --color: white; }
.preparation { min-height: 100%; max-width: 430px; padding: max(36px, env(safe-area-inset-top)) 26px max(24px, env(safe-area-inset-bottom)); margin: auto; display: flex; flex-direction: column; justify-content: center; }
.preparation-icon { width: 72px; height: 72px; padding: 24px; margin: 0 auto 18px; border-radius: 50%; background: #ffffff12; }
.preparation h1 { text-align: center; font-size: 26px; font-weight: 800; }.preparation ul { padding: 0; list-style: none; line-height: 2.5; }.preparation p { font-size: 13px; line-height: 1.5; color: #e0eaf6; }.preparation progress { width: 100%; accent-color: #4dd7ee; }.preparation ion-button { --color: white; }
.navigation-layout { position: relative; overflow: hidden; padding: 0; }
.navigation-layout .camera-frame { position: absolute; inset: 0; min-height: 0; margin: 0; height: 100%; }
.navigation-layout > .sheet:first-of-type { z-index: 2; position: relative; margin: 8px 12px; border-radius: 16px; background: #f5faffeb; }
.navigation-layout .guidance-sheet { position: absolute; z-index: 3; bottom: 0; left: 0; right: 0; max-height: 43%; overflow-y: auto; padding: 12px 16px max(10px, env(safe-area-inset-bottom)); }
.navigation-layout .journey-card { padding: 0; }.journey-pin { width: 34px; height: 34px; }.journey-identity h2 { font-size: 16px; }.journey-instruction { margin-top: 7px; padding-top: 6px; }.navigation-controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; margin-top: 6px; }.navigation-controls ion-button { font-size: 11px; min-height: 34px; text-transform: none; }.evidence-note { margin: 4px 0; font-size: 10px; color: #526b82; }.simulation-notice { position: relative; z-index: 5; padding: 8px; background: #fff2c9; color: #724500; text-align: center; font-weight: 700; font-size: 12px; }.map-guidance > .map-preview { position: absolute; inset: 0; padding-bottom: 210px; }.route-complete p { font-size: 12px; }
</style>

<style scoped>
.map-guidance { position: relative; height: 100%; }
.map-guidance:not(.navigation-layout) { display: flex; flex-direction: column; overflow-y: auto; }
.map-guidance:not(.navigation-layout) > .map-preview { position: relative; inset: auto; flex: 0 0 42dvh; min-height: 260px; padding-bottom: 0; }
.map-guidance:not(.navigation-layout) > .sheet { position: relative; z-index: 2; background: #f4f9ff; }
</style>
