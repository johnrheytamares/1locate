<template>
  <div>
    <header class="page-header catalog-head">
      <div class="title-row">
        <span class="page-mark" aria-hidden="true"><img class="page-brand-logo" src="/images/1locate-logo.png" alt="" />
        </span>
        <div>
          <h1>Floors Management</h1>
          <p>Manage floors for each building. Floors show in the app while their building is published.</p>
        </div>
      </div>
    </header>

    <div class="mini-stats">
      <article class="stat card tone-blue">
        <span class="stat-icon" style="color:#1d4ed8" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h16v3H4V5zm0 5.5h16v3H4v-3zM4 16h16v3H4v-3z"/></svg></span>
        <div><strong>{{ floors.length }}</strong><span>Total Floors</span></div>
      </article>
    </div>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok">{{ notice }}</p>
    <p v-if="!loading && buildings.length === 0" class="notice">Add a building first, then its floors.</p>

    <div class="toolbar list-toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 1 0 3.7 10.7l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>
        <input v-model="search" type="search" placeholder="Search floor name" aria-label="Search floors" />
      </label>
      <select v-model="buildingFilter" aria-label="Filter by building" data-test="building-filter">
        <option value="">All buildings</option>
        <option v-for="building in buildings" :key="building.id" :value="building.id">{{ building.name }}</option>
      </select>
      <button type="button" data-test="new-floor" :disabled="buildings.length === 0" @click="openCreate">+ Add Floor</button>
    </div>

    <p v-if="loading" class="muted">Loading floors...</p>
    <div v-else-if="filtered.length === 0" class="table-wrap">
      <p class="empty" data-test="empty">{{ floors.length === 0 ? 'No floors yet.' : 'No floors match the filters.' }}</p>
    </div>
    <div v-else class="table-wrap data-table">
      <table>
        <thead>
          <tr><th>Building</th><th>Level</th><th>Name</th><th class="actions-head">Actions</th></tr>
        </thead>
        <tbody>
          <tr v-for="floor in filtered" :key="floor.id" data-test="floor-row">
            <td data-label="Building">{{ buildingName(floor.building_id) }}</td>
            <td data-label="Level">{{ floor.level }}</td>
            <td class="name-cell" data-label="Name">{{ floor.name }}</td>
            <td class="actions" data-label="Actions">
              <button class="ghost small icon-btn" type="button" aria-label="Edit" title="Edit" @click="openEdit(floor)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.2V21h3.8l11-11-3.8-3.8-11 11zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z"/></svg>
              </button>
              <button class="ghost small error icon-btn" type="button" :disabled="busy" aria-label="Delete" title="Delete" @click="askDelete(floor)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"/></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="overlay" role="dialog" aria-modal="true" aria-label="Floor form">
      <form class="dialog small" novalidate data-test="floor-form" @submit.prevent="onSave">
        <div class="dialog-title">
          <div>
            <h2>{{ editing.id ? 'Edit Floor' : 'Add Floor' }}</h2>
            <p class="muted">{{ editing.id ? 'Update this floor.' : 'Add a floor to a building.' }}</p>
          </div>
          <button class="ghost icon-btn" type="button" aria-label="Close" @click="editing = null">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>
          </button>
        </div>
        <p v-if="formError" class="notice error" role="alert">{{ formError }}</p>
        <div class="form-grid">
          <FormField v-slot="{ id }" name="buildingId" label="Building" :error="errors.buildingId" required full>
            <select :id="id" v-model="form.buildingId">
              <option value="" disabled>Choose a building</option>
              <option v-for="building in buildings" :key="building.id" :value="building.id">{{ building.name }}</option>
            </select>
          </FormField>
          <FormField v-slot="{ id }" name="level" label="Level" :error="errors.level" hint="Ground floor is usually 1. Use -5 to 200." required>
            <input :id="id" v-model="form.level" inputmode="numeric" />
          </FormField>
          <FormField v-slot="{ id }" name="name" label="Floor name" :error="errors.name" hint="Example: Ground Floor" required>
            <input :id="id" v-model="form.name" maxlength="60" />
          </FormField>
        </div>
        <div class="form-actions">
          <button type="submit" :disabled="saving">{{ saving ? 'Saving...' : 'Save Floor' }}</button>
        </div>
      </form>
    </div>

    <ConfirmDialog
      v-if="pendingDelete"
      :title="blockers ? 'Cannot delete yet' : 'Delete floor?'"
      :confirm-label="blockers ? 'OK' : 'Delete floor'"
      :danger="!blockers"
      :busy="busy || checkingDelete"
      @cancel="closeDelete"
      @confirm="blockers ? closeDelete() : onDelete()"
    >
      <p v-if="checkingDelete">Checking linked records...</p>
      <div v-else-if="blockers">
        <p><strong>{{ pendingDelete.name }}</strong> still has:</p>
        <ul>
          <li v-if="blockers.rooms">{{ blockers.rooms }} room(s) or office(s): move them to another floor or delete them on the Rooms page</li>
          <li v-if="blockers.floorMaps">{{ blockers.floorMaps }} floor map(s): remove them in Supabase (floor-map tools come later)</li>
        </ul>
      </div>
      <p v-else>Delete <strong>{{ pendingDelete.name }}</strong> of {{ buildingName(pendingDelete.building_id) }}?</p>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FormField from '@/components/FormField.vue';
import { describeError } from '@/lib/errors';
import { validateFloor, type FieldErrors, type FloorForm } from '@/lib/validation';
import {
  createFloor,
  deleteFloor,
  floorDependents,
  listBuildings,
  listFloors,
  updateFloor,
  type FloorDependents,
} from '@/services/campus';
import type { Building, Floor } from '@/types';

const buildings = ref<Building[]>([]);
const floors = ref<Floor[]>([]);
const loading = ref(true);
const busy = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const search = ref('');
const buildingFilter = ref('');

const editing = ref<{ id: string | null } | null>(null);
const form = ref<FloorForm>({ buildingId: '', level: '', name: '' });
const errors = ref<FieldErrors<FloorForm>>({});
const formError = ref('');

const pendingDelete = ref<Floor | null>(null);
const blockers = ref<FloorDependents | null>(null);
const checkingDelete = ref(false);

const buildingNames = computed(() => new Map(buildings.value.map((item) => [item.id, item.name])));

function buildingName(id: string): string {
  return buildingNames.value.get(id) ?? 'Unknown building';
}

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return floors.value
    .filter((floor) => !buildingFilter.value || floor.building_id === buildingFilter.value)
    .filter((floor) => !needle || floor.name.toLowerCase().includes(needle))
    .sort((a, b) => buildingName(a.building_id).localeCompare(buildingName(b.building_id)) || a.level - b.level);
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [buildings.value, floors.value] = await Promise.all([listBuildings(), listFloors()]);
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { buildingId: buildingFilter.value, level: '', name: '' };
  errors.value = {};
  formError.value = '';
  editing.value = { id: null };
}

function openEdit(floor: Floor) {
  form.value = { buildingId: floor.building_id, level: String(floor.level), name: floor.name };
  errors.value = {};
  formError.value = '';
  editing.value = { id: floor.id };
}

async function onSave() {
  formError.value = '';
  const result = validateFloor(form.value);
  if (!result.ok) {
    errors.value = result.errors;
    return;
  }
  errors.value = {};
  saving.value = true;
  try {
    const id = editing.value?.id;
    const saved = id ? await updateFloor(id, result.value) : await createFloor(result.value);
    const index = floors.value.findIndex((item) => item.id === saved.id);
    if (index >= 0) floors.value.splice(index, 1, saved);
    else floors.value.push(saved);
    notice.value = `Saved ${saved.name}.`;
    editing.value = null;
  } catch (err) {
    formError.value = describeError(err);
  } finally {
    saving.value = false;
  }
}

async function askDelete(floor: Floor) {
  pendingDelete.value = floor;
  blockers.value = null;
  checkingDelete.value = true;
  try {
    const dependents = await floorDependents(floor.id);
    blockers.value = dependents.rooms + dependents.floorMaps > 0 ? dependents : null;
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
  const floor = pendingDelete.value;
  if (!floor) return;
  busy.value = true;
  error.value = '';
  try {
    await deleteFloor(floor.id);
    floors.value = floors.value.filter((item) => item.id !== floor.id);
    notice.value = `Deleted ${floor.name}.`;
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
