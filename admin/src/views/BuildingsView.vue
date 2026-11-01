<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Buildings</h1>
        <p>New buildings start unpublished. Publish a building when its details are verified.</p>
      </div>
      <button type="button" data-test="new-building" @click="openCreate">New building</button>
    </header>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>

    <div class="toolbar">
      <input v-model="search" type="search" placeholder="Search code or name" aria-label="Search buildings" data-test="search" />
    </div>

    <p v-if="loading" class="muted">Loading buildings...</p>
    <div v-else-if="filtered.length === 0" class="table-wrap">
      <p class="empty" data-test="empty">{{ buildings.length === 0 ? 'No buildings yet. Add the first one.' : 'No buildings match the search.' }}</p>
    </div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Entrance</th>
            <th>Radius</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="building in filtered" :key="building.id" data-test="building-row">
            <td class="mono">{{ building.code }}</td>
            <td>{{ building.name }}</td>
            <td>
              <span v-if="building.entrance_lat !== null">{{ building.entrance_lat }}, {{ building.entrance_lng }}</span>
              <span v-else class="badge warn">Not surveyed</span>
            </td>
            <td>{{ building.arrival_radius }} m</td>
            <td>
              <span class="badge" :class="building.is_active ? 'ok' : 'off'">{{ building.is_active ? 'Published' : 'Draft' }}</span>
            </td>
            <td class="actions">
              <button class="ghost small" type="button" @click="openEdit(building)">Edit</button>
              <button class="ghost small" type="button" :disabled="busy" data-test="toggle-publish" @click="togglePublished(building)">
                {{ building.is_active ? 'Unpublish' : 'Publish' }}
              </button>
              <button class="ghost small error" type="button" :disabled="busy" data-test="delete" @click="askDelete(building)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="overlay" role="dialog" aria-modal="true" aria-label="Building form">
      <div class="dialog">
      <form novalidate data-test="building-form" @submit.prevent="onSave">
        <h2>{{ editing.id ? 'Edit building' : 'New building' }}</h2>
        <p v-if="formError" class="notice error" role="alert" data-test="form-error">{{ formError }}</p>
        <div class="form-grid">
          <FormField v-slot="{ id }" name="code" label="Code" :error="errors.code" hint="Example: ADMIN. Letters, numbers, _ or -." required>
            <input :id="id" v-model="form.code" maxlength="20" data-test="code" />
          </FormField>
          <FormField v-slot="{ id }" name="name" label="Name" :error="errors.name" required>
            <input :id="id" v-model="form.name" maxlength="120" data-test="name" />
          </FormField>
          <FormField v-slot="{ id }" name="description" label="Description" :error="errors.description" full>
            <textarea :id="id" v-model="form.description" maxlength="2000" />
          </FormField>
          <FormField v-slot="{ id }" name="entranceName" label="Entrance name" :error="errors.entranceName" hint="Shown as the GPS target, e.g. Main Entrance.">
            <input :id="id" v-model="form.entranceName" maxlength="120" />
          </FormField>
          <FormField v-slot="{ id }" name="arrivalRadius" label="Arrival radius (meters)" :error="errors.arrivalRadius" required>
            <input :id="id" v-model="form.arrivalRadius" inputmode="decimal" data-test="arrival-radius" />
          </FormField>
          <FormField v-slot="{ id }" name="entranceLat" label="Entrance latitude" :error="errors.entranceLat" hint="Leave blank until surveyed.">
            <input :id="id" v-model="form.entranceLat" inputmode="decimal" data-test="lat" />
          </FormField>
          <FormField v-slot="{ id }" name="entranceLng" label="Entrance longitude" :error="errors.entranceLng" hint="Leave blank until surveyed.">
            <input :id="id" v-model="form.entranceLng" inputmode="decimal" data-test="lng" />
          </FormField>
          <FormField v-slot="{ id }" name="sortOrder" label="Display order" :error="errors.sortOrder">
            <input :id="id" v-model="form.sortOrder" inputmode="numeric" />
          </FormField>
          <div class="field">
            <label class="checkbox"><input v-model="form.isActive" type="checkbox" data-test="published" /> Published</label>
          </div>
        </div>
        <div class="form-actions">
          <button class="secondary" type="button" :disabled="saving" @click="closeForm">Close</button>
          <button type="submit" :disabled="saving" data-test="save">{{ saving ? 'Saving...' : 'Save' }}</button>
        </div>
      </form>
      <PhotoManager v-if="editing.id" kind="building" :parent-id="editing.id" />
      <p v-else class="muted section">Save the building first, then add photos.</p>
      </div>
    </div>

    <ConfirmDialog
      v-if="pendingDelete"
      :title="blockers ? 'Cannot delete yet' : 'Delete building?'"
      :confirm-label="blockers ? 'OK' : 'Delete building'"
      :danger="!blockers"
      :busy="busy || checkingDelete"
      @cancel="closeDelete"
      @confirm="blockers ? closeDelete() : onDelete()"
    >
      <p v-if="checkingDelete">Checking linked records...</p>
      <div v-else-if="blockers" data-test="delete-blocked">
        <p><strong>{{ pendingDelete.name }}</strong> still has:</p>
        <ul>
          <li v-if="blockers.floors">{{ blockers.floors }} floor(s): delete them on the Floors page</li>
          <li v-if="blockers.rooms">{{ blockers.rooms }} room(s) or office(s): delete or move them on the Rooms page</li>
          <li v-if="blockers.photos">{{ blockers.photos }} photo(s): delete them in Edit → Photos</li>
        </ul>
        <p class="muted">To hide it from the app without deleting, use Unpublish.</p>
      </div>
      <p v-else>Delete <strong>{{ pendingDelete.name }}</strong>? This cannot be undone.</p>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FormField from '@/components/FormField.vue';
import PhotoManager from '@/components/PhotoManager.vue';
import { describeError } from '@/lib/errors';
import { emptyBuildingForm, validateBuilding, type BuildingForm, type FieldErrors } from '@/lib/validation';
import {
  buildingDependents,
  createBuilding,
  deleteBuilding,
  listBuildings,
  updateBuilding,
  type BuildingDependents,
} from '@/services/campus';
import type { Building } from '@/types';

const buildings = ref<Building[]>([]);
const loading = ref(true);
const busy = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const search = ref('');

const editing = ref<{ id: string | null } | null>(null);
const form = ref<BuildingForm>(emptyBuildingForm());
const errors = ref<FieldErrors<BuildingForm>>({});
const formError = ref('');

const pendingDelete = ref<Building | null>(null);
const blockers = ref<BuildingDependents | null>(null);
const checkingDelete = ref(false);

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase();
  if (!needle) return buildings.value;
  return buildings.value.filter((item) => item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    buildings.value = await listBuildings();
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

function toForm(building: Building): BuildingForm {
  return {
    code: building.code,
    name: building.name,
    description: building.description ?? '',
    entranceName: building.entrance_name ?? '',
    entranceLat: building.entrance_lat === null ? '' : String(building.entrance_lat),
    entranceLng: building.entrance_lng === null ? '' : String(building.entrance_lng),
    arrivalRadius: String(building.arrival_radius),
    sortOrder: String(building.sort_order),
    isActive: building.is_active,
  };
}

function openCreate() {
  form.value = emptyBuildingForm();
  errors.value = {};
  formError.value = '';
  editing.value = { id: null };
}

function openEdit(building: Building) {
  form.value = toForm(building);
  errors.value = {};
  formError.value = '';
  editing.value = { id: building.id };
}

function closeForm() {
  editing.value = null;
}

function replace(building: Building) {
  const index = buildings.value.findIndex((item) => item.id === building.id);
  if (index >= 0) buildings.value.splice(index, 1, building);
  else buildings.value.push(building);
}

async function onSave() {
  formError.value = '';
  const result = validateBuilding(form.value);
  if (!result.ok) {
    errors.value = result.errors;
    return;
  }
  errors.value = {};
  saving.value = true;
  try {
    const id = editing.value?.id;
    const saved = id ? await updateBuilding(id, result.value) : await createBuilding(result.value);
    replace(saved);
    notice.value = id ? `Saved ${saved.name}.` : `Created ${saved.name}. You can add photos now.`;
    editing.value = { id: saved.id };
    form.value = toForm(saved);
  } catch (err) {
    formError.value = describeError(err);
  } finally {
    saving.value = false;
  }
}

async function togglePublished(building: Building) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const saved = await updateBuilding(building.id, { is_active: !building.is_active });
    replace(saved);
    notice.value = saved.is_active ? `${saved.name} is published.` : `${saved.name} is hidden from the app.`;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
  }
}

async function askDelete(building: Building) {
  pendingDelete.value = building;
  blockers.value = null;
  checkingDelete.value = true;
  try {
    const dependents = await buildingDependents(building.id);
    blockers.value = dependents.floors + dependents.rooms + dependents.photos > 0 ? dependents : null;
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
  const building = pendingDelete.value;
  if (!building) return;
  busy.value = true;
  error.value = '';
  try {
    await deleteBuilding(building.id);
    buildings.value = buildings.value.filter((item) => item.id !== building.id);
    notice.value = `Deleted ${building.name}.`;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
    closeDelete();
  }
}

onMounted(load);
</script>
