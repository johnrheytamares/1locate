<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Floors</h1>
        <p>Floors have no publish switch of their own. They show in the app while their building is published.</p>
      </div>
      <button type="button" data-test="new-floor" :disabled="buildings.length === 0" @click="openCreate">New floor</button>
    </header>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok">{{ notice }}</p>
    <p v-if="!loading && buildings.length === 0" class="notice">Add a building first, then its floors.</p>

    <div class="toolbar">
      <input v-model="search" type="search" placeholder="Search floor name" aria-label="Search floors" />
      <select v-model="buildingFilter" aria-label="Filter by building" data-test="building-filter">
        <option value="">All buildings</option>
        <option v-for="building in buildings" :key="building.id" :value="building.id">{{ building.name }}</option>
      </select>
    </div>

    <p v-if="loading" class="muted">Loading floors...</p>
    <div v-else-if="filtered.length === 0" class="table-wrap">
      <p class="empty" data-test="empty">{{ floors.length === 0 ? 'No floors yet.' : 'No floors match the filters.' }}</p>
    </div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr><th>Building</th><th>Level</th><th>Name</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="floor in filtered" :key="floor.id" data-test="floor-row">
            <td>{{ buildingName(floor.building_id) }}</td>
            <td>{{ floor.level }}</td>
            <td>{{ floor.name }}</td>
            <td class="actions">
              <button class="ghost small" type="button" @click="openEdit(floor)">Edit</button>
              <button class="ghost small error" type="button" :disabled="busy" @click="askDelete(floor)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="overlay" role="dialog" aria-modal="true" aria-label="Floor form">
      <form class="dialog small" novalidate data-test="floor-form" @submit.prevent="onSave">
        <h2>{{ editing.id ? 'Edit floor' : 'New floor' }}</h2>
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
          <button class="secondary" type="button" :disabled="saving" @click="editing = null">Cancel</button>
          <button type="submit" :disabled="saving">{{ saving ? 'Saving...' : 'Save' }}</button>
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
import { computed, onMounted, ref } from 'vue';
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

onMounted(load);
</script>
