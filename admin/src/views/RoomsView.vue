<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Rooms / Offices</h1>
        <p>A room appears in the mobile picker only after it is linked to a destination with a route.</p>
      </div>
      <button type="button" data-test="new-room" :disabled="buildings.length === 0" @click="openCreate">New room</button>
    </header>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>
    <p v-if="!loading && buildings.length === 0" class="notice">Add a building first.</p>

    <div class="toolbar">
      <input v-model="filters.search" type="search" placeholder="Search name or room number" aria-label="Search rooms" data-test="search" />
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
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Room no.</th><th>Type</th><th>Building / Floor</th><th>Status</th><th>Navigation</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="room in filtered" :key="room.id" data-test="room-row">
            <td>{{ room.name }}</td>
            <td>{{ room.room_number ?? '—' }}</td>
            <td>{{ ROOM_TYPE_LABELS[room.type] }}</td>
            <td>{{ buildingName(room.building_id) }}<br /><span class="muted">{{ floorName(room.floor_id) }}</span></td>
            <td><span class="badge" :class="room.is_active ? 'ok' : 'off'">{{ room.is_active ? 'Published' : 'Draft' }}</span></td>
            <td>
              <span v-if="linkedDestination(room.id)" class="badge ok">Linked: {{ linkedDestination(room.id) }}</span>
              <span v-else class="badge warn" data-test="not-navigable">Not yet available for navigation</span>
            </td>
            <td class="actions">
              <button class="ghost small" type="button" @click="openEdit(room)">Edit</button>
              <button class="ghost small" type="button" :disabled="busy" @click="togglePublished(room)">
                {{ room.is_active ? 'Unpublish' : 'Publish' }}
              </button>
              <button class="ghost small error" type="button" :disabled="busy" @click="askDelete(room)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="overlay" role="dialog" aria-modal="true" aria-label="Room form">
      <div class="dialog">
        <form novalidate data-test="room-form" @submit.prevent="onSave">
          <h2>{{ editing.id ? 'Edit room / office' : 'New room / office' }}</h2>
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
            <button class="secondary" type="button" :disabled="saving" @click="editing = null">Close</button>
            <button type="submit" :disabled="saving" data-test="save">{{ saving ? 'Saving...' : 'Save' }}</button>
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
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

onMounted(load);
</script>
