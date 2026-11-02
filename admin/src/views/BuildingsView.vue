<template>
  <div>
    <header class="page-header buildings-head">
      <div class="title-row">
        <span class="page-mark" aria-hidden="true"><img class="page-brand-logo" src="/images/1locate-logo.png" alt="" />
        </span>
        <div>
          <h1>Buildings Management</h1>
          <p>Manage campus buildings and information.</p>
        </div>
      </div>
    </header>

    <div class="stats building-stats">
      <article class="stat card tone-blue">
        <span class="stat-icon blue" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 21V5l8-2 8 2v16h-6v-5H10v5H4z"/></svg>
        </span>
        <div>
          <strong>{{ buildings.length }}</strong>
          <span>Total Buildings</span>
        </div>
      </article>
      <article class="stat card tone-green">
        <span class="stat-icon green" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
        </span>
        <div>
          <strong>{{ publishedCount }}</strong>
          <span>Published</span>
        </div>
      </article>
      <article class="stat card tone-slate">
        <span class="stat-icon slate" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5C20.3 10.7 17 6.5 12 6.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/><path stroke="currentColor" stroke-width="1.8" d="M5 6l14 13"/></svg>
        </span>
        <div>
          <strong>{{ buildings.length - publishedCount }}</strong>
          <span>Unpublished</span>
        </div>
      </article>
    </div>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>

    <div class="toolbar building-toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 1 0 3.7 10.7l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>
        <input v-model="search" type="search" placeholder="Search buildings..." aria-label="Search buildings" data-test="search" />
      </label>
      <button type="button" data-test="new-building" @click="openCreate">+ Add Building</button>
    </div>

    <p v-if="loading" class="muted">Loading buildings...</p>
    <div v-else-if="filtered.length === 0" class="table-wrap">
      <p class="empty" data-test="empty">{{ buildings.length === 0 ? 'No buildings yet. Add the first one.' : 'No buildings match the search.' }}</p>
    </div>
    <div v-else class="table-wrap building-table">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Entrance</th>
            <th>Radius</th>
            <th>Status</th>
            <th class="actions-head">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="building in filtered" :key="building.id" data-test="building-row">
            <td data-label="Code"><span class="code-pill">{{ building.code }}</span></td>
            <td class="name-cell" data-label="Name">{{ building.name }}</td>
            <td data-label="Entrance">
              <span v-if="building.entrance_lat !== null">{{ building.entrance_lat }}, {{ building.entrance_lng }}</span>
              <span v-else class="badge warn">Not surveyed</span>
            </td>
            <td data-label="Radius">{{ building.arrival_radius }} m</td>
            <td data-label="Status">
              <span class="badge" :class="building.is_active ? 'ok' : 'off'">{{ building.is_active ? 'Published' : 'Draft' }}</span>
            </td>
            <td class="actions" data-label="Actions">
              <button class="ghost small icon-btn" type="button" aria-label="Edit" title="Edit" @click="openEdit(building)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.2V21h3.8l11-11-3.8-3.8-11 11zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z"/></svg>
              </button>
              <button class="ghost small icon-btn" type="button" :class="{ 'is-hidden': !building.is_active }" :disabled="busy" data-test="toggle-publish" :aria-label="building.is_active ? 'Unpublish' : 'Publish'" :title="building.is_active ? 'Shown. Click to hide.' : 'Hidden. Click to show.'" @click="togglePublished(building)">
                <svg v-if="building.is_active" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 6l14 13"/></svg>
              </button>
              <button class="ghost small error icon-btn" type="button" :disabled="busy" data-test="delete" aria-label="Delete" title="Delete" @click="askDelete(building)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"/></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="overlay building-overlay" role="dialog" aria-modal="true" aria-label="Building form">
      <div class="dialog building-dialog" :class="{ 'with-photos': !!editing.id }">
      <form novalidate data-test="building-form" @submit.prevent="onSave">
        <div class="dialog-title">
          <div>
            <span class="form-eyebrow">CAMPUS MANAGEMENT</span>
            <h2>{{ editing.id ? 'Edit Building' : 'Add Building' }}</h2>
            <p class="muted">{{ editing.id ? 'Update this building.' : 'Add a new building to the campus.' }}</p>
          </div>
          <button class="ghost icon-btn" type="button" aria-label="Close" @click="closeForm">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>
          </button>
        </div>
        <p v-if="formError" class="notice error" role="alert" data-test="form-error">{{ formError }}</p>
        <div class="form-split">
        <div class="form-grid">
          <h3 class="form-section-title">Building details</h3>
          <FormField v-slot="{ id }" name="code" label="Code" :error="errors.code" hint="Example: ADMIN. Letters, numbers, _ or -." required>
            <input :id="id" v-model="form.code" maxlength="20" data-test="code" />
          </FormField>
          <FormField v-slot="{ id }" name="name" label="Name" :error="errors.name" required>
            <input :id="id" v-model="form.name" maxlength="120" data-test="name" />
          </FormField>
          <FormField v-slot="{ id }" name="description" label="Description" :error="errors.description" full>
            <textarea :id="id" v-model="form.description" maxlength="2000" />
          </FormField>
          <h3 class="form-section-title">Entrance & GPS <span>Use verified coordinates, or leave both blank.</span></h3>
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
          <h3 class="form-section-title">Publishing</h3>
          <FormField v-slot="{ id }" name="sortOrder" label="Display order" :error="errors.sortOrder">
            <input :id="id" v-model="form.sortOrder" inputmode="numeric" />
          </FormField>
          <div class="field">
            <label for="building-status">Status</label>
            <select id="building-status" v-model="form.isActive" data-test="published">
              <option :value="true">Published</option>
              <option :value="false">Unpublished</option>
            </select>
          </div>
        </div>
          <div v-if="editing.id" class="photo-col">
            <h3>Building photos</h3>
            <PhotoManager kind="building" :parent-id="editing.id" />
          </div>
        </div>
        <div class="form-actions">
          <p v-if="!editing.id" class="save-hint">You can add photos after saving.</p>
          <button class="secondary" type="button" :disabled="saving" @click="closeForm">Cancel</button>
          <button type="submit" :disabled="saving" data-test="save">{{ saving ? 'Saving...' : 'Save Building' }}</button>
        </div>
      </form>
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
import { computed, getCurrentInstance, onMounted, ref } from 'vue';
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
const initialQuery = getCurrentInstance()?.appContext.config.globalProperties.$route?.query?.q;
const search = ref(typeof initialQuery === 'string' ? initialQuery : '');

const editing = ref<{ id: string | null } | null>(null);
const form = ref<BuildingForm>(emptyBuildingForm());
const errors = ref<FieldErrors<BuildingForm>>({});
const formError = ref('');

const pendingDelete = ref<Building | null>(null);
const blockers = ref<BuildingDependents | null>(null);
const checkingDelete = ref(false);

const publishedCount = computed(() => buildings.value.filter((item) => item.is_active).length);
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

const page = getCurrentInstance();
onMounted(async () => {
  await load();
  const create = page?.appContext.config.globalProperties.$route?.query?.create;
  if (create === '1') openCreate();
});
</script>

<style scoped>
.building-toolbar {
  background: #eff6ff;
  border-color: #dbeafe;
}
.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 180px;
  min-width: 0;
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #bfdbfe;
  color: #64748b;
}
.search-field svg { width: 16px; height: 16px; flex: 0 0 auto; }
.search-field input {
  border: 0;
  height: 36px;
  padding: 0;
  background: transparent;
  outline: none;
  min-width: 0;
}
.search-field input:focus { outline: none; }
.buildings-head { justify-content: flex-start; }
.stat { display: flex; align-items: center; gap: 12px; }
.stat-icon {
  width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: 0 0 auto;
}
.stat-icon svg { width: 20px; height: 20px; }
.stat-icon.blue { background: #fff; color: #1d4ed8; }
.stat-icon.green { background: #fff; color: #16a34a; }
.stat-icon.slate { background: #fff; color: #475569; }
.tone-blue { background: #dbeafe; border-color: #bfdbfe; }
.tone-green { background: #dcfce7; border-color: #86efac; }
.tone-slate { background: #e2e8f0; border-color: #cbd5e1; }
.building-table {
  border: 0;
  border-radius: 18px;
  box-shadow: 0 10px 30px rgba(15, 39, 68, 0.06);
  overflow: hidden;
}
.building-table :deep(table) { border-collapse: separate; border-spacing: 0; }
.building-table :deep(th) {
  background: #dbeafe;
  color: #1e3a8a;
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 8px 12px;
  border-bottom: 1px solid #bfdbfe;
}
.building-table :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid #eef2f7;
  background: #fff;
}
.building-table :deep(tbody tr:hover td) { background: #f8fbff; }
.building-table :deep(tr:last-child td) { border-bottom: 0; }
.code-pill {
  display: inline-flex;
  align-items: center;
  min-width: 36px;
  padding: 4px 8px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.04em;
}
.name-cell { font-weight: 700; color: #0f2744; }
.building-table :deep(th.actions-head),
.building-table :deep(td.actions) { text-align: right; }
.building-table :deep(td.actions) { display: flex; justify-content: flex-end; gap: 6px; }
.icon-btn { width: 30px; height: 30px; padding: 0; }
.icon-btn.is-hidden { color: #94a3b8; background: #f1f5f9; border-color: #e2e8f0; }
.icon-btn svg { width: 16px; height: 16px; }
.dialog.building-dialog { width: min(720px, 100%); padding: 0; border-radius: 18px; max-height: calc(100dvh - 32px); }
.dialog.building-dialog.with-photos { width: min(1040px, 100%); }
.building-dialog .dialog-title { padding: 22px 24px 18px; margin: 0; border-bottom: 1px solid #e5ebf3; background: #f8fbff; }
.building-dialog .dialog-title h2 { font-size: 21px; margin: 5px 0; }
.form-eyebrow { font-size: 9px; letter-spacing: .12em; font-weight: 750; color: #67809c; }
.building-dialog .dialog-title .icon-btn { width: 36px; height: 36px; flex: 0 0 36px; }
.building-dialog .notice { margin: 16px 24px 0; }
.dialog-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.form-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 22px;
  align-items: start;
  margin: 0; padding: 20px 24px;
}
.with-photos .form-split { grid-template-columns: minmax(0, 1.5fr) minmax(250px, 1fr); }
.building-dialog .form-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px 16px; }
.form-section-title { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; font-size: 12px; color: #21466e; margin: 8px 0 0; padding-top: 14px; border-top: 1px solid #e8edf4; }
.form-section-title:first-child { padding: 0; margin: 0; border: 0; }
.form-section-title span { font-weight: 400; font-size: 10px; color: #7b8fa5; }
.building-dialog :deep(.field label) { font-size: 12px; }
.building-dialog :deep(.field .hint) { font-size: 10px; line-height: 1.5; }
.building-dialog input, .building-dialog select { height: 42px; padding: 9px 12px; font-size: 14px; border-radius: 9px; }
.building-dialog textarea { min-height: 72px; font-size: 14px; border-radius: 9px; }
.dialog-title { margin-bottom: 6px; }
.dialog-title p { margin: 0; font-size: 13px; }
.photo-col {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  background: #f8fafc;
}
.photo-col h3 { font-size: 13px; margin: 0 0 12px; }
.building-dialog .form-actions { position: sticky; bottom: 0; display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0; padding: 16px 24px; border-top: 1px solid #e5ebf3; background: #fff; z-index: 1; }
.building-dialog .form-actions button { min-height: 44px; font-size: 13px; padding: 10px 18px; }
.save-hint { margin: 0 auto 0 0; font-size: 11px; color: #70849a; }
.building-dialog :deep(.field), .photo-col { min-width: 0; }
.building-dialog input, .building-dialog select, .building-dialog textarea { max-width: 100%; min-width: 0; }
.building-dialog :deep(.hint), .building-dialog :deep(.field-error) { overflow-wrap: anywhere; }
@media (max-width: 800px) {
  .with-photos .form-split { grid-template-columns: 1fr; }
}
@media (max-width: 540px) {
  .building-overlay { padding: max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom)); }
  .dialog.building-dialog { max-height: calc(100dvh - max(8px, env(safe-area-inset-top)) - max(8px, env(safe-area-inset-bottom))); overscroll-behavior: contain; scroll-padding-bottom: 105px; }
  .building-dialog .dialog-title { position: sticky; top: 0; z-index: 2; }
  .building-dialog .dialog-title .icon-btn { width: 44px; height: 44px; min-height: 44px; flex-basis: 44px; }
  .building-dialog .dialog-title { padding: 18px 16px; }
  .building-dialog .dialog-title h2 { font-size: 19px; }
  .form-split { padding: 16px; }
  .building-dialog .form-grid { grid-template-columns: minmax(0,1fr); gap: 12px; }
  .building-dialog input, .building-dialog select, .building-dialog textarea { font-size: 16px; min-height: 44px; scroll-margin-top: 110px; scroll-margin-bottom: 110px; }
  .building-dialog .form-actions { padding: 12px 16px; }
  .save-hint { flex: 1 0 100%; }
  .building-dialog .form-actions button { flex: 1; }
  .photo-col { padding: 12px; }
  .photo-col :deep(.upload) { display: flex; flex-direction: column; align-items: stretch; }
  .photo-col :deep(input[type=file]) { width: 100%; font-size: 12px; }
}
@media (max-width: 899px) {
  .building-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-bottom: 12px; }
  .building-stats .stat.card { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; padding: 12px 10px; border-radius: 12px; }
  .building-stats .stat-icon { width: 28px; height: 28px; border-radius: 8px; flex: 0 0 auto; }
  .building-stats .stat-icon svg { width: 15px; height: 15px; }
  .building-stats .stat > div { min-width: 0; }
  .building-stats strong { display: block; font-size: 22px; line-height: 1.2; }
  .building-stats .stat > div > span { display: block; margin-top: 4px; font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
}
</style>
