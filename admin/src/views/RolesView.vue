<template>
  <div>
    <header class="page-header catalog-head">
      <div class="title-row">
        <span class="page-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8v-1c0-2.8 3.1-4.5 7-4.5s7 1.7 7 4.5v1H5z"/></svg>
        </span>
        <div>
          <h1>Roles Management</h1>
          <p>Admins manage campus content and roles. Editors manage campus content only. Nobody can change their own role.</p>
        </div>
      </div>
    </header>

    <div class="mini-stats role-stats">
      <article class="stat card tone-blue">
        <span class="stat-icon" style="color:#1d4ed8" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-6 1.2-6 3.5V19h8v-2.5c0-1.2.8-2.2 2-2.8A8 8 0 0 0 8 13zm8 0c-.3 0-.6 0-.9 0a4 4 0 0 1 2.4 3.5V19H22v-2.5c0-2.3-3.7-3.5-6-3.5z"/></svg></span>
        <div><strong>{{ roles.length }}</strong><span>Total Roles</span></div>
      </article>
      <article class="stat card tone-amber">
        <span class="stat-icon" style="color:#d97706" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 16 6.5 6l3 6 2.5-8 2.5 8 3-6L20 16H4z"/></svg></span>
        <div><strong>Admin</strong><span>{{ adminCount }} user</span></div>
      </article>
      <article class="stat card tone-slate">
        <span class="stat-icon" style="color:#7c3aed" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.2V21h3.8l11-11-3.8-3.8-11 11zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z"/></svg></span>
        <div><strong>Editor</strong><span>{{ editorCount }} user</span></div>
      </article>
    </div>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>

    <section class="card role-grant">
      <div class="grant-copy">
        <h2 class="with-icon">
          <span class="row-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M15 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-7 1a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 8 13zm7 2c-2.3 0-7 1.2-7 3.5V20h14v-1.5C22 16.2 17.3 15 15 15zM8 15c-.3 0-.7 0-1 .1 1.2.8 2 1.9 2 3.1V20H2v-1.5C2 16.2 5.3 15 8 15z"/></svg></span>
          Grant a Role
        </h2>
        <p class="muted">Assign a role to a user in the system.</p>
        <ol class="steps">
          <li>Get the User UID from Supabase (Dashboard → Authentication → Users).</li>
          <li>Paste the User UID and choose a role.</li>
          <li>Click Grant Role to assign the role.</li>
        </ol>
      </div>
      <form novalidate data-test="grant-form" @submit.prevent="onGrant">
        <div class="grant-fields">
          <FormField v-slot="{ id }" name="userId" label="User UID" :error="grantErrors.userId" required>
            <span class="input-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1v10H6V10h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>
              <input :id="id" v-model="grant.userId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" spellcheck="false" data-test="grant-user" />
            </span>
          </FormField>
          <FormField v-slot="{ id }" name="role" label="Role" :error="grantErrors.role" required>
            <span class="input-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4z"/></svg>
              <select :id="id" v-model="grant.role" data-test="grant-role">
                <option v-for="role in APP_ROLES" :key="role" :value="role">{{ ROLE_LABELS[role] }}</option>
              </select>
            </span>
          </FormField>
        </div>
        <button class="grant-btn" type="submit" :disabled="busy" data-test="grant-submit">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-8 1v-2H5v2H3v2h2v2h2v-2h2v-2H7zm8 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>
          {{ busy ? 'Saving...' : 'Grant Role' }}
        </button>
      </form>
    </section>

    <p v-if="loading" class="muted">Loading roles...</p>
    <section v-else class="card role-table">
      <h2 class="with-icon">
        <span class="row-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-7 1.3-7 4v2h9v-2c0-1.1.6-2.1 1.6-2.9A12 12 0 0 0 8 13zm8 0c-.4 0-.7 0-1 .1 1.2.9 2 2.1 2 3.4V19h7v-2c0-2.7-4.3-4-8-4z"/></svg></span>
        User Roles
      </h2>
      <div v-if="roles.length === 0" class="table-wrap"><p class="empty">No roles found.</p></div>
      <div v-else class="table-wrap data-table">
      <table>
        <thead><tr><th>User UID</th><th>Role</th><th>Granted by</th><th>Updated</th><th class="actions-head">Actions</th></tr></thead>
        <tbody>
          <tr v-for="item in roles" :key="item.user_id" data-test="role-row">
            <td class="mono" data-label="User UID">
              <span class="uid" :title="item.user_id">{{ shortId(item.user_id) }}</span>
              <button class="ghost icon-btn" type="button" aria-label="Copy user UID" @click="copyUid(item.user_id)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M8 8h10v12H8z"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M6 16H5V4h10v2"/></svg>
              </button>
            </td>
            <td data-label="Role">
              <div class="with-icon">
              <span class="mini" aria-hidden="true" :title="ROLE_LABELS[item.role]">
                <svg v-if="(isSelf(item) ? item.role : pendingRoles[item.user_id]) === 'admin'" viewBox="0 0 24 24"><path fill="#d97706" d="M4 16 6.5 6l3 6 2.5-8 2.5 8 3-6L20 16H4z"/></svg>
                <svg v-else viewBox="0 0 24 24"><path fill="#7c3aed" d="M3 17.2V21h3.8l11-11-3.8-3.8-11 11z"/></svg>
              </span>
              <select
                v-if="!isSelf(item)"
                v-model="pendingRoles[item.user_id]"
                :aria-label="`Role for ${item.user_id}`"
                :disabled="busy"
                data-test="role-select"
              >
                <option v-for="role in APP_ROLES" :key="role" :value="role">{{ ROLE_LABELS[role] }}</option>
              </select>
              <span v-else>{{ ROLE_LABELS[item.role] }}</span>
              </div>
            </td>
            <td class="mono" data-label="Granted by" :title="item.granted_by ?? ''">{{ item.granted_by ? shortId(item.granted_by) : '—' }}</td>
            <td data-label="Updated">
              <span class="with-icon">
                <svg class="mini" viewBox="0 0 24 24" aria-hidden="true"><path fill="#64748b" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm13 8H6v10h14V10z"/></svg>
                {{ formatDate(item.updated_at) }}
              </span>
            </td>
            <td class="actions" data-label="Actions">
              <div v-if="!isSelf(item)" class="action-row">
                <button class="small" type="button" :disabled="busy || pendingRoles[item.user_id] === item.role" data-test="role-save" @click="onChange(item)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h10l4 4v14H5V3zm8 1.5V8h3.5L13 4.5zM7 12h10v2H7v-2zm0 4h7v2H7v-2z"/></svg>
                  Save
                </button>
                <button class="small danger" type="button" :disabled="busy" data-test="role-remove" @click="pendingRemove = item">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"/></svg>
                  Remove
                </button>
              </div>
              <span v-else class="muted with-icon">
                <svg class="mini" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>
                Your own role cannot be changed here
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>

    <ConfirmDialog
      v-if="pendingRemove"
      title="Remove role?"
      confirm-label="Remove role"
      danger
      :busy="busy"
      @cancel="pendingRemove = null"
      @confirm="onRemove(pendingRemove)"
    >
      <p>
        <span class="mono">{{ pendingRemove.user_id }}</span> will lose {{ ROLE_LABELS[pendingRemove.role] }} access.
        Their Auth account stays; delete it in the Dashboard if needed.
      </p>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FormField from '@/components/FormField.vue';
import { describeError } from '@/lib/errors';
import { validateRoleGrant, type FieldErrors, type RoleGrantForm } from '@/lib/validation';
import { changeRole, grantRole, listRoles, removeRole } from '@/services/campus';
import { useSession } from '@/stores/session';
import { APP_ROLES, ROLE_LABELS, type UserRoleRecord } from '@/types';

const session = useSession();
const roles = ref<UserRoleRecord[]>([]);
const pendingRoles = reactive<Record<string, string>>({});
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const grant = ref<RoleGrantForm>({ userId: '', role: 'editor' });
const grantErrors = ref<FieldErrors<RoleGrantForm>>({});
const pendingRemove = ref<UserRoleRecord | null>(null);

function currentUserId(): string {
  return session.state.userId ?? '';
}

function isSelf(item: UserRoleRecord): boolean {
  return item.user_id === currentUserId();
}

const adminCount = computed(() => roles.value.filter((item) => item.role === 'admin').length);
const editorCount = computed(() => roles.value.filter((item) => item.role === 'editor').length);

async function copyUid(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    notice.value = 'User UID copied.';
  } catch {
    error.value = 'Could not copy the User UID.';
  }
}

function shortId(value: string): string {
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function setRoles(list: UserRoleRecord[]) {
  roles.value = list;
  for (const item of list) pendingRoles[item.user_id] = item.role;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    setRoles(await listRoles());
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

async function onGrant() {
  error.value = '';
  notice.value = '';
  const result = validateRoleGrant(grant.value, currentUserId());
  if (!result.ok) {
    grantErrors.value = result.errors;
    return;
  }
  grantErrors.value = {};
  if (roles.value.some((item) => item.user_id === result.value.user_id)) {
    grantErrors.value = { userId: 'This user already has a role. Change it in the table below.' };
    return;
  }
  busy.value = true;
  try {
    const created = await grantRole(result.value.user_id, result.value.role, currentUserId());
    setRoles([...roles.value, created]);
    grant.value = { userId: '', role: 'editor' };
    notice.value = `Granted ${ROLE_LABELS[created.role]}.`;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
  }
}

async function onChange(item: UserRoleRecord) {
  const role = pendingRoles[item.user_id];
  if (isSelf(item) || (role !== 'admin' && role !== 'editor')) return;
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    const updated = await changeRole(item.user_id, role, currentUserId());
    setRoles(roles.value.map((row) => (row.user_id === updated.user_id ? updated : row)));
    notice.value = `Role changed to ${ROLE_LABELS[updated.role]}.`;
  } catch (err) {
    pendingRoles[item.user_id] = item.role;
    error.value = describeError(err);
  } finally {
    busy.value = false;
  }
}

async function onRemove(item: UserRoleRecord) {
  if (isSelf(item)) return;
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    await removeRole(item.user_id);
    setRoles(roles.value.filter((row) => row.user_id !== item.user_id));
    notice.value = 'Role removed.';
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
    pendingRemove.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.role-stats .stat { display: flex; align-items: center; gap: 12px; }
.role-stats .stat-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: #fff; }
.role-stats .stat-icon svg { width: 22px; height: 22px; }
.role-grant { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr); gap: 18px; margin-bottom: 16px; align-items: start; }
.grant-copy h2, .role-table h2 { margin-bottom: 4px; }
.steps { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 10px; }
.steps li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--muted); }
.steps li::before {
  counter-increment: step;
  content: counter(step);
  width: 22px; height: 22px; border-radius: 999px; flex: 0 0 auto;
  display: grid; place-items: center; background: #dbeafe; color: #1d4ed8; font-weight: 800; font-size: 12px;
}
.steps { counter-reset: step; }
.grant-fields { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 10px; }
.input-icon { position: relative; display: block; }
.input-icon svg { position: absolute; left: 10px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%); color: #64748b; }
.input-icon input, .input-icon select { padding-left: 34px; }
.grant-btn { width: 100%; margin-top: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.grant-btn svg { width: 16px; height: 16px; }
.role-table { margin-bottom: 16px; }
.with-icon { display: inline-flex; align-items: center; gap: 8px; }
.row-icon, .mini { width: 16px; height: 16px; flex: 0 0 auto; }
.row-icon { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: #dbeafe; color: #1d4ed8; }
.row-icon svg, .action-row svg, .mini svg { width: 16px; height: 16px; }
.action-row { display: inline-flex; align-items: center; gap: 6px; }
.action-row button { display: inline-flex; align-items: center; gap: 4px; }
.role-table :deep(td), .role-table :deep(th) { vertical-align: middle; white-space: nowrap; font-size: 13px; }
.role-table :deep(th.actions-head) { text-align: right; }
.role-table :deep(.mono) { font-size: 12px; }
.role-table :deep(select) { height: 32px; width: auto; min-width: 110px; }
.uid { margin-right: 6px; display: inline; }
.you-badge { margin-left: 6px; }
@media (max-width: 800px) {
  .role-grant, .grant-fields { grid-template-columns: 1fr; }
}
</style>
