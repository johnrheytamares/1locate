<template>
  <ion-page>
    <ion-header>
      <ion-toolbar class="confirm-toolbar">
        <ion-buttons slot="start">
          <ion-button class="header-back" aria-label="Back to destinations" data-test="back" @click="onBack"><ion-icon slot="icon-only" :icon="chevronBack" aria-hidden="true" /></ion-button>
        </ion-buttons>
        <ion-title><span class="confirm-brand"><img src="/images/1locate-logo.png" alt="" />Destination Details</span></ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="confirm-content" :class="{ 'details-ready': state === 'ready' }">
      <p v-if="state === 'loading'" class="status" data-test="loading">Loading destination...</p>

      <section v-else-if="state === 'missing'" class="card missing" data-test="missing">
        <h1>Destination not found</h1>
        <p>It may have been removed or unpublished. Choose another destination.</p>
        <ion-button expand="block" @click="onBack">Back to destinations</ion-button>
      </section>

      <template v-else-if="summary && destination">
        <div class="gallery" data-test="gallery">
          <p v-if="imagesLoading" class="photo placeholder">Loading photos...</p>
          <template v-else-if="images.length > 0">
            <figure v-for="image in images" :key="image.url" class="photo">
              <img :src="image.url" :alt="image.caption ?? summary.name" />
              <figcaption v-if="image.caption">{{ image.caption }}</figcaption>
            </figure>
          </template>
          <div v-else class="photo placeholder" data-test="placeholder">
            <ion-icon :icon="imageOutline" aria-hidden="true" />
            <span>No photo yet</span>
          </div>
        </div>

        <section class="card">
          <p class="eyebrow">
            <ion-icon :icon="location" aria-hidden="true" />
            Destination
          </p>
          <div class="identity">
            <span class="dest-icon" aria-hidden="true">
              <ion-icon :icon="iconFor(destination)" />
            </span>
            <div>
              <h1 data-test="name">{{ summary.name }}</h1>
              <p class="building" data-test="building">{{ summary.building }}</p>
            </div>
          </div>

          <p v-if="summary.description" class="description" data-test="description">{{ summary.description }}</p>

          <ul class="facts">
            <li class="route-fact">
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="navigateOutline" /></span>
              <span class="fact-label">Route</span>
              <span class="fact-value">GPS to {{ summary.entranceName }}</span>
            </li>
            <li class="steps-fact">
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="walkOutline" /></span>
              <span class="fact-label">Steps</span>
              <span class="fact-value">{{ destination.indoorRoute.length }} steps</span>
            </li>
            <li class="distance-fact">
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="swapHorizontalOutline" /></span>
              <span class="fact-label">Distance</span>
              <span class="fact-value">{{ Number(summary.indoorMeters.toFixed(1)) }} m indoors</span>
            </li>
            <li v-if="summary.floor" class="floor-fact">
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="layersOutline" /></span>
              <span class="fact-label">Floor</span>
              <span class="fact-value" data-test="floor">{{ summary.floor }}</span>
            </li>
            <li v-if="summary.roomNumber" class="room-fact">
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="businessOutline" /></span>
              <span class="fact-label">Room</span>
              <span class="fact-value" data-test="room-number">{{ summary.roomNumber }}</span>
            </li>
          </ul>

          <div class="source" :class="{ live: isLive }">
            <ion-icon :icon="isLive ? wifi : cloudOfflineOutline" aria-hidden="true" />
            <span>{{ sourceLabel }}.</span>
          </div>
        <div class="actions" aria-label="Destination actions">
          <ion-button expand="block" class="start" data-test="start" @click="onStart">
            <ion-icon slot="start" :icon="paperPlaneOutline" aria-hidden="true" />
            View on Map
          </ion-button>
        </div>
        </section>
      </template>
    </ion-content>

  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
  onIonViewWillLeave,
  useIonRouter,
} from '@ionic/vue';
import {
  bookOutline,
  businessOutline,
  cashOutline,
  chevronBack,
  cloudOfflineOutline,
  flaskOutline,
  imageOutline,
  layersOutline,
  location,
  navigateOutline,
  paperPlaneOutline,
  peopleOutline,
  schoolOutline,
  swapHorizontalOutline,
  walkOutline,
  wifi,
} from 'ionicons/icons';
import { useDestinationCatalog } from '@/composables/useDestinationCatalog';
import { reviewDestination } from '@/services/journey.service';
import type { DisplayImage } from '@/models/campus';
import type { Destination } from '@/models/navigation';
import { summarizeDestination } from '@/services/destination-details.service';
import { getDestinationImageUrls } from '@/services/destination-repository';
import { getDestination } from '@/services/navigation.service';

const route = useRoute();
const ionRouter = useIonRouter();
const { isLive, sourceLabel, ensureLoaded } = useDestinationCatalog();

const destination = ref<Destination | null>(null);
const state = ref<'loading' | 'ready' | 'missing'>('loading');
const images = ref<DisplayImage[]>([]);
const imagesLoading = ref(false);
let request = 0;

const summary = computed(() => (destination.value ? summarizeDestination(destination.value) : null));

function routeId(): string {
  const value = route.params.id;
  return typeof value === 'string' ? value : '';
}

async function load() {
  const current = ++request;
  state.value = 'loading';
  images.value = [];
  imagesLoading.value = false;
  await ensureLoaded();
  if (current !== request) return;

  const found = getDestination(routeId());
  destination.value = found;
  state.value = found ? 'ready' : 'missing';
  const references = found?.details?.images ?? [];
  if (references.length === 0) return;

  imagesLoading.value = true;
  const urls = await getDestinationImageUrls(references);
  if (current !== request) return;
  images.value = urls;
  imagesLoading.value = false;
}

onIonViewWillEnter(() => {
  void load();
});
onIonViewWillLeave(() => {
  request += 1;
});

function iconFor(item: Destination) {
  const key = `${item.id} ${item.name} ${item.type}`.toLowerCase();
  if (key.includes('library')) return bookOutline;
  if (key.includes('cashier') || key.includes('cash') || key.includes('finance')) return cashOutline;
  if (key.includes('guidance') || key.includes('counsel')) return peopleOutline;
  if (key.includes('lab')) return flaskOutline;
  if (key.includes('class') || key.includes('school')) return schoolOutline;
  return businessOutline;
}

function onStart() {
  if (!destination.value) return;
  reviewDestination(destination.value.id);
  ionRouter.push(`/destinations/${encodeURIComponent(destination.value.id)}/preview`);
}

function onBack() {
  if (ionRouter.canGoBack()) ionRouter.back();
  else ionRouter.navigate('/destinations', 'back', 'replace');
}
</script>

<style scoped>
.confirm-toolbar {
  --background: #f3f7fb;
  --color: #12263f;
  --border-width: 0;
  --min-height: 56px;
}

.confirm-toolbar ion-title {
  font-size: 18px;
  font-weight: 800;
}

.confirm-content {
  --background: #f3f7fb;
}

.status {
  margin: 32px 16px;
  color: #35586d;
  text-align: center;
}

.gallery {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  margin: 8px 16px 0;
  scroll-snap-type: x mandatory;
}

.photo {
  flex: 0 0 100%;
  margin: 0;
  scroll-snap-align: start;
}

.photo img {
  display: block;
  width: 100%;
  max-height: 210px;
  aspect-ratio: 16 / 9;
  border-radius: 18px;
  object-fit: cover;
  background: #dbe7f3;
}

.photo figcaption {
  margin-top: 6px;
  color: #35586d;
  font-size: 13px;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-height: 210px;
  aspect-ratio: 16 / 9;
  border-radius: 18px;
  background: #dbe7f3;
  color: #35586d;
}

.placeholder ion-icon {
  font-size: 48px;
  color: #1d4ed8;
}

.card {
  margin: -28px 16px 0;
  padding: 16px 16px 14px;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(15, 42, 74, 0.08);
  position: relative;
}

.missing {
  margin-top: 16px;
}

.card h1 {
  margin: 0;
  color: #12263f;
  font-size: 22px;
  font-weight: 800;
}

.missing h1 {
  margin-top: 0;
}

.missing p {
  color: #35586d;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.eyebrow ion-icon {
  font-size: 16px;
}

.identity {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e6edf5;
}

.dest-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: #e8f1fb;
  color: #1d4ed8;
  font-size: 24px;
}

.building {
  margin: 2px 0 0;
  color: #6b8096;
  font-size: 14px;
}

.facts {
  list-style: none;
  display: grid;
  gap: 14px;
  margin: 14px 0 0;
  padding: 0;
}

.facts li {
  display: grid;
  grid-template-columns: 36px 72px 1fr;
  align-items: center;
  gap: 8px;
}

.fact-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: #e8f1fb;
  color: #1d4ed8;
  font-size: 18px;
}

.fact-label {
  color: #5d738a;
  font-size: 14px;
}

.fact-value {
  color: #1d4ed8;
  font-size: 14px;
  font-weight: 800;
}

.description {
  margin: 14px 0 0;
  color: #35586d;
  white-space: pre-line;
}

.source {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e6edf5;
  color: #5d738a;
  font-size: 13px;
}

.source.live {
  color: #0f6b45;
}

.source ion-icon {
  font-size: 18px;
}

.actions {
  display: grid;
  gap: 10px;
  margin: 16px;
}

.actions ion-button {
  --border-radius: 14px;
  height: 48px;
  font-weight: 700;
  text-transform: none;
}

.actions .start {
  --background: #1d4ed8;
  --box-shadow: none;
}

.actions .back {
  --border-color: #d5e0ec;
  --color: #1d4ed8;
  --background: #ffffff;
}
.confirm-brand { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.confirm-brand img { width: 28px; height: 32px; object-fit: contain; }
</style>

<style scoped>
/* Compact destination details with a safe-area-aware bottom action. */
.gallery { margin: 8px 12px 0; gap: 8px; }
.photo img, .placeholder { height: clamp(60px, 13dvh, 110px); max-height: 110px; aspect-ratio: auto; border-radius: 14px; }
.photo figcaption { margin: 3px 4px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.placeholder { gap: 3px; font-size: 12px; }
.placeholder ion-icon { font-size: 26px; }
.card { margin: 8px 12px; padding: 12px; border-radius: 18px; }
.eyebrow { margin-bottom: 6px; font-size: 12px; }
.identity { gap: 10px; padding-bottom: 8px; }
.identity > div { min-width: 0; }
.card h1 { font-size: 20px; overflow-wrap: anywhere; line-height: 1.15; }
.dest-icon { width: 38px; height: 38px; font-size: 22px; }
.building { font-size: 12px; }
.facts { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 12px; margin-top: 8px; }
.facts li { grid-template-columns: 24px minmax(0, 1fr); gap: 1px 6px; }
.facts li:first-child { grid-column: 1 / -1; grid-template-columns: 24px 54px minmax(0, 1fr); }
.fact-icon { width: 24px; height: 24px; font-size: 15px; grid-row: 1 / 3; }
.fact-label { font-size: 11px; }
.fact-value { grid-column: 2; font-size: 12px; line-height: 1.25; overflow-wrap: anywhere; }
.facts li:first-child .fact-value { grid-column: 3; }
.description { margin: 8px 0 0; font-size: 12px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.source { margin-top: 8px; padding-top: 6px; gap: 6px; font-size: 11px; }
.source ion-icon { font-size: 14px; }
@media (max-height: 650px) {
  .photo img, .placeholder { height: 56px; }
  .photo figcaption { display: none; }
  .card { padding: 10px; }
  .facts { gap: 5px 10px; }
}
</style>

<style scoped>
.confirm-toolbar .header-back { --color:#1d4ed8; margin-inline:4px; min-width:44px; min-height:44px; }
.confirm-content.details-ready::part(scroll) { display:flex; flex-direction:column; }
.confirm-content.details-ready .gallery, .confirm-content.details-ready .card { flex-shrink:0; }
.actions { display:block; flex-shrink:0; margin:auto 12px 0; padding-top:16px; padding-bottom:max(20px,var(--ion-safe-area-bottom,env(safe-area-inset-bottom,0px))); }
.actions .start { width:100%; margin:0; min-height:46px; font-size:14px; --border-radius:12px; --background:#1d4ed8; --color:#fff; }
</style>

<style scoped>
/* Photo-led destination sheet: the details and primary action stay together. */
.confirm-toolbar { --background:#f3f7fb; --min-height:60px; }
.confirm-toolbar .header-back { --background:#e8f0ff; --border-radius:12px; margin-inline:8px; }
.confirm-content.details-ready::part(scroll) { display:block; }
.gallery { margin:0 auto; gap:0; max-width:720px; scroll-snap-type:x mandatory; }
.photo { flex:0 0 100%; }
.photo img,.placeholder { height:clamp(220px,35dvh,380px); max-height:none; width:100%; border-radius:0; aspect-ratio:auto; }
.placeholder { min-height:220px; font-size:14px; }
.placeholder ion-icon { font-size:42px; }
.photo figcaption { margin:0; padding:6px 16px 30px; background:#e8f1fb; white-space:normal; font-size:12px; }
.card:not(.missing) { width:100%; max-width:720px; margin:-22px auto 0; padding:22px 20px max(20px,var(--ion-safe-area-bottom,env(safe-area-inset-bottom,0px))); border-radius:30px 30px 0 0; box-shadow:0 -6px 24px #163f6410; overflow:hidden; }
.eyebrow { font-size:13px; margin:0 0 12px; }
.identity { gap:14px; border:0; padding:0; }
.dest-icon { width:54px; height:54px; font-size:29px; background:#e8f0ff; }
.card h1 { font-size:28px; line-height:1.2; letter-spacing:-.02em; }
.building { font-size:14px; margin-top:3px; }
.description { display:block; margin:16px 0 0; padding:11px 14px; border-radius:14px; background:#f0f5fa; color:#35516c; font-size:13px; line-height:1.5; overflow:visible; }
.facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0; margin:16px 0 0; padding:0; border-top:1px solid #e6edf5; border-bottom:1px solid #e6edf5; }
.facts li,.facts li:first-child { grid-column:auto; grid-template-columns:36px minmax(0,1fr); gap:2px 9px; padding:13px 8px; border-bottom:1px solid #e6edf5; align-content:start; min-width:0; }
.facts .route-fact { order:1; } .facts .distance-fact { order:2; } .facts .steps-fact { order:3; } .facts .room-fact { order:4; } .facts .floor-fact { order:5; }
.fact-icon { width:36px; height:36px; border-radius:12px; font-size:22px; grid-column:1; grid-row:1 / 3; }
.fact-label { grid-column:2; font-size:12px; line-height:1.2; }
.fact-value,.facts li:first-child .fact-value { grid-column:2; font-size:14px; line-height:1.3; }
.source { margin:14px 0 0; padding:12px 14px; border:0; border-radius:14px; background:#eef2f6; font-size:12px; line-height:1.4; }
.source.live { background:#e7f8e9; color:#14763a; }
.source ion-icon { font-size:21px; flex-shrink:0; }
.actions { display:block; margin:16px 0 0; padding:16px 0 0; border-top:1px solid #e6edf5; }
.actions .start { height:50px; min-height:50px; font-size:15px; --border-radius:15px; --background:linear-gradient(125deg,#1f5df4,#123cce); --box-shadow:0 5px 14px #1d4ed824; }
@media (max-width:350px) { .card:not(.missing) { padding-inline:14px; } .facts li,.facts li:first-child { grid-template-columns:28px minmax(0,1fr); gap:2px 6px; padding-inline:4px; } .fact-icon { width:28px; height:30px; font-size:18px; } .fact-value,.facts li:first-child .fact-value { font-size:12px; } }
@media (max-height:650px) { .photo img,.placeholder { height:180px; min-height:180px; } .card:not(.missing) { padding-top:18px; } }
</style>
