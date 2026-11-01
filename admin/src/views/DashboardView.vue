<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p>Signed in as {{ session.state.email }} ({{ roleLabel }}).</p>
      </div>
      <button class="secondary" type="button" :disabled="loading" @click="load">Refresh</button>
    </header>

    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Loading summary...</p>

    <template v-else-if="summary">
      <div class="stats">
        <div class="card stat"><strong>{{ summary.buildingsPublished }} / {{ summary.buildings }}</strong><span>Buildings published</span></div>
        <div class="card stat"><strong>{{ summary.floors }}</strong><span>Floors</span></div>
        <div class="card stat"><strong>{{ summary.roomsPublished }} / {{ summary.rooms }}</strong><span>Rooms published</span></div>
        <div class="card stat"><strong>{{ summary.visibleDestinations }} / {{ summary.destinations }}</strong><span>Destinations shown in the app</span></div>
      </div>

      <p v-if="summary.unsurveyedBuildings > 0" class="notice warn">
        {{ summary.unsurveyedBuildings }} building(s) have no surveyed entrance coordinates yet. The app uses a TEST target for them.
      </p>
      <p v-if="summary.roomsWithoutDestination > 0" class="notice">
        {{ summary.roomsWithoutDestination }} room(s) are not yet available for navigation because they have no destination link.
        <router-link :to="{ name: 'destinations' }">Open Destination Links</router-link>
      </p>

      <section class="card">
        <h2>How content reaches the mobile app</h2>
        <ol class="muted">
          <li>Add a building and publish it when its details are verified.</li>
          <li>Add its floors and rooms / offices, then publish each room.</li>
          <li>Link the room to a destination that has a fixed route.</li>
          <li>The mobile app shows the room details and photos the next time the picker loads.</li>
        </ol>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { isVisible, mobileVisibility, roomsWithoutDestination } from '@/lib/destination-links';
import { describeError } from '@/lib/errors';
import { listBuildings, listDestinations, listFloors, listRooms } from '@/services/campus';
import { useSession } from '@/stores/session';
import { ROLE_LABELS } from '@/types';

interface Summary {
  buildings: number;
  buildingsPublished: number;
  unsurveyedBuildings: number;
  floors: number;
  rooms: number;
  roomsPublished: number;
  destinations: number;
  visibleDestinations: number;
  roomsWithoutDestination: number;
}

const session = useSession();
const summary = ref<Summary | null>(null);
const loading = ref(true);
const error = ref('');

const roleLabel = computed(() => (session.state.role ? ROLE_LABELS[session.state.role] : ''));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [buildings, floors, rooms, destinations] = await Promise.all([
      listBuildings(), listFloors(), listRooms(), listDestinations(),
    ]);
    const roomMap = new Map(rooms.map((item) => [item.id, item]));
    const buildingMap = new Map(buildings.map((item) => [item.id, item]));
    summary.value = {
      buildings: buildings.length,
      buildingsPublished: buildings.filter((item) => item.is_active).length,
      unsurveyedBuildings: buildings.filter((item) => item.entrance_lat === null).length,
      floors: floors.length,
      rooms: rooms.length,
      roomsPublished: rooms.filter((item) => item.is_active).length,
      destinations: destinations.length,
      visibleDestinations: destinations.filter((item) => isVisible(mobileVisibility(item, roomMap, buildingMap))).length,
      roomsWithoutDestination: roomsWithoutDestination(rooms, destinations).length,
    };
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
