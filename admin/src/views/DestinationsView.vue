<template>
  <div>
    <header class="page-header catalog-head dest-head">
      <div class="title-row">
        <span class="page-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"/></svg>
        </span>
        <div>
          <h1>Destinations Management</h1>
          <p>Link each destination to a room. Routes are not changed here.</p>
        </div>
      </div>
    </header>

    <div class="dest-summary">
      <article class="stat card tone-blue dest-count">
        <span class="stat-icon" style="color:#1d4ed8" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"/></svg></span>
        <div><strong>{{ destinations.length }}</strong><span>Total Destinations</span></div>
      </article>
      <p v-if="hiddenNames" class="notice ok dest-hidden">{{ hiddenNames }}</p>
    </div>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>

    <p v-if="loading" class="muted">Loading destinations...</p>
    <template v-else>
      <section class="card dest-panel">
        <div class="panel-bar">
          <h2>Destinations List</h2>
          <label class="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 1 0 3.7 10.7l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>
            <input v-model="search" type="search" placeholder="Search destinations..." aria-label="Search destinations" />
          </label>
          <select v-model="statusFilter" aria-label="Filter destinations">
            <option value="">All</option>
            <option value="on">Shown</option>
            <option value="off">Hidden</option>
          </select>
        </div>
      <div v-if="filteredDestinations.length === 0" class="table-wrap"><p class="empty">No destinations found.</p></div>
      <div v-else class="table-wrap data-table">
        <table>
          <thead>
            <tr><th>Destination</th><th>Fixed Route</th><th>Linked Room</th><th>Mobile App Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="destination in filteredDestinations" :key="destination.id" data-test="destination-row">
              <td data-label="Destination">
                <div class="with-icon">
                  <span class="row-icon blue" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 21V5l8-2 8 2v16h-6v-5H10v5H4z"/></svg>
                  </span>
                  <div>
                    <strong class="name-cell">{{ destination.name }}</strong>
                    <span class="muted sub">{{ destination.building }} · {{ destination.id }}</span>
                  </div>
                </div>
              </td>
              <td data-label="Fixed Route">
                <span v-if="routes.get(destination.id)?.valid" class="route">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4h2v6h6V8l5 4-5 4v-2H7v6H5V4h2z"/></svg>
                  {{ routes.get(destination.id)?.steps }} steps · {{ routes.get(destination.id)?.meters }} m
                </span>
                <span v-else class="badge warn">Route needs checking</span>
              </td>
              <td data-label="Linked Room">
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
              <td data-label="Mobile App Status">
                <span class="badge" :class="isVisible(visibility(destination)) ? 'ok' : 'warn'" data-test="visibility">
                  <svg v-if="isVisible(visibility(destination))" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 6l14 13"/></svg>
                  {{ isVisible(visibility(destination)) ? 'Shown' : 'Hidden' }}
                </span>
              </td>
              <td class="actions" data-label="Actions">
                <div class="action-row">
                <button
                  class="secondary small"
                  type="button"
                  :disabled="busyId !== null || (selection[destination.id] ?? '') === (destination.room_id ?? '')"
                  data-test="save-link"
                  @click="onSaveLink(destination)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.5 7.5 7 6 3 10l4 4 1.5-1.5L6.5 10 8.5 7.5zM15.5 16.5 17 18l4-4-4-4-1.5 1.5L17.5 14 15.5 16.5zM14.2 8.3l1.4 1.4-6 6-1.4-1.4 6-6z"/></svg>
                  {{ selection[destination.id] ? 'Save link' : 'Unlink' }}
                </button>
                <button class="secondary small" type="button" :disabled="busyId !== null" @click="onToggleActive(destination)">
                  <svg v-if="destination.is_active" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 6l14 13"/></svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
                  {{ destination.is_active ? 'Turn off' : 'Turn on' }}
                </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </section>

      <section class="card dest-panel">
        <h2 class="with-icon">
          <span class="row-icon amber" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"/></svg>
          </span>
          Rooms Without a Destination
        </h2>
        <p class="muted">
          These rooms have no fixed route yet, so the app cannot guide to them. They are marked
          <strong>Not yet available for navigation</strong>.
        </p>
        <div v-if="unlinked.length === 0" class="table-wrap"><p class="empty" data-test="all-linked">Every room has a destination.</p></div>
        <div v-else class="table-wrap data-table">
          <table>
            <thead><tr><th>Room</th><th>Building</th><th>Status</th><th>Navigation</th></tr></thead>
            <tbody>
              <tr v-for="room in unlinked" :key="room.id" data-test="unlinked-room">
                <td>
                  <div class="with-icon">
                    <span class="row-icon blue" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 11 12 4l9 7v9h-6v-6H9v6H3v-9z"/></svg>
                    </span>
                    <span>{{ roomLabel(room) }}</span>
                  </div>
                </td>
                <td>
                  <div class="with-icon">
                    <span class="row-icon slate" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 21V5l8-2 8 2v16h-6v-5H10v5H4z"/></svg>
                    </span>
                    <span>{{ buildings.get(room.building_id)?.name ?? 'Unknown building' }}</span>
                  </div>
                </td>
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
const search = ref('');
const statusFilter = ref('');
const hiddenNames = computed(() => {
  const names = destinations.value.filter((item) => !item.is_active).map((item) => item.name);
  if (names.length === 0) return '';
  return `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} hidden from the app.`;
});
const filteredDestinations = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return destinations.value.filter((item) => {
    if (statusFilter.value === 'on' && !item.is_active) return false;
    if (statusFilter.value === 'off' && item.is_active) return false;
    if (!needle) return true;
    return item.name.toLowerCase().includes(needle) || item.building.toLowerCase().includes(needle);
  });
});

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

<style scoped>
.dest-head { margin-bottom: 12px; }
.dest-summary { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch; margin-bottom: 14px; }
.dest-count { min-width: 220px; margin: 0; display: flex; align-items: center; gap: 12px; }
.dest-count .stat-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: #fff; flex: 0 0 auto; }
.dest-count .stat-icon svg { width: 22px; height: 22px; }
.dest-count strong { display: block; font-size: 1.5rem; line-height: 1.1; }
.dest-hidden { flex: 1; min-width: 220px; margin: 0; display: flex; align-items: center; }
.dest-panel { margin-bottom: 16px; padding: 14px; }
.panel-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.panel-bar h2 { margin: 0; flex: 0 0 auto; }
.panel-bar .search-field { flex: 1 1 180px; max-width: none; }
.panel-bar select { width: auto; min-width: 120px; height: 42px; }
.sub { display: block; font-size: 12px; }
.with-icon { display: flex; align-items: center; gap: 8px; }
.row-icon { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto; }
.row-icon svg { width: 16px; height: 16px; }
.row-icon.blue { background: #dbeafe; color: #1d4ed8; }
.row-icon.amber { background: #fef3c7; color: #d97706; }
.row-icon.slate { background: #e2e8f0; color: #475569; }
.route { display: inline-flex; align-items: center; gap: 6px; color: #1d4ed8; font-weight: 600; white-space: nowrap; }
.route svg { width: 16px; height: 16px; }
.dest-panel :deep(th) { white-space: nowrap; }
.dest-panel :deep(td),
.dest-panel :deep(th) { vertical-align: middle; }
.dest-panel :deep(th:last-child),
.dest-panel :deep(td.actions) {
  display: table-cell;
  text-align: right;
  vertical-align: middle;
}
.action-row {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-height: 34px;
}
.dest-panel :deep(td.actions button),
.dest-panel :deep(.badge) { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.dest-panel :deep(td.actions button svg),
.dest-panel :deep(.badge svg) { width: 14px; height: 14px; flex: 0 0 auto; }
.dest-panel :deep(td select) { min-width: 140px; height: 34px; }
@media (max-width: 899px) {
  .dest-summary { flex-direction: column; gap: 8px; }
  .dest-count, .dest-hidden { min-width: 0; width: 100%; }
  .dest-count.card { padding: 12px 14px; }
}
</style>
