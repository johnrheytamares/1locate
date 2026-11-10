<template>
  <ion-page class="preview-page" :style="{ '--preview-panel-height': `${panelHeight + 10}px` }">
    <ion-header><ion-toolbar><ion-buttons slot="start"><ion-back-button :default-href="detailsPath" text="" /></ion-buttons><ion-title>Navigation Preview</ion-title></ion-toolbar></ion-header>
    <ion-content :scroll-y="false">
      <DestinationMapPreview v-if="destination && active" ref="preview" :entrance="destination.outdoorTarget" fullscreen @location="userLocation = $event" @route="walkingRoute = $event" />
    </ion-content>
    <ion-footer v-if="destination && summary"><section ref="panel" class="preview-panel">
      <h1>{{ destination.name }}</h1><p>{{ destination.building }}<template v-if="summary.floor"> &middot; {{ summary.floor }}</template></p>
      <p>Entrance: {{ summary.entranceName }}</p>
      <div class="metrics"><span>{{ (destination.indoorJourney?.instructions.length || destination.indoorRoute.length) }} indoor instructions &middot; {{ summary.indoorMeters.toFixed(1) }} m indoors</span><span v-if="walkingRoute">{{ Math.round(walkingRoute.distance) }} m walking &middot; ~{{ Math.max(1, Math.round(walkingRoute.duration / 60)) }} min</span><span v-else-if="distance !== null">{{ Math.round(distance) }} m to entrance (straight-line)</span></div>
      <ion-button expand="block" :disabled="starting" data-test="start-navigation" @click="start">Start Navigation</ion-button>
    </section></ion-footer>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton, onIonViewWillEnter, onIonViewWillLeave, useIonRouter } from '@ionic/vue';
import DestinationMapPreview from '@/components/DestinationMapPreview.vue';
import type { Destination } from '@/models/navigation';
import type { UserLocation } from '@/models/location';
import type { WalkingRoute } from '@/services/walking-route.service';
import { getDestination, selectDestination } from '@/services/navigation.service';
import { wasDestinationReviewed, beginJourney } from '@/services/journey.service';
import { summarizeDestination } from '@/services/destination-details.service';
import { calculateDistance, isValidCoordinate } from '@/services/geo.service';
const route = useRoute(); const router = useIonRouter();
const destination = ref<Destination | null>(null); const active = ref(false); const starting = ref(false);
const preview = ref<InstanceType<typeof DestinationMapPreview>>(); const userLocation = ref<UserLocation | null>(null);
const walkingRoute = ref<WalkingRoute | null>(null);
const panel = ref<HTMLElement>();
const panelHeight = ref(190);
let panelObserver: ResizeObserver | undefined;
watch(panel, element => {
  panelObserver?.disconnect();
  if (!element || typeof ResizeObserver === 'undefined') return;
  panelObserver = new ResizeObserver(() => { panelHeight.value = element.getBoundingClientRect().height; });
  panelObserver.observe(element);
});
onBeforeUnmount(() => panelObserver?.disconnect());
const detailsPath = computed(() => `/destinations/${encodeURIComponent(String(route.params.id))}`);
const summary = computed(() => destination.value ? summarizeDestination(destination.value) : null);
const distance = computed(() => {
  const target = destination.value?.outdoorTarget; const user = userLocation.value;
  return target && user && isValidCoordinate(target.latitude, target.longitude) ? calculateDistance(user.latitude, user.longitude, target.latitude!, target.longitude!) : null;
});
onIonViewWillEnter(() => {
  const id = String(route.params.id); destination.value = getDestination(id); userLocation.value = null; walkingRoute.value = null; starting.value = false;
  if (!destination.value || !wasDestinationReviewed(id)) { router.replace(detailsPath.value); return; }
  active.value = true;
});
onIonViewWillLeave(() => { active.value = false; });
async function start() {
  if (starting.value || !destination.value) return;
  starting.value = true;
  await preview.value?.stopLocation?.(); active.value = false;
  if (!selectDestination(destination.value.id)) { router.replace('/destinations'); return; }
  beginJourney(destination.value.id);
  router.push('/ar-navigation');
}
</script>
<style scoped>
ion-toolbar { --background: #0c2d52; --color: white; }ion-content { --background: #e8eff7; }
.preview-page { --preview-panel-height: 190px; }
ion-footer { position: absolute; bottom: 0; left: 0; right: 0; z-index: 5; }
.preview-panel { max-height: 40dvh; overflow: auto; }
.preview-panel { margin: 0; padding: 12px 18px max(12px, env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; background: white; box-shadow: 0 -5px 24px #12263f16; }
h1 { font-size: 21px; font-weight: 800; margin: 0 0 4px; color: #12263f; }p { margin: 4px 0; color: #48647c; font-size: 12px; }.metrics { display: flex; flex-wrap: wrap; gap: 5px 14px; margin: 8px 0; font-size: 12px; font-weight: 700; color: #1d4ed8; }.route-note { font-size: 11px; }ion-button { --background: #1d4ed8; --border-radius: 13px; min-height: 46px; text-transform: none; font-weight: 700; }
</style>
