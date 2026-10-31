<template>
  <ion-page>
    <ion-header>
      <ion-toolbar class="confirm-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/destinations" />
        </ion-buttons>
        <ion-title>Confirm destination</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="confirm-content">
      <p v-if="state === 'loading'" class="status" data-test="loading">Loading destination...</p>

      <section v-else-if="state === 'missing'" class="card missing" data-test="missing">
        <h1>Destination not found</h1>
        <p>It may have been removed or unpublished. Choose another destination.</p>
        <ion-button expand="block" @click="onBack">Back to destinations</ion-button>
      </section>

      <template v-else-if="summary">
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
          <p class="type">{{ summary.typeLabel }}</p>
          <h1 data-test="name">{{ summary.name }}</h1>
          <dl class="facts">
            <div>
              <dt>Building</dt>
              <dd data-test="building">{{ summary.building }}</dd>
            </div>
            <div v-if="summary.floor">
              <dt>Floor</dt>
              <dd data-test="floor">{{ summary.floor }}</dd>
            </div>
            <div v-if="summary.roomNumber">
              <dt>Room</dt>
              <dd data-test="room-number">{{ summary.roomNumber }}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>GPS to {{ summary.entranceName }}, then {{ summary.indoorMeters }} m indoors</dd>
            </div>
          </dl>
          <p v-if="summary.description" class="description" data-test="description">{{ summary.description }}</p>
        </section>

        <p class="source" :class="{ live: isLive }">{{ sourceLabel }}</p>

        <div class="actions">
          <ion-button expand="block" class="start" data-test="start" @click="onStart">Start Navigation</ion-button>
          <ion-button expand="block" fill="outline" data-test="back" @click="onBack">Back</ion-button>
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
import { imageOutline } from 'ionicons/icons';
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
  --background: #0b3a5b;
  --color: #ffffff;
  --border-width: 0;
}

.confirm-content {
  --background: #f4fbff;
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
  padding: 16px 16px 0;
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
  max-height: 240px;
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  object-fit: cover;
  background: #dbeef8;
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
  max-height: 240px;
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  background: #dbeef8;
  color: #35586d;
}

.placeholder ion-icon {
  font-size: 48px;
  color: #1493c7;
}

.card {
  margin: 16px;
  padding: 16px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(11, 58, 91, 0.08);
}

.card h1 {
  margin: 4px 0 12px;
  color: #0b3a5b;
  font-size: 24px;
}

.missing h1 {
  margin-top: 0;
}

.missing p {
  color: #35586d;
}

.type {
  margin: 0;
  color: #1493c7;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.facts {
  display: grid;
  gap: 8px;
  margin: 0;
}

.facts div {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
}

.facts dt {
  color: #35586d;
  font-size: 13px;
}

.facts dd {
  margin: 0;
  color: #0b3a5b;
  font-weight: 600;
}

.description {
  margin: 12px 0 0;
  color: #35586d;
  white-space: pre-line;
}

.source {
  margin: 0 16px;
  color: #35586d;
  font-size: 12px;
  text-align: right;
}

.source.live {
  color: #1493c7;
}

.actions {
  display: grid;
  gap: 8px;
  margin: 16px;
}

.actions ion-button {
  --border-radius: 999px;
}

.actions .start {
  --background: #1493c7;
}
</style>
