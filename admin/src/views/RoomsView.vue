<template>
  <div>
    <header class="page-header catalog-head">
      <div class="title-row">
        <span class="page-mark" aria-hidden="true"><img class="page-brand-logo" src="/images/1locate-logo.png" alt="" />
        </span>
        <div>
          <h1>Rooms Management</h1>
          <p>Manage campus rooms and their locations. A room appears in the app after it is linked to a destination.</p>
        </div>
      </div>
    </header>

    <div class="mini-stats">
      <article class="stat card tone-blue">
        <span class="stat-icon" style="color:#1d4ed8" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 11 12 4l9 7v9h-6v-6H9v6H3v-9z"/></svg></span>
        <div><strong>{{ rooms.length }}</strong><span>Total Rooms</span></div>
      </article>
      <article class="stat card tone-green">
        <span class="stat-icon" style="color:#16a34a" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></span>
        <div><strong>{{ publishedRooms }}</strong><span>Published</span></div>
      </article>
      <article class="stat card tone-slate">
        <span class="stat-icon" style="color:#475569" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5C20.3 10.7 17 6.5 12 6.5z"/><path stroke="currentColor" stroke-width="1.8" d="M5 6l14 13"/></svg></span>
        <div><strong>{{ rooms.length - publishedRooms }}</strong><span>Unpublished</span></div>
      </article>
    </div>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>
    <p v-if="!loading && buildings.length === 0" class="notice">Add a building first.</p>

    <div class="add-row">
      <button type="button" data-test="new-room" :disabled="buildings.length === 0" @click="openCreate">+ Add Room</button>
    </div>
    <div class="toolbar list-toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 1 0 3.7 10.7l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>
        <input v-model="filters.search" type="search" placeholder="Search name or room number" aria-label="Search rooms" data-test="search" />
      </label>
      <select v-model="filters.buildingId" aria-label="Filter by building" data-test="filter-building">
        <option value="">All buildings</option>
        <option v-for="building in buildings" :key="building.id" :value="building.id">{{ building.name }}</option>
      </select>
      <select v-model="filters.floorId" aria-label="Filter by floor" :disabled="!filters.buildingId" data-test="filter-floor">
        <option value="">All floors</option>
        <option v-for="floor in floorsOf(filters.buildingId)" :key="floor.id" :value="floor.id">{{ floor.name }}</option>
      </select>
      <select v-model="filters.type" aria-label="Filter by type" data-test="filter-type">
        <option value="">All types</option>
        <option v-for="type in ROOM_TYPES" :key="type" :value="type">{{ ROOM_TYPE_LABELS[type] }}</option>
      </select>
      <select v-model="filters.status" aria-label="Filter by status">
        <option value="">Any status</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
      </select>
    </div>

    <p v-if="loading" class="muted">Loading rooms...</p>
    <div v-else-if="filtered.length === 0" class="table-wrap">
      <p class="empty" data-test="empty">{{ rooms.length === 0 ? 'No rooms yet.' : 'No rooms match the filters.' }}</p>
    </div>
    <div v-else class="table-wrap data-table">
      <table>
        <thead>
          <tr><th>Name</th><th>Room no.</th><th>Type</th><th>Building / Floor</th><th>Status</th><th>Navigation</th><th class="actions-head">Actions</th></tr>
        </thead>
        <tbody>
          <tr v-for="room in filtered" :key="room.id" data-test="room-row">
            <td class="name-cell" data-label="Name">{{ room.name }}</td>
            <td data-label="Room no.">{{ room.room_number ?? '—' }}</td>
            <td data-label="Type">{{ ROOM_TYPE_LABELS[room.type] }}</td>
            <td data-label="Building / Floor">{{ buildingName(room.building_id) }}<br /><span class="muted">{{ floorName(room.floor_id) }}</span></td>
            <td data-label="Status"><span class="badge" :class="room.is_active ? 'ok' : 'off'">{{ room.is_active ? 'Published' : 'Draft' }}</span></td>
            <td data-label="Navigation">
              <span v-if="linkedDestination(room.id)" class="badge ok">Linked: {{ linkedDestination(room.id) }}</span>
              <span v-else class="badge warn" data-test="not-navigable">Not yet available for navigation</span>
            </td>
            <td class="actions" data-label="Actions">
              <button class="ghost small icon-btn" type="button" aria-label="Edit" title="Edit" @click="openEdit(room)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.2V21h3.8l11-11-3.8-3.8-11 11zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z"/></svg>
              </button>
              <button class="ghost small icon-btn" type="button" :class="{ 'is-hidden': !room.is_active }" :disabled="busy" :aria-label="room.is_active ? 'Unpublish' : 'Publish'" :title="room.is_active ? 'Shown. Click to hide.' : 'Hidden. Click to show.'" @click="togglePublished(room)">
                <svg v-if="room.is_active" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 6l14 13"/></svg>
              </button>
              <button class="ghost small error icon-btn" type="button" :disabled="busy" aria-label="Delete" title="Delete" @click="askDelete(room)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"/></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="overlay" role="dialog" aria-modal="true" aria-label="Room form">
      <div class="dialog room-dialog">
        <div class="dialog-title">
          <div>
            <h2>{{ editing.id ? 'Edit Room' : 'Add Room' }}</h2>
            <p class="muted">{{ editing.id ? 'Update this room.' : 'Add a room to a building.' }}</p>
          </div>
          <button class="ghost icon-btn" type="button" aria-label="Close" :disabled="saving" @click="editing = null">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>
          </button>
        </div>
        <form novalidate data-test="room-form" @submit.prevent="onSave">
          <p v-if="formError" class="notice error" role="alert" data-test="form-error">{{ formError }}</p>
          <div class="form-grid">
            <FormField v-slot="{ id }" name="buildingId" label="Building" :error="errors.buildingId" required>
              <select :id="id" v-model="form.buildingId" data-test="room-building" @change="onBuildingChange">
                <option value="" disabled>Choose a building</option>
                <option v-for="building in buildings" :key="building.id" :value="building.id">{{ building.name }}</option>
              </select>
            </FormField>
            <FormField v-slot="{ id }" name="floorId" label="Floor" :error="errors.floorId" hint="Optional. Only floors of the selected building.">
              <select :id="id" v-model="form.floorId" :disabled="!form.buildingId" data-test="room-floor">
                <option value="">No floor</option>
                <option v-for="floor in floorsOf(form.buildingId)" :key="floor.id" :value="floor.id">{{ floor.name }} (level {{ floor.level }})</option>
              </select>
            </FormField>
            <FormField v-slot="{ id }" name="name" label="Name" :error="errors.name" required>
              <input :id="id" v-model="form.name" maxlength="120" data-test="room-name" />
            </FormField>
            <FormField v-slot="{ id }" name="roomNumber" label="Room number" :error="errors.roomNumber" hint="Optional. Unique within the building.">
              <input :id="id" v-model="form.roomNumber" maxlength="20" />
            </FormField>
            <FormField v-slot="{ id }" name="type" label="Type" :error="errors.type" required>
              <select :id="id" v-model="form.type">
                <option v-for="type in ROOM_TYPES" :key="type" :value="type">{{ ROOM_TYPE_LABELS[type] }}</option>
              </select>
            </FormField>
            <FormField v-slot="{ id }" name="sortOrder" label="Display order" :error="errors.sortOrder">
              <input :id="id" v-model="form.sortOrder" inputmode="numeric" />
            </FormField>
            <FormField v-slot="{ id }" name="description" label="Description" :error="errors.description" hint="Services, office hours, or other verified details." full>
              <textarea :id="id" v-model="form.description" maxlength="2000" />
            </FormField>
            <div class="field">
              <label class="checkbox"><input v-model="form.isActive" type="checkbox" /> Published</label>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" :disabled="saving" data-test="save">{{ saving ? 'Saving...' : 'Save Room' }}</button>
          </div>
        </form>
        <PhotoManager v-if="editing.id" kind="room" :parent-id="editing.id" />
        <p v-else class="muted section">Save the room first, then add photos.</p>
      </div>
    </div>

    <ConfirmDialog
      v-if="pendingDelete"
      :title="blockers ? 'Cannot delete yet' : 'Delete room?'"
      :confirm-label="blockers ? 'OK' : 'Delete room'"
      :danger="!blockers"
      :busy="busy || checkingDelete"
      @cancel="closeDelete"
      @confirm="blockers ? closeDelete() : onDelete()"
    >
      <p v-if="checkingDelete">Checking linked records...</p>
      <p v-else-if="blockers">
        <strong>{{ pendingDelete.name }}</strong> still has {{ blockers.photos }} photo(s). Delete them in Edit → Photos first,
        or use Unpublish to hide the room.
      </p>
      <div v-else>
        <p>Delete <strong>{{ pendingDelete.name }}</strong>? This cannot be undone.</p>
        <p v-if="unlinkedOnDelete.length" class="notice warn">
          Linked destination {{ unlinkedOnDelete.join(', ') }} will be unlinked and keep its fixed route.
        </p>
      </div>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, reactive, ref, watch } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FormField from '@/components/FormField.vue';
import PhotoManager from '@/components/PhotoManager.vue';
import { describeError } from '@/lib/errors';
import { emptyRoomForm, validateRoom, type FieldErrors, type RoomForm } from '@/lib/validation';
import {
  createRoom,
  deleteRoom,
  listBuildings,
  listDestinations,
  listFloors,
  listRooms,
  roomDependents,
  updateRoom,
} from '@/services/campus';
import { ROOM_TYPES, ROOM_TYPE_LABELS, type Building, type DestinationRecord, type Floor, type Room } from '@/types';

const buildings = ref<Building[]>([]);
const floors = ref<Floor[]>([]);
const rooms = ref<Room[]>([]);
const publishedRooms = computed(() => rooms.value.filter((room) => room.is_active).length);
const destinations = ref<DestinationRecord[]>([]);
const loading = ref(true);
const busy = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const filters = reactive({ search: '', buildingId: '', floorId: '', type: '', status: '' });

const editing = ref<{ id: string | null } | null>(null);
const form = ref<RoomForm>(emptyRoomForm());
const errors = ref<FieldErrors<RoomForm>>({});
const formError = ref('');

const pendingDelete = ref<Room | null>(null);
const blockers = ref<{ photos: number } | null>(null);
const unlinkedOnDelete = ref<string[]>([]);
const checkingDelete = ref(false);

const buildingNames = computed(() => new Map(buildings.value.map((item) => [item.id, item.name])));
const floorNames = computed(() => new Map(floors.value.map((item) => [item.id, item.name])));
const linkedNames = computed(() => new Map(
  destinations.value.filter((item) => item.room_id).map((item) => [item.room_id as string, item.name]),
));

function buildingName(id: string) { return buildingNames.value.get(id) ?? 'Unknown building'; }
function floorName(id: string | null) { return id ? floorNames.value.get(id) ?? 'Unknown floor' : 'No floor'; }
function linkedDestination(roomId: string) { return linkedNames.value.get(roomId) ?? null; }
function floorsOf(buildingId: string) {
  return floors.value.filter((floor) => floor.building_id === buildingId).sort((a, b) => a.level - b.level);
}

watch(() => filters.buildingId, () => { filters.floorId = ''; });

const filtered = computed(() => {
  const needle = filters.search.trim().toLowerCase();
  return rooms.value.filter((room) => (
    (!needle || room.name.toLowerCase().includes(needle) || (room.room_number ?? '').toLowerCase().includes(needle))
    && (!filters.buildingId || room.building_id === filters.buildingId)
    && (!filters.floorId || room.floor_id === filters.floorId)
    && (!filters.type || room.type === filters.type)
    && (!filters.status || (filters.status === 'published') === room.is_active)
  ));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [buildings.value, floors.value, rooms.value, destinations.value] = await Promise.all([
      listBuildings(), listFloors(), listRooms(), listDestinations(),
    ]);
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

function toForm(room: Room): RoomForm {
  return {
    buildingId: room.building_id,
    floorId: room.floor_id ?? '',
    name: room.name,
    roomNumber: room.room_number ?? '',
    type: room.type,
    description: room.description ?? '',
    sortOrder: String(room.sort_order),
    isActive: room.is_active,
  };
}

function openCreate() {
  form.value = { ...emptyRoomForm(), buildingId: filters.buildingId, floorId: filters.floorId };
  errors.value = {};
  formError.value = '';
  editing.value = { id: null };
}

function openEdit(room: Room) {
  form.value = toForm(room);
  errors.value = {};
  formError.value = '';
  editing.value = { id: room.id };
}

function onBuildingChange() {
  if (!floorsOf(form.value.buildingId).some((floor) => floor.id === form.value.floorId)) form.value.floorId = '';
}

function replace(room: Room) {
  const index = rooms.value.findIndex((item) => item.id === room.id);
  if (index >= 0) rooms.value.splice(index, 1, room);
  else rooms.value.push(room);
}

async function onSave() {
  formError.value = '';
  const result = validateRoom(form.value, floors.value);
  if (!result.ok) {
    errors.value = result.errors;
    return;
  }
  errors.value = {};
  saving.value = true;
  try {
    const id = editing.value?.id;
    const saved = id ? await updateRoom(id, result.value) : await createRoom(result.value);
    replace(saved);
    notice.value = id ? `Saved ${saved.name}.` : `Created ${saved.name}. Link it to a destination to make it navigable.`;
    editing.value = { id: saved.id };
    form.value = toForm(saved);
  } catch (err) {
    formError.value = describeError(err);
  } finally {
    saving.value = false;
  }
}

async function togglePublished(room: Room) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const saved = await updateRoom(room.id, { is_active: !room.is_active });
    replace(saved);
    notice.value = saved.is_active ? `${saved.name} is published.` : `${saved.name} is hidden from the app.`;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
  }
}

async function askDelete(room: Room) {
  pendingDelete.value = room;
  blockers.value = null;
  unlinkedOnDelete.value = [];
  checkingDelete.value = true;
  try {
    const dependents = await roomDependents(room.id);
    blockers.value = dependents.photos > 0 ? { photos: dependents.photos } : null;
    unlinkedOnDelete.value = dependents.destinations;
  } catch (err) {
    error.value = describeError(err);
    pendingDelete.value = null;
  } finally {
    checkingDelete.value = false;
  }
}

function closeDelete() {
  pendingDelete.value = null;
  blockers.value = null;
}

async function onDelete() {
  const room = pendingDelete.value;
  if (!room) return;
  busy.value = true;
  error.value = '';
  try {
    await deleteRoom(room.id);
    rooms.value = rooms.value.filter((item) => item.id !== room.id);
    destinations.value = destinations.value.map((item) => (item.room_id === room.id ? { ...item, room_id: null } : item));
    notice.value = `Deleted ${room.name}.`;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
    closeDelete();
  }
}

const page = getCurrentInstance();
onMounted(async () => {
  await load();
  const create = page?.appContext.config.globalProperties.$route?.query?.create;
  if (create === '1' && buildings.value.length > 0) openCreate();
});
</script>
