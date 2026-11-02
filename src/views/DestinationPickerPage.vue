<template>
  <ion-page>
    <ion-header class="picker-header">
      <ion-toolbar class="picker-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/home" color="light" text="" />
        </ion-buttons>
        <div class="brand-lockup">
          <div class="brand-title">
            <span class="pin" aria-hidden="true">
              <ion-icon :icon="location" />
            </span>
            <strong>1Locate</strong>
          </div>
          <span class="brand-sub">Choose a Destination</span>
        </div>
        <div class="skyline" aria-hidden="true" slot="end">
          <span class="bldg b1" />
          <span class="bldg b2" />
          <span class="bldg b3" />
        </div>
      </ion-toolbar>
      <ion-toolbar class="search-toolbar">
        <ion-searchbar
          v-model="query"
          placeholder="Search destinations..."
          :debounce="150"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content class="picker-content">
      <div class="source-banner" :class="{ live: isLive }">
        <ion-icon :icon="isLive ? wifi : cloudOfflineOutline" aria-hidden="true" />
        <p class="source" data-test="source">{{ sourceLabel }}</p>
        <ion-button
          v-if="failed"
          size="small"
          fill="solid"
          :disabled="loading"
          data-test="retry"
          @click="load"
        >
          {{ loading ? 'Retrying...' : 'Retry' }}
        </ion-button>
      </div>

      <p v-if="filtered.length === 0" class="empty">No destinations match that search.</p>

      <article v-for="destination in filtered" :key="destination.id" class="card">
        <div class="card-top">
          <span class="dest-icon" aria-hidden="true">
            <ion-icon :icon="iconFor(destination)" />
          </span>
          <div class="card-copy">
            <div class="name-row">
              <h2>{{ destination.name }}</h2>
              <ion-icon class="chevron" :icon="chevronForward" aria-hidden="true" />
            </div>
            <p class="building">
              <ion-icon :icon="locationOutline" aria-hidden="true" />
              {{ destination.building }}
            </p>
            <p class="meta">
              {{ destinationTypeLabel(destination.type) }} · GPS to {{ destination.outdoorTarget.name }}
            </p>
            <p class="stats">
              <span>
                <ion-icon :icon="walkOutline" aria-hidden="true" />
                {{ destination.indoorRoute.length }} steps
              </span>
              <span>
                <ion-icon :icon="chevronForward" aria-hidden="true" />
                <ion-icon :icon="chevronForward" aria-hidden="true" />
                {{ indoorRouteMeters(destination) }} m indoors
              </span>
            </p>
          </div>
        </div>
        <ion-button expand="block" class="select" @click="onSelect(destination.id)">
          <ion-icon slot="start" :icon="paperPlaneOutline" aria-hidden="true" />
          Select
        </ion-button>
      </article>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSearchbar,
  IonToolbar,
  onIonViewWillEnter,
  useIonRouter,
} from '@ionic/vue';
import {
  bookOutline,
  businessOutline,
  cashOutline,
  chevronForward,
  cloudOfflineOutline,
  flaskOutline,
  location,
  locationOutline,
  paperPlaneOutline,
  peopleOutline,
  schoolOutline,
  walkOutline,
  wifi,
} from 'ionicons/icons';
import { useDestinationCatalog } from '@/composables/useDestinationCatalog';
import type { Destination } from '@/models/navigation';
import { destinationTypeLabel } from '@/services/destination-details.service';
import { indoorRouteMeters } from '@/services/navigation.service';

const ionRouter = useIonRouter();
const query = ref('');
const { destinations, failed, loading, isLive, sourceLabel, load } = useDestinationCatalog();

onIonViewWillEnter(() => {
  void load();
});

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return destinations.value;
  return destinations.value.filter((destination) => (
    destination.name.toLowerCase().includes(needle)
    || destination.building.toLowerCase().includes(needle)
    || destination.type.toLowerCase().includes(needle)
  ));
});

function iconFor(destination: Destination) {
  const key = `${destination.id} ${destination.name} ${destination.type}`.toLowerCase();
  if (key.includes('library')) return bookOutline;
  if (key.includes('cashier') || key.includes('cash') || key.includes('finance')) return cashOutline;
  if (key.includes('guidance') || key.includes('counsel')) return peopleOutline;
  if (key.includes('lab')) return flaskOutline;
  if (key.includes('class') || key.includes('school')) return schoolOutline;
  if (key.includes('registrar')) return businessOutline;
  return businessOutline;
}

function onSelect(id: string) {
  ionRouter.push(`/destinations/${encodeURIComponent(id)}`);
}
</script>

<style scoped>
.picker-header {
  box-shadow: none;
}

.picker-toolbar,
.search-toolbar {
  --background: #0c2d52;
  --color: #ffffff;
  --border-width: 0;
  --min-height: 56px;
  padding-inline: 4px;
}

.search-toolbar {
  --min-height: 64px;
  padding-bottom: 8px;
}

.brand-lockup {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 44px;
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
  color: #ffffff;
  font-size: 15px;
}

.brand-lockup strong {
  color: #ffffff;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}

.brand-sub {
  margin-left: 34px;
  color: #c5d4e8;
  font-size: 13px;
  font-weight: 500;
}

.skyline {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 36px;
  margin-right: 10px;
  opacity: 0.85;
}

.bldg {
  display: block;
  width: 14px;
  border-radius: 2px 2px 0 0;
  background:
    linear-gradient(#dbe7f5, #dbe7f5) 3px 6px / 3px 3px no-repeat,
    linear-gradient(#dbe7f5, #dbe7f5) 8px 6px / 3px 3px no-repeat,
    linear-gradient(#dbe7f5, #dbe7f5) 3px 12px / 3px 3px no-repeat,
    linear-gradient(#dbe7f5, #dbe7f5) 8px 12px / 3px 3px no-repeat,
    #8fb0d4;
}

.b1 { height: 22px; }
.b2 { height: 32px; width: 16px; }
.b3 { height: 18px; }

.picker-content {
  --background: #eef3f8;
}

.search-toolbar ion-searchbar {
  --background: #ffffff;
  --border-radius: 14px;
  --box-shadow: none;
  --color: #102a43;
  --placeholder-color: #8aa0b8;
  --icon-color: #8aa0b8;
  --clear-button-color: #8aa0b8;
  padding-inline: 12px;
  padding-top: 0;
  padding-bottom: 4px;
}

.source-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 16px 4px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #e7f0fb;
  color: #1e4b7a;
}

.source-banner.live {
  background: #e5f6ee;
  color: #0f6b45;
}

.source-banner > ion-icon {
  flex: 0 0 auto;
  font-size: 20px;
}

.source {
  flex: 1;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.source-banner ion-button {
  --background: #ffffff;
  --color: #1d4ed8;
  --border-radius: 10px;
  --box-shadow: none;
  margin: 0;
  height: 32px;
  font-weight: 700;
  text-transform: none;
}

.empty {
  margin: 24px 16px;
  color: #0c2d52;
  text-align: center;
}

.card {
  margin: 12px 16px;
  padding: 14px 14px 12px;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 8px 22px rgba(15, 42, 74, 0.06);
}

.card-top {
  display: flex;
  gap: 12px;
}

.dest-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: #e8f1fb;
  color: #1d4ed8;
  font-size: 22px;
}

.card-copy {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card h2 {
  margin: 0;
  color: #12263f;
  font-size: 18px;
  font-weight: 800;
}

.chevron {
  flex: 0 0 auto;
  color: #9eb0c3;
  font-size: 18px;
}

.building,
.meta,
.stats {
  margin: 0;
}

.building {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  color: #5d738a;
  font-size: 13px;
}

.building ion-icon {
  color: #3b82f6;
  font-size: 14px;
}

.meta {
  margin-top: 2px;
  color: #6b8096;
  font-size: 13px;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 8px;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.stats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stats ion-icon {
  font-size: 15px;
}

.stats span ion-icon + ion-icon {
  margin-left: -10px;
}

.select {
  margin-top: 12px;
  --background: #1d4ed8;
  --background-hover: #1e40af;
  --border-radius: 12px;
  --box-shadow: none;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-transform: none;
  height: 44px;
}
</style>
