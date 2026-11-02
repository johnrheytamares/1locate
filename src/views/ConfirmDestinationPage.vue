<template>
  <ion-page>
    <ion-header>
      <ion-toolbar class="confirm-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/destinations" text="" color="dark" />
        </ion-buttons>
        <ion-title>Confirm Destination</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="confirm-content">
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

          <ul class="facts">
            <li>
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="navigateOutline" /></span>
              <span class="fact-label">Route</span>
              <span class="fact-value">GPS to {{ summary.entranceName }}</span>
            </li>
            <li>
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="walkOutline" /></span>
              <span class="fact-label">Steps</span>
              <span class="fact-value">{{ destination.indoorRoute.length }} steps</span>
            </li>
            <li>
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="swapHorizontalOutline" /></span>
              <span class="fact-label">Distance</span>
              <span class="fact-value">{{ summary.indoorMeters }} m indoors</span>
            </li>
            <li v-if="summary.floor">
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="layersOutline" /></span>
              <span class="fact-label">Floor</span>
              <span class="fact-value" data-test="floor">{{ summary.floor }}</span>
            </li>
            <li v-if="summary.roomNumber">
              <span class="fact-icon" aria-hidden="true"><ion-icon :icon="businessOutline" /></span>
              <span class="fact-label">Room</span>
              <span class="fact-value" data-test="room-number">{{ summary.roomNumber }}</span>
            </li>
          </ul>
          <p v-if="summary.description" class="description" data-test="description">{{ summary.description }}</p>

          <div class="source" :class="{ live: isLive }">
            <ion-icon :icon="isLive ? wifi : cloudOfflineOutline" aria-hidden="true" />
            <span>{{ sourceLabel }}.</span>
          </div>
        </section>

        <div class="actions">
          <ion-button expand="block" class="start" data-test="start" @click="onStart">
            <ion-icon slot="start" :icon="paperPlaneOutline" aria-hidden="true" />
            Start Navigation
          </ion-button>
          <ion-button expand="block" fill="outline" class="back" data-test="back" @click="onBack">
            <ion-icon slot="start" :icon="chevronBack" aria-hidden="true" />
            Back
          </ion-button>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
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
import type { DisplayImage } from '@/models/campus';
import type { Destination } from '@/models/navigation';
import { summarizeDestination } from '@/services/destination-details.service';
import { getDestinationImageUrls } from '@/services/destination-repository';
import { getDestination, selectDestination } from '@/services/navigation.service';

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
  if (!destination.value || !selectDestination(destination.value.id)) {
    state.value = 'missing';
    return;
  }
  ionRouter.push('/ar-navigation');
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
</style>
