<template>
  <ion-page>
    <ion-header>
      <ion-toolbar class="picker-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/home" />
        </ion-buttons>
        <div class="brand-lockup">
          <strong>1Locate</strong>
          <span>Choose a destination</span>
        </div>
      </ion-toolbar>
      <ion-toolbar class="search-toolbar">
        <ion-searchbar
          v-model="query"
          placeholder="Search destinations"
          :debounce="150"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content class="picker-content">
      <p v-if="filtered.length === 0" class="empty">No destinations match that search.</p>
      <article v-for="destination in filtered" :key="destination.id" class="card">
        <h2>{{ destination.name }}</h2>
        <p>{{ destination.building }}</p>
        <p class="meta">
          {{ destination.type }} · GPS to {{ destination.outdoorTarget.name }} · {{ indoorRouteMeters(destination) }} m indoors
        </p>
        <ion-button @click="onNavigate(destination.id)">Navigate</ion-button>
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
  IonPage,
  IonSearchbar,
  IonToolbar,
  useIonRouter,
} from '@ionic/vue';
import { getDestinations, indoorRouteMeters, selectDestination } from '@/services/navigation.service';

const ionRouter = useIonRouter();
const query = ref('');
const destinations = getDestinations();

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return destinations;
  return destinations.filter((destination) => (
    destination.name.toLowerCase().includes(needle)
    || destination.building.toLowerCase().includes(needle)
    || destination.type.toLowerCase().includes(needle)
  ));
});

function onNavigate(id: string) {
  if (!selectDestination(id)) return;
  ionRouter.push('/ar-navigation');
}
</script>

<style scoped>
.picker-toolbar,
.search-toolbar {
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

.picker-content {
  --background: #f4fbff;
}

.empty,
.card {
  margin: 16px;
}

.empty {
  color: #0b3a5b;
  text-align: center;
}

.card {
  padding: 16px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(11, 58, 91, 0.08);
}

.card h2,
.card p {
  margin: 0;
}

.card h2 {
  color: #0b3a5b;
  font-size: 20px;
}

.card p {
  margin-top: 4px;
  color: #35586d;
}

.meta {
  color: #1493c7;
  font-weight: 700;
}

.card ion-button {
  margin-top: 12px;
  --background: #1493c7;
  --border-radius: 999px;
}
</style>
