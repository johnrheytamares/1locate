<template>
  <div>
    <header class="page-header catalog-head dest-head">
      <div class="title-row">
        <span class="page-mark" aria-hidden="true"><img class="page-brand-logo" src="/images/1locate-logo.png" alt="" />
        </span>
        <div>
          <h1>Destinations Management</h1>
          <p>Create destinations, review fixed routes, and link rooms.</p>
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

    <div class="create-bar">
    <button type="button" :disabled="!!addDisabledReason" :aria-describedby="addDisabledReason ? 'add-destination-help' : undefined" @click="openEditor()">Add Destination</button>
    <p v-if="addDisabledReason" id="add-destination-help" class="muted">{{ addDisabledReason }} <router-link v-if="!loading && !error && !editor && rooms.length === 0" :to="{ name: 'rooms' }">Open Rooms</router-link></p>
    </div>
    <DestinationEditor v-if="editor" :rooms="editor.destination ? rooms : unlinked" :buildings="buildingList" :destination="editor.destination" :initial-room="editor.roomId" @close="editor = null" @saved="onSaved" />
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
      <div v-else class="table-wrap data-table destination-table">
        <table>
          <thead>
            <tr><th class="actions-heading">Actions</th><th>Destination</th><th>Fixed Route</th><th>Linked Room</th><th>Mobile App Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="destination in filteredDestinations" :key="destination.id" :class="{ expanded: expandedDestinations.has(destination.id) }" data-test="destination-row">
              <td class="actions" data-label="Actions">
                <div class="action-row">
                <button type="button" class="secondary small" :disabled="busyId !== null || !!editor" @click="openEditor(destination)">Edit / Record route</button>
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
              <td data-label="Destination">
                <div class="with-icon">
                  <span class="row-icon blue" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 21V5l8-2 8 2v16h-6v-5H10v5H4z"/></svg>
                  </span>
                  <div>
                    <strong class="name-cell desktop-destination-name">{{ destination.name }}</strong>
                    <button class="destination-toggle" type="button" :aria-expanded="expandedDestinations.has(destination.id)" @click="toggleDestination(destination.id)">
                      <span>{{ destination.name }}</span>
                      <span class="expand-chevron" aria-hidden="true">⌄</span>
                    </button>
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
              <td data-label="Linked Room" class="linked-room-cell">
                <div class="room-select-field">
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
                <svg class="room-select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </div>
              </td>
              <td data-label="Mobile App Status">
                <span class="badge" :class="isVisible(visibility(destination)) ? 'ok' : 'warn'" data-test="visibility">
                  <svg v-if="isVisible(visibility(destination))" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 6l14 13"/></svg>
                  {{ isVisible(visibility(destination)) ? 'Shown' : 'Hidden' }}
                </span>
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
                <td><button type="button" :disabled="!!editor || busyId !== null" @click="openEditor(undefined, room.id)">Add Destination</button></td>
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
import DestinationEditor from '@/components/DestinationEditor.vue';
import { validatedRoute } from '@/lib/route-editor';
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
const editor = ref<{ destination?: DestinationRecord; roomId?: string } | null>(null);
function openEditor(destination?: DestinationRecord, roomId?: string) { editor.value = { destination, roomId }; }
function onSaved(saved: DestinationRecord) {
  if (destinations.value.some(d => d.id === saved.id)) replace(saved);
  else { destinations.value.push(saved); selection[saved.id] = saved.room_id ?? ''; }
  editor.value = null;
  notice.value = 'Saved as an inactive draft. Verify the actual route before turning it on.';
}
const search = ref('');
const expandedDestinations = ref(new Set<string>());
function toggleDestination(id: string) {
  const next = new Set(expandedDestinations.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedDestinations.value = next;
}
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
const addDisabledReason = computed(() => {
  if (loading.value) return 'Wait for campus records to finish loading.';
  if (error.value && rooms.value.length === 0) return 'Campus records could not be loaded. Resolve the error above and reload this page.';
  if (busyId.value !== null) return 'Wait for the current destination change to finish.';
  if (editor.value) return 'A destination editor is already open below. Save or close it before adding another destination.';
  if (rooms.value.length === 0) return 'Add a room first. Each new destination must be linked to an existing room.';
  if (unlinked.value.length === 0) return 'Every room already has a destination. Add another room, or use Edit / Record route for an existing destination.';
  return '';
});

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
  if (!destination.is_active) {
    try {
      validatedRoute((destination.indoor_route ?? []).map(s => ({ direction: String(s.direction), distance: Number(s.distance) })));
    } catch (err) { error.value = (err as Error).message; return; }
    if (!window.confirm('Have you verified this route on site? Turning it on requires a published linked room and building for catalog visibility.')) return;
  }
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
.dest-head .title-row > div { display: block; }
.dest-head h1 { margin-bottom: 5px; }
.dest-summary { align-items: center; }
.dest-count.card { padding: 16px; min-width: 190px; }
.dest-hidden { background: #fff8e8; border-color: #f1dfb6; color: #886019; font-size: 12px; line-height: 1.6; padding: 12px 16px; overflow-wrap: anywhere; }
.create-bar { display: flex; align-items: center; gap: 16px; margin: 16px 0; }
.create-bar > button { flex: 0 0 auto; min-height: 44px; font-size: 13px; }
.create-bar > p { margin: 0; max-width: 660px; font-size: 12px; line-height: 1.6; }
.dest-panel { padding: 20px; border-radius: 16px; }
.panel-bar { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(180px, 360px) 110px; gap: 12px; margin-bottom: 18px; }
.panel-bar h2 { font-size: 16px; }
.panel-bar .search-field { width: 100%; margin: 0; }
.panel-bar select { width: 100%; min-width: 0; }
.destination-table { overflow-x: auto; border-radius: 10px; box-shadow: none; }
.destination-table table { min-width: 900px; }
.destination-table th { background: #f1f5fa; border-color: #e3eaf3; color: #687d95; font-size: 10px; letter-spacing: .06em; padding: 12px; }
.destination-table td { padding: 15px 12px; font-size: 13px; }
.destination-table .sub { font-size: 11px; margin-top: 4px; color: #7d8da2; overflow-wrap: anywhere; }
.destination-table .name-cell { font-size: 14px; }
.destination-table .row-icon { width: 34px; height: 34px; border-radius: 10px; }
.destination-table td select { width: 100%; min-height: 40px; max-width: 240px; }
.action-row { flex-wrap: wrap; }
.action-row button { min-height: 38px; font-size: 11px; }
.action-row button:first-child { background: #edf4ff; border-color: #d8e6fc; color: #215ec0; }
@media (max-width: 1100px) {
  .panel-bar { grid-template-columns: minmax(0, 1fr) 110px; }
  .panel-bar h2 { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
  .dest-head { margin-bottom: 16px; }
  .dest-head h1 { font-size: 18px; }
  .dest-head p { line-height: 1.5; }
  .dest-summary { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .dest-count.card { border-radius: 12px; }
  .dest-hidden { min-width: 0; padding: 10px 12px; }
  .create-bar { display: grid; gap: 8px; margin: 14px 0 18px; }
  .create-bar > button { justify-self: start; }
  .create-bar > p { font-size: 11px; }
  .dest-panel { padding: 14px; border-radius: 14px; }
  .panel-bar { grid-template-columns: minmax(0, 1fr) 86px; gap: 10px; margin-bottom: 14px; }
  .panel-bar h2 { font-size: 16px; }
  .panel-bar .search-field { padding: 0 9px; }
  .panel-bar input, .panel-bar select { font-size: 14px; }
  .destination-table { overflow: visible; border-radius: 0; }
  .destination-table table { min-width: 0; }
  .destination-table tbody { display: grid; gap: 14px; }
  .destination-table tbody tr { margin: 0; border: 1px solid #dfe7f1; border-radius: 12px; box-shadow: 0 3px 10px #153d7310; }
  .destination-table td { display: flex; align-items: center; text-align: left; gap: 10px; padding: 12px; border-bottom: 1px solid #edf1f6; }
  .destination-table td::before { flex: 0 0 88px; font-size: 9px; letter-spacing: .03em; }
  .destination-table td[data-label="Destination"] { padding: 16px 12px; background: #f8fbff; }
  .destination-table td[data-label="Destination"]::before { display: none; }
  .destination-table td[data-label="Destination"] .with-icon { align-items: flex-start; width: 100%; gap: 10px; }
  .destination-table .with-icon > div { min-width: 0; }
  .destination-table .name-cell { display: block; font-size: 15px; }
  .destination-table .sub { line-height: 1.5; }
  .destination-table .route { font-size: 12px; white-space: normal; }
  .destination-table td select { min-width: 0; max-width: none; flex: 1; width: 0; font-size: 16px; min-height: 44px; }
  .dest-panel .destination-table td.actions { display: block; padding: 12px; }
  .destination-table td.actions::before { display: none; }
  .action-row { display: grid; grid-template-columns: 1fr 1fr; width: 100%; gap: 8px; }
  .action-row button { margin: 0; min-width: 0; min-height: 44px; justify-content: center; font-size: 11px; padding: 8px; white-space: normal; }
  .action-row button:first-child { grid-column: 1 / -1; }
  .dest-panel > .muted { font-size: 12px; line-height: 1.6; }
}

.destination-table .actions-heading, .dest-panel .destination-table td.actions { text-align: left; }
.destination-table .action-row { justify-content: flex-start; }
@media (max-width: 640px) {
  .destination-table tbody tr { display: flex; flex-direction: column; }
  .dest-panel .destination-table td.actions { order: 1; border-top: 1px solid #edf1f6; border-bottom: 0; }
}
.create-bar > button { order: 2; margin-left: auto; }
.create-bar > p { order: 1; }
.room-select-field { position: relative; min-width: 140px; width: 100%; max-width: 240px; }
.destination-table .room-select-field select { max-width: none; }
.room-select-chevron { display: none; }
.destination-toggle { display: none; }
@media (max-width: 640px) {
  .create-bar > button { order: 0; justify-self: end; margin-left: 0; }
  .create-bar > p { order: 0; }
  .destination-table td.linked-room-cell { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 14px 12px; }
  .destination-table td.linked-room-cell::before { font-size: 10px; color: #5d738d; }
  .room-select-field { min-width: 0; max-width: none; }
  .destination-table .room-select-field select {
    display: block; appearance: none; -webkit-appearance: none;
    width: 100%; max-width: none; min-height: 48px; height: auto;
    padding: 12px 42px 12px 14px; margin: 0;
    border: 1px solid #cbd9ec; border-radius: 10px;
    background: #fff; color: #163a65; font-size: 16px; font-weight: 500;
    line-height: 1.4; box-shadow: 0 1px 3px #153d7308;
  }
  .destination-table .room-select-field select:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  .room-select-chevron { display: block; position: absolute; right: 13px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; color: #53779e; pointer-events: none; }
  .destination-table .room-select-field select:disabled { background: #f0f4f9; color: #7a8ca1; opacity: 1; }
  .destination-table .desktop-destination-name { display: none; }
  .destination-table td[data-label="Destination"] .with-icon > div { flex: 1; }
  .destination-table .destination-toggle {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    width: 100%; min-height: 44px; padding: 0; margin: -7px 0 0;
    background: transparent; border: 0; border-radius: 5px;
    color: #0f2744; text-align: left; font-size: 15px; font-weight: 700;
  }
  .destination-toggle:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
  .expand-chevron { font-size: 22px; color: #6480a0; transition: transform .15s ease; }
  .expanded .expand-chevron { transform: rotate(180deg); }
  .destination-table tbody tr:not(.expanded) > td:not([data-label="Destination"]) { display: none; }
  .destination-table tbody tr:not(.expanded) > td[data-label="Destination"] { border-bottom: 0; }
}

@media (max-width: 640px) {
  .dest-summary { grid-template-columns: 105px minmax(0,1fr); align-items: stretch; gap: 8px; margin-bottom: 12px; }
  .dest-summary .dest-count.card { min-width: 0; width: 100%; padding: 10px; flex-direction: column; align-items: flex-start; gap: 6px; border-radius: 12px; }
  .dest-count .stat-icon { width: 26px; height: 26px; border-radius: 8px; }
  .dest-count .stat-icon svg { width: 15px; height: 15px; }
  .dest-count strong { font-size: 22px; }
  .dest-count > div > span { font-size: 10px; line-height: 1.4; }
  .dest-summary .dest-hidden { width: auto; min-width: 0; padding: 10px; font-size: 10px; line-height: 1.6; border-radius: 12px; }
  .create-bar { margin: 10px 0 14px; gap: 6px; }
  .create-bar > p { font-size: 10px; line-height: 1.5; }
  .create-bar > button { font-size: 12px; padding: 8px 12px; }
  .destination-table td[data-label="Destination"] { padding: 12px; }
  .destination-table .sub { font-size: 10px; margin-top: 0; }
  .destination-table .destination-toggle { font-size: 14px; }
}
</style>
