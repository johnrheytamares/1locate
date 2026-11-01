<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Destination Links</h1>
        <p>
          The mobile picker lists destinations, and each one carries its own fixed indoor route. Linking a destination to
          a room shows that room's name, floor, description, and photos in the app. Routes are not changed here.
        </p>
      </div>
    </header>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>

    <p v-if="loading" class="muted">Loading destinations...</p>
    <template v-else>
      <div v-if="destinations.length === 0" class="table-wrap"><p class="empty">No destinations found.</p></div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr><th>Destination</th><th>Fixed route</th><th>Linked room</th><th>Mobile app</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="destination in destinations" :key="destination.id" data-test="destination-row">
              <td>
                <strong>{{ destination.name }}</strong><br />
                <span class="muted">{{ destination.building }} · <span class="mono">{{ destination.id }}</span></span>
              </td>
              <td>
                <span v-if="routes.get(destination.id)?.valid">
                  {{ routes.get(destination.id)?.steps }} steps · {{ routes.get(destination.id)?.meters }} m
                </span>
                <span v-else class="badge warn">Route needs checking</span>
              </td>
              <td>
                <select
                  v-model="selection[destination.id]"
                  :aria-label="`Room for ${destination.name}`"
                  :disabled="busyId !== null"
                  data-test="room-select"
                >
                  <option value="">Not linked</option>
                  <option v-for="room in linkableRooms(rooms, destinations, destination.id)" :key="room.id" :value="room.id">
                    {{ roomLabel(room) }}
                  </option>
                </select>
              </td>
              <td>
                <span class="badge" :class="isVisible(visibility(destination)) ? 'ok' : 'warn'" data-test="visibility">
                  {{ VISIBILITY_TEXT[visibility(destination)] }}
                </span>
              </td>
              <td class="actions">
                <button
                  class="small"
                  type="button"
                  :disabled="busyId !== null || (selection[destination.id] ?? '') === (destination.room_id ?? '')"
                  data-test="save-link"
                  @click="onSaveLink(destination)"
                >
                  {{ selection[destination.id] ? 'Save link' : 'Unlink' }}
                </button>
                <button class="ghost small" type="button" :disabled="busyId !== null" @click="onToggleActive(destination)">
                  {{ destination.is_active ? 'Turn off' : 'Turn on' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="section">
        <h2>Rooms without a destination</h2>
        <p class="muted">
          These rooms have no fixed route yet, so the app cannot guide to them. They are marked
          <strong>Not yet available for navigation</strong>. Routes will be added in a later phase.
        </p>
        <div v-if="unlinked.length === 0" class="table-wrap"><p class="empty" data-test="all-linked">Every room has a destination.</p></div>
        <div v-else class="table-wrap">
          <table>
            <thead><tr><th>Room</th><th>Building</th><th>Status</th><th>Navigation</th></tr></thead>
            <tbody>
              <tr v-for="room in unlinked" :key="room.id" data-test="unlinked-room">
                <td>{{ roomLabel(room) }}</td>
                <td>{{ buildings.get(room.building_id)?.name ?? 'Unknown building' }}</td>
                <td><span class="badge" :class="room.is_active ? 'ok' : 'off'">{{ room.is_active ? 'Published' : 'Draft' }}</span></td>
                <td><span class="badge warn">Not yet available for navigation</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  isVisible,
  linkableRooms,
  mobileVisibility,
  roomsWithoutDestination,
  routeSummary,
  VISIBILITY_TEXT,
  type MobileVisibility,
} from '@/lib/destination-links';
import { describeError } from '@/lib/errors';
import { listBuildings, listDestinations, listRooms, setDestinationActive, setDestinationRoom } from '@/services/campus';
import type { Building, DestinationRecord, Room } from '@/types';

const destinations = ref<DestinationRecord[]>([]);
const rooms = ref<Room[]>([]);
const buildingList = ref<Building[]>([]);
const selection = reactive<Record<string, string>>({});
const loading = ref(true);
const busyId = ref<string | null>(null);
const error = ref('');
const notice = ref('');

const buildings = computed(() => new Map(buildingList.value.map((item) => [item.id, item])));
const roomMap = computed(() => new Map(rooms.value.map((item) => [item.id, item])));
const routes = computed(() => new Map(destinations.value.map((item) => [item.id, routeSummary(item.indoor_route)])));
const unlinked = computed(() => roomsWithoutDestination(rooms.value, destinations.value));

function visibility(destination: DestinationRecord): MobileVisibility {
  return mobileVisibility(destination, roomMap.value, buildings.value);
}

function roomLabel(room: Room): string {
  const building = buildings.value.get(room.building_id)?.code ?? '?';
  return `${room.name}${room.room_number ? ` (${room.room_number})` : ''} · ${building}${room.is_active ? '' : ' · draft'}`;
}

function syncSelection() {
  for (const destination of destinations.value) selection[destination.id] = destination.room_id ?? '';
}

function replace(updated: DestinationRecord) {
  destinations.value = destinations.value.map((item) => (item.id === updated.id ? updated : item));
  selection[updated.id] = updated.room_id ?? '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [destinations.value, rooms.value, buildingList.value] = await Promise.all([listDestinations(), listRooms(), listBuildings()]);
    syncSelection();
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

async function onSaveLink(destination: DestinationRecord) {
  const roomId = selection[destination.id] || null;
  error.value = '';
  notice.value = '';
  if (roomId && destinations.value.some((item) => item.id !== destination.id && item.room_id === roomId)) {
    error.value = 'That room is already linked to another destination.';
    return;
  }
  busyId.value = destination.id;
  try {
    const updated = await setDestinationRoom(destination.id, roomId);
    replace(updated);
    const state = VISIBILITY_TEXT[visibility(updated)];
    notice.value = roomId ? `Linked ${updated.name}. ${state}.` : `Unlinked ${updated.name}. Its original details and route are kept.`;
  } catch (err) {
    selection[destination.id] = destination.room_id ?? '';
    error.value = describeError(err);
  } finally {
    busyId.value = null;
  }
}

async function onToggleActive(destination: DestinationRecord) {
  error.value = '';
  notice.value = '';
  busyId.value = destination.id;
  try {
    const updated = await setDestinationActive(destination.id, !destination.is_active);
    replace(updated);
    notice.value = updated.is_active ? `${updated.name} is turned on.` : `${updated.name} is hidden from the app.`;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>
